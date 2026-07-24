/**
 * 数据库管理器
 * 管理数据库连接、SQL 执行、数据浏览等功能
 */

import { invoke } from '@tauri-apps/api/core';

// ==================== Types ====================

export interface DatabaseInfo {
  db_type: string;
  name: string;
  version: string;
  status: string;
  port: number;
  data_dir: string;
}

export interface DockerMode {
  type: 'docker';
  container_id: string;
  container_name: string;
}

export interface DirectMode {
  type: 'direct';
}

export type ConnectionMode = DirectMode | DockerMode;

export interface DbConnection {
  id: string;
  db_type: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string;
  name: string;          // 显示名称
  isConnected: boolean;
  connection_mode?: ConnectionMode;
}

export interface SqlResult {
  columns: string[];
  rows: string[][];
  row_count: number;
  affected_rows?: number;
  execution_time_ms: number;
  error?: string;
}

export interface TableInfo {
  name: string;
  row_count?: number;
  size?: string;
  engine?: string;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  default_value?: string;
}

export interface DbUser {
  username: string;
  host: string;
  privileges: string[];
}

export interface PaginatedResult {
  columns: string[];
  rows: string[][];
  total_count: number;
  page: number;
  page_size: number;
}

export interface UpdateRowParams {
  database: string;
  table: string;
  updates: Record<string, string | null>;
  conditions: Record<string, string>;
}

export interface DeleteRowParams {
  database: string;
  table: string;
  conditions: Record<string, string>;
}

export interface InsertRowParams {
  database: string;
  table: string;
  data: Record<string, string | null>;
}

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type CheckStatus = 'pass' | 'fail' | 'warning' | 'error';

export interface SecurityFinding {
  item: string;
  detail: string;
}

export interface SecurityCheckResult {
  check_id: string;
  check_name: string;
  severity: SecuritySeverity;
  status: CheckStatus;
  findings: SecurityFinding[];
  recommendation: string;
}

export interface SqlHistoryEntry {
  sql: string;
  db_type: string;
  database: string;
  timestamp: number;
  success: boolean;
  row_count?: number;
}

export type DbTab = 'connections' | 'sql' | 'browser' | 'users' | 'ops';

// ==================== Manager ====================

export class DatabaseManager {
  private detectedDatabases: DatabaseInfo[] = [];
  private connections: DbConnection[] = [];
  private activeConnection: DbConnection | null = null;
  private currentTab: DbTab = 'connections';
  private sqlHistory: SqlHistoryEntry[] = [];
  private lastSqlResult: SqlResult | null = null;

  // 数据浏览状态
  private databases: string[] = [];
  private currentDatabase: string = '';
  private tables: TableInfo[] = [];
  private currentTable: string = '';
  private tableData: SqlResult | null = null;
  private columns: ColumnInfo[] = [];
  // 分页浏览状态（1-based）
  private browserPage: number = 1;
  private browserPageSize: number = 50;
  private browserTotal: number = 0;
  // 行编辑上下文：insert=新增，update=编辑现有行
  private rowEditor: { mode: 'insert' | 'update'; rowIndex: number } | null = null;

  // 用户管理状态
  private users: DbUser[] = [];

  // 安全审计结果
  private securityResults: SecurityCheckResult[] = [];
  private auditRunning: boolean = false;

  // UI 状态
  private initialized = false;
  private loading = false;

  // 待处理的密码输入请求（快速连接 / 需要密码的连接）
  private pendingConnId: string | null = null;
  // 会话级密码缓存：connId -> 明文密码（仅内存，不落盘）
  private sessionPasswords: Map<string, string> = new Map();

  constructor() {
    this.loadConnectionsFromStorage();
    this.loadSqlHistory();
  }

