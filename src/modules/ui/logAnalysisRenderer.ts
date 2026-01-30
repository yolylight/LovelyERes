/**
 * 日志审计页面渲染器
 * 负责渲染日志审计界面和处理日志数据展示
 */

import {
  Log,
  FileText,
  Refresh,
  Search,
  Down,
  Calendar,
  Left,
  Right
} from '@icon-park/svg';

interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  raw: string;
  highlighted: boolean;
}

export class LogAnalysisRenderer {
  private currentLogPath: string = '/var/log/auth.log';
  private currentLines: number = 100;
  private currentFilter: string = '';
  private useJournalctl: boolean = false;
  private journalUnit: string = '';
  
  // 新增状态
  private currentPage: number = 1;
  private currentDate: string = '';

  /**
   * 渲染日志审计页面
   */
  render(): string {
    return `
      <div class="log-analysis-page">
        <div class="log-analysis-container">
          ${this.renderToolbar()}
          ${this.renderLogContent()}
          ${this.renderPagination()}
        </div>
      </div>
    `;
  }

  /**
   * 渲染工具栏
   */
  public renderToolbar(): string {
    const today = new Date().toISOString().split('T')[0];
    
    return `
      <div class="log-toolbar">
        <div class="toolbar-left">
          <div class="toolbar-title">
            ${Log({ theme: 'outline', size: '20', fill: 'currentColor' })}
            <span class="text">日志审计</span>
          </div>
          <div class="toolbar-divider"></div>
          
          <div class="log-source-group">
            <button class="source-btn ${!this.useJournalctl ? 'active' : ''}" 
                    onclick="window.switchLogSource('file')"
                    title="查看文件日志">
              ${FileText({ theme: 'outline', size: '16', fill: 'currentColor' })}
              文件
            </button>
            <button class="source-btn ${this.useJournalctl ? 'active' : ''}" 
                    onclick="window.switchLogSource('journalctl')"
                    title="查看 Journalctl 日志">
              <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 41V7H34V41H14Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M14 15H34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M14 23H34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Journal
            </button>
          </div>

          ${!this.useJournalctl ? this.renderFileSelector() : this.renderJournalInput()}
        </div>

        <div class="toolbar-right">
          <div class="date-picker-wrapper">
            ${Calendar({ theme: 'outline', size: '16', fill: 'currentColor' })}
            <input 
              type="date" 
              class="toolbar-input date-input" 
              id="log-date-input"
              value="${this.currentDate}"
              max="${today}"
              onchange="window.updateLogDate(this.value)"
              title="筛选日期"
            />
          </div>

          <div class="search-box">
            ${Search({ theme: 'outline', size: '16', fill: 'currentColor' })}
            <input 
              type="text" 
              class="transparent-input" 
              id="log-filter-input"
              placeholder="搜索关键词..."
              value="${this.currentFilter}"
              onchange="window.updateLogFilter(this.value)"
            />
            ${this.currentFilter ? `
              <button class="clear-btn" onclick="window.clearLogFilter()">
                ${Down({ theme: 'outline', size: '14', fill: 'currentColor', strokeWidth: 4 })}
              </button>
            ` : ''}
          </div>

          <button class="modern-btn primary icon-only" onclick="window.refreshLogAnalysis()" title="刷新日志">
            ${Refresh({ theme: 'outline', size: '16', fill: 'currentColor' })}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 渲染分页控件
   */
  private renderPagination(): string {
    return `
      <div class="log-pagination">
        <div class="pagination-info">
          <span class="text-secondary">每页显示:</span>
          <select 
            class="mini-select" 
            id="log-lines-select"
            value="${this.currentLines}"
            onchange="window.updateLogLines(this.value)"
          >
            <option value="50">50条</option>
            <option value="100" ${this.currentLines === 100 ? 'selected' : ''}>100条</option>
            <option value="200">200条</option>
            <option value="500">500条</option>
            <option value="1000">1000条</option>
          </select>
        </div>

        <div class="pagination-controls">
          <button class="pagination-btn" 
                  onclick="window.changeLogPage(-1)" 
                  ${this.currentPage <= 1 ? 'disabled' : ''}
                  title="上一页">
            ${Left({ theme: 'outline', size: '16', fill: 'currentColor' })}
          </button>
          
          <span class="page-display">第 ${this.currentPage} 页</span>
          
          <button class="pagination-btn" 
                  onclick="window.changeLogPage(1)"
                  title="下一页">
            ${Right({ theme: 'outline', size: '16', fill: 'currentColor' })}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 渲染文件选择器
   */
  private renderFileSelector(): string {
    return `
      <div class="selector-wrapper">
        <select 
          class="toolbar-select" 
          id="log-file-select"
          value="${this.currentLogPath}"
          onchange="window.updateLogPath(this.value)"
        >
          <optgroup label="Docker 容器">
            <option value="docker:all">所有容器 (docker:all)</option>
          </optgroup>
          <optgroup label="系统日志">
            <option value="/var/log/auth.log">认证日志 (auth.log)</option>
            <option value="/var/log/secure">安全日志 (secure)</option>
            <option value="/var/log/syslog">系统日志 (syslog)</option>
            <option value="/var/log/messages">系统消息 (messages)</option>
            <option value="/var/log/kern.log">内核日志 (kern.log)</option>
            <option value="/var/log/cron">计划任务日志 (cron)</option>
            <option value="/var/log/audit/audit.log">审计日志 (audit.log)</option>
            <option value="/var/log/boot.log">启动日志 (boot.log)</option>
            <option value="/var/log/dmesg">设备消息 (dmesg)</option>
            <option value="/var/log/faillog">失败登录 (faillog)</option>
          </optgroup>
        </select>
      </div>
    `;
  }

  /**
   * 渲染 Journal 输入框
   */
  private renderJournalInput(): string {
    return `
      <div class="input-wrapper">
        <input 
          type="text" 
          class="toolbar-input" 
          id="journal-unit-input"
          list="journal-units"
          placeholder="服务单元 (如 sshd)"
          value="${this.journalUnit}"
          onchange="window.updateJournalUnit(this.value)"
        />
        <datalist id="journal-units">
          <option value="sshd">SSH 服务</option>
          <option value="nginx">Nginx Web 服务器</option>
          <option value="docker">Docker 容器服务</option>
          <option value="cron">定时任务服务</option>
          <option value="rsyslog">系统日志服务</option>
          <option value="NetworkManager">网络管理器</option>
          <option value="systemd-journald">Journal 日志服务</option>
          <option value="firewalld">防火墙服务</option>
          <option value="mariadb">MariaDB 数据库</option>
          <option value="mysqld">MySQL 数据库</option>
          <option value="redis">Redis 服务</option>
        </datalist>
      </div>
    `;
  }

  /**
   * 渲染日志内容区域
   */
  private renderLogContent(): string {
    return `
      <div class="log-content-wrapper">
        <div class="log-stats-bar">
          <div class="stat-group">
            <span class="stat-label">来源:</span>
            <span class="stat-value mono" id="current-source">-</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-group">
            <span class="stat-label">总计:</span>
            <span class="stat-value" id="total-logs">0</span>
          </div>
        </div>
        
        <div class="log-viewer" id="log-container">
          <div class="loading-placeholder">
            <div class="spinner"></div>
            <p>正在获取日志数据...</p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染日志条目列表
   */
  renderLogEntries(entries: LogEntry[]): string {
    if (entries.length === 0) {
      return `
        <div class="empty-state">
          ${Log({ theme: 'outline', size: '48', fill: 'currentColor' })}
          <p>没有找到日志记录</p>
          <small>请检查日志文件路径或调整过滤条件</small>
        </div>
      `;
    }

    return `
      <div class="log-entries">
        ${entries.map(entry => this.renderLogEntry(entry)).join('')}
      </div>
    `;
  }

  /**
   * 渲染单条日志
   */
  private renderLogEntry(entry: LogEntry): string {
    const levelClass = this.getLevelClass(entry.level);
    const highlightClass = entry.highlighted ? 'highlighted' : '';

    return `
      <div class="log-entry ${levelClass} ${highlightClass}">
        <div class="log-header">
          <span class="log-timestamp">
            ${Calendar({ theme: 'outline', size: '14', fill: 'currentColor' })}
            ${entry.timestamp || 'Unknown'}
          </span>
          <span class="log-level ${levelClass}">${entry.level}</span>
          <span class="log-service">${entry.service}</span>
        </div>
        <div class="log-message">${this.escapeHtml(entry.message)}</div>
        ${entry.highlighted ? '<div class="log-highlight-badge">⚠️ 包含关键词</div>' : ''}
      </div>
    `;
  }

  /**
   * 获取日志级别对应的 CSS 类
   */
  private getLevelClass(level: string): string {
    const levelUpper = level.toUpperCase();
    if (levelUpper.includes('ERROR') || levelUpper.includes('FAIL')) return 'level-error';
    if (levelUpper.includes('WARN')) return 'level-warn';
    if (levelUpper.includes('INFO')) return 'level-info';
    if (levelUpper.includes('DEBUG')) return 'level-debug';
    return 'level-info';
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 设置当前日志路径
   */
  setLogPath(path: string): void {
    this.currentLogPath = path;
  }

  /**
   * 设置显示行数
   */
  setLines(lines: number): void {
    this.currentLines = lines;
  }

  /**
   * 设置过滤器
   */
  setFilter(filter: string): void {
    this.currentFilter = filter;
  }

  /**
   * 设置是否使用 journalctl
   */
  setUseJournalctl(use: boolean): void {
    this.useJournalctl = use;
  }

  /**
   * 设置 journal 单元
   */
  setJournalUnit(unit: string): void {
    this.journalUnit = unit;
  }
}
