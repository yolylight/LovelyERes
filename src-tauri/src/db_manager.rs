//! Database Manager — 通过 SSH 远程管理数据库
//! 支持 MySQL/MariaDB, PostgreSQL, Redis, MongoDB, DM, KingBase, etc.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::ssh_manager_russh::SSHManagerRussh;

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseInfo {
    pub db_type: String,        // mysql, postgresql, redis, mongodb, dm, kingbase, etc.
    pub name: String,           // Display name
    pub version: String,        // Version string
    pub status: String,         // running, stopped, unknown
    pub port: u16,              // Default port
    pub data_dir: String,       // Data directory path
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ConnectionMode {
    Direct,
    #[serde(rename_all = "camelCase")]
    Docker {
        container_id: String,
        container_name: String,
    },
}

impl Default for ConnectionMode {
    fn default() -> Self {
        ConnectionMode::Direct
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbConnection {
    pub db_type: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: Option<String>,
    #[serde(default)]
    pub connection_mode: Option<ConnectionMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SqlResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub row_count: usize,
    pub affected_rows: Option<usize>,
    pub execution_time_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub row_count: Option<u64>,
    pub size: Option<String>,
    pub engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_primary_key: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbUser {
    pub username: String,
    pub host: String,
    pub privileges: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbStats {
    pub uptime: String,
    pub connections: u64,
    pub active_connections: u64,
    pub db_size_total: String,
    pub slow_queries: u64,
    pub extra: HashMap<String, String>,
}

/// 分页查询结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_count: u64,
    pub page: u32,
    pub page_size: u32,
}

/// 更新行参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRowParams {
    pub database: String,
    pub table: String,
    pub updates: HashMap<String, Option<String>>,
    pub conditions: HashMap<String, String>,
}

/// 删除行参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteRowParams {
    pub database: String,
    pub table: String,
    pub conditions: HashMap<String, String>,
}

/// 插入行参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertRowParams {
    pub database: String,
    pub table: String,
    pub data: HashMap<String, Option<String>>,
}

/// 安全检查严重程度
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SecuritySeverity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

/// 安全检查状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckStatus {
    Pass,
    Fail,
    Warning,
    Error,
}

/// 安全检查发现项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityFinding {
    pub item: String,
    pub detail: String,
}

/// 安全检查结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityCheckResult {
    pub check_id: String,
    pub check_name: String,
    pub severity: SecuritySeverity,
    pub status: CheckStatus,
    pub findings: Vec<SecurityFinding>,
    pub recommendation: String,
}

// ==================== Helpers ====================

/// Shell-escape a password for safe embedding in single-quoted strings.
/// Replaces `'` with `'\''` (end quote, escaped quote, start quote).
fn shell_escape(s: &str) -> String {
    s.replace('\'', "'\\''")
}

/// Escape a value for embedding inside a single-quoted SQL string literal.
/// MySQL treats `\` as an escape character by default, so it must be doubled
/// BEFORE escaping quotes — otherwise `C:\temp` would smuggle in `\t` (tab).
/// PostgreSQL (standard_conforming_strings) treats `\` literally and only
/// requires doubling `'`.
fn escape_sql_value(s: &str, db_type: &str) -> String {
    match db_type {
        "mysql" => s.replace('\\', "\\\\").replace('\'', "\\'"),
        _ => s.replace('\'', "''"),
    }
}

fn wrap_docker_exec(conn: &DbConnection, cmd: &str) -> String {
    match &conn.connection_mode {
        Some(ConnectionMode::Docker { container_id, .. }) => {
            format!("docker exec -i {} sh -c \"{}\"", container_id, cmd.replace('"', "\\\""))
        }
        _ => cmd.to_string(),
    }
}

fn wrap_docker_exec_batch(conn: &DbConnection, commands: &[String]) -> Vec<String> {
    match &conn.connection_mode {
        Some(ConnectionMode::Docker { container_id, .. }) => {
            commands.iter().map(|cmd| {
                format!("docker exec -i {} sh -c \"{}\"", container_id, cmd.replace('"', "\\\""))
            }).collect()
        }
        _ => commands.to_vec(),
    }
}

// ==================== detect_databases ====================

/// Detect installed databases on the remote server via SSH.
pub fn detect_databases(ssh: &SSHManagerRussh) -> Result<Vec<DatabaseInfo>, String> {
    let commands: Vec<String> = vec![
        // MySQL / MariaDB
        "systemctl is-active mysql mysqld mariadb 2>/dev/null | head -1".to_string(),
        "mysql --version 2>/dev/null || echo '__NOT_INSTALLED__'".to_string(),
        // PostgreSQL
        "systemctl is-active postgresql 2>/dev/null | head -1".to_string(),
        "psql --version 2>/dev/null || echo '__NOT_INSTALLED__'".to_string(),
        // Redis
        "systemctl is-active redis redis-server 2>/dev/null | head -1".to_string(),
        "redis-server --version 2>/dev/null || echo '__NOT_INSTALLED__'".to_string(),
        // MongoDB
        "systemctl is-active mongod mongodb 2>/dev/null | head -1".to_string(),
        "mongod --version 2>/dev/null | head -1 || echo '__NOT_INSTALLED__'".to_string(),
        // DM (达梦)
        "systemctl is-active DmServiceDMSERVER 2>/dev/null | head -1".to_string(),
        "/opt/dmdbms/bin/dm_svc_conf print_version 2>/dev/null || echo '__NOT_INSTALLED__'".to_string(),
        // KingBase
        "systemctl is-active kingbase 2>/dev/null | head -1".to_string(),
        "ksql --version 2>/dev/null || echo '__NOT_INSTALLED__'".to_string(),
    ];

    let results = ssh.execute_batch_commands(&commands)?;

    let mut databases: Vec<DatabaseInfo> = Vec::new();

    // Helper: extract output text from a batch result
    let get_output = |idx: usize| -> String {
        match results.get(idx) {
            Some(Ok(out)) => out.output.trim().to_string(),
            _ => String::new(),
        }
    };

    // ---------- MySQL / MariaDB ----------
    let mysql_status = get_output(0);
    let mysql_version = get_output(1);
    if !mysql_version.contains("__NOT_INSTALLED__") && !mysql_version.is_empty() {
        let status = if mysql_status.lines().any(|l| l.trim() == "active") { "running" } else { "stopped" };
        let name = if mysql_version.to_lowercase().contains("mariadb") { "MariaDB" } else { "MySQL" };
        databases.push(DatabaseInfo {
            db_type: "mysql".to_string(),
            name: name.to_string(),
            version: mysql_version,
            status: status.to_string(),
            port: 3306,
            data_dir: "/var/lib/mysql".to_string(),
        });
    }

    // ---------- PostgreSQL ----------
    let pg_status = get_output(2);
    let pg_version = get_output(3);
    if !pg_version.contains("__NOT_INSTALLED__") && !pg_version.is_empty() {
        let status = if pg_status.lines().any(|l| l.trim() == "active") { "running" } else { "stopped" };
        databases.push(DatabaseInfo {
            db_type: "postgresql".to_string(),
            name: "PostgreSQL".to_string(),
            version: pg_version,
            status: status.to_string(),
            port: 5432,
            data_dir: "/var/lib/postgresql".to_string(),
        });
    }

    // ---------- Redis ----------
    let redis_status = get_output(4);
    let redis_version = get_output(5);
    if !redis_version.contains("__NOT_INSTALLED__") && !redis_version.is_empty() {
        let status = if redis_status.lines().any(|l| l.trim() == "active") { "running" } else { "stopped" };
        databases.push(DatabaseInfo {
            db_type: "redis".to_string(),
            name: "Redis".to_string(),
            version: redis_version,
            status: status.to_string(),
            port: 6379,
            data_dir: "/var/lib/redis".to_string(),
        });
    }

    // ---------- MongoDB ----------
    let mongo_status = get_output(6);
    let mongo_version = get_output(7);
    if !mongo_version.contains("__NOT_INSTALLED__") && !mongo_version.is_empty() {
        let status = if mongo_status.lines().any(|l| l.trim() == "active") { "running" } else { "stopped" };
        databases.push(DatabaseInfo {
            db_type: "mongodb".to_string(),
            name: "MongoDB".to_string(),
            version: mongo_version,
            status: status.to_string(),
            port: 27017,
            data_dir: "/var/lib/mongodb".to_string(),
        });
    }

    // ---------- DM (达梦) ----------
    let dm_status = get_output(8);
    let dm_version = get_output(9);
    if !dm_version.contains("__NOT_INSTALLED__") && !dm_version.is_empty() {
        let status = if dm_status.lines().any(|l| l.trim() == "active") { "running" } else { "stopped" };
        databases.push(DatabaseInfo {
            db_type: "dm".to_string(),
            name: "DM (达梦)".to_string(),
            version: dm_version,
            status: status.to_string(),
            port: 5236,
            data_dir: "/opt/dmdbms/data".to_string(),
        });
    }

    // ---------- KingBase ----------
    let kb_status = get_output(10);
    let kb_version = get_output(11);
    if !kb_version.contains("__NOT_INSTALLED__") && !kb_version.is_empty() {
        let status = if kb_status.lines().any(|l| l.trim() == "active") { "running" } else { "stopped" };
        databases.push(DatabaseInfo {
            db_type: "kingbase".to_string(),
            name: "KingBase".to_string(),
            version: kb_version,
            status: status.to_string(),
            port: 54321,
            data_dir: "/opt/Kingbase/data".to_string(),
        });
    }

    Ok(databases)
}

