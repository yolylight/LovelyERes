// 数据库管理核心模块
// Database Manager Core Module

use crate::database_types::*;
use crate::docker_manager::DockerManager;
use crate::ssh_manager_russh::SSHManagerRussh;
use std::time::Instant;

pub struct DatabaseManager;

impl DatabaseManager {
    // ============ 环境检测 ============

    /// 检测服务器数据库环境（客户端 + Docker 容器）
    pub fn detect_environment(
        ssh_manager: &SSHManagerRussh,
        session_id: &str,
    ) -> Result<DatabaseEnvironment, String> {
        let start = Instant::now();
        
        // 并行检测客户端和容器
        let clients = Self::detect_clients(ssh_manager, session_id)?;
        let docker_containers = Self::detect_docker_containers(ssh_manager, session_id)?;
        
        let detected_at = chrono::Utc::now().to_rfc3339();
        
        println!(
            "✅ 环境检测完成 - 客户端: {}, Docker容器: {} (耗时 {}ms)",
            clients.len(),
            docker_containers.len(),
            start.elapsed().as_millis()
        );
        
        Ok(DatabaseEnvironment {
            session_id: session_id.to_string(),
            clients,
            docker_containers,
            detected_at,
        })
    }

    /// 检测已安装的数据库客户端
    fn detect_clients(
        ssh_manager: &SSHManagerRussh,
        session_id: &str,
    ) -> Result<Vec<DatabaseClientInfo>, String> {
        let mut clients = Vec::new();

        // 检测 MySQL
        if let Ok(info) = Self::detect_client(ssh_manager, session_id, DatabaseType::MySQL, "mysql") {
            clients.push(info);
        }

        // 检测 PostgreSQL
        if let Ok(info) = Self::detect_client(ssh_manager, session_id, DatabaseType::PostgreSQL, "psql") {
            clients.push(info);
        }

        // 检测 Redis
        if let Ok(info) = Self::detect_client(ssh_manager, session_id, DatabaseType::Redis, "redis-cli") {
            clients.push(info);
        }

        // 检测 MongoDB (优先 mongosh)
        if let Ok(info) = Self::detect_client(ssh_manager, session_id, DatabaseType::MongoDB, "mongosh") {
            clients.push(info);
        } else if let Ok(info) = Self::detect_client(ssh_manager, session_id, DatabaseType::MongoDB, "mongo") {
            clients.push(info);
        }

        // 检测 SQLite
        if let Ok(info) = Self::detect_client(ssh_manager, session_id, DatabaseType::SQLite, "sqlite3") {
            clients.push(info);
        }

        Ok(clients)
    }

    /// 检测单个数据库客户端
    fn detect_client(
        ssh_manager: &SSHManagerRussh,
        session_id: &str,
        db_type: DatabaseType,
        command: &str,
    ) -> Result<DatabaseClientInfo, String> {
        let detect_cmd = format!("which {} && {} --version 2>&1 | head -1", command, command);
        
        match ssh_manager.execute_command_on_session(session_id, &detect_cmd) {
            Ok(terminal_output) => {
                let output = &terminal_output.output;
                let lines: Vec<&str> = output.trim().lines().collect();
                if lines.len() >= 2 {
                    let client_path = lines[0].trim().to_string();
                    let version = Self::parse_version(lines[1]);
                    
                    Ok(DatabaseClientInfo {
                        db_type,
                        available: true,
                        client_path: Some(client_path),
                        version: Some(version),
                    })
                } else {
                    Err("客户端未安装".to_string())
                }
            }
            Err(_) => Ok(DatabaseClientInfo {
                db_type,
                available: false,
                client_path: None,
                version: None,
            }),
        }
    }

    /// 检测 Docker 数据库容器
    fn detect_docker_containers(
        ssh_manager: &SSHManagerRussh,
        session_id: &str,
    ) -> Result<Vec<DockerDatabaseContainer>, String> {
        let docker_manager = DockerManager::new();
        
        // 使用 DockerManager 对可重用的 Docker 列表功能
        let summaries = match docker_manager.list_containers(ssh_manager, session_id) {
            Ok(s) => s,
            Err(e) => {
                // 如果 Docker 不可用（例如未安装），通常会返回错误
                // 我们可以记录调试日志，但对调用者来说只是没有检测到容器
                println!("Docker 检测返回错误 (或许未安装): {:?}", e);
                return Ok(Vec::new());
            }
        };

        let mut containers = Vec::new();

        // 映射常用数据库镜像名到类型
        let db_keywords: [(&str, DatabaseType); 5] = [
            ("mysql", DatabaseType::MySQL),
            ("mariadb", DatabaseType::MySQL),
            ("postgres", DatabaseType::PostgreSQL),
            ("redis", DatabaseType::Redis),
            ("mongo", DatabaseType::MongoDB),
        ];

        for summary in summaries {
            let image_lower = summary.image.to_lowercase();
            // 简单匹配：如果镜像名包含数据库关键字
            // TODO: 更精确的匹配，或者检查端口
            let mut detected_type = None;
            for (keyword, db_type) in &db_keywords {
                if image_lower.contains(keyword) {
                    detected_type = Some(db_type.clone());
                    break;
                }
            }

            if let Some(db_type) = detected_type {
                let ports = summary.ports.iter().map(|p| {
                     PortMapping {
                         host_port: p.public_port.as_ref().and_then(|s| s.parse().ok()).unwrap_or(0),
                         container_port: p.private_port.parse().unwrap_or(0),
                     }
                }).collect();

                containers.push(DockerDatabaseContainer {
                    container_id: summary.id,
                    container_name: summary.name,
                    db_type,
                    image: summary.image,
                    ports,
                    status: summary.status,
                });
            }
        }

        Ok(containers)
    }



    /// 解析版本号
    fn parse_version(version_line: &str) -> String {
        // 尝试提取版本号，通常格式为: mysql Ver 8.0.35
        version_line
            .split_whitespace()
            .find(|s| s.chars().next().map_or(false, |c| c.is_ascii_digit()))
            .unwrap_or(version_line)
            .to_string()
    }

    /// 验证标识符（仅允许字母、数字、下划线、连字符）
    /// 防止命令注入
    fn validate_identifier(name: &str) -> Result<(), String> {
        if name.is_empty() {
             return Err("标识符不能为空".to_string());
        }
        // 允许的字符集: a-z, A-Z, 0-9, _, -
        // 某些数据库可能允许更多，但作为管理工具，我们采取严格策略以确保安全
        for c in name.chars() {
            if !c.is_ascii_alphanumeric() && c != '_' && c != '-' {
                return Err(format!("检测到非法字符 '{}'，标识符仅允许字母、数字、下划线和连字符", c));
            }
        }
        Ok(())
    }

    /// 转义 Shell 参数（单引号转义）
    fn escape_shell_arg(arg: &str) -> String {
        // 将 ' 替换为 '\'' (结束当前引号，转义单引号，重新开始引号)
        arg.replace("'", "'\\''")
    }

    /// 转义 SQL 标识符（表名、列名）
    fn quote_identifier(name: &str, db_type: &DatabaseType) -> String {
        match db_type {
            DatabaseType::MySQL => format!("`{}`", name.replace("`", "``")),
            DatabaseType::PostgreSQL | DatabaseType::SQLite => format!("\"{}\"", name.replace("\"", "\"\"")),
            _ => name.to_string(),
        }
    }

    // ============ 基础操作 ============

