// 数据库 UI 渲染器
// Database UI Renderer

import type {
    DatabaseConnection,
    DatabaseEnvironment,
    QueryResult,
    DatabaseClientInfo,
    DockerDatabaseContainer,
    DatabasePreset,
    TableInfo,
    TableColumn,
    PaginatedResult,
} from './databaseTypes';
import { DatabaseManager } from './databaseManager';

export class DatabaseRenderer {
    /**
     * 渲染主页面
     */
    renderMainPage(): string {
        return `
            <div class="db-page">
                <div class="db-header">
                    <h2>🗄️ 数据库管理</h2>
                    <div class="db-header-actions">
                        <button id="db-refresh-env" class="db-btn db-btn-secondary" title="重新检测环境">
                            <span class="icon">🔄</span>
                        </button>
                        <button id="db-new-connection" class="db-btn db-btn-secondary">
                            <span class="icon">➕</span> 新建连接
                        </button>
                        <button id="db-new-query" class="db-btn db-btn-primary">
                            <span class="icon">📝</span> 新建查询
                        </button>
                        <button id="db-disconnect" class="db-btn db-btn-warning" title="关闭连接" style="display: none; margin-left: 0.5rem;">
                            <span class="icon">🔌</span> 关闭连接
                        </button>
                    </div>
                </div>

                <div class="db-content">
                    <div class="db-sidebar">
                        <div class="db-section">
                            <h3>环境信息</h3>
                            <div id="db-environment-info" class="db-environment-info">
                                <p class="db-placeholder">等待 SSH 连接...</p>
                            </div>
                        </div>

                        <div class="db-section">
                            <h3>连接列表</h3>
                            <div id="db-connection-list" class="db-connection-list">
                                <p class="db-placeholder">暂无连接配置</p>
                            </div>
                        </div>

                        <div class="db-section" style="flex: 1; border-bottom: none; display: flex; flex-direction: column;">
                            <h3>数据库浏览</h3>
                            <div id="db-browser" class="db-browser" style="flex: 1; overflow: auto;">
                                <p class="db-placeholder">请选择一个连接</p>
                            </div>
                        </div>
                    </div>

                    <div class="db-main">
                        <div id="db-tabs" class="db-tabs">
                            <!-- 标签页头部将在这里渲染 -->
                        </div>
                        <div id="db-tab-contents" class="db-main" style="position: relative;">
                            <!-- 默认显示空状态 -->
                            <div class="db-empty" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
                                <span style="font-size: 3rem;">🗄️</span>
                                <p>请从左侧选择一个数据库或表进行查看</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染数据库树
     */
    renderDatabaseTree(databases: string[], activeDb?: string, tables?: TableInfo[], activeTable?: string): string {
        if (!databases || databases.length === 0) {
            return '<p class="db-placeholder">没有找到数据库</p>';
        }

        let html = '<div class="db-tree-list">';
        
        databases.forEach(db => {
            const isActiveDb = db === activeDb;
            html += `
                <div class="db-tree-item database ${isActiveDb ? 'active' : ''}" data-type="database" data-name="${db}">
                    <span class="db-tree-icon">🛢️</span>
                    <span class="db-tree-name">${db}</span>
                </div>
            `;

            if (isActiveDb && tables) {
                html += '<div class="db-tree-children">';
                tables.forEach(table => {
                    const isActiveTable = table.name === activeTable;
                    const icon = this.getTableIcon(table.tableType);
                    html += `
                        <div class="db-tree-item table ${isActiveTable ? 'active' : ''}" data-type="table" data-database="${db}" data-name="${table.name}">
                            <span class="db-tree-icon">${icon}</span>
                            <span class="db-tree-name">${table.name}</span>
                        </div>
                    `;
                });
                html += '</div>';
            }
        });

        html += '</div>';
        return html;
    }

    /**
     * getTableIcon
     */
    private getTableIcon(tableType: string): string {
        switch (tableType) {
            case 'VIEW': return '👁️';
            case 'KEY': return '🔑';
            case 'COLLECTION': return '📄';
            default: return '📋';
        }
    }

    /**
     * 渲染标签页头部
     */
    renderTabsHeader(tabs: { id: string, title: string, type: string, active: boolean }[]): string {
        return tabs.map(tab => `
            <div class="db-tab ${tab.active ? 'active' : ''}" data-id="${tab.id}">
                <span class="db-tab-icon">${tab.type === 'query' ? '📝' : '📋'}</span>
                <span class="db-tab-title">${tab.title}</span>
                <div class="db-tab-close" data-id="${tab.id}">×</div>
            </div>
        `).join('');
    }

    /**
     * 渲染数据网格工具栏
     */
    renderGridToolbar(total: number, page: number, pageSize: number): string {
        const totalPages = Math.ceil(total / pageSize);
        const start = (page - 1) * pageSize + 1;
        const end = Math.min(page * pageSize, total);
        
        return `
            <div class="db-grid-toolbar">
                <div class="db-grid-actions">
                    <button class="db-btn db-btn-primary db-add-data">
                        <span class="icon">➕</span> 添加数据
                    </button>
                    <button class="db-btn db-btn-secondary db-refresh-data">
                        <span class="icon">🔄</span> 刷新
                    </button>
                    <button class="db-btn db-btn-secondary db-view-structure">
                        <span class="icon">ℹ️</span> 结构
                    </button>
                </div>
                <div class="db-pagination">
                    <button class="db-btn db-btn-icon db-prev-page" ${page <= 1 ? 'disabled' : ''}>◀</button>
                    <span class="db-page-info">
                        ${total > 0 ? `${start}-${end} / ${total}` : '0 条'}
                    </span>
                    <button class="db-btn db-btn-icon db-next-page" ${page >= totalPages ? 'disabled' : ''}>▶</button>
                </div>
            </div>
        `;
    }

    /**
     * 渲染表结构
     */
    renderTableStructure(columns: TableColumn[]): string {
        let html = '<div class="db-result-table-wrapper">';
        html += '<table class="db-result-table">';
        html += `
            <thead>
                <tr>
                    <th>列名</th>
                    <th>类型</th>
                    <th>可空</th>
                    <th>键</th>
                    <th>默认值</th>
                    <th>额外信息</th>
                </tr>
            </thead>
            <tbody>
        `;

        columns.forEach(col => {
            html += `
                <tr>
                    <td>${this.escapeHtml(col.name)}</td>
                    <td><span class="db-badge info">${this.escapeHtml(col.dataType)}</span></td>
                    <td>${col.nullable ? '✅' : '❌'}</td>
                    <td>${col.key ? `<span class="db-badge warning">${col.key}</span>` : ''}</td>
                    <td>${col.defaultValue ? `<code>${this.escapeHtml(col.defaultValue)}</code>` : '<span class="text-muted">-</span>'}</td>
                    <td>${this.escapeHtml(col.extra || '')}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        return html;
    }