// ==================== execute_sql ====================

/// Execute a SQL statement (or command) against the specified database type via its CLI.
pub fn execute_sql(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
    sql: &str,
) -> Result<SqlResult, String> {
    let start = std::time::Instant::now();
    let escaped_pass = shell_escape(&conn.password);
    let escaped_sql = sql.replace('"', "\\\"");
    let db = conn.database.as_deref().unwrap_or("");

    let cmd = match db_type {
        "mysql" => {
            format!(
                "mysql -u{user} -p'{pass}' -h{host} -P{port} {db} -e \"{sql}\" --batch --raw 2>&1",
                user = conn.username,
                pass = escaped_pass,
                host = conn.host,
                port = conn.port,
                db = db,
                sql = escaped_sql,
            )
        }
        "postgresql" => {
            format!(
                "PGPASSWORD='{pass}' psql -U {user} -h {host} -p {port} -d {db} -t -A -F'|' -c \"{sql}\" 2>&1",
                pass = escaped_pass,
                user = conn.username,
                host = conn.host,
                port = conn.port,
                db = if db.is_empty() { "postgres" } else { db },
                sql = escaped_sql,
            )
        }
        "redis" => {
            // For Redis, the sql field is the raw command (e.g. "GET key")
            let auth = if conn.password.is_empty() {
                String::new()
            } else {
                format!("-a '{}'", escaped_pass)
            };
            format!(
                "redis-cli -h {host} -p {port} {auth} {cmd} 2>&1",
                host = conn.host,
                port = conn.port,
                auth = auth,
                cmd = sql,
            )
        }
        "mongodb" => {
            let auth = if conn.username.is_empty() {
                String::new()
            } else {
                format!("-u {user} -p '{pass}' --authenticationDatabase admin", user = conn.username, pass = escaped_pass)
            };
            let escaped_js = sql.replace('\'', "\\'");
            format!(
                "mongosh --host {host} --port {port} {auth} {db} --eval '{js}' --quiet 2>&1",
                host = conn.host,
                port = conn.port,
                auth = auth,
                db = if db.is_empty() { "admin" } else { db },
                js = escaped_js,
            )
        }
        _ => return Err(format!("不支持的数据库类型: {}", db_type)),
    };

    let output = ssh.execute_command(&wrap_docker_exec(conn, &cmd))?;
    let elapsed = start.elapsed().as_millis() as u64;

    // ── 优先检查 SSH 层面的执行失败 ──
    // 1) SSH 命令超时（MySQL CLI 连接超时通常远超 SSH 的 60s 限制）
    if output.timed_out {
        return Ok(SqlResult {
            columns: vec![],
            rows: vec![],
            row_count: 0,
            affected_rows: None,
            execution_time_ms: elapsed,
            error: Some(format!("数据库连接超时: {}", output.output)),
        });
    }
    // 2) 非零 exit_code 说明 CLI 执行失败（连接拒绝、认证失败等）
    if let Some(code) = output.exit_code {
        if code != 0 {
            let raw = strip_client_warnings(&output.output);
            let detail = if raw.is_empty() {
                format!("命令退出码: {}", code)
            } else {
                raw
            };
            return Ok(SqlResult {
                columns: vec![],
                rows: vec![],
                row_count: 0,
                affected_rows: None,
                execution_time_ms: elapsed,
                error: Some(detail),
            });
        }
    }

    // 过滤 MySQL/客户端在使用命令行密码时输出到 stderr 的告警行，
    // 否则该行会被 2>&1 合并进来并被 parse_mysql_output 误当作表头。
    let raw = strip_client_warnings(&output.output);

    // ── 检查输出中的错误标记 ──
    if looks_like_db_error(&raw) {
        return Ok(SqlResult {
            columns: vec![],
            rows: vec![],
            row_count: 0,
            affected_rows: None,
            execution_time_ms: elapsed,
            error: Some(raw),
        });
    }

    // Parse output according to db_type
    let (columns, rows) = match db_type {
        "mysql" => parse_mysql_output(&raw),
        "postgresql" => parse_pg_output(&raw),
        "redis" => parse_redis_output(&raw),
        "mongodb" => parse_mongo_output(&raw),
        _ => (vec![], vec![]),
    };

    let row_count = rows.len();
    Ok(SqlResult {
        columns,
        rows,
        row_count,
        affected_rows: None,
        execution_time_ms: elapsed,
        error: None,
    })
}

// ==================== Output parsers ====================

