// 数据库管理相关类型定义
// Database Management Type Definitions

use serde::{Deserialize, Serialize};

/// 数据库类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    MySQL,
    PostgreSQL,
    Redis,
    MongoDB,
    SQLite,
}

/// 数据库连接模式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ConnectionMode {
    /// 直接连接（主机客户端）
    Direct,
    /// Docker 容器连接
    #[serde(rename_all = "camelCase")]
    Docker {
        container_id: String,
        container_name: String,
    },
}

/// 数据库连接配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConnection {
    pub id: String,
    pub name: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub database: Option<String>,
    pub username: Option<String>,
    /// 加密后的密码（使用 AES-256-GCM）
    pub encrypted_password: Option<String>,
    /// 关联的 SSH 连接 ID（用于选择 SSH 会话）
    pub ssh_connection_id: String,
    /// 连接模式
    pub connection_mode: ConnectionMode,
    /// 创建时间
    pub created_at: Option<String>,
    /// 最后使用时间
    pub last_used_at: Option<String>,
    /// 是否收藏
    pub favorite: bool,
    /// 备注
    pub notes: Option<String>,
}

/// 查询结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub affected_rows: Option<u64>,
    pub execution_time_ms: u64,
    pub error: Option<String>,
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

/// 检查状态
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
#[serde(rename_all = "camelCase")]
pub struct SecurityFinding {
    pub item: String,
    pub detail: String,
}

/// 安全检查结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityCheckResult {
    pub check_id: String,
    pub check_name: String,
    pub severity: SecuritySeverity,
    pub status: CheckStatus,
    pub findings: Vec<SecurityFinding>,
    pub recommendation: String,
}

/// 数据库对象
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseObject {
    pub name: String,
    pub object_type: String,
    pub schema: Option<String>,
}

/// 表结构信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub key: Option<String>,
    pub default: Option<String>,
}

/// 客户端检测结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseClientInfo {
    pub db_type: DatabaseType,
    pub available: bool,
    pub client_path: Option<String>,
    pub version: Option<String>,
}

/// 服务器数据库环境
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseEnvironment {
    pub session_id: String,
    pub clients: Vec<DatabaseClientInfo>,
    pub docker_containers: Vec<DockerDatabaseContainer>,
    pub detected_at: String,
}

/// Docker 容器信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerDatabaseContainer {
    pub container_id: String,
    pub container_name: String,
    pub db_type: DatabaseType,
    pub image: String,
    pub ports: Vec<PortMapping>,
    pub status: String,
}

/// 端口映射
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortMapping {
    pub host_port: u16,
    pub container_port: u16,
}

/// 表信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    pub table_type: String, // TABLE, VIEW
    pub row_count: Option<u64>,
}

/// 表列信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableColumn {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub key: Option<String>,           // PRI, UNI, MUL
    pub default_value: Option<String>,
    pub extra: Option<String>,         // auto_increment 等
}

/// 分页查询结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_count: u64,
    pub page: u32,
    pub page_size: u32,
}

/// 更新行参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRowParams {
    pub database: String,
    pub table: String,
    pub updates: std::collections::HashMap<String, Option<String>>,
    pub conditions: std::collections::HashMap<String, String>,
}

/// 删除行参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteRowParams {
    pub database: String,
    pub table: String,
    pub conditions: std::collections::HashMap<String, String>,
}

/// 插入行参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertRowParams {
    pub database: String,
    pub table: String,
    pub data: std::collections::HashMap<String, Option<String>>,
}
