/**
 * 数据库管理界面渲染器
 * Header + 5 Tabs 布局，匹配 Docker 页面风格
 */

import { Data, Refresh, Plus, Play, Delete, Search, Export, Config, User as UserIcon, Shield, Edit } from '@icon-park/svg';
import type { DatabaseManager, DbTab, ColumnInfo, DbUser, SqlResult, SecurityCheckResult } from './databaseManager';

// ==================== Helper Functions ====================

function icon(fn: Function, size = '16', theme = 'outline'): string {
  return fn({ theme, size, fill: 'currentColor' });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==================== Renderer ====================

export class DatabaseRenderer {

  /**
   * 渲染完整页面
   */
  render(): string {
    return `
      <div class="db-page">
        ${this.renderHeader()}
        ${this.renderTabs()}
        <div class="db-content">
          <div class="db-tab-panel" id="db-tab-connections"></div>
          <div class="db-tab-panel" id="db-tab-sql" style="display:none"></div>
          <div class="db-tab-panel" id="db-tab-browser" style="display:none"></div>
          <div class="db-tab-panel" id="db-tab-users" style="display:none"></div>
          <div class="db-tab-panel" id="db-tab-ops" style="display:none"></div>
        </div>
        ${this.renderAddModal()}
        ${this.renderPasswordModal()}
      </div>
    `;
  }

  /**
   * 公共 API：由 databaseManager 调用，按 tab 重新渲染内容
   */
  renderTabContent(tab: DbTab, mgr: DatabaseManager): string {
    switch (tab) {
      case 'connections': return this.renderConnectionsTab(mgr);
      case 'sql':         return this.renderSqlTab(mgr);
      case 'browser':     return this.renderBrowserTab(mgr);
      case 'users':       return this.renderUsersTab(mgr);
      case 'ops':         return this.renderOpsTab(mgr);
      default:            return '';
    }
  }

  // ==================== Header ====================

  private renderHeader(): string {
    return `
      <div class="db-header">
        <div class="db-header-left">
          <div class="db-header-icon">${icon(Data, '22', 'filled')}</div>
          <div>
            <h2 class="db-header-title">数据库管理</h2>
            <div class="db-header-subtitle">SQL 控制台 · 数据浏览 · 用户权限 · 运维工具</div>
          </div>
        </div>
        <div class="db-header-right">
          <div id="db-switcher-slot" class="db-switcher-slot"></div>
          <button class="modern-btn secondary" data-db-action="detect">${icon(Search)} 检测数据库</button>
          <button class="modern-btn primary" data-db-action="add-connection">${icon(Plus)} 新增连接</button>
        </div>
      </div>
    `;
  }

  /**
   * 顶部全局连接切换器：下拉选择任一已保存连接即可一键切换/连接
   */
  renderConnectionSwitcher(mgr: DatabaseManager): string {
    const connections = mgr.getConnections();
    const active = mgr.getActiveConnection();
    if (connections.length === 0) return '';

    const options = connections.map(c => {
      const label = `${c.isConnected ? '● ' : '○ '}${c.name} (${c.host}:${c.port})`;
      const selected = active?.id === c.id ? ' selected' : '';
      return `<option value="${escapeHtml(c.id)}"${selected}>${escapeHtml(label)}</option>`;
    }).join('');

    const disconnectBtn = active
      ? `<button class="modern-btn secondary sm" data-db-action="disconnect" title="断开当前连接">${icon(Delete, '14')}</button>`
      : '';

    return `
      <span class="db-switcher-label">当前连接</span>
      <select class="db-select db-switcher-select" id="db-active-switcher" title="切换数据库连接">
        ${active ? '' : '<option value="" selected>-- 未连接 --</option>'}
        ${options}
      </select>
      ${disconnectBtn}
    `;
  }

  // ==================== Tabs ====================

  private renderTabs(): string {
    const tabs: { key: DbTab; label: string; iconFn: Function }[] = [
      { key: 'connections', label: '连接管理', iconFn: Data },
      { key: 'sql',         label: 'SQL 控制台', iconFn: Play },
      { key: 'browser',     label: '数据浏览', iconFn: Search },
      { key: 'users',       label: '用户权限', iconFn: UserIcon },
      { key: 'ops',         label: '运维工具', iconFn: Config },
    ];
    return `
      <div class="db-tabs" id="db-tabs-area">
        ${tabs.map((t, i) => `
          <button class="db-tab-btn${i === 0 ? ' active' : ''}" data-db-action="switch-tab" data-tab="${t.key}">
            ${icon(t.iconFn, '15')} ${t.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  // ==================== Tab 1: Connections ====================

  private renderConnectionsTab(mgr: DatabaseManager): string {
    const detected = mgr.getDetectedDatabases();
    const connections = mgr.getConnections();

    let html = '';

    // Section 1: Detected databases
    html += `
      <div class="db-section">
        <div class="db-section-title">${icon(Search, '15')} 已检测到的数据库实例</div>
    `;
    if (detected.length === 0) {
      html += `<div class="db-empty">尚未检测到数据库实例，点击「检测数据库」自动发现</div>`;
    } else {
      html += `<div class="db-detected-grid">`;
      for (const db of detected) {
        const running = db.status === 'running';
        html += `
          <div class="db-detected-card">
            <div class="db-detected-top">
              <span class="db-type-badge">${escapeHtml(db.db_type)}</span>
              <span class="db-status-badge ${running ? 'db-status-running' : 'db-status-stopped'}">${running ? '运行中' : '已停止'}</span>
            </div>
            <div class="db-detected-name">${escapeHtml(db.name)}</div>
            <div class="db-detected-info">版本: ${escapeHtml(db.version)} · 端口: ${db.port}</div>
            <div class="db-detected-info">数据目录: ${escapeHtml(db.data_dir)}</div>
            <div class="db-detected-actions">
              ${running
                ? `<button class="modern-btn primary sm" data-db-action="quick-connect" data-db-type="${escapeHtml(db.db_type)}" data-db-port="${db.port}" data-db-name="${escapeHtml(db.name)}">快速连接</button>
                   <button class="modern-btn secondary sm" data-db-action="service-stop" data-db-type="${escapeHtml(db.db_type)}">停止</button>
                   <button class="modern-btn secondary sm" data-db-action="service-restart" data-db-type="${escapeHtml(db.db_type)}">重启</button>`
                : `<button class="modern-btn primary sm" data-db-action="service-start" data-db-type="${escapeHtml(db.db_type)}">启动</button>`
              }
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }
    html += `</div>`;

    // Section 2: Saved connections
    html += `
      <div class="db-section">
        <div class="db-section-title">${icon(Data, '15')} 已保存的连接</div>
    `;
    if (connections.length === 0) {
      html += `<div class="db-empty">暂无保存的连接，点击「新增连接」添加</div>`;
    } else {
      html += `<div class="db-conn-grid">`;
      for (const conn of connections) {
        html += `
          <div class="db-conn-card">
            <div class="db-conn-status ${conn.isConnected ? 'connected' : ''}"></div>
            <div class="db-conn-type">${escapeHtml(conn.db_type)}</div>
            <div class="db-conn-name">${escapeHtml(conn.name)}</div>
            <div class="db-conn-host">${escapeHtml(conn.host)}:${conn.port}</div>
            <div class="db-conn-actions">
              ${conn.isConnected
                ? `<button class="modern-btn secondary sm" data-db-action="disconnect" data-conn-id="${escapeHtml(conn.id)}">断开</button>`
                : `<button class="modern-btn primary sm" data-db-action="connect" data-conn-id="${escapeHtml(conn.id)}">连接</button>`
              }
              <button class="modern-btn secondary sm" data-db-action="delete-connection" data-conn-id="${escapeHtml(conn.id)}">${icon(Delete, '14')}</button>
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }
    html += `</div>`;

    return html;
  }

  // ==================== Tab 2: SQL Console ====================

  private renderSqlTab(mgr: DatabaseManager): string {
    const activeConn = mgr.getActiveConnection();
    const databases = mgr.getDatabases();
    const currentDb = mgr.getCurrentDatabase();
    const history = mgr.getSqlHistory();
    const lastResult = mgr.getLastSqlResult();

    const connBadge = activeConn
      ? `<span class="db-conn-badge connected">${escapeHtml(activeConn.name)} (${escapeHtml(activeConn.db_type)})</span>`
      : `<span class="db-conn-badge">未连接</span>`;

    const dbOptions = databases.map(db =>
      `<option value="${escapeHtml(db)}"${db === currentDb ? ' selected' : ''}>${escapeHtml(db)}</option>`
    ).join('');

    const historyHtml = history.map((h, i) => `
      <div class="db-history-item${h.success ? '' : ' error'}" data-db-action="history-item" data-index="${i}" title="${escapeHtml(h.sql)}">
        <span class="db-history-sql">${escapeHtml(h.sql.substring(0, 60))}${h.sql.length > 60 ? '...' : ''}</span>
        <span class="db-history-meta">${h.row_count != null ? h.row_count + ' rows' : ''}</span>
      </div>
    `).join('');

    return `
      <div class="db-sql-area">
        <div class="db-sql-toolbar">
          <select class="db-select" id="db-sql-database-select">
            <option value="">-- 选择数据库 --</option>
            ${dbOptions}
          </select>
          <button class="modern-btn primary sm" data-db-action="execute-sql">${icon(Play, '14')} 执行 (Ctrl+Enter)</button>
          <button class="modern-btn secondary sm" data-db-action="clear-sql">清空</button>
          <span style="flex:1"></span>
          ${connBadge}
        </div>
        <textarea id="db-sql-editor" class="db-sql-editor" placeholder="输入 SQL 语句..." spellcheck="false"></textarea>
        <div id="db-results-area" class="db-sql-results">
          ${lastResult ? this.renderResultTable(lastResult) : '<div class="db-empty">执行 SQL 后结果将显示在这里</div>'}
        </div>
        <div class="db-history-panel">
          <div class="db-history-header">执行历史</div>
          ${historyHtml || '<div class="db-empty" style="padding:12px">暂无历史</div>'}
        </div>
      </div>
    `;
  }

  // ==================== Tab 3: Data Browser ====================

  private renderBrowserTab(mgr: DatabaseManager): string {
    const databases = mgr.getDatabases();
    const currentDb = mgr.getCurrentDatabase();
    const tables = mgr.getTables();
    const currentTable = mgr.getCurrentTable();
    const tableData = mgr.getTableData();
    const columns = mgr.getColumns();

    const dbItems = databases.map(db => `
      <div class="db-tree-item${db === currentDb ? ' active' : ''}" data-db-action="select-database" data-name="${escapeHtml(db)}">${escapeHtml(db)}</div>
    `).join('');

    const tableItems = tables.map(t => `
      <div class="db-tree-item${t.name === currentTable ? ' active' : ''}" data-db-action="select-table" data-name="${escapeHtml(t.name)}">
        ${escapeHtml(t.name)}
        <span style="color:var(--text-tertiary);margin-left:auto;font-size:11px">${t.row_count != null ? t.row_count : ''}</span>
      </div>
    `).join('');

    let dataPanel = '<div class="db-empty">选择左侧的表查看数据</div>';
    if (currentTable && tableData) {
      const dbType = mgr.getActiveConnection()?.db_type;
      const crud = dbType === 'mysql' || dbType === 'postgresql';
      dataPanel = `
        <div class="db-data-header">
          <span class="db-data-title">${escapeHtml(currentTable)}</span>
          <div style="display:flex;gap:6px;align-items:center">
            ${crud ? `<button class="modern-btn primary sm" data-db-action="browser-insert">${icon(Plus, '14')} 新增行</button>` : ''}
            <button class="modern-btn secondary sm" data-db-action="refresh-tables">${icon(Refresh, '14')} 刷新</button>
          </div>
        </div>
        ${crud ? this.renderBrowserData(mgr, tableData) : this.renderResultTable(tableData)}
        ${crud ? this.renderPagination(mgr) : ''}
        ${columns.length > 0 ? this.renderColumnInfo(columns) : ''}
      `;
    }

    return `
      <div class="db-browser">
        <div class="db-tree-panel">
          <div class="db-tree-group">数据库</div>
          ${dbItems || '<div class="db-empty" style="padding:8px;font-size:12px">请先连接数据库</div>'}
          <div class="db-tree-group">表 (${tables.length})</div>
          ${tableItems || '<div class="db-empty" style="padding:8px;font-size:12px">无表</div>'}
        </div>
        <div class="db-data-panel">
          ${dataPanel}
        </div>
      </div>
      ${this.renderRowModal(mgr)}
    `;
  }

  /** 带每行编辑/删除操作按钮的数据表（仅 mysql/postgresql） */
  private renderBrowserData(_mgr: DatabaseManager, result: SqlResult): string {
    if (result.error) {
      return `<div class="db-result-error">${escapeHtml(result.error)}</div>`;
    }
    if (!result.columns || result.columns.length === 0) {
      return '<div class="db-empty">该表暂无数据</div>';
    }
    const headerCells = result.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
    const bodyRows = result.rows.map((row, i) => {
      const cells = row.map(cell => `<td>${cell === null ? '<span class="db-null">NULL</span>' : escapeHtml(String(cell))}</td>`).join('');
      return `
        <tr>
          ${cells}
          <td class="db-row-actions">
            <button class="db-row-btn" title="编辑" data-db-action="browser-edit-row" data-row-index="${i}">${icon(Edit, '13')}</button>
            <button class="db-row-btn danger" title="删除" data-db-action="browser-delete-row" data-row-index="${i}">${icon(Delete, '13')}</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="db-result-meta">${result.row_count} 行 · ${result.execution_time_ms}ms</div>
      <div class="db-table-wrap">
        <table class="db-table">
          <thead><tr>${headerCells}<th style="width:80px">操作</th></tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;
  }

  /** 分页控制条 */
  private renderPagination(mgr: DatabaseManager): string {
    const page = mgr.getBrowserPage();
    const pageSize = mgr.getBrowserPageSize();
    const total = mgr.getBrowserTotal();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    return `
      <div class="db-pagination">
        <span class="db-pagination-info">共 ${total} 行 · 第 ${from}-${to} 行</span>
        <div class="db-pagination-ctrl">
          <button class="modern-btn secondary sm" data-db-action="browser-page-prev" ${page <= 1 ? 'disabled' : ''}>上一页</button>
          <span class="db-pagination-page">${page} / ${totalPages}</span>
          <button class="modern-btn secondary sm" data-db-action="browser-page-next" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
        </div>
      </div>
    `;
  }

  /** 行编辑/新增模态框（字段随当前表列动态生成） */
  private renderRowModal(mgr: DatabaseManager): string {
    const editor = mgr.getRowEditor();
    if (!editor) return '';
    const columns = mgr.getColumns();
    const isUpdate = editor.mode === 'update';
    const tableData = mgr.getTableData();
    const row = isUpdate ? (tableData?.rows?.[editor.rowIndex] ?? []) : [];
    const dataCols = tableData?.columns ?? [];

    const fields = columns.map(c => {
      let value = '';
      let isNull = false;
      if (isUpdate) {
        const idx = dataCols.indexOf(c.name);
        const cell = idx >= 0 ? row[idx] : null;
        if (cell === null || cell === undefined) { isNull = true; }
        else { value = String(cell); }
      }
      return `
        <div class="db-form-group">
          <label class="db-form-label">
            ${c.is_primary_key ? '<span class="db-pk">PK</span> ' : ''}${escapeHtml(c.name)}
            <span style="color:var(--text-tertiary);font-weight:400">${escapeHtml(c.data_type)}</span>
          </label>
          <input type="text" class="db-form-input" id="db-row-field-${escapeHtml(c.name)}" value="${escapeHtml(value)}" ${isNull ? 'disabled' : ''} />
          ${c.is_nullable ? `<label class="db-row-null-toggle"><input type="checkbox" id="db-row-null-${escapeHtml(c.name)}" ${isNull ? 'checked' : ''} onchange="this.closest('.db-form-group').querySelector('.db-form-input').disabled=this.checked" /> NULL</label>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="db-modal-overlay" id="db-row-modal" style="display:flex">
        <div class="db-modal">
          <div class="db-modal-header">
            <span class="db-modal-title">${icon(isUpdate ? Edit : Plus, '16')} ${isUpdate ? '编辑行' : '新增行'}</span>
            <button class="db-modal-close" data-db-action="row-modal-cancel">&times;</button>
          </div>
          <div class="db-modal-body">
            ${fields || '<div class="db-empty">缺少列信息</div>'}
          </div>
          <div class="db-modal-footer">
            <button class="modern-btn secondary" data-db-action="row-modal-cancel">取消</button>
            <button class="modern-btn primary" data-db-action="row-modal-save">保存</button>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== Tab 4: Users ====================

  private renderUsersTab(mgr: DatabaseManager): string {
    const users = mgr.getUsers();
    return `
      <div style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-size:14px;font-weight:600">${icon(UserIcon, '15')} 用户列表</span>
          <button class="modern-btn secondary sm" data-db-action="list-users">${icon(Refresh, '14')} 刷新</button>
        </div>
        ${users.length > 0 ? this.renderUsersTable(users) : '<div class="db-empty">点击刷新加载用户列表</div>'}
      </div>
    `;
  }

  private renderUsersTable(users: DbUser[]): string {
    let rows = '';
    for (const u of users) {
      const privs = u.privileges.length > 3
        ? u.privileges.slice(0, 3).map(escapeHtml).join(', ') + ` +${u.privileges.length - 3}`
        : u.privileges.map(escapeHtml).join(', ');
      rows += `
        <tr>
          <td>${icon(UserIcon, '13')} ${escapeHtml(u.username)}</td>
          <td>${escapeHtml(u.host)}</td>
          <td><span class="db-priv-badge">${privs || '-'}</span></td>
          <td>
            <button class="modern-btn secondary sm" data-db-action="show-user-privs" data-username="${escapeHtml(u.username)}">${icon(Shield, '13')} 详情</button>
          </td>
        </tr>
      `;
    }
    return `
      <table class="db-table">
        <thead>
          <tr><th>用户名</th><th>Host</th><th>权限</th><th>操作</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ==================== Tab 5: Operations ====================

  private renderOpsTab(mgr: DatabaseManager): string {
    const cards = [
      {
        title: '一键备份',
        desc: '将当前数据库导出为 SQL 文件，支持 mysqldump / pg_dump',
        action: 'backup',
        btnLabel: `${icon(Export, '14')} 执行备份`,
        btnClass: 'primary',
      },
      {
        title: '慢查询分析',
        desc: '查看当前正在执行的查询，发现慢查询和锁等待',
        action: 'show-processlist',
        btnLabel: `${icon(Search, '14')} SHOW PROCESSLIST`,
        btnClass: 'secondary',
      },
      {
        title: '数据库大小',
        desc: '统计各数据库和表的磁盘占用',
        action: 'show-db-size',
        btnLabel: `${icon(Data, '14')} 查看统计`,
        btnClass: 'secondary',
      },
      {
        title: '连接池状态',
        desc: '查看活跃连接数、线程数等',
        action: 'show-status',
        btnLabel: `${icon(Refresh, '14')} 查看状态`,
        btnClass: 'secondary',
      },
      {
        title: '索引优化',
        desc: '分析表索引使用情况，执行 ANALYZE TABLE',
        action: 'analyze-tables',
        btnLabel: `${icon(Config, '14')} ANALYZE TABLE`,
        btnClass: 'secondary',
      },
      {
        title: '服务器状态',
        desc: '查看数据库运行时间、版本、全局变量等',
        action: 'show-server-status',
        btnLabel: `${icon(Shield, '14')} 查看状态`,
        btnClass: 'secondary',
      },
    ];

    return `
      <div class="db-ops-grid">
        ${cards.map(c => `
          <div class="db-ops-card">
            <div class="db-ops-card-title">${escapeHtml(c.title)}</div>
            <div class="db-ops-card-desc">${escapeHtml(c.desc)}</div>
            <button class="modern-btn ${c.btnClass} sm" data-db-action="${c.action}">${c.btnLabel}</button>
          </div>
        `).join('')}
      </div>
      ${this.renderSecurityAudit(mgr)}
    `;
  }

  /** 安全审计触发卡片 + 结果视图 */
  private renderSecurityAudit(mgr: DatabaseManager): string {
    const running = mgr.isAuditRunning();
    const results = mgr.getSecurityResults();
    return `
      <div class="db-audit-section">
        <div class="db-audit-header">
          <div>
            <div class="db-section-title" style="margin:0">${icon(Shield, '15')} 安全审计</div>
            <div class="db-ops-card-desc">检查弱口令、匿名用户、危险权限等安全风险</div>
          </div>
          <button class="modern-btn primary sm" data-db-action="run-security-audit" ${running ? 'disabled' : ''}>
            ${running ? '审计中…' : `${icon(Shield, '14')} 运行审计`}
          </button>
        </div>
        ${results.length > 0 ? this.renderSecurityResults(results) : (running ? '' : '<div class="db-empty">点击「运行审计」开始检查</div>')}
      </div>
    `;
  }

  private renderSecurityResults(results: SecurityCheckResult[]): string {
    const items = results.map(r => {
      const sev = (r.severity || 'info').toLowerCase();
      const status = (r.status || '').toLowerCase();
      const statusClass = status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'warn';
      const findings = (r.findings && r.findings.length > 0)
        ? `<ul class="db-audit-findings">${r.findings.map(f =>
            `<li><strong>${escapeHtml(f.item)}</strong>${f.detail ? ': ' + escapeHtml(f.detail) : ''}</li>`
          ).join('')}</ul>`
        : '';
      return `
        <div class="db-audit-item db-audit-${statusClass}">
          <div class="db-audit-item-head">
            <span class="db-audit-sev db-audit-sev-${escapeHtml(sev)}">${escapeHtml(r.severity || '')}</span>
            <span class="db-audit-name">${escapeHtml(r.check_name)}</span>
            <span class="db-audit-status db-audit-status-${statusClass}">${escapeHtml(r.status || '')}</span>
          </div>
          ${findings}
          ${r.recommendation ? `<div class="db-audit-rec">建议: ${escapeHtml(r.recommendation)}</div>` : ''}
        </div>
      `;
    }).join('');
    return `<div class="db-audit-results">${items}</div>`;
  }

  // ==================== Add Connection Modal ====================

  private renderAddModal(): string {
    const types = [
      { value: 'mysql', label: 'MySQL', port: 3306 },
      { value: 'postgresql', label: 'PostgreSQL', port: 5432 },
      { value: 'redis', label: 'Redis', port: 6379 },
      { value: 'mongodb', label: 'MongoDB', port: 27017 },
      { value: 'dm', label: '达梦 (DM)', port: 5236 },
      { value: 'kingbase', label: '人大金仓 (KingBase)', port: 54321 },
      { value: 'opengauss', label: 'openGauss', port: 5432 },
      { value: 'tidb', label: 'TiDB', port: 4000 },
    ];

    const typeOptions = types.map(t =>
      `<option value="${t.value}" data-port="${t.port}">${t.label}</option>`
    ).join('');

    return `
      <div class="db-modal-overlay" id="db-add-modal" style="display:none">
        <div class="db-modal">
          <div class="db-modal-header">
            <span class="db-modal-title">${icon(Plus, '16')} 新增数据库连接</span>
            <button class="db-modal-close" data-db-action="close-modal">&times;</button>
          </div>
          <div class="db-modal-body">
            <div class="db-form-group">
              <label class="db-form-label">连接名称 <span class="db-required">*</span></label>
              <input type="text" class="db-form-input" id="db-add-name" placeholder="如: 生产环境 MySQL" />
            </div>
            <div class="db-form-group">
              <label class="db-form-label">数据库类型</label>
              <select class="db-form-input" id="db-add-type">${typeOptions}</select>
            </div>
            <div class="db-form-row">
              <div class="db-form-group" style="flex:2">
                <label class="db-form-label">主机</label>
                <input type="text" class="db-form-input" id="db-add-host" value="127.0.0.1" />
              </div>
              <div class="db-form-group" style="flex:1">
                <label class="db-form-label">端口</label>
                <input type="number" class="db-form-input" id="db-add-port" value="3306" />
              </div>
            </div>
            <div class="db-form-row">
              <div class="db-form-group" style="flex:1">
                <label class="db-form-label">用户名</label>
                <input type="text" class="db-form-input" id="db-add-username" placeholder="root" />
              </div>
              <div class="db-form-group" style="flex:1">
                <label class="db-form-label">密码</label>
                <input type="password" class="db-form-input" id="db-add-password" />
              </div>
            </div>
            <div class="db-form-row">
              <div class="db-form-group" style="flex:1">
                <label class="db-form-label">连接模式</label>
                <select class="db-form-input" id="db-add-mode">
                  <option value="direct">直接连接</option>
                  <option value="docker">Docker 容器</option>
                </select>
              </div>
              <div class="db-form-group" style="flex:1; display:none" id="db-add-container-group">
                <label class="db-form-label">容器名称/ID</label>
                <input type="text" class="db-form-input" id="db-add-container" placeholder="如: my-mysql" />
              </div>
            </div>
            <div class="db-form-group">
              <label class="db-form-label">数据库名 <span style="color:var(--text-tertiary)">(可选)</span></label>
              <input type="text" class="db-form-input" id="db-add-database" placeholder="留空则连接默认数据库" />
            </div>
          </div>
          <div class="db-modal-footer">
            <button class="modern-btn secondary" data-db-action="close-modal">取消</button>
            <button class="modern-btn primary" data-db-action="save-connection">保存</button>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== Password Prompt Modal ====================

  /**
   * 快速连接 / 需要认证时弹出的密码输入框。
   * 用户可选择「免密连接」或输入密码后「连接」。
   */
  private renderPasswordModal(): string {
    return `
      <div class="db-modal-overlay" id="db-pwd-modal" style="display:none">
        <div class="db-modal" style="max-width:380px">
          <div class="db-modal-header">
            <span class="db-modal-title" id="db-pwd-title">${icon(Shield, '16')} 数据库认证</span>
            <button class="db-modal-close" data-db-action="pwd-cancel">&times;</button>
          </div>
          <div class="db-modal-body">
            <div class="db-form-group">
              <label class="db-form-label">密码</label>
              <input type="password" class="db-form-input" id="db-pwd-input" placeholder="输入密码，或选择免密连接" autocomplete="off" />
              <div class="db-form-hint">密码仅保存在本次会话内存中，不会写入本地存储。</div>
            </div>
          </div>
          <div class="db-modal-footer">
            <button class="modern-btn secondary" data-db-action="pwd-nopass">免密连接</button>
            <button class="modern-btn primary" data-db-action="pwd-confirm">连接</button>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== Shared Renderers ====================
  /**
   * 渲染 SQL 结果表格（供 DatabaseManager 复用，保证执行结果与重渲染一致）
   */
  public renderResultTable(result: SqlResult): string {
    if (result.error) {
      return `<div class="db-result-error">${escapeHtml(result.error)}</div>`;
    }

    if (!result.columns || result.columns.length === 0) {
      const info = result.affected_rows != null
        ? `影响行数: ${result.affected_rows}`
        : `完成`;
      return `<div class="db-result-info">${info} (${result.execution_time_ms}ms)</div>`;
    }

    const headerCells = result.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
    const bodyRows = result.rows.map(row =>
      `<tr>${row.map(cell => `<td>${cell === null ? '<span class="db-null">NULL</span>' : escapeHtml(String(cell))}</td>`).join('')}</tr>`
    ).join('');

    return `
      <div class="db-result-meta">${result.row_count} 行 · ${result.execution_time_ms}ms</div>
      <div class="db-table-wrap">
        <table class="db-table">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;
  }

  /**
   * 渲染列信息
   */
  private renderColumnInfo(columns: ColumnInfo[]): string {
    const rows = columns.map(c => `
      <tr>
        <td>${c.is_primary_key ? '<span class="db-pk">PK</span> ' : ''}${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.data_type)}</td>
        <td>${c.is_nullable ? 'YES' : 'NO'}</td>
        <td>${c.default_value != null ? escapeHtml(String(c.default_value)) : '-'}</td>
      </tr>
    `).join('');

    return `
      <div class="db-column-info">
        <div class="db-section-title" style="margin-top:12px">列信息</div>
        <table class="db-table">
          <thead><tr><th>列名</th><th>类型</th><th>可空</th><th>默认值</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }
}