    /**
     * 渲染数据网格
     */
    renderDataGrid(data: PaginatedResult): string {
        if (!data || data.rows.length === 0) {
            return '<div class="db-empty">📭 表中没有数据</div>';
        }

        let html = '<div class="db-result-table-wrapper">';
        html += '<table class="db-result-table">';
        
        // 表头
        html += '<thead><tr>';
        // 添加行号头
        html += '<th style="width: 50px;">#</th>';
        data.columns.forEach(col => {
            html += `<th>${this.escapeHtml(col)}</th>`;
        });
        // Add Operation Column Header
        html += '<th style="width: 100px;">操作</th>';
        html += '</tr></thead>';

        // 表体
        html += '<tbody>';
        data.rows.forEach((row, index) => {
            const rowNum = data.page * data.pageSize + index + 1;
            html += `<tr>`;
            html += `<td style="color: #666;">${rowNum}</td>`;
            row.forEach(cell => {
                const displayValue = cell === null ? '<span style="color: #666; font-style: italic;">NULL</span>' : this.escapeHtml(cell);
                html += `<td>${displayValue}</td>`;
            });
            // Add Operation Buttons
            html += `
                <td>
                    <div class="db-row-actions">
                        <button class="db-btn-icon db-row-edit" title="编辑" data-row-index="${index}">✏️</button>
                        <button class="db-btn-icon db-row-delete" title="删除" data-row-index="${index}">🗑️</button>
                    </div>
                </td>
            `;
            html += `</tr>`;
        });
        html += '</tbody>';

        html += '</table></div>';
        return html;
        html += '</table></div>';
        return html;
    }

