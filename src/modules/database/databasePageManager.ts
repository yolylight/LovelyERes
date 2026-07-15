// 数据库页面管理器
// Database Page Manager

import { databaseManager, DatabaseManager } from './databaseManager';
import { DatabaseRenderer } from './databaseRenderer';
import type {
    DatabaseConnection,
    DatabaseEnvironment,
    QueryResult,
    DatabaseType,
    DatabasePreset,
    TableInfo,
    // TableColumn, // 暂时移除未使用的导入
    PaginatedResult,
} from './databaseTypes';
import { multiSessionManager } from '../remote/multiSessionManager';
import { QueryValidator } from './queryValidator';

export class DatabasePageManager {
    private renderer: DatabaseRenderer;
    private currentConnection: DatabaseConnection | null = null;
    private currentEnvironment: DatabaseEnvironment | null = null;
    private currentSessionId: string | null = null;
    
    // 浏览器状态
    private databases: string[] = [];
    private databaseTables: Map<string, TableInfo[]> = new Map(); // dbName -> tables
    private expandedDatabases: Set<string> = new Set();
    private activeDatabase: string | null = null;
    private activeTable: string | null = null;

    // 标签页状态
    private tabs: { 
        id: string, 
        title: string, 
        type: 'query' | 'data', 
        active: boolean,
        database?: string,
        table?: string,
        // 数据浏览状态
        page?: number,
        pageSize?: number,
        total?: number,
        data?: PaginatedResult,
        // 查询状态
        query?: string,
        queryResult?: QueryResult
    }[] = [];

    constructor() {
        this.renderer = new DatabaseRenderer();
        this.bindSessionEvents();
    }

