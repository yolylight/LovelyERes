/**
 * 数据库命令处理器模块
 * 通过 SSH 远程管理 MySQL/PostgreSQL/Redis/MongoDB 等数据库
 */

use tauri::State;
use crate::AppState;
use crate::db_manager;
use crate::db_manager::DbConnection;

// ==================== 数据库检测 ====================

/// 检测远程服务器上安装的数据库
#[tauri::command]
pub async fn db_detect(state: State<'_, AppState>) -> Result<Vec<db_manager::DatabaseInfo>, String> {
    let ssh = &state.ssh_manager;
    db_manager::detect_databases(ssh)
}

// ==================== SQL 执行 ====================

/// 执行 SQL 语句或数据库命令
#[tauri::command]
pub async fn db_execute_sql(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    database: Option<String>,
    sql: String,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<db_manager::SqlResult, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database,
        connection_mode,
    };
    db_manager::execute_sql(ssh, &db_type, &conn, &sql)
}

// ==================== 列出数据库 ====================

/// 列出远程服务器上的数据库列表
#[tauri::command]
pub async fn db_list_databases(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<Vec<String>, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: None,
        connection_mode,
    };
    db_manager::list_databases(ssh, &db_type, &conn)
}

// ==================== 列出表 ====================

/// 列出指定数据库中的表
#[tauri::command]
pub async fn db_list_tables(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    database: String,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<Vec<db_manager::TableInfo>, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: Some(database.clone()),
        connection_mode,
    };
    db_manager::list_tables(ssh, &db_type, &conn, &database)
}

// ==================== 列出列 ====================

/// 列出指定表的列信息
#[tauri::command]
pub async fn db_list_columns(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    database: String,
    table: String,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<Vec<db_manager::ColumnInfo>, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: Some(database.clone()),
        connection_mode,
    };
    db_manager::list_columns(ssh, &db_type, &conn, &database, &table)
}

// ==================== 列出用户 ====================

/// 列出数据库用户
#[tauri::command]
pub async fn db_list_users(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<Vec<db_manager::DbUser>, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: None,
        connection_mode,
    };
    db_manager::list_users(ssh, &db_type, &conn)
}

// ==================== 服务控制 ====================

/// 数据库服务控制（启动/停止/重启/状态）
#[tauri::command]
pub async fn db_service_control(
    state: State<'_, AppState>,
    db_type: String,
    action: String,
) -> Result<String, String> {
    let ssh = &state.ssh_manager;
    db_manager::service_control(ssh, &db_type, &action)
}

// ==================== 数据库备份 ====================

/// 备份数据库到远程服务器 /tmp 目录
#[tauri::command]
pub async fn db_backup(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    database: String,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<String, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: Some(database.clone()),
        connection_mode,
    };
    db_manager::backup_database(ssh, &db_type, &conn, &database)
}

// ==================== 数据库统计 ====================

/// 获取数据库运行统计信息
#[tauri::command]
pub async fn db_get_stats(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<db_manager::DbStats, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: None,
        connection_mode,
    };
    db_manager::get_db_stats(ssh, &db_type, &conn)
}

// ==================== 表结构描述 ====================

/// 获取表的列结构信息
#[tauri::command]
pub async fn db_describe_table(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    database: String,
    table: String,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<Vec<db_manager::ColumnInfo>, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: Some(database.clone()),
        connection_mode,
    };
    db_manager::describe_table(ssh, &db_type, &conn, &database, &table)
}

// ==================== 分页查询 ====================

/// 分页查询表数据
#[tauri::command]
pub async fn db_select_rows(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    database: String,
    table: String,
    page: u32,
    page_size: u32,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<db_manager::PaginatedResult, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: Some(database.clone()),
        connection_mode,
    };
    db_manager::select_rows(ssh, &db_type, &conn, &database, &table, page, page_size)
}

// ==================== 行级 CRUD ====================

/// 更新行
#[tauri::command]
pub async fn db_update_row(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    params: db_manager::UpdateRowParams,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<db_manager::SqlResult, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: Some(params.database.clone()),
        connection_mode,
    };
    db_manager::update_row(ssh, &db_type, &conn, &params)
}

/// 删除行
#[tauri::command]
pub async fn db_delete_row(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    params: db_manager::DeleteRowParams,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<db_manager::SqlResult, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: Some(params.database.clone()),
        connection_mode,
    };
    db_manager::delete_row(ssh, &db_type, &conn, &params)
}

/// 插入行
#[tauri::command]
pub async fn db_insert_row(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    params: db_manager::InsertRowParams,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<db_manager::SqlResult, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: Some(params.database.clone()),
        connection_mode,
    };
    db_manager::insert_row(ssh, &db_type, &conn, &params)
}

// ==================== 安全审计 ====================

/// 运行数据库安全审计
#[tauri::command]
pub async fn db_security_audit(
    state: State<'_, AppState>,
    db_type: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    connection_mode: Option<db_manager::ConnectionMode>,
) -> Result<Vec<db_manager::SecurityCheckResult>, String> {
    let ssh = &state.ssh_manager;
    let conn = DbConnection {
        db_type: db_type.clone(),
        host,
        port,
        username,
        password,
        database: None,
        connection_mode,
    };
    db_manager::run_security_audit(ssh, &db_type, &conn)
}