    /**
     * 渲染编辑行模态框内容
     */
    renderEditModal(columns: TableColumn[], rowData: string[]): string {
        let html = '<form id="db-edit-row-form" class="db-form">';
        
        columns.forEach((col, index) => {
            const value = rowData[index];
            const isKey = !!col.key; // Primary or Unique key
            // Note: We might want to allow editing keys in some cases, but generally safer to disable for primary keys in basic editor
            // Let's assume PRI keys are readonly for now to simplify logic (UPDATE WHERE PK=oldValue)
            // Actually, we pass conditions separately, so editing PK is possible if we track original values.
            // For simplicity in this iteration, let's mark keys visually but allow editing if not auto_increment.
            // If extra contains auto_increment, definitely should be careful.
            
            const isAutoIncrement = col.extra?.includes('auto_increment');
            const readonly = isAutoIncrement ? 'readonly disabled' : '';

            html += `
                <div class="db-form-group">
                    <label for="col-${index}">
                        ${this.escapeHtml(col.name)}
                        ${isKey ? '<span class="db-badge warning" style="font-size: 0.7em;">KEY</span>' : ''}
                        <span class="db-badge info" style="font-size: 0.7em;">${this.escapeHtml(col.dataType)}</span>
                    </label>
                    <input type="text" id="col-${index}" name="${this.escapeHtml(col.name)}" 
                        value="${value === null ? 'NULL' : this.escapeHtml(value)}" 
                        ${readonly}
                        data-original-value="${value === null ? 'NULL' : this.escapeHtml(value)}"
                        data-is-null="${value === null}"
                    >
                    <div class="db-form-hint" style="display: flex; gap: 10px; align-items: center;">
                        <label style="font-size: 0.8em; cursor: pointer;">
                            <input type="checkbox" class="db-edit-null-check" data-target="col-${index}" ${value === null ? 'checked' : ''}>
                            设为 NULL
                        </label>
                    </div>
                </div>
            `;
        });

        html += '</form>';
        return html;
    }

