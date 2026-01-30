// 数据库管理器
// Database Manager

import { invoke } from '@tauri-apps/api/core';
import type {
    DatabaseConnection,
    DatabaseEnvironment,
    QueryResult,
    DatabaseType,
    ConnectionMode,
    SecurityCheckResult,
    TableInfo,      // 新增
    TableColumn,    // 新增
    PaginatedResult, // 新增
    UpdateRowParams, // 新增
    DeleteRowParams, // 新增
    InsertRowParams, // 新增
} from './databaseTypes';

export class DatabaseManager {
    private connections: DatabaseConnection[] = [];
    private listeners: Map<string, Function[]> = new Map();

    constructor() {
        this.loadConnections();
    }

    // ============ 环境检测 ============

    /**
     * 检测服务器数据库环境
     */
    async detectEnvironment(sessionId: string): Promise<DatabaseEnvironment> {
        return await invoke<DatabaseEnvironment>('db_detect_environment', { sessionId });
    }

    // ============ 连接管理 ============

    /**
     * 测试数据库连接
     */
    async testConnection(config: DatabaseConnection): Promise<boolean> {
        return await invoke<boolean>('db_test_connection', { config });
    }

    /**
     * 执行数据库查询
     */
    async executeQuery(config: DatabaseConnection, query: string): Promise<QueryResult> {
        return await invoke<QueryResult>('db_execute_query', { config, query });
    }

    /**
     * 运行安全审计
     */
    async runSecurityAudit(config: DatabaseConnection): Promise<SecurityCheckResult[]> {
        return await invoke<SecurityCheckResult[]>('db_run_security_audit', { config });
    }

    // ============ 数据库浏览 ============

    /**
     * 列出所有数据库
     */
    async listDatabases(config: DatabaseConnection): Promise<string[]> {
        return await invoke<string[]>('db_list_databases', { config });
    }

    /**
     * 列出指定库的表
     */
    async listTables(config: DatabaseConnection, database: string): Promise<TableInfo[]> {
        return await invoke<TableInfo[]>('db_list_tables', { config, database });
    }

    /**
     * 获取表结构
     */
    async describeTable(config: DatabaseConnection, database: string, table: string): Promise<TableColumn[]> {
        return await invoke<TableColumn[]>('db_describe_table', { config, database, table });
    }

    /**
     * 分页查询数据
     */
    async selectRows(config: DatabaseConnection, database: string, table: string, page: number, pageSize: number): Promise<PaginatedResult> {
        return await invoke<PaginatedResult>('db_select_rows', {
            config,
            database,
            table,
            page,
            pageSize
        });
    }

    /**
     * 更新行
     */
    async updateRow(config: DatabaseConnection, params: UpdateRowParams): Promise<QueryResult> {
        return await invoke<QueryResult>('db_update_row', { config, params });
    }

    /**
     * 删除行
     */
    async deleteRow(config: DatabaseConnection, params: DeleteRowParams): Promise<QueryResult> {
        return await invoke<QueryResult>('db_delete_row', { config, params });
    }

    /**
     * 插入行
     */
    async insertRow(config: DatabaseConnection, params: InsertRowParams): Promise<QueryResult> {
        return await invoke<QueryResult>('db_insert_row', { config, params });
    }


    /**
     * 加载连接配置
     */
    async loadConnections(): Promise<DatabaseConnection[]> {
        try {
            this.connections = await invoke<DatabaseConnection[]>('db_load_connections');
            this.emit('connections-loaded', this.connections);
            return this.connections;
        } catch (error) {
            console.error('加载数据库连接配置失败:', error);
            return [];
        }
    }

    /**
     * 保存连接配置
     */
    async saveConnections(): Promise<void> {
        await invoke('db_save_connections', { connections: this.connections });
        this.emit('connections-saved');
    }

    /**
     * 添加连接
     */
    async addConnection(config: Omit<DatabaseConnection, 'id'>): Promise<DatabaseConnection> {
        const newConnection: DatabaseConnection = {
            ...config,
            id: this.generateId(),
            createdAt: new Date().toISOString(),
            favorite: false,
        };

        this.connections.push(newConnection);
        await this.saveConnections();
        this.emit('connection-added', newConnection);
        return newConnection;
    }

    /**
     * 更新连接
     */
    async updateConnection(id: string, updates: Partial<DatabaseConnection>): Promise<void> {
        const index = this.connections.findIndex((c) => c.id === id);
        if (index === -1) {
            throw new Error(`连接不存在: ${id}`);
        }

        this.connections[index] = { ...this.connections[index], ...updates };
        await this.saveConnections();
        this.emit('connection-updated', this.connections[index]);
    }

    /**
     * 删除连接
     */
    async deleteConnection(id: string): Promise<void> {
        const index = this.connections.findIndex((c) => c.id === id);
        if (index === -1) {
            throw new Error(`连接不存在: ${id}`);
        }

        const deleted = this.connections.splice(index, 1)[0];
        await this.saveConnections();
        this.emit('connection-deleted', deleted);
    }

    /**
     * 获取所有连接
     */
    getConnections(): DatabaseConnection[] {
        return [...this.connections];
    }

    /**
     * 根据 ID 获取连接
     */
    getConnection(id: string): DatabaseConnection | undefined {
        return this.connections.find((c) => c.id === id);
    }

    /**
     * 根据 SSH 会话 ID 获取连接
     */
    getConnectionsBySession(sessionId: string): DatabaseConnection[] {
        return this.connections.filter((c) => c.sshConnectionId === sessionId);
    }

    // ============ 密码加密 ============

    /**
     * 加密密码
     */
    async encryptPassword(password: string): Promise<string> {
        return await invoke<string>('db_encrypt_password', { password });
    }

    /**
     * 解密密码
     */
    async decryptPassword(encryptedPassword: string): Promise<string> {
        return await invoke<string>('db_decrypt_password', { encryptedPassword });
    }

    // ============ 辅助方法 ============

    /**
     * 生成唯一 ID
     */
    private generateId(): string {
        return `db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 事件监听
     */
    on(event: string, callback: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    /**
     * 移除事件监听
     */
    off(event: string, callback: Function): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 触发事件
     */
    private emit(event: string, ...args: any[]): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach((callback) => callback(...args));
        }
    }

    /**
     * 创建默认连接模式（直接连接）
     */
    static createDirectMode(): ConnectionMode {
        return { type: 'direct' };
    }

    /**
     * 创建 Docker 连接模式
     */
    static createDockerMode(containerId: string, containerName: string): ConnectionMode {
        return { type: 'docker', containerId, containerName };
    }

    /**
     * 获取数据库默认端口
     */
    static getDefaultPort(dbType: DatabaseType): number {
        const defaultPorts: Record<DatabaseType, number> = {
            mysql: 3306,
            postgresql: 5432,
            redis: 6379,
            mongodb: 27017,
            sqlite: 0,
        };
        return defaultPorts[dbType];
    }

    /**
     * 获取数据库默认用户名
     */
    static getDefaultUsername(dbType: DatabaseType): string {
        const defaultUsernames: Record<DatabaseType, string> = {
            mysql: 'root',
            postgresql: 'postgres',
            redis: '',
            mongodb: 'admin',
            sqlite: '',
        };
        return defaultUsernames[dbType];
    }
}

// 导出单例
export const databaseManager = new DatabaseManager();
