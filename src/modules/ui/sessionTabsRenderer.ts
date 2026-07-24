/**
 * 多会话 Tab 渲染器
 * 在侧边栏显示已连接的服务器列表，支持点击切换
 */

import { multiSessionManager, MultiSessionEntry } from '../remote/multiSessionManager';
import { showConfirm } from './confirmDialog';

export class SessionTabsRenderer {
  private container: HTMLElement | null = null;
  private initialized = false;
  // 切换/关闭进行中锁：确保上一次操作完成后才允许再次触发，避免并发切换导致状态错乱
  private isSwitching = false;
  private closingSessions = new Set<string>();

  /**
   * 计算会话对应的独立终端窗口 label
   * 必须与 main.ts openSSHTerminalWindow 中的生成规则保持一致
   */
  private getTerminalWindowLabel(sessionId: string): string {
    return `ssh-terminal-${sessionId.replace(/[^a-zA-Z0-9]/g, '-')}`;
  }

  /**
   * 判断会话对应的独立终端窗口是否处于打开状态
   */
  private async isTerminalWindowOpen(sessionId: string): Promise<boolean> {
    try {
      const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
      const label = this.getTerminalWindowLabel(sessionId);
      const windows = await getAllWebviewWindows();
      return windows.some(w => w.label === label);
    } catch {
      return false;
    }
  }

  /**
   * 关闭并销毁指定会话对应的独立终端窗口（若存在）
   */
  private async closeTerminalWindowForSession(sessionId: string): Promise<void> {
    try {
      const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
      const label = this.getTerminalWindowLabel(sessionId);
      const windows = await getAllWebviewWindows();
      const win = windows.find(w => w.label === label);
      if (win) {
        console.log(`🔌 [SessionTabsRenderer] 正在关闭终端窗口: ${label}`);
        await win.destroy();
      }
    } catch (error) {
      console.warn(`⚠️ [SessionTabsRenderer] 关闭终端窗口失败 (${sessionId}):`, error);
    }
  }

  /**
   * 初始化渲染器
   */
  initialize(): void {
    if (this.initialized) return;

    // 查找或创建容器
    this.container = document.getElementById('session-tabs-container');
    // 注意：不再因为找不到容器而直接返回，因为容器可能在后续渲染中出现

    // 设置事件委托（只需一次）
    this.setupEventDelegation();

    // 监听会话变化
    multiSessionManager.addListener((sessions, activeId) => {
      this.render(sessions, activeId);
    });

    this.initialized = true;
    console.log('✅ [SessionTabsRenderer] 初始化完成');
  }

  /**
   * 手动刷新渲染
   * 当应用主布局重新渲染后调用
   */
  refresh(): void {
    const sessions = multiSessionManager.getSessions();
    const activeId = multiSessionManager.getActiveSessionId();
    this.render(sessions, activeId);
  }

  /**
   * 渲染会话 Tab 列表
   */
  private render(sessions: MultiSessionEntry[], activeId: string | null): void {
    // 每次渲染时重新获取容器，因为应用可能会重绘整个布局
    this.container = document.getElementById('session-tabs-container');

    if (!this.container) {
      // 容器还未准备好，跳过本次渲染
      return;
    }

    if (sessions.length === 0) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'block';

    const tabsHtml = sessions.map(session => {
      const isActive = session.sessionId === activeId;
      return this.renderTab(session, isActive, activeId);
    }).join('');

    this.container.innerHTML = `
      <div class="session-tabs-header">连接的服务器 (${sessions.length})</div>
      <div class="session-tabs-wrapper">
        <div class="session-tabs-list">
          ${tabsHtml}
          <button class="session-tab-add-btn" title="新建服务器连接">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-plus"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
        <div class="session-tabs-right">
          <button class="session-tab-terminal-btn" onclick="window.switchPage?.('ssh-terminal')" title="打开 SSH 终端">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-terminal"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
            <span>终端</span>
          </button>
        </div>
      </div>
    `;

    // 注意：不再在这里调用 bindEvents，使用事件委托
  }

  /**
   * 渲染单个 Tab HTML
   */
  private renderTab(session: MultiSessionEntry, isActive: boolean, _activeId: string | null): string {
    const displayName = `${session.connection.username}@${session.connection.host}`;
    // 使用更智能的截断逻辑
    let shortName = displayName;
    if (displayName.length > 24) {
      const parts = displayName.split('@');
      if (parts.length === 2) {
        // 如果是 user@host 格式，尝试保留更多 host 信息
        const user = parts[0];
        const host = parts[1];
        if (host.length > 15) {
          shortName = `${user}@...${host.substring(host.length - 12)}`;
        } else {
          shortName = displayName.substring(0, 21) + '...';
        }
      } else {
        shortName = displayName.substring(0, 21) + '...';
      }
    }

    return `
      <div class="session-tab ${isActive ? 'active' : ''}" 
           data-session-id="${session.sessionId}"
           title="${displayName}:${session.connection.port}">
        <div class="session-tab-bg"></div>
        <span class="session-tab-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-terminal"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
        </span>
        <span class="session-tab-name">${shortName}</span>
        <div class="session-tab-close-wrapper">
          <button class="session-tab-close" data-session-id="${session.sessionId}" title="断开连接">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-x"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        ${isActive ? '<div class="active-glow"></div>' : ''}
      </div>
    `;
  }

