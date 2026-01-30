// 数据库管理类型定义
// Database Management Type Definitions

export type DatabaseType = 'mysql' | 'postgresql' | 'redis' | 'mongodb' | 'sqlite';

export type ConnectionMode = 
    | { type: 'direct' }
    | { type: 'docker'; containerId: string; containerName: string };

export interface DatabaseConnection {
    id: string;
    name: string;
    dbType: DatabaseType;
    host: string;
    port: number;
    database?: string;
    username?: string;
    encryptedPassword?: string;
    sshConnectionId: string;
    connectionMode: ConnectionMode;
    createdAt?: string;
    lastUsedAt?: string;
    favorite: boolean;
    notes?: string;
}

export interface QueryResult {
    columns: string[];
    rows: string[][];
    affectedRows?: number;
    executionTimeMs: number;
    error?: string;
}

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type CheckStatus = 'pass' | 'fail' | 'warning' | 'error';

export interface SecurityFinding {
    item: string;
    detail: string;
}

export interface SecurityCheckResult {
    checkId: string;
    checkName: string;
    severity: SecuritySeverity;
    status: CheckStatus;
    findings: SecurityFinding[];
    recommendation: string;
}

export interface DatabaseObject {
    name: string;
    objectType: string;
    schema?: string;
}

export interface ColumnInfo {
    name: string;
    dataType: string;
    nullable: boolean;
    key?: string;
    default?: string;
}

export interface DatabaseClientInfo {
    dbType: DatabaseType;
    available: boolean;
    clientPath?: string;
    version?: string;
}

export interface PortMapping {
    hostPort: number;
    containerPort: number;
}

export interface DockerDatabaseContainer {
    containerId: string;
    containerName: string;
    dbType: DatabaseType;
    image: string;
    ports: PortMapping[];
    status: string;
}

export interface DatabaseEnvironment {
    sessionId: string;
    clients: DatabaseClientInfo[];
    dockerContainers: DockerDatabaseContainer[];
    detectedAt: string;
}

// 用于预填充连接表单的预设数据
export interface DatabasePreset {
    dbType: DatabaseType;
    port?: number;
    username?: string;
    host?: string;
    // Docker 容器信息（如果从 Docker 容器创建）
    dockerContainer?: {
        containerId: string;
        containerName: string;
        image: string;
    };
}

// 表信息
export interface TableInfo {
    name: string;
    tableType: string; // TABLE, VIEW, KEY, COLLECTION
    rowCount?: number;
}

// 表列信息
export interface TableColumn {
    name: string;
    dataType: string;
    nullable: boolean;
    key?: string;           // PRI, UNI, MUL
    defaultValue?: string;
    extra?: string;         // auto_increment 等
}

// 分页查询结果
export interface PaginatedResult {
    columns: string[];
    rows: string[][];
    totalCount: number;
    page: number;
    pageSize: number;
}

// 更新行参数
export interface UpdateRowParams {
    database: string;
    table: string;
    updates: Record<string, string | null>; // 列名 -> 值 (null 表示 NULL)
    conditions: Record<string, string>;     // 列名 -> 值 (通常是主键)
}

// 删除行参数
export interface DeleteRowParams {
    database: string;
    table: string;
    conditions: Record<string, string>;     // 列名 -> 值 (通常是主键)
}

// 插入行参数
export interface InsertRowParams {
    database: string;
    table: string;
    data: Record<string, string | null>;     // 列名 -> 值
}