    /// 测试数据库连接
    pub fn test_connection(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<bool, String> {
        let session_id = &config.ssh_connection_id;
        
        let test_cmd = match config.db_type {
            DatabaseType::MySQL => Self::build_mysql_test_command(config)?,
            DatabaseType::PostgreSQL => Self::build_psql_test_command(config)?,
            DatabaseType::Redis => Self::build_redis_test_command(config)?,
            DatabaseType::MongoDB => Self::build_mongo_test_command(config)?,
            DatabaseType::SQLite => return Err("SQLite 不支持远程连接测试".to_string()),
        };

        match ssh_manager.execute_command_on_session(session_id, &test_cmd) {
            Ok(terminal_output) => {
                let output = &terminal_output.output;
                // 检查是否有错误
                Ok(!output.to_lowercase().contains("error") && !output.to_lowercase().contains("failed"))
            }
            Err(e) => Err(format!("连接测试失败: {}", e)),
        }
    }

    /// 执行 SQL 查询
    pub fn execute_query(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
        query: &str,
    ) -> Result<QueryResult, String> {
        let start = Instant::now();
        let session_id = &config.ssh_connection_id;

        let command = match config.db_type {
            DatabaseType::MySQL => Self::build_mysql_command(config, query)?,
            DatabaseType::PostgreSQL => Self::build_psql_command(config, query)?,
            DatabaseType::Redis => Self::build_redis_command(config, query)?,
            DatabaseType::MongoDB => Self::build_mongo_command(config, query)?,
            DatabaseType::SQLite => return Err("SQLite 查询暂未实现".to_string()),
        };

        let terminal_output = ssh_manager.execute_command_on_session(session_id, &command)?;
        let output = terminal_output.output;
        let execution_time_ms = start.elapsed().as_millis() as u64;

        if let Some(code) = terminal_output.exit_code {
            if code != 0 {
                return Ok(QueryResult {
                    columns: vec![],
                    rows: vec![],
                    affected_rows: None,
                    execution_time_ms,
                    error: Some(output),
                });
            }
        }

        match config.db_type {
            DatabaseType::MySQL => Self::parse_mysql_output(&output, execution_time_ms),
            DatabaseType::PostgreSQL => Self::parse_psql_output(&output, execution_time_ms),
            DatabaseType::Redis => Self::parse_redis_output(&output, execution_time_ms),
            DatabaseType::MongoDB => Self::parse_mongo_output(&output, execution_time_ms),
            DatabaseType::SQLite => Err("SQLite 查询暂未实现".to_string()),
        }
    }

    // ============ MySQL 相关 ============

    fn build_mysql_test_command(config: &DatabaseConnection) -> Result<String, String> {
        let password = config.encrypted_password.as_deref().unwrap_or("");
        let base_cmd = format!(
            "mysql -h {} -P {} -u {}",
            config.host,
            config.port,
            Self::escape_shell_arg(config.username.as_deref().unwrap_or("root"))
        );

        let cmd = if !password.is_empty() {
            format!("{} -p'{}' -e 'SELECT 1'", base_cmd, password)
        } else {
            format!("{} -e 'SELECT 1'", base_cmd)
        };

        Ok(Self::wrap_docker_exec(config, &cmd))
    }

    fn build_mysql_command(config: &DatabaseConnection, query: &str) -> Result<String, String> {
        let password = config.encrypted_password.as_deref().unwrap_or("");
        let database = config.database.as_deref().unwrap_or("");
        
        let mut cmd = format!(
            "mysql -h {} -P {} -u {}",
            config.host,
            config.port,
            Self::escape_shell_arg(config.username.as_deref().unwrap_or("root"))
        );

        if !password.is_empty() {
            cmd.push_str(&format!(" -p'{}'", password));
        }

        if !database.is_empty() {
             // 数据库名可能包含特殊字符，需要转义
            cmd.push_str(&format!(" {}", Self::escape_shell_arg(database)));
        }

        // 使用单引号包裹 query 并进行转义，防止 bash 变量扩展和反引号执行
    cmd.push_str(&format!(" -e '{}'", Self::escape_shell_arg(query)));

        Ok(Self::wrap_docker_exec(config, &cmd))
    }

    fn parse_mysql_output(output: &str, execution_time_ms: u64) -> Result<QueryResult, String> {
        let lines: Vec<&str> = output.trim().lines().collect();
        
        if lines.is_empty() {
            return Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                affected_rows: None,
                execution_time_ms,
                error: None,
            });
        }

        // 第一行是列名
        let columns: Vec<String> = lines[0]
            .split('\t')
            .map(|s| s.trim().to_string())
            .collect();

        // 其余行是数据
        let rows: Vec<Vec<String>> = lines[1..]
            .iter()
            .map(|line| {
                line.split('\t')
                    .map(|s| s.trim().to_string())
                    .collect()
            })
            .collect();