  /**
   * 设置事件委托（只需调用一次）
   */
  private setupEventDelegation(): void {
    // 使用事件委托，只在容器上绑定一次事件
    document.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;

      // 检查是否点击了关闭按钮
      const closeBtn = target.closest('.session-tab-close');
      if (closeBtn) {
        e.stopPropagation();
        const sessionId = (closeBtn as HTMLElement).dataset.sessionId;
        if (sessionId) {
          await this.closeSession(sessionId);
        }
        return;
      }

      // 检查是否点击了新建标签按钮 → 打开连接管理器
      const addBtn = target.closest('.session-tab-add-btn');
      if (addBtn) {
        e.stopPropagation();
        (window as any).scManageServers?.();
        return;
      }

      // 检查是否点击了 Tab
      const tab = target.closest('.session-tab');
      if (tab) {
        const sessionId = (tab as HTMLElement).dataset.sessionId;
        if (sessionId) {
          // 切换未完成时忽略新的切换请求，切换完成后才可再次切换
          if (this.isSwitching) {
            console.log('⏳ [SessionTabsRenderer] 上一次切换尚未完成，忽略本次点击');
            return;
          }
          // 已经是当前会话则无需切换
          if (multiSessionManager.getActiveSessionId() === sessionId) {
            return;
          }
          await this.switchToSession(sessionId);
        }
      }
    });
  }

  /**
   * 切换到指定会话
   * 全程持有 isSwitching 锁，直到页面渲染与数据刷新完成，避免切换过程中被再次触发
   */
  private async switchToSession(sessionId: string): Promise<void> {
    this.isSwitching = true;
    this.setTabsLocked(true);
    try {
      const success = await multiSessionManager.switchSession(sessionId);
      if (!success) return;

      console.log(`🔄 [SessionTabsRenderer] 切换到会话: ${sessionId}`);

      // 注意：后端当前会话已由 multiSessionManager.switchSession 内部同步，
      // 此处无需再次调用 ssh_set_current_session。

      // 更新 SSHManager 中的 systemInfoManager 的 session ID
      const sshManager = (window as any).app?.sshManager;
      if (sshManager?.setSessionId) {
        console.log(`🔄 [SessionTabsRenderer] 正在设置 SSHManager 会话 ID: ${sessionId}`);
        sshManager.setSessionId(sessionId);
      } else {
        console.warn('⚠️ [SessionTabsRenderer] SSHManager.setSessionId 不可用');
      }

      // 清除前端系统信息缓存，确保刷新时获取新会话的数据
      const cache = (window as any).systemInfoCache;
      if (cache) {
        cache.detailedInfo = null;
        cache.lastUpdate = null;
        cache.isLoading = false;
        console.log('🗑️ [SessionTabsRenderer] 已清除 systemInfoCache');
      }

      // 同时清除 SystemInfoManager 的内部缓存（通过 sshManager 代理）
      if (sshManager?.systemInfoManager) {
        console.log('🗑️ [SessionTabsRenderer] 正在强制清除 SystemInfoManager 内部缓存');
      }

      // 先渲染页面，再后台刷新数据，避免加载状态遮挡内容
      if ((window as any).app?.render) {
        (window as any).app.render();
      }

      // 等待数据刷新完成后才释放切换锁，确保“切换完成后才可再次切换”
      try {
        await this.refreshModuleData();
        (window as any).showNotification?.('已切换服务器连接', 'success');
      } catch {
        (window as any).showNotification?.('切换服务器时数据刷新失败', 'warning');
      }
    } finally {
      this.isSwitching = false;
      this.setTabsLocked(false);
    }
  }

  /**
   * 锁定/解锁 Tab 交互（切换或关闭进行中时禁止点击，提供视觉反馈）
   */
  private setTabsLocked(locked: boolean): void {
    if (!this.container) {
      this.container = document.getElementById('session-tabs-container');
    }
    if (this.container) {
      this.container.classList.toggle('session-tabs-switching', locked);
    }
  }

  /**
   * 关闭指定会话
   * 先关闭对应的独立终端窗口，再断开 SSH 连接，最后移除会话记录
   */
  private async closeSession(sessionId: string): Promise<void> {
    if (this.closingSessions.has(sessionId)) {
      console.log(`⏳ [SessionTabsRenderer] 会话 ${sessionId} 正在关闭中，忽略重复请求`);
      return;
    }
    // 若对应终端窗口已打开，先询问用户是否一并关闭
    const terminalOpen = await this.isTerminalWindowOpen(sessionId);
    if (terminalOpen) {
      const session = multiSessionManager.getSessions().find(s => s.sessionId === sessionId);
      const name = session ? `${session.connection.username}@${session.connection.host}` : sessionId;
      const confirmed = await showConfirm({
        title: '关闭连接',
        message: `该连接（${name}）的终端窗口仍处于打开状态，关闭标签页将同时关闭对应的终端窗口。\n\n确认继续？`,
        confirmText: '关闭',
        cancelText: '取消',
        dangerous: true,
      });
      if (!confirmed) return;
    }

    this.closingSessions.add(sessionId);
    this.setTabsLocked(true);
    try {
      // 记录关闭前该会话是否为当前活动会话
      const wasActive = multiSessionManager.getActiveSessionId() === sessionId;

      // 先关闭对应的独立终端窗口（若存在），确保终端窗口已关闭后再断开连接
      await this.closeTerminalWindowForSession(sessionId);

      // 调用后端断开
      await (window as any).__TAURI__.core.invoke('ssh_disconnect_direct', {
        sessionId
      });

      // 从管理器移除
      multiSessionManager.removeSession(sessionId);

      console.log(`🔌 [SessionTabsRenderer] 关闭会话: ${sessionId}`);
      (window as any).showNotification?.('已断开服务器连接', 'info');

      // 如果没有剩余会话，可能需要更新 UI 状态
      if (!multiSessionManager.hasActiveSessions()) {
        // 通知应用更新断开状态
        const app = (window as any).app;
        if (app?.getStateManager) {
          app.getStateManager().setConnected(false, '', {});

          // 强制重绘应用以显示连接界面
          if (app.render) {
            console.log('🔄 [SessionTabsRenderer] 所有会话已关闭，返回连接界面');
            app.render();
          }
        }
      } else if (wasActive) {
        // 关闭的是当前活动会话，且仍有其他会话：
        // removeSession 已把后端/前端活动会话切到剩余会话之一，
        // 这里需要把工作区视图刷新到新的活动会话，否则仍显示已关闭服务器的数据。
        const newActiveId = multiSessionManager.getActiveSessionId();
        if (newActiveId) {
          console.log(`🔄 [SessionTabsRenderer] 活动会话已关闭，切换视图到: ${newActiveId}`);
          await this.switchToSession(newActiveId);
        }
      }
    } catch (error) {
      console.error('关闭会话失败:', error);
      (window as any).showNotification?.(`断开失败: ${error}`, 'error');
    } finally {
      this.closingSessions.delete(sessionId);
      this.setTabsLocked(false);
    }
  }

  /**
   * 刷新相关模块数据
   */
  private async refreshModuleData(): Promise<void> {
    // 先刷新系统信息数据（await 等待数据加载完成）
    if ((window as any).app?.sshManager?.fetchSystemInfo) {
      try {
        // 强制刷新，忽略 isUpdating 状态，确保获取最新会话的数据
        await (window as any).app.sshManager.fetchSystemInfo(true);
        console.log('✅ [SessionTabsRenderer] 系统信息已刷新');
      } catch (error) {
        console.error('❌ [SessionTabsRenderer] 刷新系统信息失败:', error);
      }
    }

    // 数据加载完成后，再刷新仪表盘 UI
    if ((window as any).refreshDashboard) {
      (window as any).refreshDashboard();
    }

    // 重新加载详细系统信息（进程、端口等），强制刷新新会话数据
    if ((window as any).loadSystemDetailedInfo) {
      (window as any).loadSystemDetailedInfo(true);
    }

    // 刷新 SFTP
    if ((window as any).sftpManager?.refreshFileList) {
      (window as any).sftpManager.refreshFileList();
    }

    // 刷新 Docker
    if ((window as any).dockerPageManager?.refresh) {
      (window as any).dockerPageManager.refresh();
    }

    // 根据当前页面重新初始化对应模块，避免切换后停留在加载状态
    const activeNav = document.querySelector('.sidebar-item.active[data-nav-id], .activity-bar-item.active[data-nav-id]');
    const currentPage = activeNav?.getAttribute('data-nav-id');
    switch (currentPage) {
      case 'emergency-commands':
        (window as any).emergencyPageManager?.initialize?.();
        break;
      case 'kubernetes':
        (window as any).kubernetesPageManager?.initialize?.();
        (window as any).kubernetesPageManager?.refresh?.(true);
        break;
      case 'baseline-quick-edit':
        (window as any).baselineQuickEditManager?.initialize?.();
        break;
      case 'log-analysis':
        (window as any).refreshLogAnalysis?.();
        break;
      case 'database':
        (window as any).databaseManager?.initialize?.();
        break;
    }
  }
}

// 导出单例
export const sessionTabsRenderer = new SessionTabsRenderer();