/// 去除数据库客户端输出到 stderr 的告警噪音行（经 2>&1 合并进来），
/// 例如 MySQL 的 "Using a password on the command line interface can be insecure"。
/// 同时 trim 首尾空白，返回适合后续解析的干净文本。
fn strip_client_warnings(raw: &str) -> String {
    raw.lines()
        .filter(|line| {
            let l = line.trim();
            if l.is_empty() {
                return true; // 保留空行由各解析器决定是否忽略
            }
            let lower = l.to_lowercase();
            // MySQL/MariaDB 命令行密码告警
            if lower.contains("using a password on the command line interface can be insecure") {
                return false;
            }
            // 形如 "mysql: [Warning] ..." / "mysqldump: [Warning] ..."
            if lower.contains("[warning]") && lower.contains("password") {
                return false;
            }
            true
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

/// 判断数据库 CLI 输出是否包含错误标记。
/// 覆盖 MySQL ERROR、PostgreSQL FATAL、Redis ERR、MongoDB 错误及连接失败等场景。
fn looks_like_db_error(raw: &str) -> bool {
    // 快速路径：以 ERROR 开头（MySQL 标准错误格式）
    if raw.starts_with("ERROR") {
        return true;
    }
    let lower = raw.to_lowercase();
    // MySQL: "ERROR xxxx (HYxxx):" 可能不在行首（被前置空行或杂项输出推后）
    if lower.contains("\nerror ") || (lower.contains("error ") && lower.contains("(hy")) {
        return true;
    }
    // PostgreSQL
    if lower.contains("fatal:") {
        return true;
    }
    // Redis
    if raw.starts_with("ERR ") || raw.starts_with("NOAUTH") || raw.contains("\nERR ") {
        return true;
    }
    // MongoDB
    if lower.contains("mongosh") && lower.contains("error") {
        return true;
    }
    // 通用连接失败
    if lower.contains("can't connect") || lower.contains("cannot connect")
        || lower.contains("connection refused") || lower.contains("connection timed out")
    {
        return true;
    }
    // 通用 "error:" 标记（保留原逻辑兼容性）
    if raw.contains("error:") {
        return true;
    }
    false
}

/// Parse MySQL batch output (tab-separated, first line = headers).
fn parse_mysql_output(raw: &str) -> (Vec<String>, Vec<Vec<String>>) {
    let lines: Vec<&str> = raw.lines().collect();
    if lines.is_empty() {
        return (vec![], vec![]);
    }

    let columns: Vec<String> = lines[0].split('\t').map(|s| s.to_string()).collect();
    let rows: Vec<Vec<String>> = lines[1..]
        .iter()
        .filter(|l| !l.is_empty())
        .map(|line| line.split('\t').map(|s| s.to_string()).collect())
        .collect();

    (columns, rows)
}

/// Parse PostgreSQL output (pipe-separated, no header line with -t).
fn parse_pg_output(raw: &str) -> (Vec<String>, Vec<Vec<String>>) {
    let lines: Vec<&str> = raw.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.is_empty() {
        return (vec![], vec![]);
    }

    // -t omits headers; we return generic column names
    let first_cols: Vec<&str> = lines[0].split('|').collect();
    let columns: Vec<String> = (0..first_cols.len())
        .map(|i| format!("col{}", i))
        .collect();
    let rows: Vec<Vec<String>> = lines
        .iter()
        .map(|line| line.split('|').map(|s| s.trim().to_string()).collect())
        .collect();

    (columns, rows)
}

/// Parse Redis output (line-based).
fn parse_redis_output(raw: &str) -> (Vec<String>, Vec<Vec<String>>) {
    let columns = vec!["result".to_string()];
    let rows: Vec<Vec<String>> = raw
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| vec![l.to_string()])
        .collect();
    (columns, rows)
}

/// Parse MongoDB output (JSON or text lines).
fn parse_mongo_output(raw: &str) -> (Vec<String>, Vec<Vec<String>>) {
    let columns = vec!["result".to_string()];
    let rows: Vec<Vec<String>> = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| vec![l.to_string()])
        .collect();
    (columns, rows)
}

// ==================== list_databases ====================

/// List databases on the remote server.
pub fn list_databases(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
) -> Result<Vec<String>, String> {
    let sql = match db_type {
        "mysql" => "SHOW DATABASES".to_string(),
        "postgresql" => "SELECT datname FROM pg_database WHERE datistemplate = false".to_string(),
        "redis" => {
            // For Redis, get keyspace info
            let result = execute_sql(ssh, db_type, conn, "INFO keyspace")?;
            let mut dbs = Vec::new();
            for row in &result.rows {
                if let Some(val) = row.first() {
                    if val.starts_with("db") {
                        if let Some(name) = val.split(':').next() {
                            dbs.push(name.to_string());
                        }
                    }
                }
            }
            if dbs.is_empty() {
                dbs.push("db0".to_string());
            }
            return Ok(dbs);
        }
        "mongodb" => {
            let result = execute_sql(ssh, db_type, conn, "db.adminCommand({listDatabases:1}).databases.map(d=>d.name).join('\\n')")?;
            let mut dbs = Vec::new();
            for row in &result.rows {
                if let Some(val) = row.first() {
                    let trimmed = val.trim();
                    if !trimmed.is_empty() {
                        dbs.push(trimmed.to_string());
                    }
                }
            }
            return Ok(dbs);
        }
        _ => return Err(format!("不支持的数据库类型: {}", db_type)),
    };

    let result = execute_sql(ssh, db_type, conn, &sql)?;
    if let Some(ref err) = result.error {
        return Err(err.clone());
    }

    let dbs: Vec<String> = result
        .rows
        .iter()
        .filter_map(|row| row.first().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect();

    Ok(dbs)
}

// ==================== list_tables ====================

/// List tables (or collections) in the given database.
pub fn list_tables(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
    database: &str,
) -> Result<Vec<TableInfo>, String> {
    match db_type {
        "mysql" => {
            let sql = format!(
                "SELECT TABLE_NAME, TABLE_ROWS, CONCAT(ROUND(DATA_LENGTH/1024,2),' KB'), ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='{}'",
                database.replace('\'', "\\'")
            );
            let result = execute_sql(ssh, db_type, conn, &sql)?;
            if let Some(ref err) = result.error {
                return Err(err.clone());
            }
            let tables = result
                .rows
                .iter()
                .map(|row| TableInfo {
                    name: row.get(0).cloned().unwrap_or_default(),
                    row_count: row.get(1).and_then(|s| s.parse::<u64>().ok()),
                    size: row.get(2).cloned(),
                    engine: row.get(3).cloned(),
                })
                .collect();
            Ok(tables)
        }
        "postgresql" => {
            let mut pg_conn = conn.clone();
            pg_conn.database = Some(database.to_string());
            let sql = "SELECT tablename FROM pg_tables WHERE schemaname='public'";
            let result = execute_sql(ssh, "postgresql", &pg_conn, sql)?;
            if let Some(ref err) = result.error {
                return Err(err.clone());
            }
            let tables = result
                .rows
                .iter()
                .map(|row| TableInfo {
                    name: row.get(0).cloned().unwrap_or_default(),
                    row_count: None,
                    size: None,
                    engine: None,
                })
                .collect();
            Ok(tables)
        }
        "mongodb" => {
            let mut mg_conn = conn.clone();
            mg_conn.database = Some(database.to_string());
            let result = execute_sql(ssh, "mongodb", &mg_conn, "db.getCollectionNames().join('\\n')")?;
            if let Some(ref err) = result.error {
                return Err(err.clone());
            }
            let tables = result
                .rows
                .iter()
                .filter_map(|row| row.first())
                .filter(|s| !s.trim().is_empty())
                .map(|name| TableInfo {
                    name: name.trim().to_string(),
                    row_count: None,
                    size: None,
                    engine: None,
                })
                .collect();
            Ok(tables)
        }
        "redis" => {
            // Redis doesn't have tables, return empty
            Ok(vec![])
        }
        _ => Err(format!("不支持的数据库类型: {}", db_type)),
    }
}

// ==================== list_columns ====================

/// List columns (schema) for a specific table.
pub fn list_columns(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
    database: &str,
    table: &str,
) -> Result<Vec<ColumnInfo>, String> {
    match db_type {
        "mysql" => {
            let sql = format!("DESCRIBE {}.{}", database, table);
            let result = execute_sql(ssh, db_type, conn, &sql)?;
            if let Some(ref err) = result.error {
                return Err(err.clone());
            }
            // DESCRIBE output: Field, Type, Null, Key, Default, Extra
            let columns = result
                .rows
                .iter()
                .map(|row| ColumnInfo {
                    name: row.get(0).cloned().unwrap_or_default(),
                    data_type: row.get(1).cloned().unwrap_or_default(),
                    is_nullable: row.get(2).map(|s| s == "YES").unwrap_or(true),
                    is_primary_key: row.get(3).map(|s| s == "PRI").unwrap_or(false),
                    default_value: row.get(4).cloned().filter(|s| s != "NULL" && !s.is_empty()),
                })
                .collect();
            Ok(columns)
        }
        "postgresql" => {
            let mut pg_conn = conn.clone();
            pg_conn.database = Some(database.to_string());
            let sql = format!(
                "SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, \
                 CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 'YES' ELSE 'NO' END as is_pk \
                 FROM information_schema.columns c \
                 LEFT JOIN information_schema.key_column_usage kcu ON c.column_name = kcu.column_name AND c.table_name = kcu.table_name \
                 LEFT JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name AND tc.constraint_type = 'PRIMARY KEY' \
                 WHERE c.table_name='{}'",
                table.replace('\'', "\\'")
            );
            let result = execute_sql(ssh, "postgresql", &pg_conn, &sql)?;
            if let Some(ref err) = result.error {
                return Err(err.clone());
            }
            let columns = result
                .rows
                .iter()
                .map(|row| ColumnInfo {
                    name: row.get(0).cloned().unwrap_or_default(),
                    data_type: row.get(1).cloned().unwrap_or_default(),
                    is_nullable: row.get(2).map(|s| s == "YES").unwrap_or(true),
                    default_value: row.get(3).cloned().filter(|s| !s.is_empty()),
                    is_primary_key: row.get(4).map(|s| s == "YES").unwrap_or(false),
                })
                .collect();
            Ok(columns)
        }
        _ => Err(format!("数据库类型 {} 不支持列查询", db_type)),
    }
}

// ==================== list_users ====================

/// List database users.
pub fn list_users(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
) -> Result<Vec<DbUser>, String> {
    match db_type {
        "mysql" => {
            let sql = "SELECT user, host FROM mysql.user";
            let result = execute_sql(ssh, db_type, conn, sql)?;
            if let Some(ref err) = result.error {
                return Err(err.clone());
            }
            let users = result
                .rows
                .iter()
                .map(|row| DbUser {
                    username: row.get(0).cloned().unwrap_or_default(),
                    host: row.get(1).cloned().unwrap_or_default(),
                    privileges: vec![],
                })
                .collect();
            Ok(users)
        }
        "postgresql" => {
            let sql = "SELECT usename, CASE WHEN usesuper THEN 'SUPERUSER' ELSE 'USER' END FROM pg_user";
            let result = execute_sql(ssh, db_type, conn, sql)?;
            if let Some(ref err) = result.error {
                return Err(err.clone());
            }
            let users = result
                .rows
                .iter()
                .map(|row| DbUser {
                    username: row.get(0).cloned().unwrap_or_default(),
                    host: "%".to_string(),
                    privileges: row.get(1).map(|s| vec![s.clone()]).unwrap_or_default(),
                })
                .collect();
            Ok(users)
        }
        "redis" => {
            let result = execute_sql(ssh, db_type, conn, "ACL LIST")?;
            if let Some(ref err) = result.error {
                return Err(err.clone());
            }
            let users = result
                .rows
                .iter()
                .filter_map(|row| row.first())
                .map(|line| {
                    // ACL LIST output: "user <username> ..."
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    let username = parts.get(1).unwrap_or(&"default").to_string();
                    DbUser {
                        username,
                        host: "%".to_string(),
                        privileges: vec![line.clone()],
                    }
                })
                .collect();
            Ok(users)
        }
        "mongodb" => {
            let result = execute_sql(ssh, db_type, conn, "db.getUsers().users.forEach(u => print(u.user + '|' + (u.roles||[]).map(r=>r.role).join(',')))")?;
            if let Some(ref err) = result.error {
                return Err(err.clone());
            }
            let users = result
                .rows
                .iter()
                .filter_map(|row| row.first())
                .filter(|s| !s.trim().is_empty())
                .map(|line| {
                    let parts: Vec<&str> = line.split('|').collect();
                    DbUser {
                        username: parts.first().unwrap_or(&"").to_string(),
                        host: "%".to_string(),
                        privileges: parts
                            .get(1)
                            .map(|s| s.split(',').map(|r| r.trim().to_string()).collect())
                            .unwrap_or_default(),
                    }
                })
                .collect();
            Ok(users)
        }
        _ => Err(format!("不支持的数据库类型: {}", db_type)),
    }
}

// ==================== service_control ====================

/// Start / stop / restart / status a database service.
pub fn service_control(
    ssh: &SSHManagerRussh,
    db_type: &str,
    action: &str,
) -> Result<String, String> {
    if !["start", "stop", "restart", "status"].contains(&action) {
        return Err(format!("不支持的操作: {}，仅支持 start/stop/restart/status", action));
    }

    let cmd = match db_type {
        "mysql" => format!(
            "systemctl {action} mysql 2>/dev/null || systemctl {action} mysqld 2>/dev/null || systemctl {action} mariadb 2>/dev/null"
        ),
        "postgresql" => format!(
            "systemctl {action} postgresql 2>/dev/null"
        ),
        "redis" => format!(
            "systemctl {action} redis 2>/dev/null || systemctl {action} redis-server 2>/dev/null"
        ),
        "mongodb" => format!(
            "systemctl {action} mongod 2>/dev/null || systemctl {action} mongodb 2>/dev/null"
        ),
        "dm" => format!(
            "systemctl {action} DmServiceDMSERVER 2>/dev/null"
        ),
        "kingbase" => format!(
            "systemctl {action} kingbase 2>/dev/null"
        ),
        _ => return Err(format!("不支持的数据库类型: {}", db_type)),
    };

    let output = ssh.execute_command(&cmd)?;
    let result = output.output.trim().to_string();

    // For status action, also check with is-active
    if action == "status" {
        let status_cmd = match db_type {
            "mysql" => "systemctl is-active mysql mysqld mariadb 2>/dev/null | head -1",
            "postgresql" => "systemctl is-active postgresql 2>/dev/null",
            "redis" => "systemctl is-active redis redis-server 2>/dev/null | head -1",
            "mongodb" => "systemctl is-active mongod mongodb 2>/dev/null | head -1",
            "dm" => "systemctl is-active DmServiceDMSERVER 2>/dev/null",
            "kingbase" => "systemctl is-active kingbase 2>/dev/null",
            _ => "",
        };
        if !status_cmd.is_empty() {
            let status_output = ssh.execute_command(status_cmd)?;
            let active_status = status_output.output.trim().to_string();
            return Ok(format!("{}\n状态: {}", result, active_status));
        }
    }

    if result.is_empty() {
        Ok(format!("{}操作 {} 执行成功", db_type, action))
    } else {
        Ok(result)
    }
}

// ==================== backup_database ====================

/// Backup a database to /tmp on the remote server.
pub fn backup_database(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
    database: &str,
) -> Result<String, String> {
    let escaped_pass = shell_escape(&conn.password);
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();

    let cmd = match db_type {
        "mysql" => {
            let base = format!(
                "mysqldump -u{user} -p'{pass}' -h{host} -P{port} {db}",
                user = conn.username,
                pass = escaped_pass,
                host = conn.host,
                port = conn.port,
                db = database,
            );
            match &conn.connection_mode {
                Some(ConnectionMode::Docker { container_id, .. }) => {
                    format!("docker exec -i {} {} > /tmp/backup_{}_{}.sql 2>&1 && echo 'OK:/tmp/backup_{}_{}.sql'", container_id, base, database, timestamp, database, timestamp)
                }
                _ => {
                    format!("{} > /tmp/backup_{}_{}.sql 2>&1 && echo 'OK:/tmp/backup_{}_{}.sql'", base, database, timestamp, database, timestamp)
                }
            }
        }
        "postgresql" => {
            let base = format!(
                "pg_dump -U {user} -h {host} -p {port} {db}",
                user = conn.username,
                host = conn.host,
                port = conn.port,
                db = database,
            );
            let pg_pass = format!("PGPASSWORD='{}'", escaped_pass);
            match &conn.connection_mode {
                Some(ConnectionMode::Docker { container_id, .. }) => {
                    format!("docker exec -i -e {} {} {} > /tmp/backup_{}_{}.sql 2>&1 && echo 'OK:/tmp/backup_{}_{}.sql'", pg_pass, container_id, base, database, timestamp, database, timestamp)
                }
                _ => {
                    format!("{} {} > /tmp/backup_{}_{}.sql 2>&1 && echo 'OK:/tmp/backup_{}_{}.sql'", pg_pass, base, database, timestamp, database, timestamp)
                }
            }
        }
        "redis" => {
            let auth = if conn.password.is_empty() {
                String::new()
            } else {
                format!("-a '{}'", escaped_pass)
            };
            let base = format!(
                "redis-cli -h {host} -p {port} {auth} BGSAVE 2>&1",
                host = conn.host,
                port = conn.port,
                auth = auth,
            );
            match &conn.connection_mode {
                Some(ConnectionMode::Docker { container_id, .. }) => {
                    format!("docker exec -i {} {}", container_id, base)
                }
                _ => base,
            }
        }
        "mongodb" => {
            let auth = if conn.username.is_empty() {
                String::new()
            } else {
                format!("-u {user} -p '{pass}' --authenticationDatabase admin", user = conn.username, pass = escaped_pass)
            };
            let base = format!(
                "mongodump --host {host} --port {port} {auth} --db {db} --out /tmp/backup_{ts}/",
                host = conn.host,
                port = conn.port,
                auth = auth,
                db = database,
                ts = timestamp,
            );
            match &conn.connection_mode {
                Some(ConnectionMode::Docker { container_id, .. }) => {
                    format!(
                        "docker exec -i {} {} 2>&1 && docker cp {}:/tmp/backup_{}/ /tmp/ && docker exec -i {} rm -rf /tmp/backup_{}/ && echo 'OK:/tmp/backup_{}/'",
                        container_id, base, container_id, timestamp, container_id, timestamp, timestamp
                    )
                }
                _ => {
                    format!("{} 2>&1 && echo 'OK:/tmp/backup_{}/'", base, timestamp)
                }
            }
        }
        _ => return Err(format!("不支持的数据库类型: {}", db_type)),
    };

    let output = ssh.execute_command(&cmd)?;
    let raw = output.output.trim().to_string();

    if raw.contains("OK:") {
        Ok(raw)
    } else if raw.contains("Background saving started") {
        Ok(format!("Redis BGSAVE 已启动: {}", raw))
    } else if raw.contains("error") || raw.contains("ERROR") || raw.contains("FATAL") {
        Err(format!("备份失败: {}", raw))
    } else {
        Ok(raw)
    }
}

// ==================== get_db_stats ====================

/// Get runtime statistics for a database.
pub fn get_db_stats(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
) -> Result<DbStats, String> {
    match db_type {
        "mysql" => {
            let commands = vec![
                format!(
                    "mysql -u{user} -p'{pass}' -h{host} -P{port} -e \"SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Threads_running','Slow_queries','Connections')\" --batch --raw 2>&1",
                    user = conn.username,
                    pass = shell_escape(&conn.password),
                    host = conn.host,
                    port = conn.port,
                ),
                format!(
                    "mysql -u{user} -p'{pass}' -h{host} -P{port} -e \"SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb FROM information_schema.tables\" --batch --raw 2>&1",
                    user = conn.username,
                    pass = shell_escape(&conn.password),
                    host = conn.host,
                    port = conn.port,
                ),
            ];

            let results = ssh.execute_batch_commands(&wrap_docker_exec_batch(conn, &commands))?;

            let mut extra = HashMap::new();
            let mut uptime = String::new();
            let mut connections: u64 = 0;
            let mut active_connections: u64 = 0;
            let mut slow_queries: u64 = 0;

            if let Some(Ok(out)) = results.get(0) {
                let cleaned = strip_client_warnings(&out.output);
                for line in cleaned.lines().skip(1) {
                    let parts: Vec<&str> = line.split('\t').collect();
                    if parts.len() >= 2 {
                        let key = parts[0].trim();
                        let val = parts[1].trim();
                        match key {
                            "Uptime" => {
                                let secs: u64 = val.parse().unwrap_or(0);
                                let days = secs / 86400;
                                let hours = (secs % 86400) / 3600;
                                let mins = (secs % 3600) / 60;
                                uptime = format!("{}d {}h {}m", days, hours, mins);
                            }
                            "Connections" => connections = val.parse().unwrap_or(0),
                            "Threads_connected" => active_connections = val.parse().unwrap_or(0),
                            "Slow_queries" => slow_queries = val.parse().unwrap_or(0),
                            _ => { extra.insert(key.to_string(), val.to_string()); }
                        }
                    }
                }
            }

            let mut db_size_total = "unknown".to_string();
            if let Some(Ok(out)) = results.get(1) {
                let cleaned = strip_client_warnings(&out.output);
                for line in cleaned.lines().skip(1) {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() && trimmed != "NULL" {
                        db_size_total = format!("{} MB", trimmed);
                        break;
                    }
                }
            }

            Ok(DbStats {
                uptime,
                connections,
                active_connections,
                db_size_total,
                slow_queries,
                extra,
            })
        }
        "postgresql" => {
            let escaped_pass = shell_escape(&conn.password);
            let db = conn.database.as_deref().unwrap_or("postgres");
            let commands = vec![
                format!(
                    "PGPASSWORD='{pass}' psql -U {user} -h {host} -p {port} -d {db} -t -A -F'|' -c \"SELECT date_trunc('second', current_timestamp - pg_postmaster_start_time()) as uptime\" 2>&1",
                    pass = escaped_pass, user = conn.username, host = conn.host, port = conn.port, db = db,
                ),
                format!(
                    "PGPASSWORD='{pass}' psql -U {user} -h {host} -p {port} -d {db} -t -A -F'|' -c \"SELECT count(*) FROM pg_stat_activity\" 2>&1",
                    pass = escaped_pass, user = conn.username, host = conn.host, port = conn.port, db = db,
                ),
                format!(
                    "PGPASSWORD='{pass}' psql -U {user} -h {host} -p {port} -d {db} -t -A -F'|' -c \"SELECT count(*) FROM pg_stat_activity WHERE state='active'\" 2>&1",
                    pass = escaped_pass, user = conn.username, host = conn.host, port = conn.port, db = db,
                ),
                format!(
                    "PGPASSWORD='{pass}' psql -U {user} -h {host} -p {port} -d {db} -t -A -F'|' -c \"SELECT pg_size_pretty(sum(pg_database_size(datname))) FROM pg_database\" 2>&1",
                    pass = escaped_pass, user = conn.username, host = conn.host, port = conn.port, db = db,
                ),
            ];

            let results = ssh.execute_batch_commands(&wrap_docker_exec_batch(conn, &commands))?;

            let get = |idx: usize| -> String {
                match results.get(idx) {
                    Some(Ok(out)) => out.output.trim().to_string(),
                    _ => String::new(),
                }
            };

            Ok(DbStats {
                uptime: get(0),
                connections: get(1).parse().unwrap_or(0),
                active_connections: get(2).parse().unwrap_or(0),
                db_size_total: get(3),
                slow_queries: 0,
                extra: HashMap::new(),
            })
        }
        "redis" => {
            let result = execute_sql(ssh, "redis", conn, "INFO")?;
            let raw = result.rows.iter().filter_map(|r| r.first()).cloned().collect::<Vec<String>>().join("\n");

            let mut extra = HashMap::new();
            let mut uptime = String::new();
            let mut connections: u64 = 0;
            let mut active_connections: u64 = 0;

            for line in raw.lines() {
                if let Some((key, val)) = line.split_once(':') {
                    let key = key.trim();
                    let val = val.trim();
                    match key {
                        "uptime_in_seconds" => {
                            let secs: u64 = val.parse().unwrap_or(0);
                            let days = secs / 86400;
                            let hours = (secs % 86400) / 3600;
                            uptime = format!("{}d {}h", days, hours);
                        }
                        "connected_clients" => {
                            connections = val.parse().unwrap_or(0);
                            active_connections = connections;
                        }
                        "used_memory_human" => { extra.insert("used_memory".to_string(), val.to_string()); }
                        _ => {}
                    }
                }
            }

            Ok(DbStats {
                uptime,
                connections,
                active_connections,
                db_size_total: extra.get("used_memory").cloned().unwrap_or_else(|| "unknown".to_string()),
                slow_queries: 0,
                extra,
            })
        }
        "mongodb" => {
            let result = execute_sql(
                ssh,
                "mongodb",
                conn,
                "var s=db.serverStatus(); print(JSON.stringify({uptime:s.uptime,current:s.connections.current,available:s.connections.available,totalCreated:s.connections.totalCreated}))",
            )?;

            let raw = result.rows.iter().filter_map(|r| r.first()).cloned().collect::<Vec<String>>().join("");
            // Try to parse JSON
            let mut uptime = String::new();
            let mut connections: u64 = 0;
            let mut active_connections: u64 = 0;

            // Simple JSON extraction (no serde_json dependency needed)
            for part in raw.trim_matches(|c| c == '{' || c == '}').split(',') {
                if let Some((key, val)) = part.split_once(':') {
                    let key = key.trim().trim_matches('"');
                    let val = val.trim().trim_matches('"');
                    match key {
                        "uptime" => {
                            let secs: u64 = val.parse().unwrap_or(0);
                            let days = secs / 86400;
                            let hours = (secs % 86400) / 3600;
                            uptime = format!("{}d {}h", days, hours);
                        }
                        "current" => active_connections = val.parse().unwrap_or(0),
                        "totalCreated" => connections = val.parse().unwrap_or(0),
                        _ => {}
                    }
                }
            }

            Ok(DbStats {
                uptime,
                connections,
                active_connections,
                db_size_total: "unknown".to_string(),
                slow_queries: 0,
                extra: HashMap::new(),
            })
        }
        _ => Err(format!("不支持的数据库类型: {}", db_type)),
    }
}

// ==================== 输入验证 ====================

/// 验证标识符（仅允许字母、数字、下划线、连字符），防止命令注入
fn validate_identifier(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("标识符不能为空".to_string());
    }
    for c in name.chars() {
        if !c.is_ascii_alphanumeric() && c != '_' && c != '-' {
            return Err(format!("检测到非法字符 '{}'，标识符仅允许字母、数字、下划线和连字符", c));
        }
    }
    Ok(())
}

/// 转义 SQL 标识符（表名、列名）
fn quote_identifier(name: &str, db_type: &str) -> String {
    match db_type {
        "mysql" => format!("`{}`", name.replace('`', "``")),
        "postgresql" | "sqlite" => format!("\"{}\"" , name.replace('"', "\"\"")),
        _ => name.to_string(),
    }
}

// ==================== 表结构描述 ====================

/// 获取表的列结构信息
pub fn describe_table(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
    database: &str,
    table: &str,
) -> Result<Vec<ColumnInfo>, String> {
    validate_identifier(database)?;
    validate_identifier(table)?;

    match db_type {
        "mysql" => {
            let sql = format!("DESCRIBE {}", quote_identifier(table, db_type));
            let conn_with_db = DbConnection {
                database: Some(database.to_string()),
                ..conn.clone()
            };
            let result = execute_sql(ssh, db_type, &conn_with_db, &sql)?;
            // MySQL DESCRIBE 输出: Field, Type, Null, Key, Default, Extra
            let columns = result.rows.iter().filter_map(|row| {
                if row.len() >= 3 {
                    Some(ColumnInfo {
                        name: row[0].clone(),
                        data_type: row[1].clone(),
                        is_nullable: row.get(2).map(|s| s == "YES").unwrap_or(true),
                        is_primary_key: row.get(3).map(|s| s == "PRI").unwrap_or(false),
                        default_value: row.get(4).cloned().filter(|s| !s.is_empty() && s != "NULL"),
                    })
                } else {
                    None
                }
            }).collect();
            Ok(columns)
        }
        "postgresql" => {
            let sql = format!(
                "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '{}' ORDER BY ordinal_position",
                table.replace('\'', "''")
            );
            let conn_with_db = DbConnection {
                database: Some(database.to_string()),
                ..conn.clone()
            };
            let result = execute_sql(ssh, db_type, &conn_with_db, &sql)?;
            // 查询主键信息
            let pk_sql = format!(
                "SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = '{}'::regclass AND i.indisprimary",
                table.replace('\'', "''")
            );
            let pk_result = execute_sql(ssh, db_type, &conn_with_db, &pk_sql).unwrap_or(SqlResult {
                columns: vec![], rows: vec![], row_count: 0, affected_rows: None, execution_time_ms: 0, error: None,
            });
            let pk_cols: Vec<String> = pk_result.rows.iter().filter_map(|r| r.first().cloned()).collect();

            let columns = result.rows.iter().filter_map(|row| {
                if row.len() >= 3 {
                    Some(ColumnInfo {
                        name: row[0].clone(),
                        data_type: row[1].clone(),
                        is_nullable: row[2] == "YES",
                        is_primary_key: pk_cols.contains(&row[0]),
                        default_value: row.get(3).cloned().filter(|s| !s.is_empty()),
                    })
                } else {
                    None
                }
            }).collect();
            Ok(columns)
        }
        _ => Err(format!("{} 暂不支持获取表结构", db_type)),
    }
}

// ==================== 分页查询 ====================

/// 分页查询表数据
pub fn select_rows(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
    database: &str,
    table: &str,
    page: u32,
    page_size: u32,
) -> Result<PaginatedResult, String> {
    validate_identifier(database)?;
    validate_identifier(table)?;

    // page 为 1-based；page<=1 时从头开始
    let offset = page.saturating_sub(1) * page_size;
    let conn_with_db = DbConnection {
        database: Some(database.to_string()),
        ..conn.clone()
    };
    let quoted_table = quote_identifier(table, db_type);

    match db_type {
        "mysql" | "postgresql" => {
            // 获取总行数
            let count_sql = format!("SELECT COUNT(*) FROM {}", quoted_table);
            let count_result = execute_sql(ssh, db_type, &conn_with_db, &count_sql)?;
            let total_count: u64 = count_result.rows.first()
                .and_then(|r| r.first())
                .and_then(|s| s.trim().parse().ok())
                .unwrap_or(0);

            // 获取分页数据
            let data_sql = format!(
                "SELECT * FROM {} LIMIT {} OFFSET {}",
                quoted_table, page_size, offset
            );
            let result = execute_sql(ssh, db_type, &conn_with_db, &data_sql)?;

            Ok(PaginatedResult {
                columns: result.columns,
                rows: result.rows,
                total_count,
                page,
                page_size,
            })
        }
        _ => Err(format!("{} 暂不支持分页查询", db_type)),
    }
}

// ==================== 行级 CRUD ====================

/// 更新行
pub fn update_row(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
    params: &UpdateRowParams,
) -> Result<SqlResult, String> {
    validate_identifier(&params.database)?;
    validate_identifier(&params.table)?;

    match db_type {
        "mysql" => {
            let mut set_clauses = Vec::new();
            for (col, val) in &params.updates {
                validate_identifier(col)?;
                let val_str = match val {
                    Some(v) => format!("'{}'", escape_sql_value(v, db_type)),
                    None => "NULL".to_string(),
                };
                set_clauses.push(format!("{}={}", quote_identifier(col, db_type), val_str));
            }

            let mut where_clauses = Vec::new();
            for (col, val) in &params.conditions {
                validate_identifier(col)?;
                where_clauses.push(format!("{}='{}'", quote_identifier(col, db_type), escape_sql_value(val, db_type)));
            }

            if set_clauses.is_empty() { return Err("没有要更新的字段".to_string()); }
            if where_clauses.is_empty() { return Err("更新操作必须包含条件".to_string()); }

            let sql = format!(
                "UPDATE {}.{} SET {} WHERE {}",
                quote_identifier(&params.database, db_type),
                quote_identifier(&params.table, db_type),
                set_clauses.join(", "),
                where_clauses.join(" AND ")
            );
            let conn_with_db = DbConnection { database: Some(params.database.clone()), ..conn.clone() };
            execute_sql(ssh, db_type, &conn_with_db, &sql)
        }
        "postgresql" => {
            let mut set_clauses = Vec::new();
            for (col, val) in &params.updates {
                validate_identifier(col)?;
                let val_str = match val {
                    Some(v) => format!("'{}'", escape_sql_value(v, db_type)),
                    None => "NULL".to_string(),
                };
                set_clauses.push(format!("{}={}", quote_identifier(col, db_type), val_str));
            }

            let mut where_clauses = Vec::new();
            for (col, val) in &params.conditions {
                validate_identifier(col)?;
                where_clauses.push(format!("{}='{}'", quote_identifier(col, db_type), escape_sql_value(val, db_type)));
            }

            if set_clauses.is_empty() { return Err("没有要更新的字段".to_string()); }
            if where_clauses.is_empty() { return Err("更新操作必须包含条件".to_string()); }

            let sql = format!(
                "UPDATE {} SET {} WHERE {}",
                quote_identifier(&params.table, db_type),
                set_clauses.join(", "),
                where_clauses.join(" AND ")
            );
            let conn_with_db = DbConnection { database: Some(params.database.clone()), ..conn.clone() };
            execute_sql(ssh, db_type, &conn_with_db, &sql)
        }
        _ => Err(format!("{} 暂不支持更新操作", db_type)),
    }
}

/// 删除行
pub fn delete_row(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
    params: &DeleteRowParams,
) -> Result<SqlResult, String> {
    validate_identifier(&params.database)?;
    validate_identifier(&params.table)?;

    match db_type {
        "mysql" => {
            let mut where_clauses = Vec::new();
            for (col, val) in &params.conditions {
                validate_identifier(col)?;
                where_clauses.push(format!("{}='{}'", quote_identifier(col, db_type), escape_sql_value(val, db_type)));
            }
            if where_clauses.is_empty() { return Err("删除操作必须包含条件".to_string()); }

            let sql = format!(
                "DELETE FROM {}.{} WHERE {}",
                quote_identifier(&params.database, db_type),
                quote_identifier(&params.table, db_type),
                where_clauses.join(" AND ")
            );
            let conn_with_db = DbConnection { database: Some(params.database.clone()), ..conn.clone() };
            execute_sql(ssh, db_type, &conn_with_db, &sql)
        }
        "postgresql" => {
            let mut where_clauses = Vec::new();
            for (col, val) in &params.conditions {
                validate_identifier(col)?;
                where_clauses.push(format!("{}='{}'", quote_identifier(col, db_type), escape_sql_value(val, db_type)));
            }
            if where_clauses.is_empty() { return Err("删除操作必须包含条件".to_string()); }

            let sql = format!(
                "DELETE FROM {} WHERE {}",
                quote_identifier(&params.table, db_type),
                where_clauses.join(" AND ")
            );
            let conn_with_db = DbConnection { database: Some(params.database.clone()), ..conn.clone() };
            execute_sql(ssh, db_type, &conn_with_db, &sql)
        }
        _ => Err(format!("{} 暂不支持删除操作", db_type)),
    }
}

/// 插入行
pub fn insert_row(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
    params: &InsertRowParams,
) -> Result<SqlResult, String> {
    validate_identifier(&params.database)?;
    validate_identifier(&params.table)?;

    match db_type {
        "mysql" => {
            let mut columns = Vec::new();
            let mut values = Vec::new();
            for (col, val) in &params.data {
                validate_identifier(col)?;
                columns.push(quote_identifier(col, db_type));
                match val {
                    Some(v) => values.push(format!("'{}'", escape_sql_value(v, db_type))),
                    None => values.push("NULL".to_string()),
                }
            }
            if columns.is_empty() { return Err("插入数据不能为空".to_string()); }

            let sql = format!(
                "INSERT INTO {}.{} ({}) VALUES ({})",
                quote_identifier(&params.database, db_type),
                quote_identifier(&params.table, db_type),
                columns.join(", "),
                values.join(", ")
            );
            let conn_with_db = DbConnection { database: Some(params.database.clone()), ..conn.clone() };
            execute_sql(ssh, db_type, &conn_with_db, &sql)
        }
        "postgresql" => {
            let mut columns = Vec::new();
            let mut values = Vec::new();
            for (col, val) in &params.data {
                validate_identifier(col)?;
                columns.push(quote_identifier(col, db_type));
                match val {
                    Some(v) => values.push(format!("'{}'", escape_sql_value(v, db_type))),
                    None => values.push("NULL".to_string()),
                }
            }
            if columns.is_empty() { return Err("插入数据不能为空".to_string()); }

            let sql = format!(
                "INSERT INTO {} ({}) VALUES ({})",
                quote_identifier(&params.table, db_type),
                columns.join(", "),
                values.join(", ")
            );
            let conn_with_db = DbConnection { database: Some(params.database.clone()), ..conn.clone() };
            execute_sql(ssh, db_type, &conn_with_db, &sql)
        }
        _ => Err(format!("{} 暂不支持插入操作", db_type)),
    }
}

// ==================== 安全审计 ====================

/// 运行数据库安全审计
pub fn run_security_audit(
    ssh: &SSHManagerRussh,
    db_type: &str,
    conn: &DbConnection,
) -> Result<Vec<SecurityCheckResult>, String> {
    let mut results = Vec::new();

    match db_type {
        "mysql" => {
            results.push(check_mysql_empty_passwords(ssh, db_type, conn));
            results.push(check_mysql_privileged_users(ssh, db_type, conn));
            results.push(check_mysql_remote_root(ssh, db_type, conn));
            results.push(check_mysql_anonymous_users(ssh, db_type, conn));
        }
        "postgresql" => {
            results.push(check_postgres_superusers(ssh, db_type, conn));
        }
        "redis" => {
            results.push(check_redis_password(ssh, conn));
        }
        _ => {
            results.push(SecurityCheckResult {
                check_id: "unsupported".to_string(),
                check_name: "不支持的数据库类型".to_string(),
                severity: SecuritySeverity::Info,
                status: CheckStatus::Warning,
                findings: vec![],
                recommendation: format!("暂不支持 {} 的安全审计", db_type),
            });
        }
    }

    Ok(results)
}

// ---- MySQL 安全检查 ----

fn check_mysql_empty_passwords(ssh: &SSHManagerRussh, db_type: &str, conn: &DbConnection) -> SecurityCheckResult {
    let sql = "SELECT Host, User FROM mysql.user WHERE authentication_string = '' OR authentication_string IS NULL";
    match execute_sql(ssh, db_type, conn, sql) {
        Ok(result) => {
            let findings: Vec<SecurityFinding> = result.rows.iter().filter_map(|row| {
                if row.len() >= 2 && !row[1].trim().is_empty() {
                    Some(SecurityFinding {
                        item: format!("{}@{}", row[1], row[0]),
                        detail: format!("用户 {}@{} 无密码", row[1], row[0]),
                    })
                } else { None }
            }).collect();
            SecurityCheckResult {
                check_id: "mysql_empty_passwords".to_string(),
                check_name: "空口令用户检查".to_string(),
                severity: if findings.is_empty() { SecuritySeverity::Info } else { SecuritySeverity::Critical },
                status: if findings.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                findings,
                recommendation: "为所有用户设置强密码".to_string(),
            }
        }
        Err(e) => SecurityCheckResult {
            check_id: "mysql_empty_passwords".to_string(),
            check_name: "空口令用户检查".to_string(),
            severity: SecuritySeverity::Info,
            status: CheckStatus::Error,
            findings: vec![SecurityFinding { item: "error".to_string(), detail: e }],
            recommendation: String::new(),
        },
    }
}

fn check_mysql_privileged_users(ssh: &SSHManagerRussh, db_type: &str, conn: &DbConnection) -> SecurityCheckResult {
    let sql = "SELECT Host, User, Super_priv, Grant_priv FROM mysql.user WHERE Super_priv = 'Y' OR Grant_priv = 'Y'";
    match execute_sql(ssh, db_type, conn, sql) {
        Ok(result) => {
            let findings: Vec<SecurityFinding> = result.rows.iter().filter_map(|row| {
                if row.len() >= 4 {
                    Some(SecurityFinding {
                        item: format!("{}@{}", row[1], row[0]),
                        detail: format!("SUPER: {}, GRANT: {}", row[2], row[3]),
                    })
                } else { None }
            }).collect();
            SecurityCheckResult {
                check_id: "mysql_privileged_users".to_string(),
                check_name: "高权限用户审计".to_string(),
                severity: SecuritySeverity::High,
                status: if findings.is_empty() { CheckStatus::Pass } else { CheckStatus::Warning },
                findings,
                recommendation: "最小化具有 SUPER 和 GRANT 权限的用户数量".to_string(),
            }
        }
        Err(e) => SecurityCheckResult {
            check_id: "mysql_privileged_users".to_string(),
            check_name: "高权限用户审计".to_string(),
            severity: SecuritySeverity::Info,
            status: CheckStatus::Error,
            findings: vec![SecurityFinding { item: "error".to_string(), detail: e }],
            recommendation: String::new(),
        },
    }
}

fn check_mysql_remote_root(ssh: &SSHManagerRussh, db_type: &str, conn: &DbConnection) -> SecurityCheckResult {
    let sql = "SELECT Host, User FROM mysql.user WHERE User = 'root' AND Host NOT IN ('localhost', '127.0.0.1', '::1')";
    match execute_sql(ssh, db_type, conn, sql) {
        Ok(result) => {
            let findings: Vec<SecurityFinding> = result.rows.iter().filter_map(|row| {
                if row.len() >= 2 {
                    Some(SecurityFinding {
                        item: format!("root@{}", row[0]),
                        detail: "允许远程 root 访问".to_string(),
                    })
                } else { None }
            }).collect();
            SecurityCheckResult {
                check_id: "mysql_remote_root".to_string(),
                check_name: "远程 Root 访问检查".to_string(),
                severity: if findings.is_empty() { SecuritySeverity::Info } else { SecuritySeverity::Critical },
                status: if findings.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                findings,
                recommendation: "禁止 root 用户远程访问".to_string(),
            }
        }
        Err(e) => SecurityCheckResult {
            check_id: "mysql_remote_root".to_string(),
            check_name: "远程 Root 访问检查".to_string(),
            severity: SecuritySeverity::Info,
            status: CheckStatus::Error,
            findings: vec![SecurityFinding { item: "error".to_string(), detail: e }],
            recommendation: String::new(),
        },
    }
}

fn check_mysql_anonymous_users(ssh: &SSHManagerRussh, db_type: &str, conn: &DbConnection) -> SecurityCheckResult {
    let sql = "SELECT Host, User FROM mysql.user WHERE User = ''";
    match execute_sql(ssh, db_type, conn, sql) {
        Ok(result) => {
            let findings: Vec<SecurityFinding> = result.rows.iter().filter_map(|row| {
                if row.len() >= 1 {
                    Some(SecurityFinding {
                        item: "匿名用户".to_string(),
                        detail: row.join(" | "),
                    })
                } else { None }
            }).collect();
            SecurityCheckResult {
                check_id: "mysql_anonymous_users".to_string(),
                check_name: "匿名用户检查".to_string(),
                severity: if findings.is_empty() { SecuritySeverity::Info } else { SecuritySeverity::High },
                status: if findings.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                findings,
                recommendation: "删除匿名用户".to_string(),
            }
        }
        Err(e) => SecurityCheckResult {
            check_id: "mysql_anonymous_users".to_string(),
            check_name: "匿名用户检查".to_string(),
            severity: SecuritySeverity::Info,
            status: CheckStatus::Error,
            findings: vec![SecurityFinding { item: "error".to_string(), detail: e }],
            recommendation: String::new(),
        },
    }
}

// ---- PostgreSQL 安全检查 ----

fn check_postgres_superusers(ssh: &SSHManagerRussh, db_type: &str, conn: &DbConnection) -> SecurityCheckResult {
    let sql = "SELECT usename FROM pg_user WHERE usesuper = true";
    match execute_sql(ssh, db_type, conn, sql) {
        Ok(result) => {
            let findings: Vec<SecurityFinding> = result.rows.iter().filter_map(|row| {
                row.first().map(|name| SecurityFinding {
                    item: name.trim().to_string(),
                    detail: "超级用户权限".to_string(),
                })
            }).collect();
            SecurityCheckResult {
                check_id: "pg_superusers".to_string(),
                check_name: "超级用户审计".to_string(),
                severity: SecuritySeverity::High,
                status: if findings.len() <= 1 { CheckStatus::Pass } else { CheckStatus::Warning },
                findings,
                recommendation: "最小化超级用户数量，仅保留必要的管理员".to_string(),
            }
        }
        Err(e) => SecurityCheckResult {
            check_id: "pg_superusers".to_string(),
            check_name: "超级用户审计".to_string(),
            severity: SecuritySeverity::Info,
            status: CheckStatus::Error,
            findings: vec![SecurityFinding { item: "error".to_string(), detail: e }],
            recommendation: String::new(),
        },
    }
}

// ---- Redis 安全检查 ----

fn check_redis_password(_ssh: &SSHManagerRussh, conn: &DbConnection) -> SecurityCheckResult {
    let has_password = !conn.password.is_empty();
    SecurityCheckResult {
        check_id: "redis_password".to_string(),
        check_name: "Redis 密码检查".to_string(),
        severity: if has_password { SecuritySeverity::Info } else { SecuritySeverity::Critical },
        status: if has_password { CheckStatus::Pass } else { CheckStatus::Fail },
        findings: if has_password {
            vec![]
        } else {
            vec![SecurityFinding {
                item: "redis".to_string(),
                detail: "Redis 未设置密码，任何人可直接访问".to_string(),
            }]
        },
        recommendation: "使用 requirepass 配置项设置强密码".to_string(),
    }
}