    /**
     * 初始化页面
     */
    async initialize(containerId: string): Promise<void> {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`容器不存在: ${containerId}`);
        }

        // 渲染主界面
        container.innerHTML = this.renderer.renderMainPage();

        // 绑定事件
        this.bindEvents();

        // 加载连接列表
        await this.refreshConnectionList();
        
        // 恢复当前连接状态
        if (this.currentConnection) {
            this.restoreConnectionState();
        }

        // 如果有缓存的环境信息，立即渲染
        if (this.currentEnvironment) {
            this.renderEnvironmentInfo(this.currentEnvironment);
        }

        console.log('✅ 数据库管理页面初始化完成');
    }

    /**
     * 设置当前 SSH 会话
     */
    async setSession(sessionId: string, force: boolean = false): Promise<void> {
        // 如果会话ID没有变化且不是强制刷新
        if (this.currentSessionId === sessionId && !force) {
            // 如果有缓存的环境信息，重新渲染（应对页面重新初始化的情况）
            if (this.currentEnvironment) {
                 console.log('🔄 数据库会话ID未变更，使用缓存重新渲染环境信息');
                 this.renderEnvironmentInfo(this.currentEnvironment);
                 return;
            }
            // 如果没有环境信息（可能上次检测失败），则继续执行重新检测
            console.log('⚠️ 数据库会话ID未变更但无环境缓存，重新检测环境');
        }

        this.currentSessionId = sessionId;

        // 显示加载状态
        const container = document.getElementById('db-environment-info');
        if (container) {
            container.innerHTML = `
                <div class="db-loading-state" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                    <div class="loading-spinner" style="margin-bottom: 0.5rem;">🔄</div>
                    <div>正在检测数据库环境...</div>
                </div>
            `;
        }
        
        // 检测环境
        try {
            console.log('🔄 开始检测数据库环境:', sessionId);
            const env = await databaseManager.detectEnvironment(sessionId);
            this.currentEnvironment = env;
            this.renderEnvironmentInfo(env);
            console.log('✅ 数据库环境检测完成', env);
        } catch (error) {
            console.error('环境检测失败:', error);
            this.showError('环境检测失败: ' + error);
        }
    }



    /**
     * 绑定会话事件
     */
    private bindSessionEvents(): void {
        multiSessionManager.addListener((sessions) => {
            // 如果当前有数据库连接
            if (this.currentConnection) {
                // 检查关联的 SSH 会话是否还存在
                const sessionExists = sessions.some(s => s.sessionId === this.currentConnection?.sshConnectionId);
                
                // 如果 SSH 会话已关闭，则自动断开数据库连接
                if (!sessionExists) {
                    console.log(`🔌 关联的 SSH 会话 (${this.currentConnection.sshConnectionId}) 已关闭，自动断开数据库连接`);
                    this.disconnect();
                }
            }
        });
    }

    /**
     * 恢复连接状态 UI
     */
    private restoreConnectionState(): void {
        if (!this.currentConnection) return;

        // 1. 高亮连接列表项
        this.updateConnectionHighlight();

        // 2. 显示断开按钮
        const disconnectBtn = document.getElementById('db-disconnect');
        if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';

        // 3. 恢复浏览器视图
        this.renderBrowser();

        // 4. 恢复标签页
        this.renderTabs();
        
        console.log('✅ 已恢复数据库连接 UI 状态');
    }

    /**
     * 更新连接列表高亮
     */
    private updateConnectionHighlight(): void {
        if (!this.currentConnection) return;
        const id = this.currentConnection.id;
        const container = document.getElementById('db-connection-list');
        if (container) {
            container.querySelectorAll('.db-connection-item').forEach((item) => {
                item.classList.toggle('active', item.getAttribute('data-id') === id);
            });
        }
    }

    /**
     * 绑定事件
     */
    private bindEvents(): void {
        // 新建连接按钮
        document.getElementById('db-new-connection')?.addEventListener('click', () => {
            this.showConnectionForm();
        });

        // 新建查询按钮
        document.getElementById('db-new-query')?.addEventListener('click', () => {
            if (this.currentConnection) {
                this.openQueryTab();
            } else {
                this.showError('请先连接数据库');
            }
        });

        // 刷新环境按钮
        document.getElementById('db-refresh-env')?.addEventListener('click', async () => {
            console.log('🔄 手动刷新环境 triggered');
            if (this.currentSessionId) {
                await this.setSession(this.currentSessionId, true);
            } else {
                // 尝试从全局 app 获取当前活跃会话
                const app = (window as any).app;
                if (app && app.sshManager) {
                    const activeConn = app.sshManager.getActiveConnection();
                    if (activeConn) {
                        console.log('🔄 手动刷新：获取到活跃会话', activeConn.id);
                        await this.setSession(activeConn.id, true);
                    } else {
                        console.warn('⚠️ 手动刷新：未找到活跃 SSH 会话');
                        this.showError('未检测到活跃 SSH 连接，请先连接服务器');
                    }
                } else {
                    console.error('❌ 无法访问全局 app.sshManager');
                }
            }
        });


        // 断开连接按钮
        document.getElementById('db-disconnect')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showConfirmModal('确定要关闭当前数据库连接吗？', async () => {
                await this.disconnect();
            });
        });
    }



    /**
     * 运行安全审计
     */
    private async runSecurityAudit(): Promise<void> {
        if (!this.currentConnection) {
            this.showError('请先选择数据库连接');
            return;
        }

        try {
            this.showSuccess('正在运行安全审计...');
            const results = await databaseManager.runSecurityAudit(this.currentConnection);
            this.showSecurityAuditModal(results);
            this.showSuccess(`安全审计完成，发现 ${results.length} 项检查`);
        } catch (error) {
            this.showError('安全审计失败: ' + error);
        }
    }

    /**
     * 显示安全审计结果模态框
     */
    private showSecurityAuditModal(results: any[]): void {
        const modal = document.createElement('div');
        modal.className = 'db-modal';
        modal.innerHTML = `
            <div class="db-modal-content" style="max-width: 900px;">
                <div class="db-modal-header">
                    <h3>🔒 安全审计报告</h3>
                    <button class="db-modal-close">&times;</button>
                </div>
                <div class="db-modal-body">
                    ${this.renderer.renderSecurityAuditResults(results)}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定关闭事件
        modal.querySelector('.db-modal-close')?.addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    /**
     * 显示确认模态框
     */
    private showConfirmModal(message: string, onConfirm: () => void): void {
        const modal = document.createElement('div');
        modal.className = 'db-modal';
        modal.innerHTML = `
            <div class="db-modal-content" style="max-width: 400px;">
                <div class="db-modal-header">
                    <h3>⚠️ 确认</h3>
                    <button class="db-modal-close">&times;</button>
                </div>
                <div class="db-modal-body">
                    <p style="margin: 1rem 0; font-size: 1.1rem;">${message}</p>
                    <div class="db-form-actions" style="margin-top: 1.5rem; justify-content: flex-end;">
                        <button class="db-btn db-btn-secondary db-modal-cancel">取消</button>
                        <button class="db-btn db-btn-primary db-modal-confirm">确定</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const close = () => modal.remove();

        modal.querySelector('.db-modal-close')?.addEventListener('click', close);
        modal.querySelector('.db-modal-cancel')?.addEventListener('click', close);
        
        modal.querySelector('.db-modal-confirm')?.addEventListener('click', () => {
            onConfirm();
            close();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
    }

    /**
     * 显示连接表单
     */
    showConnectionForm(connection?: DatabaseConnection, preset?: DatabasePreset): void {
        const formHtml = this.renderer.renderConnectionForm(connection, this.currentEnvironment, preset);
        
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'db-modal';
        
        const title = connection ? '编辑连接' : (preset?.dockerContainer ? `新建 Docker 连接` : '新建连接');
        
        modal.innerHTML = `
            <div class="db-modal-content">
                <div class="db-modal-header">
                    <h3>${title}</h3>
                    <button class="db-modal-close">&times;</button>
                </div>
                <div class="db-modal-body">
                    ${formHtml}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定关闭事件
        modal.querySelector('.db-modal-close')?.addEventListener('click', () => {
            modal.remove();
        });

        // DISABLE click outside to close for forms to prevent accidental data loss
        // modal.addEventListener('click', (e) => {
        //     if (e.target === modal) {
        //         modal.remove();
        //     }
        // });

        // 绑定表单提交
        this.bindConnectionFormEvents(modal, connection, preset);
    }

    /**
     * 绑定连接表单事件
     */
    private bindConnectionFormEvents(modal: HTMLElement, existingConnection?: DatabaseConnection, preset?: DatabasePreset): void {
        const form = modal.querySelector('#db-connection-form') as HTMLFormElement;
        if (!form) return;

        // 数据库类型变更 - 更新端口和用户名
        const dbTypeSelect = form.querySelector('#db-type') as HTMLSelectElement;
        const portInput = form.querySelector('#db-port') as HTMLInputElement;
        const usernameInput = form.querySelector('#db-username') as HTMLInputElement;
        
        dbTypeSelect?.addEventListener('change', () => {
            const dbType = dbTypeSelect.value as DatabaseType;
            // 更新端口为默认值
            portInput.value = DatabaseManager.getDefaultPort(dbType).toString();
            // 更新用户名 placeholder
            const defaultUsername = DatabaseManager.getDefaultUsername(dbType);
            usernameInput.placeholder = defaultUsername || '无需用户名';
            // 如果用户名为空，填充默认用户名
            if (!usernameInput.value) {
                usernameInput.value = defaultUsername;
            }
        });
        
        // 连接模式变更（仅当有 Docker 容器时）
        const connectionModeSelect = form.querySelector('#db-connection-mode') as HTMLSelectElement;
        if (connectionModeSelect) {
            const hintDocker = form.querySelector('.hint-docker') as HTMLElement;
            const hintDirect = form.querySelector('.hint-direct') as HTMLElement;
            const hostInput = form.querySelector('#db-host') as HTMLInputElement;
            
            connectionModeSelect.addEventListener('change', () => {
                const mode = connectionModeSelect.value;
                if (hintDocker && hintDirect) {
                    hintDocker.style.display = mode === 'docker' ? '' : 'none';
                    hintDirect.style.display = mode === 'direct' ? '' : 'none';
                }
                // 切换模式时更新主机地址提示
                if (mode === 'docker') {
                    hostInput.value = 'localhost';
                    hostInput.placeholder = 'Docker 模式下忽略此设置';
                } else {
                    hostInput.placeholder = 'localhost 或 IP 地址';
                }
            });
        }

        // 测试连接
        form.querySelector('#db-test-connection')?.addEventListener('click', async () => {
            await this.testFormConnection(form);
        });

        // 保存连接
        form.querySelector('#db-save-connection')?.addEventListener('click', async () => {
            await this.saveFormConnection(form, existingConnection, preset);
            modal.remove();
        });
    }

    /**
     * 测试表单连接
     */
    private async testFormConnection(form: HTMLFormElement): Promise<void> {
        const configData = this.getFormConnectionData(form);
        // 为测试添加临时 id
        const config: DatabaseConnection = {
            ...configData,
            id: 'temp-test-connection',
        };
        
        const btn = form.querySelector('#db-test-connection') as HTMLButtonElement;
        const originalText = btn.textContent;

        try {
            btn.textContent = '测试中...';
            btn.disabled = true;

            const result = await databaseManager.testConnection(config);
            
            if (result) {
                this.showSuccess('连接测试成功！');
            } else {
                this.showError('连接测试失败');
            }
        } catch (error) {
            this.showError('连接测试失败: ' + error);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /**
     * 保存表单连接
     */
    private async saveFormConnection(form: HTMLFormElement, existingConnection?: DatabaseConnection, preset?: DatabasePreset): Promise<void> {
        const config = this.getFormConnectionData(form, preset);

        try {
            if (existingConnection) {
                await databaseManager.updateConnection(existingConnection.id, config);
                this.showSuccess('连接已更新');
            } else {
                await databaseManager.addConnection(config);
                this.showSuccess('连接已添加');
            }

            await this.refreshConnectionList();
        } catch (error) {
            this.showError('保存连接失败: ' + error);
        }
    }

    /**
     * 从表单获取连接数据
     */
    private getFormConnectionData(form: HTMLFormElement, _preset?: DatabasePreset): Omit<DatabaseConnection, 'id'> {
        const formData = new FormData(form);
        
        // 检查连接模式
        const connectionModeValue = formData.get('connectionMode') as string;
        const dockerContainerId = formData.get('dockerContainerId') as string;
        const dockerContainerName = formData.get('dockerContainerName') as string;
        
        // 根据连接模式创建 ConnectionMode
        let connectionMode;
        if (connectionModeValue === 'docker' && dockerContainerId && dockerContainerName) {
            connectionMode = DatabaseManager.createDockerMode(dockerContainerId, dockerContainerName);
        } else {
            connectionMode = DatabaseManager.createDirectMode();
        }
        
        return {
            name: formData.get('name') as string,
            dbType: formData.get('dbType') as DatabaseType,
            host: formData.get('host') as string,
            port: parseInt(formData.get('port') as string),
            database: formData.get('database') as string || undefined,
            username: formData.get('username') as string || undefined,
            encryptedPassword: formData.get('password') as string || undefined,
            sshConnectionId: this.currentSessionId || '',
            connectionMode,
            favorite: false,
        };
    }





    /**
     * 刷新连接列表
     */
    private async refreshConnectionList(): Promise<void> {
        const connections = await databaseManager.loadConnections();
        const container = document.getElementById('db-connection-list');
        
        if (container) {
            container.innerHTML = this.renderer.renderConnectionList(connections);
            this.bindConnectionListEvents();
        }
    }

    /**
     * 绑定连接列表事件
     */
    private bindConnectionListEvents(): void {
        document.querySelectorAll('.db-connection-item').forEach((item) => {
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-id');
                if (id) {
                    this.selectConnection(id);
                }
            });
        });

        document.querySelectorAll('.db-connection-edit').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).getAttribute('data-id');
                if (id) {
                    const connection = databaseManager.getConnection(id);
                    if (connection) {
                        this.showConnectionForm(connection);
                    }
                }
            });
        });

        document.querySelectorAll('.db-connection-delete').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).getAttribute('data-id');
                if (id && confirm('确定删除此连接？')) {
                    await databaseManager.deleteConnection(id);
                    await this.refreshConnectionList();
                }
            });
        });
    }

    /**
     * 选择连接
     */
    private async selectConnection(id: string): Promise<void> {
        const connection = databaseManager.getConnection(id);
        if (!connection) return;

        this.currentConnection = connection;
        
        // 更新 UI 高亮
        this.updateConnectionHighlight();

        // 重置状态
        this.expandedDatabases.clear();
        this.databaseTables.clear();
        this.activeDatabase = null;
        this.activeTable = null;
        this.closeAllTabs();

        // 加载数据库列表
        await this.loadDatabases();
        
        this.showSuccess(`已连接到: ${connection.name}`);
        
        // 显示断开连接按钮
        const disconnectBtn = document.getElementById('db-disconnect');
        if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
    }

    /**
     * 断开连接
     */
    private async disconnect(): Promise<void> {
        if (!this.currentConnection) return;

        console.log('🔌 断开数据库连接:', this.currentConnection.name);

        this.currentConnection = null;
        this.expandedDatabases.clear();
        this.databaseTables.clear();
        this.activeDatabase = null;
        this.activeTable = null;
        this.closeAllTabs();

        // 隐藏断开连接按钮
        const disconnectBtn = document.getElementById('db-disconnect');
        if (disconnectBtn) disconnectBtn.style.display = 'none';

        // 重置 UI 高亮
        document.querySelectorAll('.db-connection-item').forEach((item) => {
            item.classList.remove('active');
        });

        // 重置浏览器区域
        const container = document.getElementById('db-browser');
        if (container) {
            container.innerHTML = '<p class="db-placeholder">请选择一个连接</p>';
        }

        this.showSuccess('连接已关闭');
    }

    /**
     * 加载数据库列表
     */
    private async loadDatabases(): Promise<void> {
        if (!this.currentConnection) return;
        
        const container = document.getElementById('db-browser');
        if (container) container.innerHTML = '<p class="db-placeholder">正在加载数据库...</p>';

        try {
            this.databases = await databaseManager.listDatabases(this.currentConnection);
            this.renderBrowser();
        } catch (error) {
            console.error('获取数据库列表失败:', error);
            if (container) container.innerHTML = `<p class="db-error">加载失败: ${error}</p>`;
            this.showError('获取数据库列表失败');
        }
    }

    /**
     * 加载表列表
     */
    private async loadTables(database: string): Promise<void> {
        if (!this.currentConnection) return;

        try {
            const tables = await databaseManager.listTables(this.currentConnection, database);
            this.databaseTables.set(database, tables);
            this.renderBrowser();
        } catch (error) {
            console.error(`获取表列表失败 (${database}):`, error);
            this.showError(`无法加载 ${database} 的表: ${error}`);
        }
    }

    /**
     * 渲染数据库浏览器
     */
    private renderBrowser(): void {
        const container = document.getElementById('db-browser');
        if (!container) return;

        // 构建渲染所需的数据
        // 实际上 Renderer.renderDatabaseTree 需要知道每个数据库的表（如果它被展的话）
        // 目前 renderDatabaseTree 设计比较简单，只支持单个展开的数据库。为了支持多展开，我可能需要修改 Renderer。
        // 但目前 Renderer 的 renderDatabaseTree 签名是 renderDatabaseTree(databases, activeDb, tables, activeTable)
        // 这意味着它只支持显示一个“激活”数据库的表。
        // 让我们调整 Renderer 以支持更好的交互：我们可以只传递当前展开的数据库及其表。
        // 但为了简单，我们先假设一次只能展开一个数据库（或者我们修改 Renderer）。
        
        // 让我修改一下 Renderer 的调用方式。我们可以为 activeDatabase 传递表列表。
        let tables: TableInfo[] | undefined = undefined;
        if (this.activeDatabase && this.expandedDatabases.has(this.activeDatabase)) {
            tables = this.databaseTables.get(this.activeDatabase);
        }

        container.innerHTML = this.renderer.renderDatabaseTree(
            this.databases,
            this.activeDatabase || undefined,
            tables,
            this.activeTable || undefined
        );

        this.bindBrowserEvents();
    }

    /**
     * 绑定浏览器事件
     */
    private bindBrowserEvents(): void {
        const container = document.getElementById('db-browser');
        if (!container) return;

        // 点击数据库
        container.querySelectorAll('.db-tree-item.database').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const dbName = item.getAttribute('data-name');
                if (dbName) {
                    await this.toggleDatabase(dbName);
                }
            });
        });

        // 点击表
        container.querySelectorAll('.db-tree-item.table').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const dbName = item.getAttribute('data-database');
                const tableName = item.getAttribute('data-name');
                if (dbName && tableName) {
                    this.activeTable = tableName;
                    this.renderBrowser(); // 更新高亮
                    await this.openDataTab(dbName, tableName);
                }
            });
        });
    }

    /**
     * 切换数据库展开/折叠
     */
    private async toggleDatabase(dbName: string): Promise<void> {
        if (this.activeDatabase === dbName) {
            // 如果已激活，则折叠
            this.activeDatabase = null;
            this.expandedDatabases.delete(dbName);
        } else {
            // 展开新数据库
            this.activeDatabase = dbName;
            this.expandedDatabases.add(dbName);
            
            // 如果只有没有加载过表，加载表
            if (!this.databaseTables.has(dbName)) {
                // 显示加载状态（这里简化处理，renderBrowser 会在数据回来后刷新）
                await this.loadTables(dbName);
            }
        }
        this.renderBrowser();
    }


    /**
     * 打开数据浏览标签页
     */
    private async openDataTab(database: string, table: string): Promise<void> {
        const id = `data-${database}-${table}`;
        let tab = this.tabs.find(t => t.id === id);

        if (!tab) {
            tab = {
                id,
                title: table,
                type: 'data',
                active: true,
                database,
                table,
                page: 1,
                pageSize: 50,
            };
            this.tabs.push(tab);
        }

        await this.activateTab(id);
    }

    /**
     * 打开查询标签页
     */
    private async openQueryTab(): Promise<void> {
        const id = `query-${Date.now()}`;
        const tab = {
            id,
            title: '新查询',
            type: 'query' as const,
            active: true,
            database: this.currentConnection?.database
        };
        this.tabs.push(tab);
        await this.activateTab(id);
    }

    /**
     * 激活标签页
     */
    private async activateTab(id: string): Promise<void> {
        this.tabs.forEach(t => t.active = (t.id === id));
        this.renderTabs();
    }

    /**
     * 关闭标签页
     */
    private closeTab(id: string): void {
        const index = this.tabs.findIndex(t => t.id === id);
        if (index === -1) return;

        const wasActive = this.tabs[index].active;
        this.tabs.splice(index, 1);

        if (wasActive && this.tabs.length > 0) {
            // 激活最后一个标签页
            this.activateTab(this.tabs[this.tabs.length - 1].id);
        } else {
            this.renderTabs();
        }
    }

    /**
     * 关闭所有标签页
     */
    private closeAllTabs(): void {
        this.tabs = [];
        this.renderTabs();
    }

    /**
     * 渲染标签页
     */
    private renderTabs(): void {
        const headerContainer = document.getElementById('db-tabs');
        const contentContainer = document.getElementById('db-tab-contents');
        
        if (!headerContainer || !contentContainer) return;

        // 渲染头部
        headerContainer.innerHTML = this.renderer.renderTabsHeader(this.tabs);

        // 绑定头部事件
        this.bindTabEvents();

        // 渲染内容
        const activeTab = this.tabs.find(t => t.active);
        if (!activeTab) {
            contentContainer.innerHTML = `
                <div class="db-empty" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
                    <span style="font-size: 3rem;">🗄️</span>
                    <p>请从左侧选择一个数据库或表进行查看</p>
                    <div style="margin-top: 1rem;">
                        <button id="db-quick-query" class="db-btn db-btn-primary">
                            <span class="icon">📝</span> 新建查询
                        </button>
                        <button id="db-quick-audit" class="db-btn db-btn-warning" style="margin-left: 0.5rem;">
                            <span class="icon">🛡️</span> 安全审计
                        </button>
                    </div>
                </div>
            `;
            // 绑定快速查询按钮
            document.getElementById('db-quick-query')?.addEventListener('click', () => {
                this.openQueryTab();
            });
            // 绑定安全审计按钮
            document.getElementById('db-quick-audit')?.addEventListener('click', () => {
                this.runSecurityAudit();
            });
            return;
        }

        if (activeTab.type === 'data') {
            this.renderDataTab(contentContainer, activeTab);
        } else {
            this.renderQueryTab(contentContainer, activeTab);
        }
    }

    /**
     * 绑定标签页事件
     */
    private bindTabEvents(): void {
        document.querySelectorAll('.db-tab').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.getAttribute('data-id');
                if (id) this.activateTab(id);
            });
        });

        document.querySelectorAll('.db-tab-close').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = el.getAttribute('data-id');
                if (id) this.closeTab(id);
            });
        });
    }

    /**
     * 渲染数据标签页内容
     */
    private async renderDataTab(container: HTMLElement, tab: any): Promise<void> {
        // 如果没有数据，先加载数据
        if (!tab.data) {
           await this.loadTabData(tab);
        }

        container.innerHTML = `
            ${this.renderer.renderGridToolbar(tab.total || 0, tab.page || 1, tab.pageSize || 50)}
            <div id="db-grid-${tab.id}" class="db-grid-container" style="flex: 1; overflow: auto;">
                ${this.renderer.renderDataGrid(tab.data)}
            </div>
        `;

        // 绑定工具栏事件
        const toolbar = container.querySelector('.db-grid-toolbar');
        if (toolbar) {
            toolbar.querySelector('.db-prev-page')?.addEventListener('click', () => {
                if (tab.page > 1) {
                    tab.page--;
                    this.loadTabData(tab).then(() => this.renderTabs());
                }
            });

            toolbar.querySelector('.db-next-page')?.addEventListener('click', () => {
                const totalPages = Math.ceil((tab.total || 0) / (tab.pageSize || 50));
                if (tab.page < totalPages) {
                    tab.page++;
                    this.loadTabData(tab).then(() => this.renderTabs());
                }
            });

            toolbar.querySelector('.db-refresh-data')?.addEventListener('click', () => {
                this.loadTabData(tab).then(() => this.renderTabs());
            });

            toolbar.querySelector('.db-view-structure')?.addEventListener('click', async () => {
                await this.showTableStructure(tab.database, tab.table);
            });

            toolbar.querySelector('.db-add-data')?.addEventListener('click', () => {
                this.addData(tab.database, tab.table, tab);
            });
        }
        
        // 绑定数据网格事件 (编辑/删除)
        this.bindDataGridEvents(container, tab);
    }

    /**
     * 绑定数据网格操作事件
     */
    private bindDataGridEvents(container: HTMLElement, tab: any): void {
        const grid = container.querySelector('.db-result-table');
        if (!grid) return;

        grid.querySelectorAll('.db-row-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt((btn as HTMLElement).getAttribute('data-row-index') || '-1');
                if (index >= 0 && tab.data && tab.data.rows[index]) {
                    this.editRow(tab.database, tab.table, tab.data.rows[index], tab);
                }
            });
        });

        grid.querySelectorAll('.db-row-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt((btn as HTMLElement).getAttribute('data-row-index') || '-1');
                if (index >= 0 && tab.data && tab.data.rows[index]) {
                    this.deleteRow(tab.database, tab.table, tab.data.rows[index], tab);
                }
            });
        });
    }

    /**
     * 添加数据
     */
    private async addData(database: string, table: string, tab: any): Promise<void> {
        if (!this.currentConnection) return;

        try {
            const columns = await databaseManager.describeTable(this.currentConnection, database, table);
            
            const modal = document.createElement('div');
            modal.className = 'db-modal';
            modal.innerHTML = `
                <div class="db-modal-content" style="max-width: 600px;">
                    <div class="db-modal-header">
                        <h3>添加数据: ${table}</h3>
                        <button class="db-modal-close">&times;</button>
                    </div>
                    <div class="db-modal-body">
                        ${this.renderer.renderAddDataModal(columns)}
                        <div class="db-form-actions" style="margin-top: 1.5rem; justify-content: flex-end;">
                            <button class="db-btn db-btn-secondary db-modal-cancel">取消</button>
                            <button class="db-btn db-btn-primary db-save-add">添加</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const close = () => modal.remove();
            modal.querySelector('.db-modal-close')?.addEventListener('click', close);
            modal.querySelector('.db-modal-cancel')?.addEventListener('click', close);

            // 处理 NULL 复选框
            modal.querySelectorAll('.db-add-null-check').forEach(chk => {
                chk.addEventListener('change', (e) => {
                    const checkbox = e.target as HTMLInputElement;
                    const targetId = checkbox.getAttribute('data-target');
                    if (targetId) {
                        const input = modal.querySelector(`#${targetId}`) as HTMLInputElement;
                        if (input) {
                            input.disabled = checkbox.checked;
                            input.dataset.isNull = checkbox.checked ? 'true' : 'false';
                            if (checkbox.checked) {
                                input.value = 'NULL';
                            } else {
                                input.value = ''; 
                            }
                        }
                    }
                });
            });

            // 保存
            modal.querySelector('.db-save-add')?.addEventListener('click', async () => {
                if (!this.currentConnection) return;
                
                const form = modal.querySelector('#db-add-data-form') as HTMLFormElement;
                const data: Record<string, string | null> = {};

                columns.forEach((col, idx) => {
                    const isAutoIncrement = col.extra?.includes('auto_increment');
                    if (!isAutoIncrement) {
                        const input = form.querySelector(`#add-col-${idx}`) as HTMLInputElement;
                        // const checkbox = modal.querySelector(`.db-add-null-check[data-target="add-col-${idx}"]`) as HTMLInputElement;
                        // const isNull = checkbox && checkbox.checked; 
                        // 或者使用 dataset
                        const isNull = input.dataset.isNull === 'true';

                        data[col.name] = isNull ? null : input.value;
                    }
                });

                try {
                    await databaseManager.insertRow(this.currentConnection!, {
                        database,
                        table,
                        data
                    });
                    this.showSuccess('添加成功');
                    close();
                    this.loadTabData(tab).then(() => this.renderTabs());
                } catch (error) {
                    this.showError('添加失败: ' + error);
                }
            });

        } catch (error) {
            this.showError('准备添加失败: ' + error);
        }
    }

    /**
     * 编辑行
     */
    private async editRow(database: string, table: string, rowData: string[], tab: any): Promise<void> {
        if (!this.currentConnection) return;

        try {
            // 获取表结构以知道哪些是主键和字段类型
            const columns = await databaseManager.describeTable(this.currentConnection, database, table);
            
            // 渲染模态框
            const modal = document.createElement('div');
            modal.className = 'db-modal';
            modal.innerHTML = `
                <div class="db-modal-content" style="max-width: 600px;">
                    <div class="db-modal-header">
                        <h3>编辑行</h3>
                        <button class="db-modal-close">&times;</button>
                    </div>
                    <div class="db-modal-body">
                        ${this.renderer.renderEditModal(columns, rowData)}
                        <div class="db-form-actions" style="margin-top: 1.5rem; justify-content: flex-end;">
                            <button class="db-btn db-btn-secondary db-modal-cancel">取消</button>
                            <button class="db-btn db-btn-primary db-save-row">保存更改</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // 绑定事件
            const close = () => modal.remove();
            modal.querySelector('.db-modal-close')?.addEventListener('click', close);
            modal.querySelector('.db-modal-cancel')?.addEventListener('click', close);

            // 处理 NULL 复选框变化
            modal.querySelectorAll('.db-edit-null-check').forEach(chk => {
                chk.addEventListener('change', (e) => {
                    const checkbox = e.target as HTMLInputElement;
                    const targetId = checkbox.getAttribute('data-target');
                    if (targetId) {
                        const input = modal.querySelector(`#${targetId}`) as HTMLInputElement;
                        if (input) {
                            input.disabled = checkbox.checked;
                            input.dataset.isNull = checkbox.checked ? 'true' : 'false';
                            if (checkbox.checked) {
                                input.value = 'NULL';
                            } else {
                                // 恢复原值或空字符串
                                input.value = input.getAttribute('data-original-value') === 'NULL' ? '' : (input.getAttribute('data-original-value') || '');
                            }
                        }
                    }
                });
            });

            // 保存
            modal.querySelector('.db-save-row')?.addEventListener('click', async () => {
                if (!this.currentConnection) return;

                const form = modal.querySelector('#db-edit-row-form') as HTMLFormElement;
                // const formData = new FormData(form); // Unused
                const updates: Record<string, string | null> = {};
                const conditions: Record<string, string> = {};

                // 收集更新数据和条件
                columns.forEach((col, idx) => {
                    const input = form.querySelector(`#col-${idx}`) as HTMLInputElement;
                    const isNull = input.dataset.isNull === 'true';
                    const currentValue = isNull ? null : input.value;
                    const originalValue = rowData[idx]; // 注意：这里 originalValue 是 string | null (但 PaginatedResult.rows 是 string[][]，null 被转为 'NULL' 字符串了吗？后端返回 Option<String>，json 序列化为 null 或 string)
                    // Update: PaginatedResult rows is string[][] in frontend types currently? 
                    // Let's check databaseTypes.ts. Yes, string[][]. 
                    // Rust `rows: Vec<Vec<String>>`. 
                    // WAIT. Rust `parse_tabular_output` filters nulls? No.
                    // Rust `select_rows` returns `Vec<Vec<String>>`?
                    // In `database_manager.rs`, `rows` is `Vec<Vec<String>>`.
                    // The `parse_tabular_output` simply splits by tab.
                    // If a value is NULL in DB, how is it represented in tab output?
                    // MySQL `mysql -N` output: NULL is usually `NULL` text or empty?
                    // Let's check `databaseRenderer.ts`: `cell === null ? ...`.
                    // So `cell` CAN be null.
                    
                    // Actually `PaginatedResult` definition in `databaseTypes.ts` says `rows: string[][]`.
                    // But JSON allows null.
                    // Let's assume cell can be null.
                    
                    // 构建条件 (使用旧值)
                    // 为了安全，我们应该使用主键作为条件。
                    // 如果有 Primary Key，只用 Primary Key。
                    // 如果没有 Primary Key，则使用所有字段作为条件 (Old Value) 以防止并发冲突。
                    
                    const isKey = !!col.key;
                    if (isKey) {
                        // 如果是 Key，加入条件
                         if (originalValue !== null) {
                            conditions[col.name] = originalValue;
                         }
                         // 如果 Key 是 NULL (不应该发生)，我们可能无法定位行。
                    }
                    
                    // 收集变更
                    // 只有当值改变时才更新，或者我们更新所有非 Key 字段？
                    // 简单起见，如果在这个表单里，我们更新它，除了 readonly 的。
                    if (!input.readOnly) {
                        updates[col.name] = currentValue;
                    }
                });
                
                // 如果没有主键，我们被迫使用所有原始值作为条件
                const hasKey = columns.some(c => !!c.key);
                if (!hasKey) {
                    columns.forEach((col, idx) => {
                        const originalValue = rowData[idx];
                         if (originalValue !== null) {
                            conditions[col.name] = originalValue;
                         }
                    });
                }

                if (Object.keys(updates).length === 0) {
                    this.showError('没有需要保存的更改');
                    return;
                }
                
                if (Object.keys(conditions).length === 0) {
                     this.showError('无法定位行（缺少主键或唯一标识）');
                     return;
                }

                // 确认对话框
                this.showConfirmModal('确定要保存更改吗？', async () => {
                     try {
                        await databaseManager.updateRow(this.currentConnection!, {
                            database,
                            table,
                            updates,
                            conditions
                        });
                        this.showSuccess('更新成功');
                        close();
                        // 刷新数据
                        this.loadTabData(tab).then(() => this.renderTabs());
                    } catch (error) {
                        this.showError('更新失败: ' + error);
                    }
                });
            });

        } catch (error) {
            this.showError('准备编辑失败: ' + error);
        }
    }

    /**
     * 删除行
     */
    private async deleteRow(database: string, table: string, rowData: string[], tab: any): Promise<void> {
        if (!this.currentConnection) return;

        try {
            // 获取表结构以确定主键
            const columns = await databaseManager.describeTable(this.currentConnection, database, table);
            const conditions: Record<string, string> = {};
            
            // 优先使用主键
            let hasKey = false;
            columns.forEach((col, idx) => {
                if (col.key && rowData[idx] !== null) {
                    conditions[col.name] = rowData[idx];
                    hasKey = true;
                }
            });

            // 如果没有主键，使用所有字段
            if (!hasKey) {
                columns.forEach((col, idx) => {
                    if (rowData[idx] !== null) {
                        conditions[col.name] = rowData[idx];
                    }
                });
            }

            if (Object.keys(conditions).length === 0) {
                this.showError('无法定位行（缺少主键或唯一标识）');
                return;
            }

            this.showConfirmModal('确定要删除此行数据吗？此操作不可恢复。', async () => {
                try {
                    await databaseManager.deleteRow(this.currentConnection!, {
                        database,
                        table,
                        conditions
                    });
                    this.showSuccess('删除成功');
                    // 刷新数据
                    this.loadTabData(tab).then(() => this.renderTabs());
                } catch (error) {
                    this.showError('删除失败: ' + error);
                }
            });

        } catch (error) {
             this.showError('准备删除失败: ' + error);
        }
    }

    /**
     * 加载标签页数据
     */
    private async loadTabData(tab: any): Promise<void> {
        if (!this.currentConnection || !tab.database || !tab.table) return;

        try {
            const result = await databaseManager.selectRows(
                this.currentConnection,
                tab.database,
                tab.table,
                (tab.page || 1) - 1,
                tab.pageSize || 50
            );
            tab.data = result;
            tab.total = result.totalCount;
        } catch (error) {
            console.error('加载数据失败:', error);
            this.showError('加载数据失败: ' + error);
        }
    }

    /**
     * 查看表结构
     */
    private async showTableStructure(database: string, table: string): Promise<void> {
        if (!this.currentConnection) return;

        try {
            const columns = await databaseManager.describeTable(this.currentConnection, database, table);
            
            // 显示模态框
            const modal = document.createElement('div');
            modal.className = 'db-modal';
            modal.innerHTML = `
                <div class="db-modal-content" style="max-width: 800px;">
                    <div class="db-modal-header">
                        <h3>表结构: ${table}</h3>
                        <button class="db-modal-close">&times;</button>
                    </div>
                    <div class="db-modal-body">
                        ${this.renderer.renderTableStructure(columns)}
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            modal.querySelector('.db-modal-close')?.addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

        } catch (error) {
            this.showError('获取表结构失败: ' + error);
        }
    }

    /**
     * 渲染查询标签页内容
     */
    private renderQueryTab(container: HTMLElement, tab: any): void {
        container.innerHTML = `
            <div class="db-query-panel">
                <div class="db-query-header">
                    <h3>SQL 查询${tab.database ? ` (${tab.database})` : ''}</h3>
                    <div class="db-query-actions">
                        <button class="db-btn db-btn-success db-run-query">
                            <span class="icon">▶</span> 执行
                        </button>
                    </div>
                </div>
                <textarea class="db-query-editor" spellcheck="false">${tab.query || ''}</textarea>
            </div>
            <div class="db-result-panel">
                <div class="db-result-header">
                    <h3>查询结果</h3>
                </div>
                <div class="db-query-result">
                    ${tab.queryResult ? this.renderer.renderQueryResult(tab.queryResult) : '<p class="db-placeholder">执行查询后显示结果</p>'}
                </div>
            </div>
        `;

        // 绑定事件
        const editor = container.querySelector('.db-query-editor') as HTMLTextAreaElement;
        editor.addEventListener('input', () => {
            tab.query = editor.value;
        });

        container.querySelector('.db-run-query')?.addEventListener('click', async () => {
            if (!this.currentConnection || !editor.value.trim()) return;
            
            const query = editor.value;
            const dbType = this.currentConnection.dbType;

            // 1. 验证查询
            const validation = QueryValidator.validate(query, dbType);
            if (!validation.isValid) {
                this.showError(`SQL 校验失败: ${validation.message}`);
                return;
            }

            try {
                // 2. 拆分语句（如果支持）
                const statements = QueryValidator.splitStatements(query);
                
                if (statements.length === 0) {
                    this.showError('没有有效的 SQL 语句');
                    return;
                }

                // 3. 依次执行
                let lastResult = null;
                let successCount = 0;
                const totalTimeStart = Date.now();

                // 显示执行中状态
                 const btn = container.querySelector('.db-run-query') as HTMLButtonElement;
                 const originalText = btn.textContent;
                 btn.textContent = '执行中...';
                 btn.disabled = true;

                try {
                    for (const stmt of statements) {
                        // 跳过空语句
                        if (!stmt.trim()) continue;

                        const result = await databaseManager.executeQuery(this.currentConnection, stmt);
                        
                        // 如果出错，立即停止
                        if (result.error) {
                            throw new Error(`在执行第 ${successCount + 1} 条语句时出错: ${result.error}`);
                        }

                        lastResult = result;
                        successCount++;
                    }
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
                
                // 4. 显示结果 (显示最后一条有结果的语句，或者最后一条语句)
                // 目前简单处理：显示最后一条执行结果
                if (lastResult) {
                     // 累计时间可能不准确，因为是串行。这里使用总耗时。
                    lastResult.executionTimeMs = Date.now() - totalTimeStart;
                    tab.queryResult = lastResult;
                    this.renderTabs(); // 重新渲染以显示结果
                    
                    if (successCount > 1) {
                         this.showSuccess(`成功执行 ${successCount} 条语句 (耗时 ${lastResult.executionTimeMs}ms)`);
                    } else {
                         this.showSuccess(`查询完成 (${lastResult.executionTimeMs}ms)`);
                    }
                } else {
                    this.showSuccess('执行完成，无结果返回');
                }

            } catch (error) {
                this.showError('查询失败: ' + error);
            }
        });
    }

    /**
     * 渲染环境信息
     */
    private renderEnvironmentInfo(env: DatabaseEnvironment): void {
        const container = document.getElementById('db-environment-info');
        if (!container) return;

        container.innerHTML = this.renderer.renderEnvironmentInfo(env);
        
        // 绑定环境卡片事件
        this.bindEnvironmentCardEvents();
    }
    
    /**
     * 绑定环境卡片点击事件
     */
    private bindEnvironmentCardEvents(): void {
        // 可用客户端卡片点击
        document.querySelectorAll('.db-client-card.db-client-available').forEach(card => {
            card.addEventListener('click', () => {
                const dbType = card.getAttribute('data-db-type') as DatabaseType;
                if (dbType) {
                    const preset: DatabasePreset = {
                        dbType,
                        port: DatabaseManager.getDefaultPort(dbType),
                        username: DatabaseManager.getDefaultUsername(dbType),
                    };
                    this.showConnectionForm(undefined, preset);
                }
            });
        });
        
        // Docker 容器卡片点击
        document.querySelectorAll('.db-docker-card').forEach(card => {
            card.addEventListener('click', () => {
                const dbType = card.getAttribute('data-db-type') as DatabaseType;
                const containerId = card.getAttribute('data-container-id') || '';
                const containerName = card.getAttribute('data-container-name') || '';
                const hostPort = parseInt(card.getAttribute('data-host-port') || '0');
                const image = card.getAttribute('data-image') || '';
                
                if (dbType) {
                    const preset: DatabasePreset = {
                        dbType,
                        port: hostPort || DatabaseManager.getDefaultPort(dbType),
                        username: DatabaseManager.getDefaultUsername(dbType),
                        dockerContainer: {
                            containerId,
                            containerName,
                            image,
                        },
                    };
                    this.showConnectionForm(undefined, preset);
                }
            });
        });
    }

    /**
     * 显示成功消息
     */
    private showSuccess(message: string): void {
        this.showMessage(message, 'success');
    }

    /**
     * 显示错误消息
     */
    private showError(message: string): void {
        this.showMessage(message, 'error');
    }

    /**
     * 显示消息
     */
    private showMessage(message: string, type: 'success' | 'error'): void {
        const toast = document.createElement('div');
        toast.className = `db-toast db-toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// 导出单例
export const databasePageManager = new DatabasePageManager();
