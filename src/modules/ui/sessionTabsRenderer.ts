/**
 * 多会话 Tab 渲染器
 * 在侧边栏显示已连接的服务器列表，支持点击切换
 */

import { multiSessionManager, MultiSessionEntry } from '../remote/multiSessionManager';

export class SessionTabsRenderer {
  private container: HTMLElement | null = null;
  private initialized = false;

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
      <div class="session-tabs-list">${tabsHtml}</div>
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
      
      // 检查是否点击了 Tab
      const tab = target.closest('.session-tab');
      if (tab) {
        const sessionId = (tab as HTMLElement).dataset.sessionId;
        if (sessionId) {
          await this.switchToSession(sessionId);
        }
      }
    });
  }

  /**
   * 切换到指定会话
   */
  private async switchToSession(sessionId: string): Promise<void> {
    const success = await multiSessionManager.switchSession(sessionId);
    if (success) {
      console.log(`🔄 [SessionTabsRenderer] 切换到会话: ${sessionId}`);
      
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

      // 立即显示加载状态
      this.showLoadingState();
      
      (window as any).showNotification?.('正在切换服务器...', 'info');
      
      // 刷新相关模块数据 (await 等待完成)
      await this.refreshModuleData();
      
      (window as any).showNotification?.('已切换服务器连接', 'success');

      // 强制重新渲染当前页面以恢复视图（因为 showLoadingState 覆盖了内容）
      // 这会触发 app.render -> modernUIRenderer.render -> databasePageManager.initialize
      if ((window as any).app?.render) {
          console.log('🔄 [SessionTabsRenderer] 触发应用重绘以恢复视图');
          (window as any).app.render();
      }
    }
  }

  /**
   * 显示加载状态
   */
  private showLoadingState(): void {
    const workspaceContent = document.querySelector('.workspace-content');
    if (workspaceContent) {
      workspaceContent.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px;">
          <div style="width: 40px; height: 40px; border: 3px solid var(--bg-tertiary); border-top-color: var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <span style="color: var(--text-secondary); font-size: 14px;">正在加载服务器信息...</span>
        </div>
        <style>
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      `;
    }
  }

  /**
   * 关闭指定会话
   */
  private async closeSession(sessionId: string): Promise<void> {
    try {
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
      }
    } catch (error) {
      console.error('关闭会话失败:', error);
      (window as any).showNotification?.(`断开失败: ${error}`, 'error');
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
    
    // 刷新 SFTP
    if ((window as any).sftpManager?.refreshFileList) {
      (window as any).sftpManager.refreshFileList();
    }
    
    // 刷新 Docker
    if ((window as any).dockerPageManager?.refresh) {
      (window as any).dockerPageManager.refresh();
    }
  }
}

// 导出单例
export const sessionTabsRenderer = new SessionTabsRenderer();