    /**
     * 渲染添加数据模态框内容
     */
    renderAddDataModal(columns: TableColumn[]): string {
        let html = '<form id="db-add-data-form" class="db-form">';
        
        columns.forEach((col, index) => {
            // 跳过自增列，或者显示为只读占位
            const isAutoIncrement = col.extra?.includes('auto_increment');
            
            html += `
                <div class="db-form-group">
                    <label for="add-col-${index}">
                        ${this.escapeHtml(col.name)}
                        ${col.key ? '<span class="db-badge warning" style="font-size: 0.7em;">KEY</span>' : ''}
                        <span class="db-badge info" style="font-size: 0.7em;">${this.escapeHtml(col.dataType)}</span>
                        ${col.nullable ? '<span class="db-badge success" style="font-size: 0.7em;">NULL</span>' : ''}
                    </label>
                    ${isAutoIncrement 
                        ? `<input type="text" value="(自动生成)" disabled class="db-input-disabled">` 
                        : `<input type="text" id="add-col-${index}" name="${this.escapeHtml(col.name)}" 
                              placeholder="${col.defaultValue ? `默认值: ${col.defaultValue}` : ''}">`
                    }
                    ${!isAutoIncrement && col.nullable ? `
                        <div class="db-form-hint">
                            <label style="font-size: 0.8em; cursor: pointer;">
                                <input type="checkbox" class="db-add-null-check" data-target="add-col-${index}">
                                设为 NULL
                            </label>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        html += '</form>';
        return html;
    }


    // ... (中间代码省略) ...

    /**
     * 渲染安全审计结果
     */
    renderSecurityAuditResults(results: any[]): string {
        if (!results || results.length === 0) {
            return '<div class="db-empty">未发现安全问题</div>';
        }

        const statusEmojis: Record<string, string> = {
            pass: '✅',
            fail: '❌',
            warning: '⚠️',
            error: '🔴',
        };

        let html = '<div class="db-security-report">';
        
        // 汇总
        const summary = results.reduce((acc: any, curr: any) => {
            acc[curr.status] = (acc[curr.status] || 0) + 1;
            return acc;
        }, {});

        html += `
            <div class="db-security-summary-card">
                <h4>审计概览</h4>
                <div class="db-summary-stats">
                    <div class="db-stat-item pass">
                        <span class="count">${summary.pass || 0}</span>
                        <span class="label">通过</span>
                    </div>
                    <div class="db-stat-item fail">
                        <span class="count">${summary.fail || 0}</span>
                        <span class="label">失败</span>
                    </div>
                    <div class="db-stat-item warning">
                        <span class="count">${summary.warning || 0}</span>
                        <span class="label">警告</span>
                    </div>
                </div>
            </div>
        `;

        html += '<div class="db-security-list">';
        results.forEach(result => {
             html += `
                <div class="db-security-item ${result.status}">
                    <div class="db-security-header">
                        <div class="db-security-title">
                            <span class="db-security-icon">${statusEmojis[result.status]}</span>
                            <span class="name">${result.checkName}</span>
                        </div>
                        <span class="db-badge ${result.severity}">${result.severity.toUpperCase()}</span>
                    </div>
                    
                    ${result.findings.length > 0 ? `
                        <div class="db-security-findings">
                            <strong>发现问题:</strong>
                            <ul>
                                ${result.findings.map((f: any) => `<li><span class="item">${f.item}</span>: ${f.detail}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    <div class="db-security-recommendation">
                        <strong>💡 建议:</strong> ${result.recommendation}
                    </div>
                </div>
            `;
        });
        html += '</div></div>';

        return html;
    }

    /**
     * 获取数据库图标
     */
     // ... (后续方法)


    /**
     * 渲染环境信息
     */
    renderEnvironmentInfo(env: DatabaseEnvironment): string {
        const availableClients = env.clients.filter(c => c.available);
        const unavailableClients = env.clients.filter(c => !c.available);

        let html = '<div class="db-env-summary">';
        html += `<div class="db-env-item">`;
        html += `<span class="db-env-label">可用客户端:</span>`;
        html += `<span class="db-env-value">${availableClients.length} / ${env.clients.length}</span>`;
        html += `</div>`;
        html += `<div class="db-env-item">`;
        html += `<span class="db-env-label">Docker 容器:</span>`;
        html += `<span class="db-env-value">${env.dockerContainers.length}</span>`;
        html += `</div>`;
        html += '</div>';

        // 客户端列表
        if (availableClients.length > 0) {
            html += '<div class="db-client-list">';
            html += '<h4>✅ 可用客户端</h4>';
            availableClients.forEach(client => {
                html += this.renderClientCard(client, true);
            });
            html += '</div>';
        }

        if (unavailableClients.length > 0) {
            html += '<div class="db-client-list">';
            html += '<h4>❌ 不可用客户端</h4>';
            unavailableClients.forEach(client => {
                html += this.renderClientCard(client, false);
            });
            html += '</div>';
        }

        // Docker 容器
        if (env.dockerContainers.length > 0) {
            html += '<div class="db-docker-list">';
            html += '<h4>🐳 Docker 容器</h4>';
            env.dockerContainers.forEach(container => {
                html += this.renderDockerCard(container);
            });
            html += '</div>';
        }

        return html;
    }

    /**
     * 渲染客户端卡片
     */
    private renderClientCard(client: DatabaseClientInfo, available: boolean): string {
        const statusClass = available ? 'available' : 'unavailable';
        const clickableClass = available ? 'db-clickable' : '';
        const icon = this.getDatabaseIcon(client.dbType);
        const dataAttr = available ? `data-db-type="${client.dbType}"` : '';
        
        return `
            <div class="db-client-card db-client-${statusClass} ${clickableClass}" ${dataAttr}>
                <span class="db-client-icon">${icon}</span>
                <div class="db-client-info">
                    <div class="db-client-name">${this.getDatabaseName(client.dbType)}</div>
                    <div class="db-client-version">${client.version || '未安装'}</div>
                </div>
                ${available ? '<span class="db-client-action-hint">点击创建连接</span>' : ''}
            </div>
        `;
    }

    /**
     * 渲染 Docker 容器卡片
     */
    private renderDockerCard(container: DockerDatabaseContainer): string {
        const icon = this.getDatabaseIcon(container.dbType);
        const ports = container.ports.map(p => `${p.hostPort}:${p.containerPort}`).join(', ');
        const hostPort = container.ports.length > 0 ? container.ports[0].hostPort : 0;
        
        // Determine status color/state
        const isUp = container.status.toLowerCase().startsWith('up');
        const statusClass = isUp ? 'up' : 'down';
        
        return `
            <div class="db-docker-card db-clickable" 
                 data-container-id="${container.containerId}"
                 data-container-name="${container.containerName}"
                 data-db-type="${container.dbType}"
                 data-host-port="${hostPort}"
                 data-image="${this.escapeHtml(container.image)}">
                <span class="db-docker-icon">${icon}</span>
                <div class="db-docker-info">
                    <div class="db-docker-name" title="${this.escapeHtml(container.containerName)}">${this.escapeHtml(container.containerName)}</div>
                    <div class="db-docker-meta">
                        <span class="db-docker-image" title="${this.escapeHtml(container.image)}">${this.escapeHtml(container.image)}</span>
                        <span class="db-docker-ports">${ports || '无端口映射'}</span>
                    </div>
                </div>
                <div class="db-docker-right">
                    <div class="db-docker-status-wrapper" title="${this.escapeHtml(container.status)}">
                        <span class="db-status-dot ${statusClass}"></span>
                        <span class="db-docker-status">${this.escapeHtml(container.status)}</span>
                    </div>
                    <span class="db-docker-action-hint">点击创建连接</span>
                </div>
            </div>
        `;
    }

    /**
     * 渲染连接表单
     */
    renderConnectionForm(connection?: DatabaseConnection, _env?: DatabaseEnvironment | null, preset?: DatabasePreset): string {
        const c = connection;
        
        // 确定各字段值：优先使用 preset，其次使用 connection，最后使用默认值
        const dbType = preset?.dbType || c?.dbType || 'mysql';
        const port = preset?.port ?? c?.port ?? DatabaseManager.getDefaultPort(dbType);
        const username = preset?.username ?? c?.username ?? '';
        const host = preset?.host || c?.host || 'localhost';
        
        // Docker 容器信息区域
        const dockerInfoHtml = preset?.dockerContainer ? `
            <div class="db-form-docker-info">
                <div class="db-docker-indicator">🐳 来自 Docker 容器</div>
                <div class="db-docker-details">
                    <div class="db-docker-detail-item">
                        <span class="label">容器名称:</span>
                        <span class="value">${this.escapeHtml(preset.dockerContainer.containerName)}</span>
                    </div>
                    <div class="db-docker-detail-item">
                        <span class="label">容器 ID:</span>
                        <span class="value">${preset.dockerContainer.containerId.substring(0, 12)}</span>
                    </div>
                    <div class="db-docker-detail-item">
                        <span class="label">镜像:</span>
                        <span class="value">${this.escapeHtml(preset.dockerContainer.image)}</span>
                    </div>
                </div>
            </div>
            <input type="hidden" name="dockerContainerId" value="${preset.dockerContainer.containerId}">
            <input type="hidden" name="dockerContainerName" value="${this.escapeHtml(preset.dockerContainer.containerName)}">
        ` : '';
        
        // 连接模式选择（仅当来自 Docker 容器时显示）
        const connectionModeHtml = preset?.dockerContainer ? `
            <div class="db-form-group db-form-full-width">
                <label for="db-connection-mode">连接模式</label>
                <select id="db-connection-mode" name="connectionMode">
                    <option value="docker" selected>通过 Docker 容器 (docker exec)</option>
                    <option value="direct">直接连接 (通过主机端口 ${port})</option>
                </select>
                <div class="db-form-hint">
                    <span class="hint-docker">Docker 模式：通过 docker exec 直接在容器内执行命令，无需端口映射</span>
                    <span class="hint-direct" style="display:none;">直连模式：通过主机端口连接，需要容器端口已映射到主机</span>
                </div>
            </div>
        ` : '';
        
        // 自动生成连接名称建议
        const suggestedName = preset?.dockerContainer 
            ? `${this.getDatabaseName(dbType)} - ${preset.dockerContainer.containerName}`
            : c?.name || '';
        
        return `
            <form id="db-connection-form" class="db-form">
                ${dockerInfoHtml}
                
                <div class="db-form-group">
                    <label for="db-name">连接名称</label>
                    <input type="text" id="db-name" name="name" value="${suggestedName}" 
                        placeholder="例如: 生产环境 MySQL" required>
                </div>

                ${connectionModeHtml}

                <div class="db-form-row">
                    <div class="db-form-group">
                        <label for="db-type">数据库类型</label>
                        <select id="db-type" name="dbType" required>
                            <option value="mysql" ${dbType === 'mysql' ? 'selected' : ''}>MySQL/MariaDB</option>
                            <option value="postgresql" ${dbType === 'postgresql' ? 'selected' : ''}>PostgreSQL</option>
                            <option value="redis" ${dbType === 'redis' ? 'selected' : ''}>Redis</option>
                            <option value="mongodb" ${dbType === 'mongodb' ? 'selected' : ''}>MongoDB</option>
                            <option value="sqlite" ${dbType === 'sqlite' ? 'selected' : ''}>SQLite</option>
                        </select>
                    </div>

                    <div class="db-form-group">
                        <label for="db-port">端口</label>
                        <input type="number" id="db-port" name="port" value="${port}" required>
                    </div>
                </div>

                <div class="db-form-row">
                    <div class="db-form-group">
                        <label for="db-host">主机</label>
                        <input type="text" id="db-host" name="host" value="${host}" 
                            placeholder="localhost 或 IP 地址" required>
                    </div>

                    <div class="db-form-group">
                        <label for="db-database">数据库名</label>
                        <input type="text" id="db-database" name="database" value="${c?.database || ''}" 
                            placeholder="可选">
                    </div>
                </div>

                <div class="db-form-row">
                    <div class="db-form-group">
                        <label for="db-username">用户名</label>
                        <input type="text" id="db-username" name="username" value="${username}" 
                            placeholder="${DatabaseManager.getDefaultUsername(dbType) || '无需用户名'}">
                    </div>

                    <div class="db-form-group">
                        <label for="db-password">密码</label>
                        <input type="password" id="db-password" name="password" value="" 
                            placeholder="留空表示无密码">
                    </div>
                </div>

                <div class="db-form-actions">
                    <button type="button" id="db-test-connection" class="db-btn db-btn-secondary">
                        测试连接
                    </button>
                    <button type="button" id="db-save-connection" class="db-btn db-btn-primary">
                        保存
                    </button>
                </div>
            </form>
        `;
    }

    /**
     * 渲染连接列表
     */
    renderConnectionList(connections: DatabaseConnection[]): string {
        if (connections.length === 0) {
            return '<p class="db-placeholder">暂无连接配置</p>';
        }

        let html = '';
        connections.forEach(conn => {
            const icon = this.getDatabaseIcon(conn.dbType);
            html += `
                <div class="db-connection-item" data-id="${conn.id}">
                    <span class="db-connection-icon">${icon}</span>
                    <div class="db-connection-info">
                        <div class="db-connection-name">${conn.name}</div>
                        <div class="db-connection-meta">${conn.host}:${conn.port}</div>
                    </div>
                    <div class="db-connection-actions">
                        <button class="db-connection-edit db-btn-icon" data-id="${conn.id}">✏️</button>
                        <button class="db-connection-delete db-btn-icon" data-id="${conn.id}">🗑️</button>
                    </div>
                </div>
            `;
        });

        return html;
    }

    /**
     * 渲染查询结果
     */
    renderQueryResult(result: QueryResult): string {
        if (result.error) {
            return `<div class="db-error">❌ ${result.error}</div>`;
        }

        if (result.rows.length === 0) {
            return `<div class="db-empty">📭 查询返回 0 行结果</div>`;
        }

        let html = '<div class="db-result-table-wrapper">';
        html += '<table class="db-result-table">';
        
        // 表头
        html += '<thead><tr>';
        result.columns.forEach(col => {
            html += `<th>${this.escapeHtml(col)}</th>`;
        });
        html += '</tr></thead>';

        // 表体
        html += '<tbody>';
        result.rows.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
                html += `<td>${this.escapeHtml(cell)}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody>';

        html += '</table>';
        html += '</div>';

        html += `<div class="db-result-info">`;
        html += `${result.rows.length} 行 · ${result.executionTimeMs}ms`;
        html += `</div>`;

        return html;
    }

    /**
     * 获取数据库图标
     */
    private getDatabaseIcon(dbType: string): string {
        const icons: Record<string, string> = {
            mysql: '🐬',
            postgresql: '🐘',
            redis: '⚡',
            mongodb: '🍃',
            sqlite: '🗃️',
        };
        return icons[dbType] || '🗄️';
    }

    /**
     * 获取数据库名称
     */
    private getDatabaseName(dbType: string): string {
        const names: Record<string, string> = {
            mysql: 'MySQL',
            postgresql: 'PostgreSQL',
            redis: 'Redis',
            mongodb: 'MongoDB',
            sqlite: 'SQLite',
        };
        return names[dbType] || dbType;
    }

    /**
     * HTML 转义
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