        Ok(QueryResult {
            columns,
            rows,
            affected_rows: None,
            execution_time_ms,
            error: None,
        })
    }

    // ============ PostgreSQL 相关 ============

    fn build_psql_test_command(config: &DatabaseConnection) -> Result<String, String> {
        let cmd = format!(
            "PGPASSWORD='{}' psql -h {} -p {} -U {} -c 'SELECT 1'",
            config.encrypted_password.as_deref().map(Self::escape_shell_arg).unwrap_or_default(),
            config.host,
            config.port,
            Self::escape_shell_arg(config.username.as_deref().unwrap_or("postgres"))
        );

        Ok(Self::wrap_docker_exec(config, &cmd))
    }

    fn build_psql_command(config: &DatabaseConnection, query: &str) -> Result<String, String> {
        let database = config.database.as_deref().unwrap_or("postgres");
        
        let cmd = format!(
            "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -c '{}'",
            config.encrypted_password.as_deref().map(Self::escape_shell_arg).unwrap_or_default(),
            config.host,
            config.port,
            Self::escape_shell_arg(config.username.as_deref().unwrap_or("postgres")),
            Self::escape_shell_arg(database),
            Self::escape_shell_arg(query)
        );

        Ok(Self::wrap_docker_exec(config, &cmd))
    }

    fn parse_psql_output(output: &str, execution_time_ms: u64) -> Result<QueryResult, String> {
        // PostgreSQL 输出格式类似 MySQL
        Self::parse_mysql_output(output, execution_time_ms)
    }

    // ============ Redis 相关 ============

    fn build_redis_test_command(config: &DatabaseConnection) -> Result<String, String> {
        let cmd = match config.encrypted_password.as_ref().filter(|p| !p.is_empty()) {
            Some(password) => format!("redis-cli -h {} -p {} -a '{}' PING", config.host, config.port, Self::escape_shell_arg(password)),
            None => format!("redis-cli -h {} -p {} PING", config.host, config.port),
        };

        Ok(Self::wrap_docker_exec(config, &cmd))
    }

    fn build_redis_command(config: &DatabaseConnection, command: &str) -> Result<String, String> {
        let cmd = match config.encrypted_password.as_ref().filter(|p| !p.is_empty()) {
            Some(password) => format!("redis-cli -h {} -p {} -a '{}' {}", config.host, config.port, Self::escape_shell_arg(password), command),
            None => format!("redis-cli -h {} -p {} {}", config.host, config.port, command),
        };

        Ok(Self::wrap_docker_exec(config, &cmd))
    }

    fn parse_redis_output(output: &str, execution_time_ms: u64) -> Result<QueryResult, String> {
        let lines: Vec<String> = output.trim().lines().map(|s| s.to_string()).collect();
        
        Ok(QueryResult {
            columns: vec!["结果".to_string()],
            rows: lines.iter().map(|line| vec![line.clone()]).collect(),
            affected_rows: None,
            execution_time_ms,
            error: None,
        })
    }

    // ============ MongoDB 相关 ============

    fn build_mongo_test_command(config: &DatabaseConnection) -> Result<String, String> {
        let cmd = if let Some(password) = &config.encrypted_password {
            format!(
                "mongosh --host {} --port {} --username {} --password '{}' --eval 'db.version()'",
                config.host, config.port, 
                Self::escape_shell_arg(config.username.as_deref().unwrap_or("admin")),
                Self::escape_shell_arg(password)
            )
        } else {
            format!(
                "mongosh --host {} --port {} --eval 'db.version()'",
                config.host, config.port
            )
        };

        Ok(Self::wrap_docker_exec(config, &cmd))
    }

    fn build_mongo_command(config: &DatabaseConnection, query: &str) -> Result<String, String> {
        let database = config.database.as_deref().unwrap_or("admin");
        
        let cmd = if let Some(password) = &config.encrypted_password {
            format!(
                "mongosh --host {} --port {} --username {} --password '{}' {} --eval \"{}\"",
                config.host, config.port,
                Self::escape_shell_arg(config.username.as_deref().unwrap_or("admin")),
                Self::escape_shell_arg(password),
                Self::escape_shell_arg(database),
                query.replace("\"", "\\\"")
            )
        } else {
            format!(
                "mongosh --host {} --port {} {} --eval \"{}\"",
                config.host, config.port, 
                Self::escape_shell_arg(database),
                query.replace("\"", "\\\"")
            )
        };

        Ok(Self::wrap_docker_exec(config, &cmd))
    }

    fn parse_mongo_output(output: &str, execution_time_ms: u64) -> Result<QueryResult, String> {
        // 简单处理 MongoDB 输出
        let lines: Vec<String> = output.trim().lines().map(|s| s.to_string()).collect();
        
        Ok(QueryResult {
            columns: vec!["结果".to_string()],
            rows: lines.iter().map(|line| vec![line.clone()]).collect(),
            affected_rows: None,
            execution_time_ms,
            error: None,
        })
    }

    // ============ Docker 支持 ============

    /// 包装 Docker exec 命令
    /// 注意：cmd 中的单引号必须已经通过 escape_shell_arg 处理过
    fn wrap_docker_exec(config: &DatabaseConnection, cmd: &str) -> String {
        match &config.connection_mode {
            ConnectionMode::Direct => cmd.to_string(),
            ConnectionMode::Docker { container_id, .. } => {
                // Docker exec 需要谨慎处理转义
                // sh -c "cmd" -> cmd 中的双引号需要转义
                format!("docker exec -i {} sh -c \"{}\"", container_id, cmd.replace("\"", "\\\""))
            }
        }
    }

    // ============ 数据库浏览器 ============

    /// 列出数据库
    pub fn list_databases(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<Vec<String>, String> {
        let session_id = &config.ssh_connection_id;

        match config.db_type {
            DatabaseType::MySQL => {
                // MySQL: 密码如果包含特殊字符可能破坏命令
                // 使用 export MYSQL_PWD 方式更安全（虽然在 ps 中可能仍可见，但避免了 CLI 参数解析问题）
                // 暂时保持 -p 但确保转义
                let password_arg = config.encrypted_password.as_ref()
                    .map(|p| format!("-p'{}'", Self::escape_shell_arg(p)))
                    .unwrap_or_default();

                let command = Self::wrap_docker_exec(config, &format!(
                    "mysql -h {} -P {} -u {} {} -e 'SHOW DATABASES'",
                    config.host,
                    config.port,
                    config.username.as_deref().unwrap_or("root"),
                    password_arg
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let databases: Vec<String> = output
                    .lines()
                    .skip(1)
                    .filter_map(|line| {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() && trimmed != "Database" {
                            Some(trimmed.to_string())
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(databases)
            }
            DatabaseType::PostgreSQL => {
                let command = Self::wrap_docker_exec(config, &format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -t -c \"SELECT datname FROM pg_database WHERE datistemplate = false\"",
                    config.encrypted_password.as_deref().unwrap_or(""),
                    config.host,
                    config.port,
                    config.username.as_deref().unwrap_or("postgres")
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let databases: Vec<String> = output
                    .lines()
                    .filter_map(|line| {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            Some(trimmed.to_string())
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(databases)
            }
            DatabaseType::Redis => {
                // Redis 有16个数据库 (0-15)
                Ok((0..16).map(|i| format!("db{}", i)).collect())
            }
            DatabaseType::MongoDB => {
                let command = Self::wrap_docker_exec(config, &format!(
                    "mongosh --host {} --port {} {} --quiet --eval 'db.adminCommand({{listDatabases: 1}}).databases.map(d => d.name).join(\"\\n\")'",
                    config.host,
                    config.port,
                    config.encrypted_password.as_ref()
                        .map(|p| format!("-u {} -p '{}'", config.username.as_deref().unwrap_or("admin"), p))
                        .unwrap_or_default()
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let databases: Vec<String> = output
                    .lines()
                    .filter_map(|line| {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() && !trimmed.starts_with("Using") {
                            Some(trimmed.to_string())
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(databases)
            }
            DatabaseType::SQLite => {
                // SQLite 只有单个数据库文件
                Ok(vec!["main".to_string()])
            }
        }
    }

    /// 列出表（或集合/键）
    pub fn list_tables(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
        database: &str,
    ) -> Result<Vec<TableInfo>, String> {
        let session_id = &config.ssh_connection_id;

        match config.db_type {
            DatabaseType::MySQL => {
                Self::validate_identifier(database)?;

                let command = Self::wrap_docker_exec(config, &format!(
                    "mysql -h {} -P {} -u {} {} {} -e 'SHOW TABLES'",
                    config.host,
                    config.port,
                    config.username.as_deref().unwrap_or("root"),
                    config.encrypted_password.as_ref()
                        .map(|p| format!("-p'{}'", Self::escape_shell_arg(p)))
                        .unwrap_or_default(),
                    database // validate_identifier 保证了这里安全
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let tables: Vec<TableInfo> = output
                    .lines()
                    .skip(1)
                    .filter_map(|line| {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            Some(TableInfo {
                                name: trimmed.to_string(),
                                table_type: "TABLE".to_string(),
                                row_count: None,
                            })
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(tables)
            }
            DatabaseType::PostgreSQL => {
                Self::validate_identifier(database)?;
                
                let command = Self::wrap_docker_exec(config, &format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -c \"SELECT table_name FROM information_schema.tables WHERE table_schema='public'\"",
                    config.encrypted_password.as_ref().map(|p| Self::escape_shell_arg(p)).unwrap_or_default(),
                    config.host,
                    config.port,
                    config.username.as_deref().unwrap_or("postgres"),
                    database
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let tables: Vec<TableInfo> = output
                    .lines()
                    .filter_map(|line| {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            Some(TableInfo {
                                name: trimmed.to_string(),
                                table_type: "TABLE".to_string(),
                                row_count: None,
                            })
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(tables)
            }
            DatabaseType::Redis => {
                // Redis: KEYS *
                // database 格式通常为 db0, db1...
                // 暂时只验证是否为 db数字 格式，或者简单字符
                Self::validate_identifier(database)?;
                let db_index = database.strip_prefix("db").unwrap_or("0");
                
                // 验证 db_index 是否为数字
                if !db_index.chars().all(|c| c.is_ascii_digit()) {
                    return Err(format!("Redis 数据库名称格式无效: {}", database));
                }

                let auth_str = config.encrypted_password.as_ref()
                    .map(|p| {
                         if let Some(user) = &config.username {
                             format!("--user '{}' -a '{}'", Self::escape_shell_arg(user), Self::escape_shell_arg(p))
                         } else {
                             format!("-a '{}'", Self::escape_shell_arg(p))
                         }
                    })
                    .unwrap_or_default();

                let command = Self::wrap_docker_exec(config, &format!(
                    "redis-cli -h {} -p {} {} -n {} KEYS '*' | head -n 100",
                    config.host, config.port,
                    auth_str,
                    db_index
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let tables: Vec<TableInfo> = output
                    .lines()
                    .filter_map(|line| {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() && !trimmed.contains("OK") && !trimmed.contains("Warning") {
                            Some(TableInfo {
                                name: trimmed.to_string(),
                                table_type: "KEY".to_string(),
                                row_count: None,
                            })
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(tables)
            }
            DatabaseType::MongoDB => {
                Self::validate_identifier(database)?;

                let command = Self::wrap_docker_exec(config, &format!(
                    "mongosh --host {} --port {} {} --quiet --eval 'use {}; db.getCollectionNames().join(\"\\n\")'",
                    config.host,
                    config.port,
                    config.encrypted_password.as_ref()
                        .map(|p| format!("-u {} -p '{}'", config.username.as_deref().unwrap_or("admin"), Self::escape_shell_arg(p)))
                        .unwrap_or_default(),
                    database
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let tables: Vec<TableInfo> = output
                    .lines()
                    .filter_map(|line| {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() && !trimmed.starts_with("switched") {
                            Some(TableInfo {
                                name: trimmed.to_string(),
                                table_type: "COLLECTION".to_string(),
                                row_count: None,
                            })
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(tables)
            }
            DatabaseType::SQLite => {
                // SQLite: 从配置中的 database 字段获取文件路径
                let db_path = config.database.as_deref().unwrap_or("/tmp/database.db");
                let command = Self::wrap_docker_exec(config, &format!(
                    "sqlite3 {} \".tables\"",
                    db_path
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let tables: Vec<TableInfo> = output
                    .split_whitespace()
                    .filter_map(|name| {
                        let trimmed = name.trim();
                        if !trimmed.is_empty() {
                            Some(TableInfo {
                                name: trimmed.to_string(),
                                table_type: "TABLE".to_string(),
                                row_count: None,
                            })
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(tables)
            }
        }
    }

    /// 获取表结构（或键/集合信息）
    pub fn describe_table(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
        database: &str,
        table: &str,
    ) -> Result<Vec<TableColumn>, String> {
        let session_id = &config.ssh_connection_id;

        match config.db_type {
            DatabaseType::MySQL => {
                Self::validate_identifier(database)?;
                Self::validate_identifier(table)?;

                let command = Self::wrap_docker_exec(config, &format!(
                    "mysql -h {} -P {} -u {} {} {} -e 'DESCRIBE {}'",
                    config.host,
                    config.port,
                    config.username.as_deref().unwrap_or("root"),
                    config.encrypted_password.as_ref()
                        .map(|p| format!("-p'{}'", Self::escape_shell_arg(p)))
                        .unwrap_or_default(),
                    database,
                    Self::quote_identifier(table, &config.db_type)
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let columns: Vec<TableColumn> = output
                    .lines()
                    .skip(1)
                    .filter_map(|line| {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            let parts: Vec<&str> = trimmed.split('\t').collect();
                            if parts.len() >= 3 {
                                Some(TableColumn {
                                    name: parts[0].trim().to_string(),
                                    data_type: parts[1].trim().to_string(),
                                    nullable: parts.get(2).map(|s| s.trim() == "YES").unwrap_or(true),
                                    key: parts.get(3).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
                                    default_value: parts.get(4).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
                                    extra: parts.get(5).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
                                })
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(columns)
            }
            DatabaseType::PostgreSQL => {
                Self::validate_identifier(database)?;
                Self::validate_identifier(table)?;

                let command = Self::wrap_docker_exec(config, &format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -c \"SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '{}'\"",
                    config.encrypted_password.as_ref().map(|p| Self::escape_shell_arg(p)).unwrap_or_default(),
                    config.host,
                    config.port,
                    config.username.as_deref().unwrap_or("postgres"),
                    database,
                    table
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let columns: Vec<TableColumn> = output
                    .lines()
                    .filter_map(|line| {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            let parts: Vec<&str> = trimmed.split('|').collect();
                            if parts.len() >= 3 {
                                Some(TableColumn {
                                    name: parts[0].trim().to_string(),
                                    data_type: parts[1].trim().to_string(),
                                    nullable: parts[2].trim() == "YES",
                                    key: None,
                                    default_value: None,
                                    extra: None,
                                })
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(columns)
            }
            DatabaseType::Redis => {
                // Redis: 显示键的类型和 TTL
                Self::validate_identifier(database)?;
                // Redis Key 可能包含特殊字符，但作为表名管理时，我们暂时限制它
                // 或者我们在这里放宽限制，但 strict strict escaping
                // 由于 Redis Key 确实可能包含 : 等字符，validate_identifier 可能太严
                // 但为了防止注入，我们先用 escape_shell_arg 处理 table (key)
                let db_index = database.strip_prefix("db").unwrap_or("0");
                
                // 注意：redis-cli 的 key 是作为参数传递的，不是 SQL 语句，所以 shell escaping 是主要防御
                let escaped_key = Self::escape_shell_arg(table);
                
                // 验证 db_index
                if !db_index.chars().all(|c| c.is_ascii_digit()) {
                    return Err("Invalid database index".to_string());
                }

                let auth_str = config.encrypted_password.as_ref()
                    .map(|p| {
                         if let Some(user) = &config.username {
                             format!("--user '{}' -a '{}'", Self::escape_shell_arg(user), Self::escape_shell_arg(p))
                         } else {
                             format!("-a '{}'", Self::escape_shell_arg(p))
                         }
                    })
                    .unwrap_or_default();

                let command = Self::wrap_docker_exec(config, &format!(
                    "redis-cli -h {} -p {} {} -n {} TYPE '{}' && redis-cli -h {} -p {} {} -n {} TTL '{}'",
                    config.host, config.port,
                    auth_str,
                    db_index, escaped_key,
                    config.host, config.port,
                    auth_str,
                    db_index, escaped_key
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let lines: Vec<&str> = output.lines().filter(|l| !l.contains("Warning")).collect();
                
                let key_type = lines.get(0).map(|s| s.trim()).unwrap_or("unknown");
                let ttl = lines.get(1).map(|s| s.trim()).unwrap_or("-1");
                
                Ok(vec![
                    TableColumn {
                        name: "type".to_string(),
                        data_type: key_type.to_string(),
                        nullable: false,
                        key: None,
                        default_value: None,
                        extra: None,
                    },
                    TableColumn {
                        name: "ttl".to_string(),
                        data_type: format!("{} seconds", ttl),
                        nullable: false,
                        key: None,
                        default_value: None,
                        extra: Some(if ttl == "-1" { "永不过期".to_string() } else if ttl == "-2" { "键不存在".to_string() } else { "".to_string() }),
                    },
                ])
            }
            DatabaseType::MongoDB => {
                Self::validate_identifier(database)?;
                Self::validate_identifier(table)?;

                // MongoDB: 显示集合索引
                let command = Self::wrap_docker_exec(config, &format!(
                    "mongosh --host {} --port {} {} --quiet --eval 'use {}; JSON.stringify(db.{}.getIndexes())'",
                    config.host,
                    config.port,
                    config.encrypted_password.as_ref()
                        .map(|p| format!("-u {} -p '{}'", config.username.as_deref().unwrap_or("admin"), Self::escape_shell_arg(p)))
                        .unwrap_or_default(),
                    database,
                    table
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                
                // 解析 JSON 返回索引信息
                Ok(vec![
                    TableColumn {
                        name: "_id".to_string(),
                        data_type: "ObjectId".to_string(),
                        nullable: false,
                        key: Some("PRI".to_string()),
                        default_value: Some("auto".to_string()),
                        extra: Some(output.trim().to_string()),
                    },
                ])
            }
            DatabaseType::SQLite => {
                let db_path = config.database.as_deref().unwrap_or("/tmp/database.db");
                let command = Self::wrap_docker_exec(config, &format!(
                    "sqlite3 {} \"PRAGMA table_info({})\"",
                    db_path, table
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let columns: Vec<TableColumn> = output
                    .lines()
                    .filter_map(|line| {
                        let parts: Vec<&str> = line.split('|').collect();
                        if parts.len() >= 6 {
                            Some(TableColumn {
                                name: parts[1].trim().to_string(),
                                data_type: parts[2].trim().to_string(),
                                nullable: parts[3].trim() == "0",
                                key: if parts[5].trim() == "1" { Some("PRI".to_string()) } else { None },
                                default_value: if parts[4].trim().is_empty() { None } else { Some(parts[4].trim().to_string()) },
                                extra: None,
                            })
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(columns)
            }
        }
    }

    /// 分页查询表数据（或键值/文档）
    pub fn select_rows(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
        database: &str,
        table: &str,
        page: u32,
        page_size: u32,
    ) -> Result<PaginatedResult, String> {
        let session_id = &config.ssh_connection_id;
        let offset = page * page_size;

        match config.db_type {
            DatabaseType::MySQL => {
                Self::validate_identifier(database)?;
                Self::validate_identifier(table)?;

                // 获取总行数
                let count_cmd = Self::wrap_docker_exec(config, &format!(
                    "mysql -h {} -P {} -u {} {} {} -N -e 'SELECT COUNT(*) FROM {}'",
                    config.host, config.port,
                    config.username.as_deref().unwrap_or("root"),
                    config.encrypted_password.as_ref()
                        .map(|p| format!("-p'{}'", Self::escape_shell_arg(p)))
                        .unwrap_or_default(),
                    database, Self::quote_identifier(table, &config.db_type)
                ));
                let count_output = ssh_manager.execute_command_on_session(session_id, &count_cmd)?.output;
                let total_count: u64 = count_output.trim().parse().unwrap_or(0);

                // 获取分页数据
                let data_cmd = Self::wrap_docker_exec(config, &format!(
                    "mysql -h {} -P {} -u {} {} {} -e 'SELECT * FROM {} LIMIT {} OFFSET {}'",
                    config.host, config.port,
                    config.username.as_deref().unwrap_or("root"),
                    config.encrypted_password.as_ref()
                        .map(|p| format!("-p'{}'", Self::escape_shell_arg(p)))
                        .unwrap_or_default(),
                    database, Self::quote_identifier(table, &config.db_type), page_size, offset
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &data_cmd)?.output;
                Self::parse_tabular_output(&output, total_count, page, page_size)
            }
            DatabaseType::PostgreSQL => {
                Self::validate_identifier(database)?;
                Self::validate_identifier(table)?;

                // 获取总行数
                let count_cmd = Self::wrap_docker_exec(config, &format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -c \"SELECT COUNT(*) FROM {}\"",
                    config.encrypted_password.as_ref().map(|p| Self::escape_shell_arg(p)).unwrap_or_default(),
                    config.host, config.port,
                    config.username.as_deref().unwrap_or("postgres"),
                    database, Self::quote_identifier(table, &config.db_type)
                ));
                let count_output = ssh_manager.execute_command_on_session(session_id, &count_cmd)?.output;
                let total_count: u64 = count_output.trim().parse().unwrap_or(0);

                // 获取分页数据
                let data_cmd = Self::wrap_docker_exec(config, &format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -c \"SELECT * FROM {} LIMIT {} OFFSET {}\"",
                    config.encrypted_password.as_ref().map(|p| Self::escape_shell_arg(p)).unwrap_or_default(),
                    config.host, config.port,
                    config.username.as_deref().unwrap_or("postgres"),
                    database, Self::quote_identifier(table, &config.db_type), page_size, offset
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &data_cmd)?.output;
                Self::parse_tabular_output(&output, total_count, page, page_size)
            }
            DatabaseType::Redis => {
                // Redis: 获取键值
                Self::validate_identifier(database)?;
                let db_index = database.strip_prefix("db").unwrap_or("0");
                // Key 需要转义
                let escaped_key = Self::escape_shell_arg(table);

                let auth_str = config.encrypted_password.as_ref()
                    .map(|p| {
                         if let Some(user) = &config.username {
                             format!("--user '{}' -a '{}'", Self::escape_shell_arg(user), Self::escape_shell_arg(p))
                         } else {
                             format!("-a '{}'", Self::escape_shell_arg(p))
                         }
                    })
                    .unwrap_or_default();
                    
                let command = Self::wrap_docker_exec(config, &format!(
                    "redis-cli -h {} -p {} {} -n {} GET '{}' 2>/dev/null || redis-cli -h {} -p {} {} -n {} HGETALL '{}' 2>/dev/null || redis-cli -h {} -p {} {} -n {} LRANGE '{}' 0 -1 2>/dev/null || redis-cli -h {} -p {} {} -n {} SMEMBERS '{}' 2>/dev/null || redis-cli -h {} -p {} {} -n {} ZRANGE '{}' 0 -1 WITHSCORES 2>/dev/null",
                    config.host, config.port, auth_str, db_index, escaped_key,
                    config.host, config.port, auth_str, db_index, escaped_key,
                    config.host, config.port, auth_str, db_index, escaped_key,
                    config.host, config.port, auth_str, db_index, escaped_key,
                    config.host, config.port, auth_str, db_index, escaped_key
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                let rows: Vec<Vec<String>> = output
                    .lines()
                    .filter(|l| !l.contains("Warning") && !l.trim().is_empty())
                    .map(|l| vec![l.to_string()])
                    .collect();
                
                Ok(PaginatedResult {
                    columns: vec!["value".to_string()],
                    rows,
                    total_count: 1,
                    page,
                    page_size,
                })
            }
            DatabaseType::MongoDB => {
                // MongoDB: 获取文档
                Self::validate_identifier(database)?;
                Self::validate_identifier(table)?;

                let command = Self::wrap_docker_exec(config, &format!(
                    "mongosh --host {} --port {} {} --quiet --eval 'use {}; JSON.stringify(db.getCollection(\"{}\").find().limit({}).skip({}).toArray())'",
                    config.host, config.port,
                    config.encrypted_password.as_ref()
                        .map(|p| format!("-u {} -p '{}'", config.username.as_deref().unwrap_or("admin"), Self::escape_shell_arg(p)))
                        .unwrap_or_default(),
                    database, table, page_size, offset
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &command)?.output;
                
                // 获取总数
                let count_cmd = Self::wrap_docker_exec(config, &format!(
                    "mongosh --host {} --port {} {} --quiet --eval 'use {}; db.getCollection(\"{}\").countDocuments()'",
                    config.host, config.port,
                    config.encrypted_password.as_ref()
                        .map(|p| format!("-u {} -p '{}'", config.username.as_deref().unwrap_or("admin"), Self::escape_shell_arg(p)))
                        .unwrap_or_default(),
                    database, table
                ));
                let count_output = ssh_manager.execute_command_on_session(session_id, &count_cmd)?.output;
                let total_count: u64 = count_output.lines()
                    .filter(|l| !l.starts_with("switched"))
                    .last()
                    .and_then(|l| l.trim().parse().ok())
                    .unwrap_or(0);
                
                Ok(PaginatedResult {
                    columns: vec!["document".to_string()],
                    rows: vec![vec![output.trim().to_string()]],
                    total_count,
                    page,
                    page_size,
                })
            }
            DatabaseType::SQLite => {
                let db_path = config.database.as_deref().unwrap_or("/tmp/database.db");
                
                // 获取总行数
                let count_cmd = Self::wrap_docker_exec(config, &format!(
                    "sqlite3 {} \"SELECT COUNT(*) FROM \\\"{}\\\"\"",
                    db_path, table
                ));
                let count_output = ssh_manager.execute_command_on_session(session_id, &count_cmd)?.output;
                let total_count: u64 = count_output.trim().parse().unwrap_or(0);

                // 获取分页数据 (带表头)
                // 获取分页数据 (带表头)
                let data_cmd = Self::wrap_docker_exec(config, &format!(
                    "sqlite3 -header -separator '\\t' {} \"SELECT * FROM \\\"{}\\\" LIMIT {} OFFSET {}\"",
                    db_path, table, page_size, offset
                ));
                let output = ssh_manager.execute_command_on_session(session_id, &data_cmd)?.output;
                Self::parse_tabular_output(&output, total_count, page, page_size)
            }
        }
    }

    /// 解析制表符分隔的输出
    fn parse_tabular_output(output: &str, total_count: u64, page: u32, page_size: u32) -> Result<PaginatedResult, String> {
        // 不要 trim output，否则会丢失首尾的空行有效数据
        let lines: Vec<&str> = output.lines().collect();

        if lines.is_empty() {
            return Ok(PaginatedResult {
                columns: vec![],
                rows: vec![],
                total_count,
                page,
                page_size,
            });
        }

        // 第一行是列名
        let columns: Vec<String> = lines[0]
            .split('\t')
            .map(|s| s.trim().to_string())
            .collect();

        // 其余行是数据
        // 移除过滤逻辑，防止误杀以 '-' 或 '(' 开头的有效数据，以及空数据
        let rows: Vec<Vec<String>> = lines[1..]
            .iter()
            .map(|line| {
                line.split('\t')
                    .map(|s| s.trim().to_string())
                    .collect()
            })
            .collect();

        Ok(PaginatedResult {
            columns,
            rows,
            total_count,
            page,
            page_size,
        })
    }


    // ============ 安全检查 ============

    /// 运行数据库安全审计
    pub fn run_security_audit(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<Vec<SecurityCheckResult>, String> {
        let mut results = Vec::new();

        match config.db_type {
            DatabaseType::MySQL => {
                results.push(Self::check_mysql_empty_passwords(ssh_manager, config)?);
                results.push(Self::check_mysql_privileged_users(ssh_manager, config)?);
                results.push(Self::check_mysql_remote_root(ssh_manager, config)?);
                results.push(Self::check_mysql_anonymous_users(ssh_manager, config)?);
            }
            DatabaseType::PostgreSQL => {
                results.push(Self::check_postgres_superusers(ssh_manager, config)?);
                results.push(Self::check_postgres_trust_auth(ssh_manager, config)?);
            }
            DatabaseType::Redis => {
                results.push(Self::check_redis_password(ssh_manager, config)?);
                results.push(Self::check_redis_dangerous_commands(ssh_manager, config)?);
            }
            DatabaseType::MongoDB => {
                results.push(Self::check_mongodb_auth_enabled(ssh_manager, config)?);
                results.push(Self::check_mongodb_roles(ssh_manager, config)?);
            }
            DatabaseType::SQLite => {
                // SQLite 文件权限检查
                results.push(Self::check_sqlite_permissions(ssh_manager, config)?);
            }
        }

        Ok(results)
    }

    // ---- MySQL 安全检查 ----

    /// 检查 MySQL 空口令用户
    fn check_mysql_empty_passwords(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<SecurityCheckResult, String> {
        let query = "SELECT Host, User FROM mysql.user WHERE authentication_string = '' OR Password = '';";
        let cmd = Self::build_mysql_command(config, query)?;
        
        let output = ssh_manager.execute_command_on_session(&config.ssh_connection_id, &cmd)?.output;
        let lines: Vec<&str> = output.trim().lines().skip(1).collect(); // 跳过表头

        let mut findings = Vec::new();
        for line in &lines {
            if !line.trim().is_empty() {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 2 {
                    findings.push(SecurityFinding {
                        item: parts[1].to_string(),
                        detail: format!("用户 {}@{} 无密码", parts[1], parts[0]),
                    });
                }
            }
        }

        Ok(SecurityCheckResult {
            check_id: "mysql_empty_passwords".to_string(),
            check_name: "空口令用户检查".to_string(),
            severity: if findings.is_empty() { SecuritySeverity::Info } else { SecuritySeverity::Critical },
            status: if findings.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
            findings,
            recommendation: "为所有用户设置强密码，使用 ALTER USER 'user'@'host' IDENTIFIED BY 'strong_password';".to_string(),
        })
    }

    /// 检查 MySQL 权限过大的用户
    fn check_mysql_privileged_users(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<SecurityCheckResult, String> {
        let query = "SELECT Host, User, Super_priv, Grant_priv FROM mysql.user WHERE Super_priv = 'Y' OR Grant_priv = 'Y';";
        let cmd = Self::build_mysql_command(config, query)?;
        
        let output = ssh_manager.execute_command_on_session(&config.ssh_connection_id, &cmd)?.output;
        let lines: Vec<&str> = output.trim().lines().skip(1).collect();

        let mut findings = Vec::new();
        for line in &lines {
            if !line.trim().is_empty() {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 4 {
                    findings.push(SecurityFinding {
                        item: format!("{}@{}", parts[1], parts[0]),
                        detail: format!("SUPER: {}, GRANT: {}", parts[2], parts[3]),
                    });
                }
            }
        }

        Ok(SecurityCheckResult {
            check_id: "mysql_privileged_users".to_string(),
            check_name: "高权限用户审计".to_string(),
            severity: SecuritySeverity::High,
            status: if findings.is_empty() { CheckStatus::Pass } else { CheckStatus::Warning },
            findings,
            recommendation: "最小化具有 SUPER 和 GRANT 权限的用户数量，仅保留必要的管理员账户".to_string(),
        })
    }

    /// 检查 MySQL 远程 root 访问
    fn check_mysql_remote_root(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<SecurityCheckResult, String> {
        let query = "SELECT Host, User FROM mysql.user WHERE User = 'root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');";
        let cmd = Self::build_mysql_command(config, query)?;
        
        let output = ssh_manager.execute_command_on_session(&config.ssh_connection_id, &cmd)?.output;
        let lines: Vec<&str> = output.trim().lines().skip(1).collect();

        let mut findings = Vec::new();
        for line in &lines {
            if !line.trim().is_empty() {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 2 {
                    findings.push(SecurityFinding {
                        item: format!("root@{}", parts[0]),
                        detail: "允许远程 root 访问".to_string(),
                    });
                }
            }
        }

        Ok(SecurityCheckResult {
            check_id: "mysql_remote_root".to_string(),
            check_name: "远程 Root 访问检查".to_string(),
            severity: if findings.is_empty() { SecuritySeverity::Info } else { SecuritySeverity::Critical },
            status: if findings.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
            findings,
            recommendation: "禁止 root 用户远程访问，使用 DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1');".to_string(),
        })
    }

    /// 检查 MySQL 匿名用户
    fn check_mysql_anonymous_users(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<SecurityCheckResult, String> {
        let query = "SELECT Host, User FROM mysql.user WHERE User = '';";
        let cmd = Self::build_mysql_command(config, query)?;
        
        let output = ssh_manager.execute_command_on_session(&config.ssh_connection_id, &cmd)?.output;
        let lines: Vec<&str> = output.trim().lines().skip(1).collect();

        let mut findings = Vec::new();
        for line in &lines {
            if !line.trim().is_empty() {
                findings.push(SecurityFinding {
                    item: "匿名用户".to_string(),
                    detail: line.to_string(),
                });
            }
        }

        Ok(SecurityCheckResult {
            check_id: "mysql_anonymous_users".to_string(),
            check_name: "匿名用户检查".to_string(),
            severity: if findings.is_empty() { SecuritySeverity::Info } else { SecuritySeverity::High },
            status: if findings.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
            findings,
            recommendation: "删除匿名用户，使用 DELETE FROM mysql.user WHERE User='';".to_string(),
        })
    }

    // ---- PostgreSQL 安全检查 ----

    /// 检查 PostgreSQL 超级用户
    fn check_postgres_superusers(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<SecurityCheckResult, String> {
        let query = "SELECT usename FROM pg_user WHERE usesuper = true;";
        let cmd = Self::build_psql_command(config, query)?;
        
        let output = ssh_manager.execute_command_on_session(&config.ssh_connection_id, &cmd)?.output;
        let lines: Vec<&str> = output.trim().lines().skip(1).collect();

        let mut findings = Vec::new();
        for line in &lines {
            if !line.trim().is_empty() && !line.contains("---") {
                findings.push(SecurityFinding {
                    item: line.trim().to_string(),
                    detail: "超级用户权限".to_string(),
                });
            }
        }

        Ok(SecurityCheckResult {
            check_id: "postgres_superusers".to_string(),
            check_name: "超级用户审计".to_string(),
            severity: SecuritySeverity::Medium,
            status: if findings.len() <= 1 { CheckStatus::Pass } else { CheckStatus::Warning },
            findings,
            recommendation: "限制超级用户数量，使用角色进行细粒度权限控制".to_string(),
        })
    }

    /// 检查 PostgreSQL trust 认证
    fn check_postgres_trust_auth(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<SecurityCheckResult, String> {
        let cmd = "cat /var/lib/postgresql/data/pg_hba.conf 2>/dev/null || cat /etc/postgresql/*/main/pg_hba.conf 2>/dev/null | grep -v '^#' | grep trust";
        
        let output = ssh_manager.execute_command_on_session(&config.ssh_connection_id, cmd)?.output;
        let lines: Vec<&str> = output.trim().lines().collect();

        let mut findings = Vec::new();
        for line in &lines {
            if !line.trim().is_empty() {
                findings.push(SecurityFinding {
                    item: "trust 认证".to_string(),
                    detail: line.to_string(),
                });
            }
        }

        Ok(SecurityCheckResult {
            check_id: "postgres_trust_auth".to_string(),
            check_name: "Trust 认证检查".to_string(),
            severity: if findings.is_empty() { SecuritySeverity::Info } else { SecuritySeverity::High },
            status: if findings.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
            findings,
            recommendation: "将 pg_hba.conf 中的 trust 认证改为 md5 或 scram-sha-256".to_string(),
        })
    }

    // ---- Redis 安全检查 ----

    /// 检查 Redis 密码配置
    fn check_redis_password(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<SecurityCheckResult, String> {
        let cmd = Self::build_redis_command(config, "CONFIG GET requirepass")?;
        
        let output = ssh_manager.execute_command_on_session(&config.ssh_connection_id, &cmd)?.output;
        
        let has_password = !output.contains("\"\"") && output.contains("requirepass");

        let findings = if !has_password {
            vec![SecurityFinding {
                item: "无密码保护".to_string(),
                detail: "Redis 未设置 requirepass".to_string(),
            }]
        } else {
            Vec::new()
        };

        Ok(SecurityCheckResult {
            check_id: "redis_password".to_string(),
            check_name: "密码保护检查".to_string(),
            severity: if has_password { SecuritySeverity::Info } else { SecuritySeverity::Critical },
            status: if has_password { CheckStatus::Pass } else { CheckStatus::Fail },
            findings,
            recommendation: "使用 CONFIG SET requirepass <strong_password> 设置密码".to_string(),
        })
    }

    /// 检查 Redis 危险命令
    fn check_redis_dangerous_commands(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<SecurityCheckResult, String> {
        let dangerous_cmds = vec!["FLUSHDB", "FLUSHALL", "KEYS", "CONFIG"];
        let mut findings = Vec::new();

        for cmd_name in dangerous_cmds {
            let cmd = Self::build_redis_command(config, &format!("CONFIG GET rename-command"))?;
            let output = ssh_manager.execute_command_on_session(&config.ssh_connection_id, &cmd)?.output;
            
            if !output.to_lowercase().contains(&cmd_name.to_lowercase()) {
                findings.push(SecurityFinding {
                    item: cmd_name.to_string(),
                    detail: "危险命令未重命名或禁用".to_string(),
                });
            }
        }

        Ok(SecurityCheckResult {
            check_id: "redis_dangerous_commands".to_string(),
            check_name: "危险命令检查".to_string(),
            severity: SecuritySeverity::Medium,
            status: if findings.is_empty() { CheckStatus::Pass } else { CheckStatus::Warning },
            findings,
            recommendation: "在 redis.conf 中重命名危险命令，例如: rename-command FLUSHALL \"\"".to_string(),
        })
    }

    // ---- MongoDB 安全检查 ----

    /// 检查 MongoDB 认证是否启用
    fn check_mongodb_auth_enabled(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<SecurityCheckResult, String> {
        let cmd = Self::build_mongo_command(config, "db.adminCommand({getCmdLineOpts: 1})")?;
        
        let output = ssh_manager.execute_command_on_session(&config.ssh_connection_id, &cmd)?.output;
        
        let auth_enabled = output.contains("authorization") || output.contains("auth");

        let findings = if !auth_enabled {
            vec![SecurityFinding {
                item: "认证未启用".to_string(),
                detail: "MongoDB 可能未启用认证".to_string(),
            }]
        } else {
            Vec::new()
        };

        Ok(SecurityCheckResult {
            check_id: "mongodb_auth_enabled".to_string(),
            check_name: "认证启用检查".to_string(),
            severity: if auth_enabled { SecuritySeverity::Info } else { SecuritySeverity::Critical },
            status: if auth_enabled { CheckStatus::Pass } else { CheckStatus::Fail },
            findings,
            recommendation: "在配置文件中启用认证: security.authorization: enabled".to_string(),
        })
    }

    /// 检查 MongoDB 角色权限
    fn check_mongodb_roles(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<SecurityCheckResult, String> {
        let cmd = Self::build_mongo_command(config, "db.getUsers()")?;
        
        let output = ssh_manager.execute_command_on_session(&config.ssh_connection_id, &cmd)?.output;
        
        let has_root = output.contains("\"root\"") || output.contains("\"__system\"");

        let findings = if has_root {
            vec![SecurityFinding {
                item: "高权限角色".to_string(),
                detail: "存在 root 或 __system 角色用户".to_string(),
            }]
        } else {
            Vec::new()
        };

        Ok(SecurityCheckResult {
            check_id: "mongodb_roles".to_string(),
            check_name: "角色权限审计".to_string(),
            severity: SecuritySeverity::Medium,
            status: if findings.is_empty() { CheckStatus::Pass } else { CheckStatus::Warning },
            findings,
            recommendation: "使用最小权限原则，避免不必要的 root 角色".to_string(),
        })
    }

    // ---- SQLite 安全检查 ----

    /// 检查 SQLite 文件权限
    fn check_sqlite_permissions(
        _ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
    ) -> Result<SecurityCheckResult, String> {
        // SQLite 文件权限检查需要文件路径
        let findings = vec![SecurityFinding {
            item: "文件权限".to_string(),
            detail: format!("检查 {} 的文件权限", config.database.as_deref().unwrap_or("数据库文件")),
        }];

        Ok(SecurityCheckResult {
            check_id: "sqlite_permissions".to_string(),
            check_name: "文件权限检查".to_string(),
            severity: SecuritySeverity::Info,
            status: CheckStatus::Warning,
            findings,
            recommendation: "确保 SQLite 数据库文件权限设置为 600 或更严格".to_string(),
        })
    }
    // ============ 数据修改 (Update/Delete) ============

    /// 更新行
    pub fn update_row(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
        params: &UpdateRowParams,
    ) -> Result<QueryResult, String> {
        match config.db_type {
            DatabaseType::MySQL => {
                Self::validate_identifier(&params.database)?;
                Self::validate_identifier(&params.table)?;

                let mut set_clauses = Vec::new();
                for (col, val) in &params.updates {
                    Self::validate_identifier(col)?;
                    let val_str = if let Some(v) = val {
                        format!("'{}'", v.replace("'", "\\'"))
                    } else {
                        "NULL".to_string()
                    };
                    set_clauses.push(format!("`{}`={}", col, val_str));
                }

                let mut where_clauses = Vec::new();
                for (col, val) in &params.conditions {
                    Self::validate_identifier(col)?;
                    let val_str = format!("'{}'", val.replace("'", "\\'"));
                    where_clauses.push(format!("`{}`={}", col, val_str));
                }
                
                if set_clauses.is_empty() {
                    return Err("没有要更新的字段".to_string());
                }
                if where_clauses.is_empty() {
                    return Err("更新操作必须包含条件".to_string());
                }

                let query = format!(
                    "UPDATE `{}`.`{}` SET {} WHERE {}; SELECT ROW_COUNT() as affected;",
                    params.database,
                    params.table,
                    set_clauses.join(", "),
                    where_clauses.join(" AND ")
                );
                
                let result = Self::execute_query(ssh_manager, config, &query)?;
                
                // 检查 result.rows 中是否有affected rows
                if let Some(first_row) = result.rows.first() {
                    if let Some(count_str) = first_row.first() {
                        if let Ok(count) = count_str.parse::<i64>() {
                            if count == 0 {
                                return Err("更新成功但未修改任何行（可能是条件不匹配或数据未变动）".to_string());
                            } else {
                                return Ok(QueryResult {
                                    columns: vec![],
                                    rows: vec![],
                                    affected_rows: Some(count as u64),
                                    execution_time_ms: result.execution_time_ms,
                                    error: None,
                                });
                            }
                        }
                    }
                }

                // 如果没解析出来，就返回原结果
                Ok(result)
            }
            DatabaseType::PostgreSQL => {
                 Self::validate_identifier(&params.database)?;
                 Self::validate_identifier(&params.table)?;

                let mut set_clauses = Vec::new();
                for (col, val) in &params.updates {
                    Self::validate_identifier(col)?;
                    let val_str = if let Some(v) = val {
                        format!("'{}'", v.replace("'", "''"))
                    } else {
                        "NULL".to_string()
                    };
                    set_clauses.push(format!("\"{}\"={}", col, val_str));
                }

                let mut where_clauses = Vec::new();
                for (col, val) in &params.conditions {
                    Self::validate_identifier(col)?;
                    let val_str = format!("'{}'", val.replace("'", "''"));
                    where_clauses.push(format!("\"{}\"={}", col, val_str));
                }
                
                 if set_clauses.is_empty() {
                    return Err("没有要更新的字段".to_string());
                }
                if where_clauses.is_empty() {
                    return Err("更新操作必须包含条件".to_string());
                }

                let query = format!(
                    "UPDATE \"{}\" SET {} WHERE {}",
                    params.table,
                    set_clauses.join(", "),
                    where_clauses.join(" AND ")
                );
                
                Self::execute_query(ssh_manager, config, &query)
            }
             _ => Err(format!("虽然 {:?} 支持查询，但暂不支持更新操作", config.db_type)),
        }
    }

    /// 删除行
    pub fn delete_row(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
        params: &DeleteRowParams,
    ) -> Result<QueryResult, String> {
        match config.db_type {
            DatabaseType::MySQL => {
                Self::validate_identifier(&params.database)?;
                Self::validate_identifier(&params.table)?;

                let mut where_clauses = Vec::new();
                for (col, val) in &params.conditions {
                    Self::validate_identifier(col)?;
                    let val_str = format!("'{}'", val.replace("'", "\\'"));
                    where_clauses.push(format!("`{}`={}", col, val_str));
                }
                
                if where_clauses.is_empty() {
                    return Err("删除操作必须包含条件".to_string());
                }

                let query = format!(
                    "DELETE FROM `{}`.`{}` WHERE {}; SELECT ROW_COUNT() as affected;",
                    params.database,
                    params.table,
                    where_clauses.join(" AND ")
                );
                
                let result = Self::execute_query(ssh_manager, config, &query)?;

                // 检查 result.rows 中是否有affected rows
                if let Some(first_row) = result.rows.first() {
                    if let Some(count_str) = first_row.first() {
                        if let Ok(count) = count_str.parse::<i64>() {
                            if count == 0 {
                                return Err("删除成功但未移除任何行（可能是条件不匹配或数据不存在）".to_string());
                            } else {
                                return Ok(QueryResult {
                                    columns: vec![],
                                    rows: vec![],
                                    affected_rows: Some(count as u64),
                                    execution_time_ms: result.execution_time_ms,
                                    error: None,
                                });
                            }
                        }
                    }
                }
                
                Ok(result)
            }
            DatabaseType::PostgreSQL => {
                 Self::validate_identifier(&params.database)?;
                 Self::validate_identifier(&params.table)?;

                let mut where_clauses = Vec::new();
                for (col, val) in &params.conditions {
                    Self::validate_identifier(col)?;
                    let val_str = format!("'{}'", val.replace("'", "''"));
                    where_clauses.push(format!("\"{}\"={}", col, val_str));
                }
                
                if where_clauses.is_empty() {
                    return Err("删除操作必须包含条件".to_string());
                }

                let query = format!(
                    "DELETE FROM \"{}\" WHERE {}",
                    params.table,
                    where_clauses.join(" AND ")
                );
                
                Self::execute_query(ssh_manager, config, &query)
            }
            _ => Err(format!("虽然 {:?} 支持查询，但暂不支持删除操作", config.db_type)),
        }
    }

    /// 插入行
    pub fn insert_row(
        ssh_manager: &SSHManagerRussh,
        config: &DatabaseConnection,
        params: &InsertRowParams,
    ) -> Result<QueryResult, String> {
        match config.db_type {
            DatabaseType::MySQL => {
                Self::validate_identifier(&params.database)?;
                Self::validate_identifier(&params.table)?;

                let mut columns = Vec::new();
                let mut values = Vec::new();

                for (col, val) in &params.data {
                    Self::validate_identifier(col)?;
                    columns.push(format!("`{}`", col));
                    match val {
                        Some(v) => values.push(format!("'{}'", v.replace("'", "\\'"))),
                        None => values.push("NULL".to_string()),
                    }
                }

                if columns.is_empty() {
                    return Err("插入数据不能为空".to_string());
                }

                let query = format!(
                    "INSERT INTO `{}`.`{}` ({}) VALUES ({});",
                    params.database,
                    params.table,
                    columns.join(", "),
                    values.join(", ")
                );

                Self::execute_query(ssh_manager, config, &query)
            }
            DatabaseType::PostgreSQL => {
                 Self::validate_identifier(&params.database)?;
                 Self::validate_identifier(&params.table)?;

                let mut columns = Vec::new();
                let mut values = Vec::new();

                for (col, val) in &params.data {
                    Self::validate_identifier(col)?;
                    columns.push(format!("\"{}\"", col));
                     match val {
                        Some(v) => values.push(format!("'{}'", v.replace("'", "''"))),
                        None => values.push("NULL".to_string()),
                    }
                }

                if columns.is_empty() {
                     return Err("插入数据不能为空".to_string());
                }

                let query = format!(
                    "INSERT INTO \"{}\" ({}) VALUES ({})",
                    params.table,
                    columns.join(", "),
                    values.join(", ")
                );

                Self::execute_query(ssh_manager, config, &query)
            }
            _ => Err(format!("虽然 {:?} 支持查询，但暂不支持插入操作", config.db_type)),
        }
    }
}