  // ==================== Lifecycle ====================

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.bindEvents();
    this.initialized = true;
    (window as any).databaseManager = this;
    // 初始化后渲染当前 tab 内容
    this.updateUI();
  }

  private bindEvents(): void {
    document.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-db-action]') as HTMLElement;
      if (!target) return;
      const action = target.getAttribute('data-db-action') || '';
      this.handleAction(action, target);
    });

    // SQL 执行快捷键
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const sqlEditor = document.getElementById('db-sql-editor') as HTMLTextAreaElement;
        if (sqlEditor && document.activeElement === sqlEditor) {
          e.preventDefault();
          this.executeSql();
        }
      }
    });

    // 连接模式变动事件
    document.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      if (target && target.id === 'db-add-mode') {
        const mode = (target as HTMLSelectElement).value;
        const group = document.getElementById('db-add-container-group');
        if (group) {
          group.style.display = mode === 'docker' ? '' : 'none';
        }
      }
      // 顶部全局连接切换下拉
      if (target && target.id === 'db-active-switcher') {
        this.switchActiveConnection((target as HTMLSelectElement).value);
      }
      // SQL 控制台数据库选择下拉
      if (target && target.id === 'db-sql-database-select') {
        this.selectDatabase((target as HTMLSelectElement).value);
      }
    });

    // 密码输入框回车确认
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement)?.id === 'db-pwd-input') {
        e.preventDefault();
        this.confirmPasswordPrompt(false);
      }
    });
  }

  // ==================== Action Router ====================

  private async handleAction(action: string, el: HTMLElement): Promise<void> {
    switch (action) {
      case 'switch-tab': this.switchTab(el.getAttribute('data-tab') as DbTab); break;
      case 'detect': await this.detectDatabases(); break;
      case 'add-connection': this.showAddConnectionModal(); break;
      case 'connect': await this.connectToDatabase(el.getAttribute('data-conn-id') || ''); break;
      case 'disconnect': this.disconnectDatabase(); break;
      case 'service-start': await this.serviceControl(el.getAttribute('data-db-type') || '', 'start'); break;
      case 'service-stop': await this.serviceControl(el.getAttribute('data-db-type') || '', 'stop'); break;
      case 'service-restart': await this.serviceControl(el.getAttribute('data-db-type') || '', 'restart'); break;
      case 'execute-sql': await this.executeSql(); break;
      case 'clear-sql': this.clearSqlEditor(); break;
      case 'select-database': await this.selectDatabase(el.getAttribute('data-name') || ''); break;
      case 'select-table': await this.selectTable(el.getAttribute('data-name') || ''); break;
      case 'refresh-tables': await this.refreshTables(); break;
      case 'list-users': await this.listUsers(); break;
      case 'backup': await this.backupDatabase(); break;
      case 'delete-connection': this.deleteConnection(el.getAttribute('data-conn-id') || ''); break;
      case 'save-connection': await this.saveNewConnection(); break;
      case 'close-modal': this.hideAddConnectionModal(); break;
      case 'history-item': this.loadHistoryItem(parseInt(el.getAttribute('data-index') || '0')); break;
      case 'quick-connect': await this.quickConnect(el); break;
      case 'switch-connection': await this.switchActiveConnection(el.getAttribute('data-conn-id') || ''); break;
      case 'pwd-confirm': await this.confirmPasswordPrompt(false); break;
      case 'pwd-nopass': await this.confirmPasswordPrompt(true); break;
      case 'pwd-cancel': this.hidePasswordPrompt(); break;
      case 'show-user-privs': await this.showUserPrivileges(el.getAttribute('data-username') || ''); break;
      case 'show-processlist': await this.runOpsQuery('processlist'); break;
      case 'show-db-size': await this.runOpsQuery('db-size'); break;
      case 'show-status': await this.runOpsQuery('status'); break;
      case 'analyze-tables': await this.runOpsQuery('analyze'); break;
      case 'show-server-status': await this.runOpsQuery('server-status'); break;
      case 'browser-page-prev': await this.gotoPage(this.browserPage - 1); break;
      case 'browser-page-next': await this.gotoPage(this.browserPage + 1); break;
      case 'browser-insert': this.openRowEditor('insert'); break;
      case 'browser-edit-row': this.openRowEditor('update', parseInt(el.getAttribute('data-row-index') || '-1')); break;
      case 'browser-delete-row': await this.confirmDeleteRow(parseInt(el.getAttribute('data-row-index') || '-1')); break;
      case 'row-modal-save': await this.saveRowEditor(); break;
      case 'row-modal-cancel': this.closeRowEditor(); break;
      case 'run-security-audit': await this.runSecurityAudit(); break;
    }
  }

  // ==================== Database Detection ====================

  async detectDatabases(): Promise<void> {
    this.loading = true;
    this.updateUI();
    try {
      this.detectedDatabases = await invoke('db_detect') as DatabaseInfo[];
      window.showNotification?.(`发现 ${this.detectedDatabases.length} 个数据库实例`, 'success');

      // 对每个检测到的数据库尝试本地连接测试
      for (const db of this.detectedDatabases) {
        if (db.status !== 'running') continue;
        try {
          const testSql = db.db_type === 'redis' ? 'PING'
            : db.db_type === 'mongodb' ? 'db.runCommand({ping:1})'
            : 'SELECT 1';
          await invoke('db_execute_sql', {
            dbType: db.db_type, host: '127.0.0.1', port: db.port || 0,
            username: db.db_type === 'redis' ? '' : 'root',
            password: '', database: '', sql: testSql,
          });
          (db as any).connectable = true;
        } catch {
          (db as any).connectable = false;
        }
      }
    } catch (e) {
      console.error('数据库检测失败:', e);
      window.showNotification?.(`检测失败: ${e}`, 'error');
    }
    this.loading = false;
    this.updateUI();
  }

  // ==================== Quick Connect ====================

  /**
   * 从检测到的数据库实例一键创建连接并尝试连接。
   * Redis/MongoDB 默认可免密，其余数据库弹出密码输入框让用户选择免密或输入密码。
   */
  private async quickConnect(el: HTMLElement): Promise<void> {
    const dbType = el.getAttribute('data-db-type') || '';
    const port = parseInt(el.getAttribute('data-db-port') || '0');
    const name = el.getAttribute('data-db-name') || dbType;

    // 检查是否已有同类型同端口的连接
    const existing = this.connections.find(c =>
      c.db_type === dbType && c.host === '127.0.0.1' && c.port === port
    );
    if (existing) {
      // 已有连接配置，直接连接（连接流程内部会按需提示密码）
      if (!existing.isConnected) {
        await this.connectToDatabase(existing.id);
      } else {
        await this.switchActiveConnection(existing.id);
      }
      return;
    }

    // 根据数据库类型确定默认用户名
    const defaultUsers: Record<string, string> = {
      mysql: 'root', postgresql: 'postgres', redis: '',
      mongodb: '', dm: 'SYSDBA', kingbase: 'system',
      opengauss: 'gaussdb', tidb: 'root',
    };

    const conn: DbConnection = {
      id: `db-${Date.now()}`,
      db_type: dbType,
      host: '127.0.0.1',
      port,
      username: defaultUsers[dbType] || 'root',
      password: '',
      database: '',
      name: `${name} (本地)`,
      isConnected: false,
      connection_mode: { type: 'direct' },
    };

    this.connections.push(conn);
    this.saveConnectionsToStorage();
    this.updateUI();

    // 弹出密码输入框：用户可选择免密连接或输入密码
    this.showPasswordPrompt(conn.id);
  }

  // ==================== Password Prompt ====================

  /**
   * 弹出密码输入框，等待用户选择免密或输入密码后再连接
   */
  private showPasswordPrompt(connId: string): void {
    const conn = this.connections.find(c => c.id === connId);
    if (!conn) return;
    this.pendingConnId = connId;

    const modal = document.getElementById('db-pwd-modal');
    const title = document.getElementById('db-pwd-title');
    const input = document.getElementById('db-pwd-input') as HTMLInputElement | null;
    if (title) title.textContent = `连接 ${conn.name}`;
    if (input) {
      // 若会话中已缓存过密码则预填
      input.value = this.sessionPasswords.get(connId) || '';
    }
    if (modal) modal.style.display = 'flex';
    // 聚焦输入框
    setTimeout(() => input?.focus(), 50);
  }

  hidePasswordPrompt(): void {
    this.pendingConnId = null;
    const modal = document.getElementById('db-pwd-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * 确认密码输入。noPass=true 表示用户选择免密连接。
   */
  private async confirmPasswordPrompt(noPass: boolean): Promise<void> {
    const connId = this.pendingConnId;
    if (!connId) { this.hidePasswordPrompt(); return; }

    let password = '';
    if (!noPass) {
      const input = document.getElementById('db-pwd-input') as HTMLInputElement | null;
      password = input?.value || '';
    }
    this.hidePasswordPrompt();
    await this.connectToDatabase(connId, password);
  }

  // ==================== Connection Management ====================

  /**
   * 连接到数据库。
   * @param connId  连接 ID
   * @param passwordOverride  本次连接使用的密码（快速连接/密码提示传入）。
   *   未传入时优先使用会话缓存密码，再退回连接配置中的密码。
   */
  async connectToDatabase(connId: string, passwordOverride?: string): Promise<void> {
    const conn = this.connections.find(c => c.id === connId);
    if (!conn) return;

    // 解析本次连接使用的密码
    const password = passwordOverride !== undefined
      ? passwordOverride
      : (this.sessionPasswords.get(connId) ?? conn.password ?? '');

    try {
      // 验证连接（执行一个简单查询）
      const testSql = conn.db_type === 'redis' ? 'PING'
        : conn.db_type === 'mongodb' ? 'db.runCommand({ping:1})'
        : 'SELECT 1';

      const test = await invoke('db_execute_sql', {
        dbType: conn.db_type, host: conn.host, port: conn.port,
        username: conn.username, password,
        database: conn.database || '', sql: testSql,
        connectionMode: conn.connection_mode,
      }) as SqlResult;

      // 后端在 SQL/认证失败时返回 Ok(SqlResult{error}) 而非抛错，
      // 因此必须显式检查 error 字段，否则会把失败误判为连接成功。
      if (test?.error) {
        throw new Error(test.error);
      }

      // 连接成功：缓存本次密码到内存（供后续 SQL 执行/浏览复用）
      this.sessionPasswords.set(connId, password);
      conn.password = password;
      conn.isConnected = true;
      this.activeConnection = conn;
      this.saveConnectionsToStorage();

      // 加载数据库列表
      await this.loadDatabases();

      window.showNotification?.(`已连接 ${conn.name}`, 'success');
    } catch (e) {
      const msg = String(e);
      // 认证失败且本次未走密码提示流程时，自动弹出密码输入框
      if (passwordOverride === undefined && this.looksLikeAuthError(msg)) {
        window.showNotification?.(`${conn.name} 需要密码`, 'warning');
        this.showPasswordPrompt(connId);
      } else {
        window.showNotification?.(`连接失败: ${msg}`, 'error');
      }
    }
    this.updateUI();
  }

  /** 粗略判断错误信息是否为认证/密码问题 */
  private looksLikeAuthError(msg: string): boolean {
    const m = msg.toLowerCase();
    return m.includes('access denied')
      || m.includes('authentication')
      || m.includes('auth failed')
      || m.includes('password')
      || m.includes('permission denied')
      || m.includes('no password supplied')
      || m.includes('requirepass')
      || m.includes('noauth');
  }

  /**
   * 顶部全局切换当前活动连接。
   * 若目标连接尚未建立，则发起连接（按需提示密码）。
   */
  async switchActiveConnection(connId: string): Promise<void> {
    if (!connId) return;
    const conn = this.connections.find(c => c.id === connId);
    if (!conn) return;

    if (this.activeConnection?.id === connId && conn.isConnected) {
      return; // 已是当前连接
    }

    // 切换活动连接时重置浏览状态，避免展示上一个连接的库表数据
    this.databases = [];
    this.tables = [];
    this.currentDatabase = '';
    this.currentTable = '';
    this.tableData = null;
    this.columns = [];
    this.users = [];

    if (conn.isConnected) {
      this.activeConnection = conn;
      await this.loadDatabases();
      window.showNotification?.(`已切换到 ${conn.name}`, 'info');
      this.updateUI();
    } else {
      await this.connectToDatabase(connId);
    }
  }

  disconnectDatabase(): void {
    if (this.activeConnection) {
      // 清除该连接的会话密码缓存，下次连接需重新提供
      this.sessionPasswords.delete(this.activeConnection.id);
      this.activeConnection.password = '';
      this.activeConnection.isConnected = false;
      this.activeConnection = null;
      this.databases = [];
      this.tables = [];
      this.currentDatabase = '';
      this.currentTable = '';
      this.tableData = null;
      this.updateUI();
    }
  }

  // ==================== SQL Execution ====================

  async executeSql(): Promise<void> {
    if (!this.activeConnection) {
      window.showNotification?.('请先连接数据库', 'warning');
      return;
    }

    const editor = document.getElementById('db-sql-editor') as HTMLTextAreaElement;
    if (!editor) return;

    // 支持选中执行
    const sql = editor.selectionStart !== editor.selectionEnd
      ? editor.value.substring(editor.selectionStart, editor.selectionEnd).trim()
      : editor.value.trim();

    if (!sql) return;

    const conn = this.activeConnection;
    this.loading = true;
    this.updateResultsArea('<div class="db-loading">执行中...</div>');

    try {
      const result = await invoke('db_execute_sql', {
        dbType: conn.db_type, host: conn.host, port: conn.port,
        username: conn.username, password: conn.password,
        database: this.currentDatabase || conn.database || '', sql,
        connectionMode: conn.connection_mode,
      }) as SqlResult;

      this.lastSqlResult = result;
      this.addToHistory(sql, conn.db_type, this.currentDatabase, !result.error, result.row_count);

      // 无论成功或返回错误，都统一走 renderSqlResults（renderResultTable 内部处理 error）
      this.renderSqlResults(result);
    } catch (e) {
      this.addToHistory(sql, conn.db_type, this.currentDatabase, false);
      this.updateResultsArea(`<div class="db-result-error">执行失败: ${this.escapeHtml(String(e))}</div>`);
    }
    this.loading = false;
  }

  // ==================== Data Browser ====================

  async loadDatabases(): Promise<void> {
    if (!this.activeConnection) return;
    const conn = this.activeConnection;
    try {
      this.databases = await invoke('db_list_databases', {
        dbType: conn.db_type, host: conn.host, port: conn.port,
        username: conn.username, password: conn.password,
        connectionMode: conn.connection_mode,
      }) as string[];
      if (this.databases.length > 0 && !this.currentDatabase) {
        this.currentDatabase = this.databases[0];
      }
    } catch (e) {
      console.error('加载数据库列表失败:', e);
    }
    this.updateUI();
  }

  async selectDatabase(name: string): Promise<void> {
    this.currentDatabase = name;
    this.currentTable = '';
    this.tableData = null;
    await this.refreshTables();
  }

  async refreshTables(): Promise<void> {
    if (!this.activeConnection || !this.currentDatabase) return;
    const conn = this.activeConnection;
    try {
      this.tables = await invoke('db_list_tables', {
        dbType: conn.db_type, host: conn.host, port: conn.port,
        username: conn.username, password: conn.password,
        database: this.currentDatabase,
        connectionMode: conn.connection_mode,
      }) as TableInfo[];
    } catch (e) {
      console.error('加载表列表失败:', e);
    }
    this.updateUI();
  }

  async selectTable(name: string): Promise<void> {
    if (!this.activeConnection || !this.currentDatabase) return;
    this.currentTable = name;
    this.browserPage = 1;
    const conn = this.activeConnection;

    try {
      // 加载列信息
      this.columns = await invoke('db_list_columns', {
        dbType: conn.db_type, host: conn.host, port: conn.port,
        username: conn.username, password: conn.password,
        database: this.currentDatabase, table: name,
        connectionMode: conn.connection_mode,
      }) as ColumnInfo[];
    } catch (e) {
      console.error('加载表结构失败:', e);
    }
    await this.loadTablePage();
  }

  /**
   * 加载当前表的当前分页数据。
   * MySQL/PostgreSQL 走后端分页 db_select_rows（含总行数）；
   * 其他类型退回一次性 SELECT/find（无分页）。
   */
  async loadTablePage(): Promise<void> {
    if (!this.activeConnection || !this.currentDatabase || !this.currentTable) return;
    const conn = this.activeConnection;
    // 仅 mysql/postgresql 后端支持 db_select_rows 分页；其余类型退回一次性 SELECT
    const supportsPagination = conn.db_type === 'mysql' || conn.db_type === 'postgresql';

    try {
      if (supportsPagination) {
        const paged = await invoke('db_select_rows', {
          dbType: conn.db_type, host: conn.host, port: conn.port,
          username: conn.username, password: conn.password,
          database: this.currentDatabase, table: this.currentTable,
          page: this.browserPage, pageSize: this.browserPageSize,
          connectionMode: conn.connection_mode,
        }) as PaginatedResult;
        this.tableData = {
          columns: paged.columns, rows: paged.rows,
          row_count: paged.rows.length, execution_time_ms: 0,
        };
        this.browserTotal = paged.total_count;
      } else {
        const sql = conn.db_type === 'mongodb'
          ? `db.${this.currentTable}.find().limit(${this.browserPageSize}).toArray()`
          : `SELECT * FROM ${this.currentTable} LIMIT ${this.browserPageSize}`;
        this.tableData = await invoke('db_execute_sql', {
          dbType: conn.db_type, host: conn.host, port: conn.port,
          username: conn.username, password: conn.password,
          database: this.currentDatabase, sql,
          connectionMode: conn.connection_mode,
        }) as SqlResult;
        this.browserTotal = this.tableData?.row_count ?? 0;
      }
    } catch (e) {
      console.error('加载表数据失败:', e);
      window.showNotification?.(`加载数据失败: ${e}`, 'error');
    }
    this.updateUI();
  }

  /** 跳转到指定分页（1-based，自动夹取范围） */
  async gotoPage(page: number): Promise<void> {
    const totalPages = Math.max(1, Math.ceil(this.browserTotal / this.browserPageSize));
    const target = Math.min(Math.max(1, page), totalPages);
    if (target === this.browserPage) return;
    this.browserPage = target;
    await this.loadTablePage();
  }

  // ==================== 行级 CRUD（UI 层） ====================

  /** 仅 mysql/postgresql 后端支持行级 CRUD */
  private supportsRowCrud(): boolean {
    const t = this.activeConnection?.db_type;
    return t === 'mysql' || t === 'postgresql';
  }

  /** 打开行编辑器：insert=新增空行，update=编辑指定行 */
  openRowEditor(mode: 'insert' | 'update', rowIndex: number = -1): void {
    if (!this.supportsRowCrud()) {
      window.showNotification?.('当前数据库类型暂不支持行级编辑', 'warning');
      return;
    }
    if (this.columns.length === 0) {
      window.showNotification?.('缺少表结构信息，无法编辑', 'warning');
      return;
    }
    this.rowEditor = { mode, rowIndex };
    this.updateUI();
    const modal = document.getElementById('db-row-modal');
    if (modal) modal.style.display = 'flex';
  }

  closeRowEditor(): void {
    this.rowEditor = null;
    const modal = document.getElementById('db-row-modal');
    if (modal) modal.style.display = 'none';
  }

  /** 构造行操作的 WHERE 条件：优先主键，否则用全部原始列值 */
  private buildRowConditions(rowIndex: number): Record<string, string> {
    const conditions: Record<string, string> = {};
    const cols = this.tableData?.columns ?? [];
    const row = this.tableData?.rows?.[rowIndex] ?? [];
    const pkNames = this.columns.filter(c => c.is_primary_key).map(c => c.name);
    const useCols = pkNames.length > 0 ? pkNames : cols;
    for (const colName of useCols) {
      const idx = cols.indexOf(colName);
      if (idx < 0) continue;
      const v = row[idx];
      // NULL 值无法用 = 匹配，跳过（退回其余列已足够定位）
      if (v === null || v === undefined) continue;
      conditions[colName] = String(v);
    }
    return conditions;
  }

  /** 从行编辑模态框收集输入并提交（新增或更新） */
  async saveRowEditor(): Promise<void> {
    if (!this.rowEditor || !this.activeConnection) return;
    const { mode, rowIndex } = this.rowEditor;
    const database = this.currentDatabase;
    const table = this.currentTable;

    // 收集各列输入值；勾选 NULL 复选框则置为 null
    const data: Record<string, string | null> = {};
    for (const col of this.columns) {
      const input = document.getElementById(`db-row-field-${col.name}`) as HTMLInputElement | null;
      const nullBox = document.getElementById(`db-row-null-${col.name}`) as HTMLInputElement | null;
      if (!input) continue;
      data[col.name] = nullBox?.checked ? null : input.value;
    }

    try {
      if (mode === 'insert') {
        const res = await this.insertRow({ database, table, data });
        if (res.error) throw new Error(res.error);
        window.showNotification?.('已新增一行', 'success');
      } else {
        const conditions = this.buildRowConditions(rowIndex);
        if (Object.keys(conditions).length === 0) {
          throw new Error('无法定位该行（缺少可用于条件的列）');
        }
        const res = await this.updateRow({ database, table, updates: data, conditions });
        if (res.error) throw new Error(res.error);
        window.showNotification?.('已更新该行', 'success');
      }
      this.closeRowEditor();
      await this.loadTablePage();
    } catch (e) {
      console.error('保存行失败:', e);
      window.showNotification?.(`保存失败: ${e}`, 'error');
    }
  }

  /** 删除指定行（带确认） */
  async confirmDeleteRow(rowIndex: number): Promise<void> {
    if (!this.supportsRowCrud() || !this.activeConnection) {
      window.showNotification?.('当前数据库类型暂不支持删除', 'warning');
      return;
    }
    if (!window.confirm('确定要删除这一行吗？此操作不可撤销。')) return;
    const conditions = this.buildRowConditions(rowIndex);
    if (Object.keys(conditions).length === 0) {
      window.showNotification?.('无法定位该行（缺少可用于条件的列）', 'error');
      return;
    }
    try {
      const res = await this.deleteRow({ database: this.currentDatabase, table: this.currentTable, conditions });
      if (res.error) throw new Error(res.error);
      window.showNotification?.('已删除该行', 'success');
      await this.loadTablePage();
    } catch (e) {
      console.error('删除行失败:', e);
      window.showNotification?.(`删除失败: ${e}`, 'error');
    }
  }

  // ==================== 安全审计（UI 层） ====================

  async runSecurityAudit(): Promise<void> {
    if (!this.activeConnection) {
      window.showNotification?.('请先连接数据库', 'warning');
      return;
    }
    this.auditRunning = true;
    this.updateUI();
    try {
      this.securityResults = await this.securityAudit();
      window.showNotification?.(`安全审计完成，共 ${this.securityResults.length} 项检查`, 'success');
    } catch (e) {
      console.error('安全审计失败:', e);
      window.showNotification?.(`安全审计失败: ${e}`, 'error');
    }
    this.auditRunning = false;
    this.updateUI();
  }

  // ==================== User Management ====================

  async listUsers(): Promise<void> {
    if (!this.activeConnection) return;
    const conn = this.activeConnection;
    try {
      this.users = await invoke('db_list_users', {
        dbType: conn.db_type, host: conn.host, port: conn.port,
        username: conn.username, password: conn.password,
        connectionMode: conn.connection_mode,
      }) as DbUser[];
    } catch (e) {
      console.error('加载用户列表失败:', e);
      window.showNotification?.(`加载用户失败: ${e}`, 'error');
    }
    this.updateUI();
  }

  // ==================== Operations ====================

  async serviceControl(dbType: string, action: string): Promise<void> {
    try {
      const result = await invoke('db_service_control', { dbType, action }) as string;
      window.showNotification?.(`${dbType} ${action}: ${result}`, 'success');
      // 刷新检测
      setTimeout(() => this.detectDatabases(), 1000);
    } catch (e) {
      window.showNotification?.(`操作失败: ${e}`, 'error');
    }
  }

  async backupDatabase(): Promise<void> {
    if (!this.activeConnection || !this.currentDatabase) {
      window.showNotification?.('请先选择数据库', 'warning');
      return;
    }
    const conn = this.activeConnection;
    try {
      window.showNotification?.(`正在备份 ${this.currentDatabase}...`, 'info');
      const result = await invoke('db_backup', {
        dbType: conn.db_type, host: conn.host, port: conn.port,
        username: conn.username, password: conn.password,
        database: this.currentDatabase,
        connectionMode: conn.connection_mode,
      }) as string;
      window.showNotification?.(`备份完成: ${result}`, 'success');
    } catch (e) {
      window.showNotification?.(`备份失败: ${e}`, 'error');
    }
  }

  // ==================== Ops Diagnostics ====================

  /**
   * 运行运维诊断查询：切换到 SQL 控制台，填入对应 SQL 并执行。
   * 按数据库类型选择合适的语句。
   */
  private async runOpsQuery(kind: string): Promise<void> {
    if (!this.activeConnection) {
      window.showNotification?.('请先连接数据库', 'warning');
      return;
    }
    const dbType = this.activeConnection.db_type;
    if (kind === 'analyze' && !this.currentTable) {
      window.showNotification?.('请先在数据浏览中选择一个表', 'warning');
      return;
    }
    const sql = this.buildOpsSql(kind, dbType);
    if (!sql) {
      window.showNotification?.(`${dbType} 暂不支持该运维操作`, 'warning');
      return;
    }
    // 切到 SQL 控制台并填入语句
    this.switchTab('sql');
    const editor = document.getElementById('db-sql-editor') as HTMLTextAreaElement | null;
    if (editor) {
      editor.value = sql;
      editor.setSelectionRange(sql.length, sql.length);
    }
    await this.executeSql();
  }

  private buildOpsSql(kind: string, dbType: string): string {
    const isPg = dbType === 'postgresql' || dbType === 'opengauss' || dbType === 'kingbase' || dbType === 'gaussdb';
    const isMysql = dbType === 'mysql' || dbType === 'tidb';
    switch (kind) {
      case 'processlist':
        if (isMysql) return 'SHOW FULL PROCESSLIST';
        if (isPg) return 'SELECT pid, usename, state, query FROM pg_stat_activity';
        return '';
      case 'db-size':
        if (isMysql) return "SELECT table_schema AS db, ROUND(SUM(data_length + index_length)/1024/1024, 2) AS size_mb FROM information_schema.tables GROUP BY table_schema ORDER BY size_mb DESC";
        if (isPg) return "SELECT datname AS db, pg_size_pretty(pg_database_size(datname)) AS size FROM pg_database ORDER BY pg_database_size(datname) DESC";
        return '';
      case 'status':
        if (isMysql) return "SHOW STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Connections','Aborted_connects','Uptime')";
        if (isPg) return "SELECT count(*) AS connections, count(*) FILTER (WHERE state = 'active') AS active FROM pg_stat_activity";
        return '';
      case 'analyze': {
        const table = this.currentTable;
        if (!table) return '';
        if (isMysql) return `ANALYZE TABLE ${table}`;
        if (isPg) return `ANALYZE ${table}`;
        return '';
      }
      case 'server-status':
        if (isMysql) return 'SHOW VARIABLES';
        if (isPg) return 'SHOW ALL';
        return '';
      default:
        return '';
    }
  }

  /**
   * 显示用户权限详情：MySQL 用 SHOW GRANTS，PostgreSQL 查系统表。
   */
  private async showUserPrivileges(username: string): Promise<void> {
    if (!username || !this.activeConnection) return;
    const dbType = this.activeConnection.db_type;
    const isMysql = dbType === 'mysql' || dbType === 'tidb';
    const isPg = dbType === 'postgresql' || dbType === 'opengauss' || dbType === 'kingbase' || dbType === 'gaussdb';
    let sql = '';
    if (isMysql) sql = `SHOW GRANTS FOR '${username}'`;
    else if (isPg) sql = `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname = '${username}'`;
    if (!sql) {
      window.showNotification?.(`${dbType} 暂不支持查看用户权限详情`, 'warning');
      return;
    }
    this.switchTab('sql');
    const editor = document.getElementById('db-sql-editor') as HTMLTextAreaElement | null;
    if (editor) {
      editor.value = sql;
      editor.setSelectionRange(sql.length, sql.length);
    }
    await this.executeSql();
  }

  // ==================== Description & CRUD & Security Audit (New) ====================

  async describeTable(database: string, table: string): Promise<ColumnInfo[]> {
    if (!this.activeConnection) throw new Error('请先连接数据库');
    const conn = this.activeConnection;
    return await invoke('db_describe_table', {
      dbType: conn.db_type, host: conn.host, port: conn.port,
      username: conn.username, password: conn.password,
      database, table,
      connectionMode: conn.connection_mode,
    }) as ColumnInfo[];
  }

  async selectRows(database: string, table: string, page: number, pageSize: number): Promise<PaginatedResult> {
    if (!this.activeConnection) throw new Error('请先连接数据库');
    const conn = this.activeConnection;
    return await invoke('db_select_rows', {
      dbType: conn.db_type, host: conn.host, port: conn.port,
      username: conn.username, password: conn.password,
      database, table, page, pageSize,
      connectionMode: conn.connection_mode,
    }) as PaginatedResult;
  }

  async updateRow(params: UpdateRowParams): Promise<SqlResult> {
    if (!this.activeConnection) throw new Error('请先连接数据库');
    const conn = this.activeConnection;
    return await invoke('db_update_row', {
      dbType: conn.db_type, host: conn.host, port: conn.port,
      username: conn.username, password: conn.password,
      params,
      connectionMode: conn.connection_mode,
    }) as SqlResult;
  }

  async deleteRow(params: DeleteRowParams): Promise<SqlResult> {
    if (!this.activeConnection) throw new Error('请先连接数据库');
    const conn = this.activeConnection;
    return await invoke('db_delete_row', {
      dbType: conn.db_type, host: conn.host, port: conn.port,
      username: conn.username, password: conn.password,
      params,
      connectionMode: conn.connection_mode,
    }) as SqlResult;
  }

  async insertRow(params: InsertRowParams): Promise<SqlResult> {
    if (!this.activeConnection) throw new Error('请先连接数据库');
    const conn = this.activeConnection;
    return await invoke('db_insert_row', {
      dbType: conn.db_type, host: conn.host, port: conn.port,
      username: conn.username, password: conn.password,
      params,
      connectionMode: conn.connection_mode,
    }) as SqlResult;
  }

  async securityAudit(): Promise<SecurityCheckResult[]> {
    if (!this.activeConnection) throw new Error('请先连接数据库');
    const conn = this.activeConnection;
    return await invoke('db_security_audit', {
      dbType: conn.db_type, host: conn.host, port: conn.port,
      username: conn.username, password: conn.password,
      connectionMode: conn.connection_mode,
    }) as SecurityCheckResult[];
  }

  // ==================== Tab Management ====================

  switchTab(tab: DbTab): void {
    this.currentTab = tab;
    // Update tab buttons
    document.querySelectorAll('.db-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    // Show/hide panels
    document.querySelectorAll('.db-tab-panel').forEach(panel => {
      (panel as HTMLElement).style.display = panel.id === `db-tab-${tab}` ? '' : 'none';
    });

    // 渲染当前 tab 内容（render() 生成的面板初始为空）
    this.updateUI();

    // 延迟加载数据（加载完成后 loadDatabases/listUsers 内部会再次 updateUI）
    if (tab === 'users' && this.users.length === 0 && this.activeConnection) {
      this.listUsers();
    }
    if (tab === 'browser' && this.databases.length === 0 && this.activeConnection) {
      this.loadDatabases();
    }
  }

  // ==================== Connection Storage ====================

  private loadConnectionsFromStorage(): void {
    try {
      const data = localStorage.getItem('lovelyres-db-connections');
      if (data) {
        const parsed = JSON.parse(data);
        // 连接状态不跨会话持久化，启动时全部重置为未连接
        this.connections = parsed.map((c: DbConnection) => ({ ...c, isConnected: false }));
      }
    } catch { /* ignore */ }
  }

  private saveConnectionsToStorage(): void {
    try {
      // 不存储密码到 localStorage
      const safe = this.connections.map(c => ({ ...c, password: '' }));
      localStorage.setItem('lovelyres-db-connections', JSON.stringify(safe));
    } catch { /* ignore */ }
  }

  // ==================== SQL History ====================

  private loadSqlHistory(): void {
    try {
      const data = localStorage.getItem('lovelyres-sql-history');
      if (data) this.sqlHistory = JSON.parse(data);
    } catch { /* ignore */ }
  }

  private addToHistory(sql: string, dbType: string, database: string, success: boolean, rowCount?: number): void {
    this.sqlHistory.unshift({
      sql, db_type: dbType, database, timestamp: Date.now(), success, row_count: rowCount,
    });
    if (this.sqlHistory.length > 50) this.sqlHistory.length = 50;
    try {
      localStorage.setItem('lovelyres-sql-history', JSON.stringify(this.sqlHistory));
    } catch { /* ignore */ }
  }

  private loadHistoryItem(index: number): void {
    const entry = this.sqlHistory[index];
    if (!entry) return;
    const editor = document.getElementById('db-sql-editor') as HTMLTextAreaElement;
    if (editor) editor.value = entry.sql;
  }

  // ==================== Modal ====================

  showAddConnectionModal(): void {
    const modal = document.getElementById('db-add-modal');
    if (modal) modal.style.display = 'flex';
  }

  hideAddConnectionModal(): void {
    const modal = document.getElementById('db-add-modal');
    if (modal) modal.style.display = 'none';
  }

  async saveNewConnection(): Promise<void> {
    const name = (document.getElementById('db-add-name') as HTMLInputElement)?.value?.trim();
    const dbType = (document.getElementById('db-add-type') as HTMLSelectElement)?.value;
    const host = (document.getElementById('db-add-host') as HTMLInputElement)?.value?.trim() || '127.0.0.1';
    const port = parseInt((document.getElementById('db-add-port') as HTMLInputElement)?.value) || 3306;
    const username = (document.getElementById('db-add-username') as HTMLInputElement)?.value?.trim() || 'root';
    const password = (document.getElementById('db-add-password') as HTMLInputElement)?.value || '';
    const database = (document.getElementById('db-add-database') as HTMLInputElement)?.value?.trim() || '';

    const mode = (document.getElementById('db-add-mode') as HTMLSelectElement)?.value || 'direct';
    const container = (document.getElementById('db-add-container') as HTMLInputElement)?.value?.trim() || '';

    const connection_mode: ConnectionMode = mode === 'docker' ? {
      type: 'docker',
      container_id: container,
      container_name: container
    } : {
      type: 'direct'
    };

    if (!name) {
      window.showNotification?.('请输入连接名称', 'warning');
      return;
    }

    const conn: DbConnection = {
      id: `db-${Date.now()}`, db_type: dbType, host, port,
      username, password, database, name, isConnected: false,
      connection_mode
    };

    this.connections.push(conn);
    this.saveConnectionsToStorage();
    this.hideAddConnectionModal();
    this.updateUI();
    window.showNotification?.(`已添加连接: ${name}`, 'success');
  }

  deleteConnection(connId: string): void {
    this.connections = this.connections.filter(c => c.id !== connId);
    if (this.activeConnection?.id === connId) {
      this.disconnectDatabase();
    }
    this.saveConnectionsToStorage();
    this.updateUI();
  }

  // ==================== UI Helpers ====================

  private updateUI(): void {
    // 由 renderer 负责（通过 getters 获取状态）
    const renderer = (window as any).app?.modernUIRenderer?.databaseRenderer;
    const content = document.getElementById(`db-tab-${this.currentTab}`);
    if (content && renderer?.renderTabContent) {
      // 重新渲染会重建 SQL 编辑器，先保存用户已输入的 SQL 及光标，渲染后恢复
      const prevEditor = document.getElementById('db-sql-editor') as HTMLTextAreaElement | null;
      const savedSql = prevEditor?.value;
      const selStart = prevEditor?.selectionStart;
      const selEnd = prevEditor?.selectionEnd;

      content.innerHTML = renderer.renderTabContent(this.currentTab, this);

      if (savedSql !== undefined) {
        const newEditor = document.getElementById('db-sql-editor') as HTMLTextAreaElement | null;
        if (newEditor) {
          newEditor.value = savedSql;
          if (selStart != null && selEnd != null) {
            newEditor.setSelectionRange(selStart, selEnd);
          }
        }
      }
    }
    // 刷新顶部全局连接切换器
    const switcher = document.getElementById('db-switcher-slot');
    if (switcher && renderer?.renderConnectionSwitcher) {
      switcher.innerHTML = renderer.renderConnectionSwitcher(this);
    }
  }

  private updateResultsArea(html: string): void {
    const area = document.getElementById('db-results-area');
    if (area) area.innerHTML = html;
  }

  private renderSqlResults(result: SqlResult): void {
    // 复用渲染器的 renderResultTable，确保执行后的结果与后续 updateUI 重渲染一致
    const renderer = (window as any).app?.modernUIRenderer?.databaseRenderer;
    if (renderer?.renderResultTable) {
      this.updateResultsArea(renderer.renderResultTable(result));
      return;
    }
    // 回退实现（渲染器不可用时）
    if (!result.columns.length) {
      this.updateResultsArea(`<div class="db-result-info">执行成功，影响 ${result.affected_rows || 0} 行 (${result.execution_time_ms}ms)</div>`);
      return;
    }
    const html = `
      <div class="db-result-meta">${result.row_count} 行 · ${result.execution_time_ms}ms</div>
      <div class="db-table-wrap">
        <table class="db-table">
          <thead><tr>${result.columns.map(c => `<th>${this.escapeHtml(c)}</th>`).join('')}</tr></thead>
          <tbody>${result.rows.map(row =>
            `<tr>${row.map(cell => cell === null ? '<span class="db-null">NULL</span>' : `<td>${this.escapeHtml(String(cell))}</td>`).join('')}</tr>`
          ).join('')}</tbody>
        </table>
      </div>
    `;
    this.updateResultsArea(html);
  }

  private clearSqlEditor(): void {
    const editor = document.getElementById('db-sql-editor') as HTMLTextAreaElement;
    if (editor) editor.value = '';
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ==================== Getters (for renderer) ====================

  getDetectedDatabases(): DatabaseInfo[] { return this.detectedDatabases; }
  getConnections(): DbConnection[] { return this.connections; }
  getActiveConnection(): DbConnection | null { return this.activeConnection; }
  getCurrentTab(): DbTab { return this.currentTab; }
  getSqlHistory(): SqlHistoryEntry[] { return this.sqlHistory; }
  getLastSqlResult(): SqlResult | null { return this.lastSqlResult; }
  getDatabases(): string[] { return this.databases; }
  getCurrentDatabase(): string { return this.currentDatabase; }
  getTables(): TableInfo[] { return this.tables; }
  getCurrentTable(): string { return this.currentTable; }
  getTableData(): SqlResult | null { return this.tableData; }
  getColumns(): ColumnInfo[] { return this.columns; }
  getUsers(): DbUser[] { return this.users; }
  getBrowserPage(): number { return this.browserPage; }
  getBrowserPageSize(): number { return this.browserPageSize; }
  getBrowserTotal(): number { return this.browserTotal; }
  getRowEditor(): { mode: 'insert' | 'update'; rowIndex: number } | null { return this.rowEditor; }
  getSecurityResults(): SecurityCheckResult[] { return this.securityResults; }
  isAuditRunning(): boolean { return this.auditRunning; }
  isLoading(): boolean { return this.loading; }
}

export const databaseManager = new DatabaseManager();
