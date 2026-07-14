/**
 * 现代化UI渲染器
 * 负责渲染应用的各个UI组件
 */

import type { StateManager } from '../core/stateManager';
import type { AppState } from '../core/types';
import { DashboardRenderer } from './dashboardRenderer';
import { KubernetesRenderer } from './kubernetesRenderer';
import { SftpContextMenuRenderer } from './sftpContextMenu';
import { LogAnalysisRenderer } from './logAnalysisRenderer';

import { emergencyCategories } from '../emergency/commands';
import {
  List,
  Peoples,
  Earth,
  Rocket,
  Calendar,
  SettingTwo,
  ApplicationMenu,
  FolderOpen,
  Whale,
  CheckOne,
  CloseOne,
  Dashboard,
  Code,
  Plus,
  LinkInterrupt,
  Connection,
  User,
  Key,
  Up,
  Home,
  Refresh,
  Upload,
  FolderPlus,
  History,
  // 快速检测图标
  Lock,
  Shield,
  Analysis,
  Fire,
  FileText,
  Config,
  NetworkTree,
  System,
  Time,
  SettingConfig,
  Cpu,
  Memory,
  Speed,
  LinkCloud,
  BookOpen,
  Log,
  Data,
  Left,
  Right
} from '@icon-park/svg';

// 添加系统信息页面的样式
const systemInfoStyles = `
  <style>
    /* 基础样式已移至 system-info.css */
  </style>
`;

export class ModernUIRenderer {
  private stateManager: StateManager;
  private state: AppState;
  private dashboardRenderer: DashboardRenderer;
  public kubernetesRenderer: KubernetesRenderer;
  private logAnalysisRenderer: LogAnalysisRenderer;

  public sftpContextMenuRenderer: SftpContextMenuRenderer;


  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.state = stateManager.getState();
    this.dashboardRenderer = new DashboardRenderer();
    this.kubernetesRenderer = new KubernetesRenderer();
    this.logAnalysisRenderer = new LogAnalysisRenderer();
    this.sftpContextMenuRenderer = new SftpContextMenuRenderer();


    // 注入系统信息页面样式
    if (!document.querySelector('#system-info-styles')) {
      const styleElement = document.createElement('div');
      styleElement.id = 'system-info-styles';
      styleElement.innerHTML = systemInfoStyles;
      document.head.appendChild(styleElement.firstElementChild!);
    }

    // 注册 System Info Header 切换函数
    (window as any).toggleSystemInfoHeader = () => {
      const header = document.querySelector('.system-info-header');
      const content = document.querySelector('.system-info-content');
      const toggleBtn = document.querySelector('.header-toggle-icon');
      
      if (header && content) {
        header.classList.toggle('collapsed');
        content.classList.toggle('expanded');
        
        // 保存状态到 localStorage
        const isCollapsed = header.classList.contains('collapsed');
        localStorage.setItem('system-info-header-collapsed', String(isCollapsed));
        
        // 更新按钮图标
        if (toggleBtn) {
          toggleBtn.innerHTML = isCollapsed 
            ? Right({ theme: 'outline', size: '16', fill: 'currentColor' })
            : Left({ theme: 'outline', size: '16', fill: 'currentColor' });
        }
      }
    };

    // 注册Kubernetes Tab切换函数
    (window as any).switchKubernetesTab = (tabId: string) => {
      this.kubernetesRenderer.setTab(tabId);
      // 重新渲染工作区内容
      const workspaceContent = document.querySelector('.workspace-content');
      if (workspaceContent) {
        workspaceContent.innerHTML = this.renderKubernetesPage();
      }
    };

    // 监听状态变化
    this.stateManager.addListener((newState) => {
      const oldTheme = this.state.theme;
      const oldConnected = this.state.isConnected;

      this.state = newState;

      // 如果主题或连接状态发生变化，重新渲染连接面板
      if (oldTheme !== newState.theme || oldConnected !== newState.isConnected) {
        console.log('🎨 状态监听器检测到变化，重新渲染连接面板', {
          oldTheme,
          newTheme: newState.theme,
          oldConnected,
          newConnected: newState.isConnected
        });
        this.rerenderConnectionPanel();

        // 如果是从未连接变为已连接，触发状态变化动画
        if (!oldConnected && newState.isConnected) {
          console.log('🎉 连接成功，触发状态变化动画');
          setTimeout(() => {
            const connectionCard = document.querySelector('.connection-card');
            if (connectionCard) {
              connectionCard.classList.add('status-change');
              setTimeout(() => {
                connectionCard.classList.remove('status-change');
              }, 800);
            }
          }, 50); // 等待DOM更新
        }
      }
    });

    // 注册系统信息Tab切换函数
    (window as any).switchSystemInfoTab = (tabId: string) => {
      this.switchSystemInfoTab(tabId);
    };

    // 注册设置Tab切换函数
    (window as any).switchSettingsTab = (tabId: string) => {
      this.switchSettingsTab(tabId);
    };

    // 注册日志审计相关函数
    this.registerLogAnalysisFunctions();
  }

  /**
   * 注册日志审计相关全局函数
   */
  private registerLogAnalysisFunctions(): void {
    (window as any).switchLogSource = (source: 'file' | 'journalctl') => {
      this.logAnalysisRenderer.setUseJournalctl(source === 'journalctl');
      
      // 更新工具栏UI
      const toolbarContainer = document.querySelector('.log-toolbar');
      if (toolbarContainer) {
        toolbarContainer.outerHTML = this.logAnalysisRenderer.renderToolbar();
      }

      // 同步状态
      (window as any).logAnalysisState = (window as any).logAnalysisState || {};
      (window as any).logAnalysisState.useJournalctl = source === 'journalctl';
      if (typeof (window as any).refreshLogAnalysis === 'function') {
        (window as any).refreshLogAnalysis();
      }
    };

    (window as any).updateLogDate = (_date: string) => {
      // LogAnalysisRenderer 暂时没有 setDate 方法，需要添加或使用现有方法
      if (typeof (window as any).refreshLogAnalysis === 'function') {
        (window as any).refreshLogAnalysis();
      }
    };

    (window as any).updateLogFilter = (filter: string) => {
      this.logAnalysisRenderer.setFilter(filter);
      // 同步状态
      (window as any).logAnalysisState = (window as any).logAnalysisState || {};
      (window as any).logAnalysisState.filter = filter;
      if (typeof (window as any).refreshLogAnalysis === 'function') {
        (window as any).refreshLogAnalysis();
      }
    };

    (window as any).clearLogFilter = () => {
      const input = document.getElementById('log-filter-input') as HTMLInputElement;
      if (input) input.value = '';
      this.logAnalysisRenderer.setFilter('');
      if (typeof (window as any).refreshLogAnalysis === 'function') {
        (window as any).refreshLogAnalysis();
      }
    };

    // refreshLogAnalysis 由 main.ts 定义，不在这里覆盖

    (window as any).updateLogLines = (lines: string) => {
      this.logAnalysisRenderer.setLines(parseInt(lines, 10));
      // 同步更新 logAnalysisState，确保 main.ts 的 refreshLogAnalysis 能读取到
      (window as any).logAnalysisState = (window as any).logAnalysisState || {};
      (window as any).logAnalysisState.lines = lines;
      // 刷新交给 main.ts 的 refreshLogAnalysis
      if (typeof (window as any).refreshLogAnalysis === 'function') {
        (window as any).refreshLogAnalysis();
      }
    };

    (window as any).changeLogPage = (delta: number) => {
      // 更新分页状态
      (window as any).logAnalysisState = (window as any).logAnalysisState || {};
      let currentPage = (window as any).logAnalysisState.page || 1;
      currentPage += delta;
      if (currentPage < 1) currentPage = 1;
      (window as any).logAnalysisState.page = currentPage;
      
      if (typeof (window as any).refreshLogAnalysis === 'function') {
        (window as any).refreshLogAnalysis();
      }
    };

    (window as any).updateLogPath = (path: string) => {
      this.logAnalysisRenderer.setLogPath(path);
      // 同步状态
      (window as any).logAnalysisState = (window as any).logAnalysisState || {};
      (window as any).logAnalysisState.logPath = path;
      (window as any).logAnalysisState.page = 1; // 重置页码为1
      if (typeof (window as any).refreshLogAnalysis === 'function') {
        (window as any).refreshLogAnalysis();
      }
    };

    (window as any).updateJournalUnit = (unit: string) => {
      this.logAnalysisRenderer.setJournalUnit(unit);
      // 同步状态
      (window as any).logAnalysisState = (window as any).logAnalysisState || {};
      (window as any).logAnalysisState.journalUnit = unit;
      if (typeof (window as any).refreshLogAnalysis === 'function') {
        (window as any).refreshLogAnalysis();
      }
    };
  }

  /**
   * 刷新日志审计视图
   */
  public refreshLogAnalysis(): void {
    const container = document.querySelector('.log-analysis-container');
    if (container) {
      container.parentElement!.innerHTML = this.renderLogAnalysisPage();
    }
  }

  /**
   * 切换系统信息标签页
   */
  public switchSystemInfoTab(tabId: string): void {
    // 1. 更新 Tab 按钮状态
    const tabs = document.querySelectorAll('.system-info-tabs .tab-btn');
    tabs.forEach(tab => {
      if (tab.getAttribute('data-tab') === tabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // 2. 更新内容区域
    const contentContainer = document.getElementById('system-info-content');
    if (contentContainer) {
      contentContainer.innerHTML = this.renderSystemInfoTab(tabId);
      
      // 重新绑定过滤器事件（如果需要）
    }
  }

  /**
   * 切换设置标签页
   */
  public switchSettingsTab(tabId: string): void {
    // 1. 更新 Tab 按钮状态
    const tabs = document.querySelectorAll('.settings-tab');
    tabs.forEach(tab => {
      if (tab.getAttribute('data-tab') === tabId) {
        tab.classList.add('active');
        (tab as HTMLElement).style.color = 'var(--text-primary)';
        (tab as HTMLElement).style.borderBottom = '2px solid var(--accent-color)';
      } else {
        tab.classList.remove('active');
        (tab as HTMLElement).style.color = 'var(--text-secondary)';
        (tab as HTMLElement).style.borderBottom = '2px solid transparent';
      }
    });

    // 2. 更新内容区域
    const basicSettings = document.getElementById('basic-settings');
    const aiSettings = document.getElementById('ai-settings');

    if (basicSettings && aiSettings) {
      if (tabId === 'basic') {
        basicSettings.style.display = 'block';
        aiSettings.style.display = 'none';
      } else {
        basicSettings.style.display = 'none';
        aiSettings.style.display = 'block';
      }
    }
  }
  /**
   * 更新状态
   */
  updateState(newState: AppState): void {
    const oldTheme = this.state.theme;
    this.state = newState;

    console.log('🔄 ModernUIRenderer.updateState - 主题变化:', { oldTheme, newTheme: newState.theme });

    // 如果主题发生变化，重新渲染连接面板
    if (oldTheme !== newState.theme) {
      console.log('🎨 主题已变化，重新渲染连接面板');
      this.rerenderConnectionPanel();
    }
  }

  /**
   * 重新渲染连接面板
   */
  private rerenderConnectionPanel(): void {
    console.log('🔄 开始重新渲染连接面板，当前主题:', this.state.theme);

    const sidebar = document.querySelector('.modern-sidebar');
    if (!sidebar) {
      console.warn('⚠️ 未找到 .modern-sidebar');
      return;
    }

    // 查找连接卡片包装器
    let targetElement = sidebar.querySelector('.connection-card-wrapper');
    
    // 如果没找到 wrapper，尝试查找 card (兼容旧结构)
    if (!targetElement) {
        targetElement = sidebar.querySelector('.connection-card');
    }

    console.log('📍 找到连接卡片元素:', !!targetElement);

    if (targetElement) {
      // 创建临时容器
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.renderConnectionPanel();
      const newElement = tempDiv.firstElementChild;

      if (newElement) {
        console.log('✅ 替换连接卡片');
        // 替换旧元素
        targetElement.replaceWith(newElement);
      } else {
        console.warn('⚠️ 未能创建新卡片');
      }
    }
  }

  /**
   * 检测是否为 macOS
   */
  private isMacOS(): boolean {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  }

  /**
   * 更新系统信息标签页的计数
   */
  public updateSystemInfoTabs(detailedInfo: any): void {
    if (!detailedInfo) return;

    const counts = {
      processes: detailedInfo.processes?.length || 0,
      network: detailedInfo.networkDetails?.length || 0,
      services: detailedInfo.services?.length || 0,
      users: detailedInfo.users?.length || 0,
      autostart: detailedInfo.autostart?.length || 0,
      cron: detailedInfo.cronJobs?.length || 0,
      firewall: detailedInfo.firewallRules?.length || 0
    };

    const tabNames: Record<string, string> = {
      processes: '进程详情',
      network: '网络详情',
      services: '系统服务',
      users: '用户列表',
      autostart: '自启动',
      cron: '计划任务',
      firewall: '防火墙'
    };

    Object.keys(counts).forEach(key => {
      const tabBtn = document.querySelector(`.tab-btn[data-tab="${key}"]`);
      if (tabBtn) {
        const count = counts[key as keyof typeof counts];
        const name = tabNames[key] || key;
        const badgeHtml = count > 0 ? `<span class="count-badge">${count}</span>` : '';
        // 保持 active 类和其他属性不变，只更新内容
        tabBtn.innerHTML = `${name} ${badgeHtml}`;
      }
    });
  }

  /**
   * 渲染标题栏
   */
  renderTitleBar(): string {
    const isMac = this.isMacOS();

    return `
      <div class="modern-title-bar" data-tauri-drag-region>
        <div class="title-bar-left">
          <div class="app-logo">
            <div class="logo-icon" style="width: 30px; height: 30px; border-radius: var(--border-radius-lg); display: flex; align-items: center; justify-content: center; overflow: hidden;">
              <img src="/logo-32.png" alt="LovelyRes Logo" style="width: 100%; height: 100%; object-fit: contain;" />
            </div>
            <div class="app-info">
              <div class="app-name">Lovely<span class="luxe-text">Res</span></div>
              <div style="font-size: 10px; color: var(--text-secondary);">Linux Emergency Response</div>
            </div>
          </div>

        </div>

        <div class="title-bar-right">
          <!-- SSH终端按钮 -->
          ${this.renderSSHTerminalTitleButton()}

          ${!isMac ? `
          <div class="window-controls">
            <button class="control-button minimize-btn" title="最小化">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="5.5" width="8" height="1"/>
              </svg>
            </button>
            <button class="control-button maximize-btn" title="最大化">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1" fill="none"/>
              </svg>
            </button>
            <button class="control-button close-btn close" title="关闭">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * 渲染侧边栏
   */
  renderSidebar(): string {
    return `
      <div class="modern-sidebar mini-sidebar">
        <div class="sidebar-content">
          ${this.renderNavigationMenu()}
        </div>
        
        <!-- 底部设置按钮 -->
        <div class="sidebar-settings-container">
            ${this.renderSettingsMenu()}
            <button class="nav-item settings-btn" style="width: 100%; justify-content: center; margin-bottom: 8px;" onclick="window.toggleSettingsDropdown()" title="设置" data-tooltip="设置">
                <span class="nav-item-icon">
                    ${SettingTwo({ theme: 'outline', size: '18', fill: 'currentColor' })}
                </span>
            </button>
        </div>

        <!-- 底部连接面板 -->
        <div style="margin-top: 0;">
            ${this.renderConnectionPanel()}
        </div>
      </div>
    `;
  }

  /**
   * 渲染设置菜单
   */
  private renderSettingsMenu(): string {
    const currentTheme = this.state.theme;
    
    return `
      <div id="settings-dropdown-menu" class="settings-dropdown-menu">
        <div class="settings-group">
            <div class="settings-group-title">开发工具</div>
            <button class="settings-item" onclick="window.toggleDevTools(); window.hideSettingsDropdown();">
                <div class="settings-item-icon">
                    🐛
                </div>
                <span>Debug 工具</span>
            </button>
        </div>

        <div class="dropdown-divider"></div>

        <div class="settings-group">
            <div class="settings-group-title">主题设置</div>
            <div class="segmented-control theme-switcher" style="width: 100%; padding: 3px;">
                <button class="segmented-btn ${currentTheme === 'light' ? 'active' : ''}" style="flex: 1; padding: 6px;" data-theme-value="light" title="浅色">☀️ 浅色</button>
                <button class="segmented-btn ${currentTheme === 'dark' ? 'active' : ''}" style="flex: 1; padding: 6px;" data-theme-value="dark" title="深色">🌙 深色</button>
                <button class="segmented-btn ${currentTheme === 'sakura' ? 'active' : ''}" style="flex: 1; padding: 6px;" data-theme-value="sakura" title="粉色">🌸 粉色</button>
            </div>
        </div>

        <div class="dropdown-divider"></div>

        <div class="settings-group">
            <div class="settings-group-title">通用</div>
            <button class="settings-item" onclick="window.handleUserMenuAction('settings'); window.hideSettingsDropdown();">
                 <div class="settings-item-icon">
                    ${SettingConfig({ theme: 'outline', size: '16', fill: 'currentColor' })}
                 </div>
                 <span>基础设置</span>
            </button>
        </div>
      </div>
    `;
  }

  /**
   * 渲染连接面板
   */
  private renderConnectionPanel(): string {
    const isConnected = this.state.isConnected;
    
    // 从状态中获取服务器信息
    let mainText = '连接服务器';
    let subText = '点击选择';

    if (isConnected && this.state.serverInfo) {
      mainText = this.state.serverInfo.name || this.state.serverInfo.host;
      subText = `${this.state.serverInfo.host}`;
    }

    return `
      <div class="connection-card-wrapper">
        <!-- 向上弹出的菜单 -->
        <div id="connection-dropdown-menu" class="connection-dropdown-menu">
          ${this.renderConnectionDropdownContent()}
        </div>

        <div class="connection-card ${isConnected ? 'connected' : ''}" onclick="window.toggleConnectionDropdown()" data-tooltip="${mainText}">
          
          <!-- Icon Area -->
          <div class="connection-card-icon">
             ${isConnected 
               ? Connection({ theme: 'filled', size: '16', fill: 'currentColor' }) 
               : Plus({ theme: 'outline', size: '16', fill: 'currentColor' })
             }
             ${isConnected ? `<div class="connection-status-dot"></div>` : ''}
          </div>

          <!-- Text Info -->
          <div class="connection-card-info">
             <div class="connection-card-title" title="${mainText}">
                ${mainText}
             </div>
             <div class="connection-card-subtitle" title="${subText}">
                ${subText}
             </div>
          </div>
          
          <!-- Settings/Menu Icon -->
          <div class="connection-card-action">
             ${SettingConfig({ theme: 'outline', size: '16', fill: 'currentColor' })}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染导航菜单
   */
  private renderNavigationMenu(): string {
    const currentPage = this.state.currentPage;
    const menuItems = [
      {
        id: 'dashboard',
        icon: Dashboard({ theme: 'outline', size: '18', fill: 'currentColor' }),
        title: '仪表板',
        active: currentPage === 'dashboard'
      },
      {
        id: 'system-info',
        icon: ApplicationMenu({ theme: 'outline', size: '18', fill: 'currentColor' }),
        title: '系统信息',
        active: currentPage === 'system-info'
      },
      {
        id: 'remote-operations',
        icon: FolderOpen({ theme: 'outline', size: '18', fill: 'currentColor' }),
        title: 'SFTP文件',
        active: currentPage === 'remote-operations'
      },
      {
        id: 'docker',
        icon: Whale({ theme: 'outline', size: '18', fill: 'currentColor' }),
        title: 'Docker容器',
        active: currentPage === 'docker'
      },
      {
        id: 'emergency-commands',
        icon: Code({ theme: 'outline', size: '18', fill: 'currentColor' }),
        title: '命令执行',
        active: currentPage === 'emergency-commands'
      },
      {
        id: 'quick-detection',
        icon: Rocket({ theme: 'outline', size: '18', fill: 'currentColor' }),
        title: '快速检测',
        active: currentPage === 'quick-detection'
      },
      {
        id: 'kubernetes',
        icon: LinkCloud({ theme: 'outline', size: '18', fill: 'currentColor' }),
        title: 'K8s管理(不可用)',
        active: currentPage === 'kubernetes'
      },
      {
        id: 'database',
        icon: Data({ theme: 'outline', size: '18', fill: 'currentColor' }),
        title: '数据库管理',
        active: currentPage === 'database'
      },
      {
        id: 'log-analysis',
        icon: Log({ theme: 'outline', size: '18', fill: 'currentColor' }),
        title: '日志审计',
        active: currentPage === 'log-analysis'
      }
    ];

    return `
      <div class="nav-category">
        ${menuItems.map(item => {
            const isActive = item.active;
            
            return `
              <div class="nav-item ${isActive ? 'active' : ''}" data-nav-id="${item.id}" data-tooltip="${item.title}">
                
                ${isActive ? `<div class="nav-item-indicator"></div>` : ''}
                
                <span class="nav-item-icon">
                    ${item.icon}
                </span>
                <span class="nav-item-text">${item.title}</span>
              </div>
            `;
        }).join('')}
      </div>
    `;
  }

  /**
   * 渲染主工作区
   */
  renderMainWorkspace(): string {
    return `
      <div class="main-workspace">
        
        <!-- 多服务器会话 Tab 列表 (Horizontal) -->
        <div id="session-tabs-container"></div>

        <!-- 工作区内容 -->
        <div class="workspace-content">
          ${this.renderWorkspaceContent()}
        </div>
      </div>
    `;
  }



  /**
   * 渲染连接下拉菜单内容
   */
  renderConnectionDropdownContent(): string {
    const sshManager = (window as any).app?.sshManager;
    const connections = sshManager ? sshManager.getConnections() : [];
    // 优先使用 getActiveConnection，如果不行则遍历 connections 找一个已连接的
    const activeConnection = (sshManager ? sshManager.getActiveConnection() : null) 
        || connections.find((c: any) => c.isConnected);

    let menuItems = '';

    // 如果已连接，显示断开连接选项
    if (activeConnection) {
      const disconnectIcon = LinkInterrupt({ theme: 'outline', size: '16', fill: 'currentColor' });
      menuItems += `
        <div class="dropdown-item danger" onclick="window.disconnectServer('${activeConnection.id}'); window.hideConnectionDropdown();">
          <div class="dropdown-item-icon danger">
              ${disconnectIcon}
          </div>
          <div class="dropdown-item-content">
            <span class="dropdown-item-title">断开当前连接</span>
            <span class="dropdown-item-subtitle">${activeConnection.name}</span>
          </div>
        </div>
        <div class="dropdown-divider"></div>
      `;
    }

    // 添加新连接选项 - 放在顶部作为主要操作
    menuItems += `
      <div class="dropdown-item primary" onclick="window.showServerModal(); window.hideConnectionDropdown();">
        <div class="dropdown-item-icon primary">
            ${Plus({ theme: 'outline', size: '16', fill: 'currentColor' })}
        </div>
        <div class="dropdown-item-content">
            <span class="dropdown-item-title">添加新服务器</span>
            <span class="dropdown-item-subtitle">配置 SSH 连接</span>
        </div>
      </div>
      <div class="dropdown-divider"></div>
    `;

    if (connections.length > 0) {
      menuItems += `
        <div class="dropdown-section-title">
          <span>快速连接</span>
          <span class="count-badge">${connections.length}</span>
        </div>
        <div class="dropdown-scroll-area">
      `;

      connections.forEach((conn: any) => {
        const isConnected = conn.isConnected;
        
        menuItems += `
          <div class="dropdown-item ${isConnected ? 'active' : ''}" onclick="window.connectServer('${conn.id}'); window.hideConnectionDropdown();">
            
            <div class="dropdown-item-icon ${isConnected ? 'success' : 'default'}">
                ${isConnected 
                    ? CheckOne({ theme: 'filled', size: '16', fill: 'currentColor' }) 
                    : System({ theme: 'outline', size: '16', fill: 'currentColor' })
                }
                ${isConnected ? `<div class="status-dot"></div>` : ''}
            </div>

            <div class="dropdown-item-content">
              <span class="dropdown-item-title">${conn.name}</span>
              <span class="dropdown-item-subtitle">${conn.username}@${conn.host}</span>
            </div>
            
            ${isConnected ? `
                <div class="status-badge">运行中</div>
            ` : ''}
          </div>
        `;
      });
      
      menuItems += `</div>`; // Close scroll container
    } else {
      menuItems += `
        <div class="dropdown-empty-state">
          <div class="empty-icon">
            ${Connection({ theme: 'outline', size: '24', fill: 'currentColor' })}
          </div>
          <div class="empty-text">暂无已保存的服务器</div>
        </div>
      `;
    }

    return menuItems;
  }



  /**
   * 渲染工作区内容
   */
  private renderWorkspaceContent(): string {
    if (this.state.loading) {
      return this.renderLoadingState();
    }

    // 设置页面不需要连接服务器，可以在未连接时访问
    if (this.state.currentPage === 'settings') {
      return this.renderSettingsPage();
    }

    if (!this.state.isConnected) {
      return this.renderConnectionPrompt();
    }

    // 根据当前页面渲染不同内容
    switch (this.state.currentPage as any) {
      case 'system-info':
        return this.renderSystemInfo();
      case 'ssh-terminal':
        // SSH终端在独立窗口中打开，这里显示提示信息
        return this.renderSSHTerminalRedirect();
      case 'remote-operations':
        return this.renderRemoteOperationsPage();
      case 'docker':
        return this.renderDockerPage();
      case 'emergency-commands':
        return this.renderEmergencyCommandsPage();
      case 'quick-detection':
        return this.renderQuickDetectionPage();
      case 'kubernetes':
        return this.renderKubernetesPage();
      case 'database':
        return '<div id="database-page-container" style="height: 100%; width: 100%;"></div>';
      case 'log-analysis':
        return this.renderLogAnalysisPage();
      case 'settings':
        return this.renderSettingsPage();
      case 'dashboard':
      default:
        return this.renderDashboard();
    }
  }

  /**
   * 渲染系统信息页面
   */
  private renderSystemInfo(): string {
    const detailedInfo = this.state.serverInfo?.detailedInfo;
    const counts = {
      processes: detailedInfo?.processes?.length || 0,
      network: detailedInfo?.networkDetails?.length || 0,
      services: detailedInfo?.services?.length || 0,
      users: detailedInfo?.users?.length || 0,
      autostart: detailedInfo?.autostart?.length || 0,
      cron: detailedInfo?.cronJobs?.length || 0,
      firewall: detailedInfo?.firewallRules?.length || 0
    };

    // 读取折叠状态
    const isCollapsed = localStorage.getItem('system-info-header-collapsed') === 'true';
    const collapsedClass = isCollapsed ? 'collapsed' : '';
    const contentExpandedClass = isCollapsed ? 'expanded' : '';
    const toggleIcon = isCollapsed 
      ? Right({ theme: 'outline', size: '16', fill: 'currentColor' })
      : Left({ theme: 'outline', size: '16', fill: 'currentColor' });

    return `
      <div class="system-info-container">
        <div class="system-info-header ${collapsedClass}">
          <div class="header-toggle-btn" onclick="window.toggleSystemInfoHeader()" title="切换菜单">
            <span class="header-toggle-icon">${toggleIcon}</span>
          </div>
          
          <div class="system-info-menu-title">
            <span>系统概览</span>
          </div>

          <div class="system-info-tabs">
            <button class="tab-btn active" data-tab="processes" onclick="window.switchSystemInfoTab('processes')">
              <span class="tab-icon">${List({ theme: 'outline', size: '16', fill: 'currentColor' })}</span>
              <span class="tab-label">进程详情</span>
              ${counts.processes > 0 ? `<span class="count-badge">${counts.processes}</span>` : ''}
            </button>
            <button class="tab-btn" data-tab="network" onclick="window.switchSystemInfoTab('network')">
              <span class="tab-icon">${Earth({ theme: 'outline', size: '16', fill: 'currentColor' })}</span>
              <span class="tab-label">网络详情</span>
              ${counts.network > 0 ? `<span class="count-badge">${counts.network}</span>` : ''}
            </button>
            <button class="tab-btn" data-tab="services" onclick="window.switchSystemInfoTab('services')">
              <span class="tab-icon">${System({ theme: 'outline', size: '16', fill: 'currentColor' })}</span>
              <span class="tab-label">系统服务</span>
              ${counts.services > 0 ? `<span class="count-badge">${counts.services}</span>` : ''}
            </button>
            <button class="tab-btn" data-tab="users" onclick="window.switchSystemInfoTab('users')">
              <span class="tab-icon">${User({ theme: 'outline', size: '16', fill: 'currentColor' })}</span>
              <span class="tab-label">用户列表</span>
              ${counts.users > 0 ? `<span class="count-badge">${counts.users}</span>` : ''}
            </button>
            <button class="tab-btn" data-tab="autostart" onclick="window.switchSystemInfoTab('autostart')">
              <span class="tab-icon">${Rocket({ theme: 'outline', size: '16', fill: 'currentColor' })}</span>
              <span class="tab-label">自启动</span>
              ${counts.autostart > 0 ? `<span class="count-badge">${counts.autostart}</span>` : ''}
            </button>
            <button class="tab-btn" data-tab="cron" onclick="window.switchSystemInfoTab('cron')">
              <span class="tab-icon">${Time({ theme: 'outline', size: '16', fill: 'currentColor' })}</span>
              <span class="tab-label">计划任务</span>
              ${counts.cron > 0 ? `<span class="count-badge">${counts.cron}</span>` : ''}
            </button>
            <button class="tab-btn" data-tab="firewall" onclick="window.switchSystemInfoTab('firewall')">
              <span class="tab-icon">${Shield({ theme: 'outline', size: '16', fill: 'currentColor' })}</span>
              <span class="tab-label">防火墙</span>
              ${counts.firewall > 0 ? `<span class="count-badge">${counts.firewall}</span>` : ''}
            </button>
          </div>
          
          <div class="system-info-actions">
            <button class="refresh-btn" onclick="window.refreshAllSystemInfo()" title="刷新所有系统信息">
              ${Refresh({ theme: 'outline', size: '16', fill: 'currentColor' })}
              <span>刷新数据</span>
            </button>
          </div>
        </div>

        <div class="system-info-content ${contentExpandedClass}" id="system-info-content">
          ${this.renderSystemInfoTab('processes')}
        </div>
      </div>
    `;
  }

  /**
   * 渲染系统信息标签页内容
   */
  private renderSystemInfoTab(tab: string): string {
    // 这里暂时返回占位内容，实际数据需要从系统信息管理器获取
    switch (tab) {
      case 'processes':
        return this.renderProcessesTable();
      case 'network':
        return this.renderNetworkTable();
      case 'services':
        return this.renderServicesTable();
      case 'users':
        return this.renderUsersTable();
      case 'autostart':
        return this.renderAutostartTable();
      case 'cron':
        return this.renderCronTable();
      case 'firewall':
        return this.renderFirewallTable();
      default:
        return '<p>选择一个标签页查看详细信息</p>';
    }
  }

  /**
   * 渲染进程表格
   */
  private renderProcessesTable(): string {
    return `
      <div class="info-table-container">
        <div class="table-header-toolbar">
          <span class="table-title">
            ${List({ theme: 'outline', size: '20', fill: 'currentColor' })}
            运行中的进程
          </span>
          <div class="search-container">
            <select
              id="processes-filter"
              class="system-select"
              style="width: 100px;"
              onchange="window.filterTableByCategory('processes', this.value)"
            >
              <option value="">所有用户</option>
            </select>
            <select
              id="processes-stat-filter"
              class="system-select"
              style="width: 100px;"
              onchange="window.filterTableByStatus('processes', this.value)"
            >
              <option value="">所有状态</option>
              <option value="R">运行中 (R)</option>
              <option value="S">休眠 (S)</option>
              <option value="D">不可中断 (D)</option>
              <option value="Z">僵尸 (Z)</option>
              <option value="T">停止 (T)</option>
            </select>
            <input
              type="text"
              id="processes-search"
              class="system-input"
              placeholder="搜索进程..."
              style="width: 120px;"
              oninput="window.filterTable('processes', this.value)"
            />
            <button
              class="system-btn"
              onclick="document.getElementById('processes-search').value = ''; document.getElementById('processes-filter').value = ''; document.getElementById('processes-stat-filter').value = ''; window.filterTable('processes', '');"
            >清除</button>
          </div>
        </div>
        <div class="table-content">
          <table class="system-table">
            <thead>
              <tr>
                <th>PID</th>
                <th>用户</th>
                <th>状态</th>
                <th>CPU%</th>
                <th>内存%</th>
                <th>命令</th>
              </tr>
            </thead>
            <tbody id="processes-table-body">
              <tr>
                <td colspan="6" style="padding: var(--spacing-lg); text-align: center; color: var(--text-secondary);">
                  正在加载进程信息...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 渲染网络表格
   */
  private renderNetworkTable(): string {
    return `
      <div class="info-table-container">
        <div class="table-header-toolbar">
          <span class="table-title">
            ${Earth({ theme: 'outline', size: '20', fill: 'currentColor' })}
            网络连接详情
          </span>
          <div class="search-container">
            <select
              id="network-filter"
              class="system-select"
              style="width: 120px;"
              onchange="window.filterTableByCategory('network', this.value)"
            >
              <option value="">所有状态</option>
              <option value="LISTEN">LISTEN</option>
              <option value="ESTABLISHED">ESTABLISHED</option>
              <option value="TIME_WAIT">TIME_WAIT</option>
              <option value="CLOSE_WAIT">CLOSE_WAIT</option>
              <option value="SYN_SENT">SYN_SENT</option>
              <option value="SYN_RECV">SYN_RECV</option>
              <option value="FIN_WAIT1">FIN_WAIT1</option>
              <option value="FIN_WAIT2">FIN_WAIT2</option>
              <option value="CLOSED">CLOSED</option>
            </select>
            <input
              type="text"
              id="network-search"
              class="system-input"
              placeholder="搜索连接..."
              style="width: 150px;"
              oninput="window.filterTable('network', this.value)"
            />
            <button
              class="system-btn"
              onclick="document.getElementById('network-search').value = ''; document.getElementById('network-filter').value = ''; window.filterTable('network', '');"
            >清除</button>
          </div>
        </div>
        <div class="table-content">
          <table class="system-table">
            <thead>
              <tr>
                <th>协议</th>
                <th>本地地址</th>
                <th>远程地址</th>
                <th>状态</th>
                <th>PID</th>
                <th>进程</th>
              </tr>
            </thead>
            <tbody id="network-table-body">
              <tr>
                <td colspan="6" style="padding: var(--spacing-lg); text-align: center; color: var(--text-secondary);">
                  正在加载网络连接信息...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 渲染系统服务表格
   */
  private renderServicesTable(): string {
    return `
      <div class="info-table-container">
        <div class="table-header-toolbar">
          <span class="table-title">
            ${SettingTwo({ theme: 'outline', size: '20', fill: 'currentColor' })}
            系统服务状态
          </span>
          <div class="search-container">
            <select
              id="services-filter"
              class="system-select"
              style="width: 100px;"
              onchange="window.filterTableByCategory('services', this.value)"
            >
              <option value="">所有状态</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="failed">failed</option>
              <option value="running">running</option>
              <option value="stopped">stopped</option>
            </select>
            <input
              type="text"
              id="services-search"
              class="system-input"
              placeholder="搜索服务..."
              style="width: 120px;"
              oninput="window.filterTable('services', this.value)"
            />
            <button
              class="system-btn"
              onclick="document.getElementById('services-search').value = ''; document.getElementById('services-filter').value = ''; window.filterTable('services', '');"
            >清除</button>
          </div>
        </div>
        <div class="table-content">
          <table class="system-table">
            <thead>
              <tr>
                <th>服务名</th>
                <th>状态</th>
                <th>启用状态</th>
                <th>描述</th>
              </tr>
            </thead>
            <tbody id="services-table-body">
              <tr>
                <td colspan="4" style="padding: var(--spacing-lg); text-align: center; color: var(--text-secondary);">
                  正在加载系统服务信息...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 渲染用户列表表格
   */
  private renderUsersTable(): string {
    return `
      <div class="info-table-container">
        <div class="table-header-toolbar">
          <span class="table-title">
            ${Peoples({ theme: 'outline', size: '20', fill: 'currentColor' })}
            系统用户列表
          </span>
          <div class="search-container">
            <select
              id="users-filter"
              class="system-select"
              style="width: 120px;"
              onchange="window.filterTableByCategory('users', this.value)"
            >
              <option value="">所有Shell</option>
              <option value="/bin/bash">/bin/bash</option>
              <option value="/bin/sh">/bin/sh</option>
              <option value="/usr/sbin/nologin">/usr/sbin/nologin</option>
              <option value="/bin/false">/bin/false</option>
              <option value="/usr/bin/zsh">/usr/bin/zsh</option>
              <option value="/bin/dash">/bin/dash</option>
            </select>
            <input
              type="text"
              id="users-search"
              class="system-input"
              placeholder="搜索用户..."
              style="width: 100px;"
              oninput="window.filterTable('users', this.value)"
            />
            <button
              class="system-btn"
              onclick="document.getElementById('users-search').value = ''; document.getElementById('users-filter').value = ''; window.filterTable('users', '');"
            >清除</button>
          </div>
        </div>
        <div class="table-content">
          <table class="system-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>UID</th>
                <th>GID</th>
                <th>主目录</th>
                <th>Shell</th>
              </tr>
            </thead>
            <tbody id="users-table-body">
              <tr>
                <td colspan="5" style="padding: var(--spacing-lg); text-align: center; color: var(--text-secondary);">
                  正在加载用户信息...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 渲染自启动服务表格
   */
  private renderAutostartTable(): string {
    return `
      <div class="info-table-container">
        <div class="table-header-toolbar">
          <span class="table-title">
            ${Rocket({ theme: 'outline', size: '20', fill: 'currentColor' })}
            自启动服务
          </span>
          <div class="search-container">
            <input
              type="text"
              id="autostart-search"
              class="system-input"
              placeholder="搜索服务..."
              style="width: 150px;"
              oninput="window.filterTable('autostart', this.value)"
            />
            <button
              class="system-btn"
              onclick="document.getElementById('autostart-search').value = ''; window.filterTable('autostart', '');"
            >清除</button>
          </div>
        </div>
        <div class="table-content">
          <table class="system-table">
            <thead>
              <tr>
                <th>服务名</th>
                <th>命令</th>
                <th>状态</th>
                <th>类型</th>
              </tr>
            </thead>
            <tbody id="autostart-table-body">
              <tr>
                <td colspan="4" style="padding: var(--spacing-lg); text-align: center; color: var(--text-secondary);">
                  正在加载自启动服务信息...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 渲染计划任务表格
   */
  private renderCronTable(): string {
    return `
      <div class="info-table-container">
        <div class="table-header-toolbar">
          <span class="table-title">
            ${Calendar({ theme: 'outline', size: '20', fill: 'currentColor' })}
            计划任务 (Cron Jobs)
          </span>
          <div class="search-container">
            <input
              type="text"
              id="cron-search"
              class="system-input"
              placeholder="搜索任务..."
              style="width: 150px;"
              oninput="window.filterTable('cron', this.value)"
            />
            <button
              class="system-btn"
              onclick="document.getElementById('cron-search').value = ''; window.filterTable('cron', '');"
            >清除</button>
          </div>
        </div>
        <div class="table-content">
          <table class="system-table">
            <thead>
              <tr>
                <th>用户</th>
                <th>时间表</th>
                <th>命令</th>
              </tr>
            </thead>
            <tbody id="cron-table-body">
              <tr>
                <td colspan="3" style="padding: var(--spacing-lg); text-align: center; color: var(--text-secondary);">
                  正在加载计划任务信息...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 渲染防火墙表格
   */
  private renderFirewallTable(): string {
    return `
      <div class="info-table-container">
        <div class="table-header-toolbar">
          <span class="table-title">
            ${Fire({ theme: 'outline', size: '20', fill: 'currentColor' })}
            防火墙规则
          </span>
          <div class="search-container">
            <select
              id="firewall-type-filter"
              class="system-select"
              style="width: 100px;"
              onchange="window.filterTableByCategory('firewall', this.value)"
            >
              <option value="">所有规则</option>
              <option value="iptables">iptables</option>
              <option value="firewalld">firewalld</option>
              <option value="ufw">UFW</option>
            </select>
            <input
              type="text"
              id="firewall-search"
              class="system-input"
              placeholder="搜索规则..."
              style="width: 150px;"
              oninput="window.filterTable('firewall', this.value)"
            />
            <button
              class="system-btn"
              onclick="document.getElementById('firewall-search').value = ''; document.getElementById('firewall-type-filter').value = ''; window.filterTable('firewall', '');"
            >清除</button>
          </div>
        </div>
        <div class="table-content">
          <table class="system-table">
            <thead>
              <tr>
                <th>链</th>
                <th>目标</th>
                <th>协议</th>
                <th>源地址</th>
                <th>目标地址</th>
                <th>选项</th>
              </tr>
            </thead>
            <tbody id="firewall-table-body">
              <tr>
                <td colspan="6" style="padding: var(--spacing-lg); text-align: center; color: var(--text-secondary);">
                  正在加载防火墙规则信息...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 渲染加载状态
   */
  /**
   * 渲染加载状态
   */
  private renderLoadingState(): string {
    const steps = [
      '建立 TCP 连接到服务器...',
      '执行 SSH 握手协议...',
      '验证用户凭据...',
      '创建 SSH 通道...',
      '正在获取系统信息...'
    ];

    const stepsHtml = steps.map((step, index) => `
          <div class="loading-step-item" style="animation-delay: ${index * 0.8}s;">
            <div class="step-indicator">
              <div class="step-dot"></div>
              <div class="step-line"></div>
            </div>
            <span class="step-label">${step}</span>
          </div>
        `).join('');

    return `
      <div class="workspace-loading-overlay">
        <div class="loading-container">
          <div class="loading-visual-area">
            <div class="server-node local">
              <div class="node-icon">
                ${System({ theme: 'filled', size: '24', fill: 'currentColor' })}
              </div>
              <div class="node-pulse"></div>
            </div>
            
            <div class="connection-stream">
              <div class="stream-line"></div>
              <div class="stream-particles"></div>
            </div>

            <div class="server-node remote">
              <div class="node-icon">
                ${LinkCloud({ theme: 'filled', size: '24', fill: 'currentColor' })}
              </div>
              <div class="node-pulse"></div>
            </div>
          </div>

          <div class="loading-status-area">
            <h3 class="loading-main-text">正在建立安全连接</h3>
            <p class="loading-sub-text">LovelyRes 正在初始化远程环境</p>
            
            <div class="loading-steps-list">
              ${stepsHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染服务器管理模态框
   */
  renderServerModal(): string {
    return `
      <div id="server-modal" class="modal-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.2s ease;
      ">
        <div class="modal-content modern-modal-content">
          <div class="modern-modal-header">
            <div class="header-left">
                <div class="header-icon-box">
                    ${LinkCloud({ theme: 'filled', size: '18', fill: 'currentColor' })}
                </div>
                <div class="header-title-group">
                    <h2>服务器管理</h2>
                </div>
            </div>
            <button class="close-modal-btn" onclick="window.hideServerModal()" title="关闭">
              ${CloseOne({ theme: 'outline', size: '18', fill: 'currentColor' })}
            </button>
          </div>

          <div class="modal-body modern-modal-body">
            <div id="server-list-container" class="server-list-container">
                <div class="manager-toolbar">
                  <div class="search-filter-area">
                    <div class="modern-search-input-wrapper">
                      <span class="search-icon">
                         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                      </span>
                      <input type="text" placeholder="搜索服务器..." class="modern-search-input" oninput="window.filterServerList(this.value)">
                    </div>
                  </div>

                  <div class="toolbar-actions">
                      <button class="icon-btn" onclick="window.refreshServerList()" title="刷新列表">
                        ${Refresh({ theme: 'outline', size: '16', fill: 'currentColor' })}
                      </button>
                      <button class="modern-btn primary compact" onclick="window.showAddServerForm()">
                        ${Plus({ theme: 'outline', size: '14', fill: 'currentColor' })}
                        <span>添加服务器</span>
                      </button>
                  </div>
                </div>

                <div id="server-list" class="server-grid-modern">
                  ${this.renderServerList()}
                </div>
            </div>

            <div id="add-server-form" class="add-server-form" style="display: none; padding: var(--spacing-xl);">
              ${this.renderAddServerForm()}
            </div>
          </div>
        </div>
      </div>
    `;
  }


  /**
   * 渲染服务器列表
   */
  private renderServerList(): string {
    // 从SSH管理器获取真实的服务器数据
    const sshManager = (window as any).app?.sshManager;
    const servers = sshManager ? sshManager.getConnections().map((conn: any) => ({
      id: conn.id,
      name: conn.name,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      authType: conn.authType,
      status: conn.isConnected ? 'connected' : 'disconnected',
      accounts: conn.accounts || [],
      accountCount: conn.accounts ? conn.accounts.length : 0
    })) : [];

    if (servers.length === 0) {
      return `
        <div class="empty-state" style="
          grid-column: 1 / -1;
          text-align: center;
          padding: 60px 20px;
          color: var(--text-secondary);
          background: var(--bg-tertiary);
          border-radius: var(--border-radius-lg);
          border: 1px dashed var(--border-color);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: var(--bg-secondary);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: var(--spacing-md);
            color: var(--text-tertiary);
          ">
             ${LinkCloud({ theme: 'filled', size: '32', fill: 'currentColor' })}
          </div>
          <p style="margin: 0 0 8px 0; font-weight: 600; color: var(--text-primary); font-size: 14px;">暂无服务器配置</p>
          <p style="font-size: 12px; margin: 0; max-width: 200px; line-height: 1.5;">
            点击右上角 "添加服务器" 按钮，配置您的第一个 Linux 服务器连接
          </p>
        </div>
      `;
    }

    return servers.map((server: any) => `
      <div class="server-card ${server.status}" style="
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-lg);
        padding: var(--spacing-md);
        transition: all 0.2s;
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 12px;
      " onmouseover="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='var(--shadow-md)'; this.style.transform='translateY(-2px)';" 
         onmouseout="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'; this.style.transform='translateY(0)';">
        
        ${server.status === 'connected' ? `
            <div style="
                position: absolute; 
                top: 0; 
                right: 0; 
                padding: 4px 10px; 
                background: rgba(34, 197, 94, 0.1); 
                color: var(--success-color); 
                font-size: 10px; 
                border-bottom-left-radius: 10px; 
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 4px;
            ">
                <span style="width: 6px; height: 6px; background: currentColor; border-radius: 50%; display: inline-block;"></span>
                已连接
            </div>
        ` : ''}

        <div style="display: flex; align-items: flex-start; gap: 12px;">
            <div style="
                width: 42px;
                height: 42px;
                border-radius: 10px;
                background: ${server.status === 'connected' ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-tertiary)'};
                color: ${server.status === 'connected' ? 'var(--success-color)' : 'var(--text-tertiary)'};
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: all 0.3s;
            ">
                 ${server.status === 'connected' 
                    ? LinkInterrupt({ theme: 'filled', size: '22', fill: 'currentColor' }) 
                    : System({ theme: 'filled', size: '22', fill: 'currentColor' })}
            </div>
            <div style="flex: 1; min-width: 0; padding-right: 60px;">
                <div style="font-weight: 600; color: var(--text-primary); font-size: 14px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${server.name}">
                    ${server.name}
                </div>
                <div style="font-size: 12px; color: var(--text-secondary); font-family: monospace; display: flex; align-items: center; gap: 6px;">
                    <span style="opacity: 0.8;">${server.username}@${server.host}:${server.port}</span>
                </div>
            </div>
        </div>

        <div style="
            display: flex; 
            align-items: center; 
            gap: 8px; 
            padding-top: 12px; 
            border-top: 1px solid var(--border-color-light);
            margin-top: auto;
        ">
            <div style="flex: 1; display: flex; gap: 6px; align-items: center;">
                <span style="
                    padding: 2px 8px;
                    background: var(--bg-tertiary);
                    color: var(--text-secondary);
                    border-radius: 4px;
                    font-size: 10px;
                    border: 1px solid var(--border-color);
                    display: flex;
                    align-items: center;
                    gap: 4px;
                ">
                    ${server.authType === 'password' ? Key({ theme: 'outline', size: '10', fill: 'currentColor' }) : Shield({ theme: 'outline', size: '10', fill: 'currentColor' })}
                    ${server.authType === 'password' ? '密码' : '密钥'}
                </span>
                ${server.accountCount > 0 ? `
                <span style="
                    padding: 2px 8px;
                    background: rgba(168, 85, 247, 0.1);
                    color: rgb(168, 85, 247);
                    border-radius: 4px;
                    font-size: 10px;
                    border: 1px solid rgba(168, 85, 247, 0.2);
                    display: flex;
                    align-items: center;
                    gap: 4px;
                ">
                    ${Peoples({ theme: 'outline', size: '10', fill: 'currentColor' })}
                    ${server.accountCount}
                </span>
                ` : ''}
            </div>

            <div style="display: flex; gap: 6px;">
                <button class="modern-btn ${server.status === 'connected' ? 'danger' : 'primary'}" style="
                    padding: 4px 12px; 
                    font-size: 11px; 
                    height: 28px;
                    border-radius: 6px;
                " onclick="window.${server.status === 'connected' ? 'disconnectServer' : 'connectServer'}('${server.id}')">
                    ${server.status === 'connected' ? '断开' : '连接'}
                </button>
                
                <button class="modern-btn secondary icon-only" style="
                    width: 28px; 
                    height: 28px; 
                    padding: 0; 
                    border-radius: 6px;
                    background: var(--bg-tertiary);
                " onclick="window.editServer('${server.id}')" title="编辑配置">
                    ${SettingConfig({ theme: 'outline', size: '14', fill: 'currentColor' })}
                </button>
                
                <button class="modern-btn secondary icon-only" style="
                    width: 28px; 
                    height: 28px; 
                    padding: 0; 
                    color: var(--error-color);
                    border-radius: 6px;
                    background: rgba(239, 68, 68, 0.1);
                    border-color: transparent;
                " onclick="window.deleteServer('${server.id}')" title="删除服务器"
                  onmouseover="this.style.background='var(--error-color)'; this.style.color='white';"
                  onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'; this.style.color='var(--error-color)';">
                    ${CloseOne({ theme: 'outline', size: '14', fill: 'currentColor' })}
                </button>
            </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * 渲染添加服务器表单
   */
  private renderAddServerForm(): string {
    return `
      <div class="form-container" style="
        background: var(--bg-secondary);
        border-radius: var(--border-radius-lg);
      ">
        <style>
        .auth-radio-label {
          flex: 1;
          cursor: pointer;
          text-align: center;
          padding: 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: var(--text-secondary);
          border: 1px solid transparent;
        }
        .auth-radio-input:checked + .auth-radio-label {
          background: var(--bg-primary);
          color: var(--primary-color);
          box-shadow: var(--shadow-sm);
          border-color: var(--border-color);
        }
        </style>
        <div class="form-header" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--spacing-xl);
          padding-bottom: var(--spacing-md);
          border-bottom: 1px dashed var(--border-color);
        ">
          <div>
            <h3 style="margin: 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">
              添加新服务器
            </h3>
            <p style="margin: 4px 0 0; font-size: 12px; color: var(--text-secondary);">配置远程 Linux 服务器的连接信息</p>
          </div>
          <button class="cancel-add-btn" style="
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            border-radius: var(--border-radius);
            transition: all 0.2s;
          " onclick="window.hideAddServerForm()" onmouseover="this.style.background='var(--bg-tertiary)'; this.style.color='var(--text-primary)'" onmouseout="this.style.background='transparent'; this.style.color='var(--text-secondary)'">
            ${CloseOne({ theme: 'outline', size: '14', fill: 'currentColor' })} 取消
          </button>
        </div>

        <form id="add-server-form-element" class="server-form" onsubmit="event.preventDefault(); window.handleServerFormSubmit(event)">
          
          <!-- 基础信息 -->
          <div style="margin-bottom: var(--spacing-xl);">
            <h4 style="font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-md); font-weight: 600;">基础信息</h4>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-lg); margin-bottom: var(--spacing-md);">
                <div class="form-group">
                  <label style="display: block; font-size: 12px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px;">服务器名称</label>
                  <div style="position: relative;">
                    <input type="text" name="name" placeholder="例如：生产服务器" style="
                      width: 100%;
                      padding: 10px 12px 10px 36px;
                      border: 1px solid var(--border-color);
                      border-radius: var(--border-radius);
                      background: var(--bg-primary);
                      color: var(--text-primary);
                      font-size: 13px;
                      transition: all 0.2s;
                    " required onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 2px var(--primary-color-alpha-10)'" onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                    <div style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary);">
                        ${LinkCloud({ theme: 'outline', size: '14', fill: 'currentColor' })}
                    </div>
                  </div>
                </div>
                
                <div class="form-group">
                  <label style="display: block; font-size: 12px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px;">主机地址 (IP/域名)</label>
                  <div style="position: relative;">
                    <input type="text" name="host" placeholder="192.168.1.100" style="
                      width: 100%;
                      padding: 10px 12px 10px 36px;
                      border: 1px solid var(--border-color);
                      border-radius: var(--border-radius);
                      background: var(--bg-primary);
                      color: var(--text-primary);
                      font-size: 13px;
                      transition: all 0.2s;
                    " required onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 2px var(--primary-color-alpha-10)'" onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                     <div style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary);">
                        ${Earth({ theme: 'outline', size: '14', fill: 'currentColor' })}
                    </div>
                  </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 120px 1fr; gap: var(--spacing-lg);">
                <div class="form-group">
                  <label style="display: block; font-size: 12px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px;">SSH 端口</label>
                  <div style="position: relative;">
                    <input type="number" name="port" value="22" style="
                      width: 100%;
                      padding: 10px 12px 10px 36px;
                      border: 1px solid var(--border-color);
                      border-radius: var(--border-radius);
                      background: var(--bg-primary);
                      color: var(--text-primary);
                      font-size: 13px;
                      transition: all 0.2s;
                    " required onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 2px var(--primary-color-alpha-10)'" onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                    <div style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary);">
                        ${NetworkTree({ theme: 'outline', size: '14', fill: 'currentColor' })}
                    </div>
                  </div>
                </div>
                <div class="form-group">
                  <label style="display: block; font-size: 12px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px;">用户名</label>
                  <div style="position: relative;">
                    <input type="text" name="username" placeholder="root" style="
                      width: 100%;
                      padding: 10px 12px 10px 36px;
                      border: 1px solid var(--border-color);
                      border-radius: var(--border-radius);
                      background: var(--bg-primary);
                      color: var(--text-primary);
                      font-size: 13px;
                      transition: all 0.2s;
                    " required onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 2px var(--primary-color-alpha-10)'" onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                    <div style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary);">
                        ${User({ theme: 'outline', size: '14', fill: 'currentColor' })}
                    </div>
                  </div>
                </div>
            </div>
          </div>

          <!-- 认证信息 -->
          <div style="margin-bottom: var(--spacing-xl);">
            <h4 style="font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-md); font-weight: 600;">认证方式</h4>
            
            <div class="form-group" style="margin-bottom: var(--spacing-md);">
                <div style="
                    display: flex; 
                    background: var(--bg-tertiary); 
                    padding: 4px; 
                    border-radius: var(--border-radius); 
                    border: 1px solid var(--border-color);
                    gap: 4px;
                ">
                    <input type="radio" id="auth-type-password" name="authType" value="password" checked class="auth-radio-input" style="display: none;" onchange="window.toggleAuthFields(this.value)">
                    <label for="auth-type-password" class="auth-radio-label">
                        ${Key({ theme: 'outline', size: '14', fill: 'currentColor' })} 密码认证
                    </label>
                    
                    <input type="radio" id="auth-type-key" name="authType" value="key" class="auth-radio-input" style="display: none;" onchange="window.toggleAuthFields(this.value)">
                    <label for="auth-type-key" class="auth-radio-label">
                        ${Shield({ theme: 'outline', size: '14', fill: 'currentColor' })} SSH 密钥
                    </label>
                </div>
            </div>

            <div id="password-auth" class="auth-fields" style="animation: fadeIn 0.3s ease;">
              <div class="form-group">
                <label style="display: block; font-size: 12px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px;">服务器密码</label>
                <div style="position: relative;">
                    <input type="password" name="password" placeholder="请输入服务器密码" style="
                      width: 100%;
                      padding: 10px 12px 10px 36px;
                      border: 1px solid var(--border-color);
                      border-radius: var(--border-radius);
                      background: var(--bg-primary);
                      color: var(--text-primary);
                      font-size: 13px;
                      transition: all 0.2s;
                    " onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 2px var(--primary-color-alpha-10)'" onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                    <div style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary);">
                        ${Lock({ theme: 'outline', size: '14', fill: 'currentColor' })}
                    </div>
                </div>
              </div>
            </div>

            <div id="key-auth" class="auth-fields" style="display: none; animation: fadeIn 0.3s ease;">
              <div class="form-group" style="margin-bottom: var(--spacing-md);">
                <label style="display: block; font-size: 12px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px;">私钥文件路径</label>
                <div style="display: flex; gap: 8px;">
                    <div style="position: relative; flex: 1;">
                        <input type="text" name="keyPath" placeholder="/Users/username/.ssh/id_rsa" style="
                          width: 100%;
                          padding: 10px 12px 10px 36px;
                          border: 1px solid var(--border-color);
                          border-radius: var(--border-radius);
                          background: var(--bg-primary);
                          color: var(--text-primary);
                          font-size: 13px;
                          transition: all 0.2s;
                        " onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 2px var(--primary-color-alpha-10)'" onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                        <div style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary);">
                            ${FileText({ theme: 'outline', size: '14', fill: 'currentColor' })}
                        </div>
                    </div>
                    <button type="button" class="modern-btn secondary" style="padding: 0 12px;" onclick="window.selectPrivateKeyFile()" title="选择文件">
                        ${FolderOpen({ theme: 'outline', size: '16', fill: 'currentColor' })}
                    </button>
                </div>
              </div>
              <div class="form-group">
                <label style="display: block; font-size: 12px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px;">密钥密码 (可选)</label>
                <div style="position: relative;">
                    <input type="password" name="keyPassphrase" placeholder="如果私钥设置了密码" style="
                      width: 100%;
                      padding: 10px 12px 10px 36px;
                      border: 1px solid var(--border-color);
                      border-radius: var(--border-radius);
                      background: var(--bg-primary);
                      color: var(--text-primary);
                      font-size: 13px;
                      transition: all 0.2s;
                    " onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 2px var(--primary-color-alpha-10)'" onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                    <div style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary);">
                        ${Lock({ theme: 'outline', size: '14', fill: 'currentColor' })}
                    </div>
                </div>
              </div>
            </div>
          </div>


            <div id="auth-key-passphrase-field" class="form-group" style="display: none;">
                <!-- 密钥密码字段 -->
            </div>
          </div>

          <!-- Sudo 配置 -->
          <div style="margin-bottom: var(--spacing-xl);">
            <h4 style="font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-md); font-weight: 600;">提权设置</h4>
            
            <div class="form-group">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" name="useSudo" id="server-use-sudo" onchange="const el=document.getElementById('sudo-password-field'); if(el) el.style.display=this.checked?'block':'none';" style="margin-right: 8px;">
                    <span style="font-size: 13px; color: var(--text-primary);">使用 Sudo 执行特权命令</span>
                </label>
                <div style="font-size: 11px; color: var(--text-secondary); margin-left: 20px; margin-top: 4px;">
                    启用后，系统命令（如 Docker、进程管理）将通过 sudo 执行。
                </div>
            </div>

            <div id="sudo-password-field" style="display: none; margin-top: var(--spacing-md); animation: fadeIn 0.3s ease;">
                <div class="form-group">
                  <label style="display: block; font-size: 12px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px;">Sudo 密码 (可选)</label>
                  <div style="position: relative;">
                      <input type="password" name="sudoPassword" placeholder="如果与登录密码不同，请在此输入" style="
                        width: 100%;
                        padding: 10px 12px 10px 36px;
                        border: 1px solid var(--border-color);
                        border-radius: var(--border-radius);
                        background: var(--bg-primary);
                        color: var(--text-primary);
                        font-size: 13px;
                        transition: all 0.2s;
                      " onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 2px var(--primary-color-alpha-10)'" onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                      <div style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary);">
                          ${Shield({ theme: 'outline', size: '14', fill: 'currentColor' })}
                      </div>
                  </div>
                  <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">留空将使用登录密码或免密 Sudo</div>
                </div>
            </div>
          </div>

          <!-- 多账号管理区域 -->
          <div class="form-group" style="
            margin-bottom: var(--spacing-md); 
            margin-top: var(--spacing-lg); 
            padding: var(--spacing-md); 
            border: 1px dashed var(--border-color);
            border-radius: var(--border-radius);
            background: var(--bg-tertiary);
          ">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-sm);">
              <div style="display: flex; align-items: center; gap: 8px;">
                  ${Peoples({ theme: 'filled', size: '16', fill: 'var(--primary-color)' })}
                  <label style="
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin: 0;
                  ">多账号管理</label>
              </div>
              <button type="button" class="add-account-btn modern-btn secondary" style="
                padding: 4px 10px;
                font-size: 11px;
                height: 24px;
              " onclick="window.addServerAccount()">
                ${Plus({ theme: 'outline', size: '12', fill: 'currentColor' })} 添加账号
              </button>
            </div>
            <div style="
              font-size: 11px;
              color: var(--text-secondary);
              margin-bottom: var(--spacing-md);
              line-height: 1.4;
            ">
              您可以为同一台服务器添加多个登录账号（例如 root、superuser 等），连接时可快速切换。
            </div>
            <div id="additional-accounts-list" style="
              display: flex;
              flex-direction: column;
              gap: var(--spacing-md);
            ">
              <!-- 额外账号列表将动态插入这里 -->
            </div>
          </div>

          <div class="form-actions" style="
            display: flex;
            gap: var(--spacing-md);
            justify-content: space-between;
            margin-top: var(--spacing-xl);
            padding-top: var(--spacing-lg);
            border-top: 1px solid var(--border-color);
          ">
            <button type="button" id="test-connection-btn" class="modern-btn secondary" style="
              padding: 10px 20px;
              font-size: 13px;
              justify-content: center;
            " onclick="window.testConnection()">
              测试连接
            </button>
            <div style="display: flex; gap: var(--spacing-md);">
              <button type="button" class="cancel-btn modern-btn secondary" style="
                padding: 10px 20px;
                font-size: 13px;
                width: 100px;
                justify-content: center;
              " onclick="window.hideAddServerForm()">
                取消
              </button>
              <button type="button" id="save-server-btn" class="save-btn modern-btn primary" style="
                padding: 10px 24px;
                font-size: 13px;
                width: 120px;
                justify-content: center;
                box-shadow: 0 4px 12px var(--primary-color-alpha-30);
              ">
                保存配置
              </button>
            </div>
          </div>
        </form>
      </div>
    `;
  }

  /**
   * 渲染连接提示
   */
  private renderConnectionPrompt(): string {
    return `
      <div class="connection-prompt">
        <div class="connection-prompt-bg"></div>
        <div class="connection-prompt-card glass-effect hover-lift">
          <div class="prompt-badge">
            <img src="/logo.png" alt="LovelyRes Logo" style="width: 100%; height: 100%; object-fit: contain;" />
          </div>
          
          <div class="prompt-header-content">
            <h2 class="prompt-title">Welcome to Lovely<span class="luxe-text">Res</span></h2>
            <p class="prompt-subtitle">Linux 应急响应与管理工具</p>
          </div>

          <div class="prompt-actions-container">
            <button class="modern-btn primary large pulse-effect" onclick="window.showServerModal()" style="width: 100%; justify-content: center; padding: 12px;">
              <span style="margin-right: 8px;">${Plus({ theme: 'outline', size: '18', fill: 'currentColor' })}</span>
              连接服务器
            </button>
            
            <div class="prompt-quick-actions">
               <button class="modern-btn secondary" onclick="window.showSettingsOverlay()" title="设置">
                 ${SettingTwo({ theme: 'outline', size: '16', fill: 'currentColor' })} 设置
               </button>
               <button class="modern-btn secondary" onclick="window.open('https://github.com/tokeii0/LovelyERes', '_blank')" title="帮助文档">
                 ${BookOpen({ theme: 'outline', size: '16', fill: 'currentColor' })} 文档
               </button>
            </div>
          </div>

          <div class="prompt-features-grid">
            <div class="feature-item" title="SSH 终端">
              <div class="feature-icon">${Code({ theme: 'filled', size: '20', fill: '#3b82f6' })}</div>
              <span>终端</span>
            </div>
            <div class="feature-item" title="SFTP 文件管理">
              <div class="feature-icon">${FolderOpen({ theme: 'filled', size: '20', fill: '#f59e0b' })}</div>
              <span>文件</span>
            </div>
            <div class="feature-item" title="Docker 管理">
              <div class="feature-icon">${Whale({ theme: 'filled', size: '20', fill: '#06b6d4' })}</div>
              <span>Docker</span>
            </div>
            <div class="feature-item" title="系统监控">
              <div class="feature-icon">${Dashboard({ theme: 'filled', size: '20', fill: '#10b981' })}</div>
              <span>监控</span>
            </div>
          </div>
          
          <p class="prompt-hint">点击上方按钮添加或选择服务器以开始使用</p>
        </div>
      </div>
    `;
  }

  /**
   * 渲染仪表板
   */
  private renderDashboard(): string {
    // 获取系统信息（这里需要从应用状态或SSH管理器获取）
    const systemInfo = this.getSystemInfo();
    const theme = this.state.theme || 'dark';

    return this.dashboardRenderer.renderDashboard(systemInfo, theme);
  }

  /**
   * 获取系统信息
   */
  private getSystemInfo() {
    // 从状态管理器获取SSH管理器的系统信息
    const systemInfo = (window as any).app?.sshManager?.getSystemInfo();

    // 如果有缓存的详细信息，将其合并到系统信息中
    const cache = (window as any).systemInfoCache;
    if (systemInfo && cache?.detailedInfo) {
      systemInfo.detailedInfo = cache.detailedInfo;
    }

    // Trigger chart initialization if dashboard renderer instance exists
    // Use setTimeout to ensure DOM is updated
    setTimeout(() => {
      if ((window as any).dashboardRendererInstance) {
        (window as any).dashboardRendererInstance.initCharts();
      }
    }, 100);

    return systemInfo;
  }



  /**
   * 渲染远程操作页面（SFTP + SSH终端分屏）
   */
  private static remoteOperationsInitTimer: number | null = null;

  private renderRemoteOperationsPage(): string {
    // 防止重复设置定时器
    if (ModernUIRenderer.remoteOperationsInitTimer) {
      clearTimeout(ModernUIRenderer.remoteOperationsInitTimer);
    }

    // 延迟初始化远程操作页面
    ModernUIRenderer.remoteOperationsInitTimer = window.setTimeout(() => {
      (window as any).initRemoteOperationsPage?.();
      ModernUIRenderer.remoteOperationsInitTimer = null;
    }, 100);

    return `
      <div class="sftp-page-container">
        <!-- Header -->
        <div class="sftp-header">
          <div class="sftp-title">
            <div style="width: 32px; height: 32px; background: var(--primary-color-alpha-10); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--primary-color);">
              ${FolderOpen({ theme: 'filled', size: '18', fill: 'currentColor' })}
            </div>
            <span>SFTP 文件管理</span>
          </div>
          <div class="sftp-actions">
            <button id="sftp-history-btn" class="modern-btn secondary" onclick="window.toggleSftpHistory && window.toggleSftpHistory()" title="传输历史">
              ${History({ theme: 'outline', size: '16', fill: 'currentColor' })}
              <span>历史</span>
            </button>
            <button id="sftp-refresh-btn" class="modern-btn secondary" onclick="window.sftpRefresh && window.sftpRefresh()" title="刷新列表">
              ${Refresh({ theme: 'outline', size: '16', fill: 'currentColor' })}
              <span>刷新</span>
            </button>
            <button id="sftp-create-folder-btn" class="modern-btn secondary" onclick="window.sftpOpenCreateFolder && window.sftpOpenCreateFolder()" title="新建文件夹">
              ${FolderPlus({ theme: 'outline', size: '16', fill: 'currentColor' })}
              <span>新建</span>
            </button>
            <button id="sftp-upload-btn" class="modern-btn primary" onclick="window.sftpOpenUpload && window.sftpOpenUpload()" title="上传文件">
              ${Upload({ theme: 'outline', size: '16', fill: 'currentColor' })}
              <span>上传</span>
            </button>
          </div>
        </div>

        <!-- Toolbar & Navigation -->
        <div class="sftp-toolbar">
          <div class="sftp-nav-controls">
            <button class="modern-btn icon-only secondary" onclick="sftpManager.navigateToParent()" title="返回上一级">
              ${Up({ theme: 'outline', size: '16', fill: 'currentColor' })}
            </button>
            <button class="modern-btn icon-only secondary" onclick="sftpManager.navigateToPath('/')" title="返回根目录">
              ${Home({ theme: 'outline', size: '16', fill: 'currentColor' })}
            </button>
          </div>
          
          <div class="sftp-breadcrumb-bar">

            <input
              type="text"
              id="sftp-path-input"
              class="sftp-path-input"
              placeholder="输入路径..."
              onkeydown="if(event.key === 'Enter') sftpManager.navigateToPath(this.value)"
            />
          </div>
        </div>

        <!-- File List -->
        <div class="sftp-file-list-container">
          <table class="sftp-table">
            <thead>
              <tr>
                <th style="width: 50%; cursor: pointer;" onclick="window.setSftpSortMode(sftpManager.getSortMode() === 'name-asc' ? 'name-desc' : 'name-asc')">
                  名称
                </th>
                <th style="width: 15%; cursor: pointer;" onclick="window.setSftpSortMode(sftpManager.getSortMode() === 'size-asc' ? 'size-desc' : 'size-asc')">
                  大小
                </th>
                <th style="width: 15%;">权限</th>
                <th style="width: 20%; cursor: pointer;" onclick="window.setSftpSortMode(sftpManager.getSortMode() === 'modified-asc' ? 'modified-desc' : 'modified-asc')">
                  修改时间
                </th>
              </tr>
            </thead>
            <tbody id="sftp-file-list">
              <!-- File list content will be injected here -->
              <tr>
                <td colspan="4" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                  <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                    <div class="loading-spinner" style="width: 24px; height: 24px;"></div>
                    <span>正在加载文件列表...</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Status Bar -->
        <div class="sftp-status-bar">
          <div class="status-item" id="sftp-status-count">
            <span>0 项</span>
          </div>
          <div class="status-item">
            ${this.state.isConnected ? '<span style="color: var(--success-color);">● 已连接</span>' : '<span style="color: var(--error-color);">● 未连接</span>'}
          </div>
        </div>
      </div>
      ${this.sftpContextMenuRenderer.renderContextMenu()}
    `;
  }





  /**
   * 渲染Docker页面
   */
  private renderDockerPage(): string {
    const refreshIcon = Refresh({ theme: 'outline', size: '14', fill: 'currentColor' });
    const searchIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;

    return `
      <div class="docker-page-container">
        <!-- 顶部统计 -->
        <div id="docker-stats"></div>

        <!-- 顶部工具栏 -->
        <div class="docker-toolbar">
          <div class="docker-search-wrapper">
             <div class="docker-search-icon">${searchIcon}</div>
             <input 
               type="text" 
               id="docker-search" 
               placeholder="搜索容器名称 / 镜像 / ID..." 
               autocomplete="off"
             >
          </div>
          
          <div class="docker-actions-right">
             <button class="docker-btn secondary" data-docker-action="toggle-auto-refresh">
               <span>自动刷新·关</span>
             </button>
             <button class="docker-btn primary" data-docker-action="refresh">
               <span class="btn-icon">${refreshIcon}</span>
               <span>刷新列表</span>
             </button>
          </div>
        </div>

        <!-- 容器网格 -->
        <div id="docker-container-grid">
          <div class="docker-loading">
            <div class="loading-spinner"></div>
            <div>正在连接 Docker 服务...</div>
          </div>
        </div>
        
        <!-- 空状态占位 -->
        <div id="docker-empty-state" style="display: none;"></div>
      </div>
    `;
  }

  /**
   * 渲染Kubernetes页面
   */
  private renderKubernetesPage(): string {
    return this.kubernetesRenderer.render();
  }

  /**
   * 渲染日志审计页面
   */
  private renderLogAnalysisPage(): string {
    return this.logAnalysisRenderer.render();
  }

  /**
   * 渲染应急命令页面
   */
  private renderEmergencyCommandsPage(): string {
    const renderCategory = (cat: any) => {
      const items = cat.items.map((item: any) => `
          <button class="em-cmd-btn" data-em-id="${item.id}" title="${item.desc || ''}">
            <div class="em-cmd-content">
              <span class="em-cmd-name">${item.name}</span>
              <span class="em-cmd-desc">${item.desc || '点击执行此命令'}</span>
            </div>
            <div class="em-cmd-icon">
              <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 12L26 24L14 36" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M26 36H42" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </button>
        `).join('');

      return `
      <div class="em-category-section">
        <div class="em-category-header">
          <h3 class="em-category-title">${cat.title}</h3>
          ${cat.hint ? `<div class="em-category-hint">${cat.hint}</div>` : ''}
        </div>
        <div class="em-grid">
          ${items}
        </div>
      </div>
    `;
    };

    // 获取当前连接的账号列表
    const sshManager = (window as any).app?.sshManager;
    const sshConnectionManager = (window as any).sshConnectionManager;
    const currentConnectionId = sshConnectionManager?.getCurrentConnectionId?.();
    let accountsOptions = '<option value="">默认账号</option>';

    if (currentConnectionId && sshManager) {
      const connection = sshManager.getConnection(currentConnectionId);
      if (connection && connection.accounts && connection.accounts.length > 0) {
        connection.accounts.forEach((account: any) => {
          const label = account.description
            ? `${account.username} (${account.description})`
            : account.username;
          accountsOptions += `<option value="${account.username}">${label}</option>`;
        });
      }
    }

    const body = emergencyCategories.map(renderCategory).join('');

    return `
      <div class="emergency-commands-page" style="display:flex; flex-direction:column; gap: var(--spacing-lg);">
        <div class="em-header-container">
          <div class="em-system-card">
            <div class="em-system-icon">
              <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="6" width="36" height="36" rx="3" stroke="currentColor" stroke-width="4"/>
                <path d="M14 6V42" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <path d="M14 16H34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <path d="M14 24H34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <path d="M14 32H34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="em-system-info">
              <div class="em-system-label">检测到的系统</div>
              <div id="detected-system-info" class="em-system-value">检测中...</div>
            </div>
          </div>

          <div class="em-actions-card">
            <div class="em-search-wrapper">
               <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 38C30.3888 38 38 30.3888 38 21C38 11.6112 30.3888 4 21 4C11.6112 4 4 11.6112 4 21C4 30.3888 11.6112 38 21 38Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
                  <path d="M33.2218 33.2218L41.7071 41.7071" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>
               <input type="text" class="em-search-input" placeholder="搜索命令..." oninput="window.emergencyPageManager?.handleSearch(this.value)">
            </div>

            <div class="em-account-select-wrapper">
              <label style="font-size: 12px; color: var(--text-secondary); margin: 0;">执行账号:</label>
              <select id="emergency-account-select" class="em-account-select" title="选择执行应急命令的账号">
                ${accountsOptions}
              </select>
            </div>

            <button id="view-command-history-btn" class="modern-btn primary" style="height: 36px;" onclick="(window).commandHistoryModal?.show()">
              <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;">
                <path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
                <path d="M24 12V24L32 32" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>查看命令历史</span>
            </button>
          </div>
        </div>
        ${body}
      </div>
    `;
  }

  /**
   * 渲染快速检测页面
   */
  private renderQuickDetectionPage(): string {
    // 安全检测项目 - 使用 IconPark 图标
    const securityChecks = [
      // 基础安全检测
      { id: 'port-scan', name: '端口安全扫描', description: '检测开放端口和高危服务', iconFunc: NetworkTree },
      { id: 'user-audit', name: '用户权限审计', description: '检查用户权限和空密码账号', iconFunc: User },
      { id: 'backdoor-scan', name: '后门检测', description: '扫描 Webshell 和计划任务', iconFunc: Code },
      { id: 'memshell-scan', name: '内存马排查', description: '检测 Java 内存马（Tomcat/Spring等）', iconFunc: Shield },
      { id: 'process-analysis', name: '可疑进程分析', description: '识别异常进程和网络连接', iconFunc: Config },
      { id: 'file-permission', name: '文件权限检测', description: '检查敏感文件和 SUID 文件', iconFunc: FileText },
      { id: 'ssh-audit', name: 'SSH 安全审计', description: '检查 SSH 配置安全性', iconFunc: Lock },
      { id: 'log-analysis', name: '日志安全分析', description: '分析异常登录和暴力破解', iconFunc: Analysis },
      { id: 'firewall-check', name: '防火墙状态检查', description: '检查防火墙规则配置', iconFunc: Shield },

      // 账号与认证安全
      { id: 'password-policy', name: '密码策略检查', description: '检查密码复杂度和过期策略', iconFunc: Key },
      { id: 'sudo-audit', name: 'Sudo 配置审计', description: '检查 sudo 权限配置安全性', iconFunc: Shield },
      { id: 'pam-config', name: 'PAM 配置检查', description: '检查 PAM 认证配置', iconFunc: Lock },
      { id: 'account-lockout', name: '账号锁定策略', description: '检查登录失败锁定机制', iconFunc: Lock },

      // 系统加固
      { id: 'selinux-status', name: 'SELinux/AppArmor', description: '检查强制访问控制状态', iconFunc: Shield },
      { id: 'kernel-params', name: '内核参数检查', description: '检查安全相关内核参数', iconFunc: System },
      { id: 'system-updates', name: '系统补丁状态', description: '检查系统更新和漏洞补丁', iconFunc: System },

      // 服务与进程
      { id: 'unnecessary-services', name: '不必要服务检查', description: '检测运行的不必要服务', iconFunc: SettingConfig },
      { id: 'auto-start-services', name: '自启动服务审计', description: '审计开机自启动服务', iconFunc: SettingConfig },

      // 审计与日志
      { id: 'audit-config', name: '审计配置检查', description: '检查系统审计(auditd)配置', iconFunc: Analysis },
      { id: 'history-audit', name: '历史命令审计', description: '检查可疑历史命令', iconFunc: FileText },

      // 网络与时间
      { id: 'ntp-config', name: '时间同步检查', description: '检查 NTP 时间同步配置', iconFunc: Time },
      { id: 'dns-config', name: 'DNS 配置检查', description: '检查 DNS 解析配置安全', iconFunc: LinkCloud }
    ];

    // 性能检测项目 - 使用 IconPark 图标
    const performanceChecks = [
      { id: 'cpu-test', name: 'CPU 压力测试', description: '测试 CPU 性能和频率', iconFunc: Cpu },
      { id: 'memory-test', name: '内存性能测试', description: '测试内存读写速度', iconFunc: Memory },
      { id: 'disk-test', name: '磁盘 I/O 测试', description: '测试磁盘读写性能', iconFunc: System },
      { id: 'network-test', name: '网络性能测试', description: '测试带宽和延迟', iconFunc: Speed }
    ];

    const renderCheckItem = (check: any, category: string) => {
      // 使用 iconFunc 渲染 SVG 图标
      const iconSVG = check.iconFunc ? check.iconFunc({ theme: 'filled', size: '20', fill: 'currentColor' }) : '';

      return `
        <div class="detection-item" data-check-id="${check.id}" data-category="${category}" style="
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 16px;
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-lg);
          background: var(--bg-secondary);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        " onclick="
          const checkbox = this.querySelector('input[type=checkbox]');
          checkbox.checked = !checkbox.checked;
          this.classList.toggle('selected', checkbox.checked);
          if(checkbox.checked) {
            this.style.borderColor = 'var(--primary-color)';
            this.style.background = 'var(--bg-primary)';
            this.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)';
          } else {
            this.style.borderColor = 'var(--border-color)';
            this.style.background = 'var(--bg-secondary)';
            this.style.boxShadow = 'none';
          }
        " onmouseover="if(!this.classList.contains('selected')) { this.style.background='var(--bg-primary)'; this.style.borderColor='var(--border-hover)'; }"
           onmouseout="if(!this.classList.contains('selected')) { this.style.background='var(--bg-secondary)'; this.style.borderColor='var(--border-color)'; }">
          
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 8px;
            background: var(--bg-tertiary);
            color: var(--primary-color);
            flex-shrink: 0;
            margin-top: 2px;
          ">
            ${iconSVG}
          </div>

          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div style="font-weight: 600; color: var(--text-primary); font-size: 14px; margin-bottom: 4px;">${check.name}</div>
              <input type="checkbox" id="check-${check.id}" checked style="
                width: 16px;
                height: 16px;
                accent-color: var(--primary-color);
                cursor: pointer;
                margin-top: 2px;
              " onclick="event.stopPropagation();">
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4; margin-bottom: 8px;">${check.description}</div>
            
            <div id="status-${check.id}" class="check-status" style="
              display: inline-flex;
              align-items: center;
              font-size: 11px;
              color: var(--text-secondary);
              padding: 2px 8px;
              border-radius: 4px;
              background: var(--bg-tertiary);
            ">
              <span style="width: 6px; height: 6px; background: var(--text-disabled); border-radius: 50%; margin-right: 6px;"></span>
              待检测
            </div>
          </div>
      </div>
      `;
    };

    return `
      <div class="quick-detection-page" style="
        max-width: 1200px;
        margin: 0 auto;
        padding: var(--spacing-lg) var(--spacing-md);
      ">
        <!-- 顶部 Header -->
        <div style="
          background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
          border-radius: var(--border-radius-xl);
          padding: 32px;
          margin-bottom: var(--spacing-xl);
          border: 1px solid var(--border-color);
          position: relative;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
        ">
          <div style="position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h2 style="margin: 0 0 8px 0; font-size: 24px; color: var(--text-primary); font-weight: 700;">快速检测中心</h2>
              <p style="margin: 0; font-size: 14px; color: var(--text-secondary); max-width: 500px;">
                全方位服务器安全漏洞扫描与性能体检，护航系统稳定运行
              </p>
            </div>
            
            <div style="display: flex; gap: 12px;">
              <button id="quick-scan-all-btn" class="modern-btn primary large" style="
                padding: 10px 24px;
                font-size: 14px;
                font-weight: 600;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
              " onclick="window.quickDetection?.startFullScan()">
                ${Rocket({ theme: 'filled', size: '18', fill: 'currentColor' })}
                <span style="margin-left: 8px;">一键全面扫描</span>
              </button>
              
              <button id="quick-view-report-btn" class="modern-btn secondary large" style="
                padding: 10px 24px;
                font-size: 14px;
                background: var(--bg-primary);
              " onclick="window.quickDetection?.viewReport()">
                ${Analysis({ theme: 'outline', size: '18', fill: 'currentColor' })}
                <span style="margin-left: 8px;">查看报告</span>
              </button>
            </div>
          </div>

          <!-- 装饰背景 -->
          <div style="
            position: absolute;
            right: -10px;
            top: -30px;
            opacity: 0.03;
            transform: rotate(10deg);
            pointer-events: none;
            color: var(--text-primary);
          ">
            ${Shield({ theme: 'filled', size: '180', fill: 'currentColor' })}
          </div>
        </div>

        <!-- 进度面板 -->
        <div id="detection-progress-panel" style="
          display: none;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-lg);
          padding: 24px;
          margin-bottom: var(--spacing-xl);
          box-shadow: var(--shadow-md);
        ">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px;">
            <div>
              <div style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                <span class="pulse-dot" style="display: inline-block; width: 8px; height: 8px; background: var(--primary-color); border-radius: 50%; margin-right: 8px;"></span>
                正在进行检测...
              </div>
              <div id="detection-current-task" style="color: var(--text-secondary); font-size: 13px; margin-left: 16px;">正在初始化检测引擎...</div>
            </div>
            <div id="detection-score-display" style="font-size: 32px; font-weight: 700; color: var(--primary-color); font-family: monospace;">--</div>
          </div>
          
          <div style="width: 100%; height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
            <div id="detection-progress-bar" style="
              width: 0%;
              height: 100%;
              background: linear-gradient(90deg, var(--primary-color), #8b5cf6);
              transition: width 0.3s ease;
              border-radius: 4px;
            "></div>
          </div>
          
          <div style="display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 12px;">
            <span id="detection-progress-text">0%</span>
            <span id="detection-items-count">0/0 项</span>
          </div>
        </div>

        <!-- 结果汇总面板 -->
        <div id="detection-summary-panel" style="
          display: none;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-lg);
          padding: 24px;
          margin-bottom: var(--spacing-xl);
          box-shadow: var(--shadow-md);
        ">
          <div style="display: flex; gap: 32px; align-items: center;">
            <div style="text-align: center; padding-right: 32px; border-right: 1px solid var(--border-color);">
              <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">安全评分</div>
              <div style="display: flex; align-items: baseline; gap: 4px;">
                <span id="final-score" style="font-size: 42px; font-weight: 700; color: var(--success-color);">--</span>
                <span style="font-size: 16px; color: var(--text-secondary);">/100</span>
              </div>
            </div>
            
            <div style="flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
              <div style="padding: 16px; background: rgba(239, 68, 68, 0.05); border-radius: var(--border-radius); border: 1px solid rgba(239, 68, 68, 0.1); text-align: center;">
                <div style="font-size: 24px; font-weight: 700; color: #ef4444;" id="critical-count">0</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">严重风险</div>
              </div>
              <div style="padding: 16px; background: rgba(245, 158, 11, 0.05); border-radius: var(--border-radius); border: 1px solid rgba(245, 158, 11, 0.1); text-align: center;">
                <div style="font-size: 24px; font-weight: 700; color: #f59e0b;" id="high-count">0</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">高危风险</div>
              </div>
              <div style="padding: 16px; background: rgba(234, 179, 8, 0.05); border-radius: var(--border-radius); border: 1px solid rgba(234, 179, 8, 0.1); text-align: center;">
                <div style="font-size: 24px; font-weight: 700; color: #eab308;" id="medium-count">0</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">中危风险</div>
              </div>
              <div style="padding: 16px; background: rgba(59, 130, 246, 0.05); border-radius: var(--border-radius); border: 1px solid rgba(59, 130, 246, 0.1); text-align: center;">
                <div style="font-size: 24px; font-weight: 700; color: #3b82f6;" id="low-count">0</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">低危建议</div>
              </div>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 32px;">
          <!-- 安全检测 -->
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="padding: 8px; background: rgba(34, 197, 94, 0.1); border-radius: 8px; color: var(--success-color);">
                  ${Shield({ theme: 'filled', size: '20', fill: 'currentColor' })}
                </div>
                <div>
                  <h3 style="margin: 0; font-size: 16px; color: var(--text-primary); font-weight: 600;">安全检测</h3>
                  <div style="font-size: 12px; color: var(--text-secondary);">${securityChecks.length} 项安全检查</div>
                </div>
              </div>
              <button class="modern-btn text-only" style="font-size: 12px;" onclick="window.quickDetection?.toggleAllChecks('security')">全选</button>
            </div>
            <div style="display: grid; gap: 12px;">
              ${securityChecks.map(check => renderCheckItem(check, 'security')).join('')}
            </div>
          </div>

          <!-- 性能检测 -->
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="padding: 8px; background: rgba(59, 130, 246, 0.1); border-radius: 8px; color: var(--primary-color);">
                  ${Speed({ theme: 'filled', size: '20', fill: 'currentColor' })}
                </div>
                <div>
                  <h3 style="margin: 0; font-size: 16px; color: var(--text-primary); font-weight: 600;">性能检测</h3>
                  <div style="font-size: 12px; color: var(--text-secondary);">${performanceChecks.length} 项性能评估</div>
                </div>
              </div>
              <button class="modern-btn text-only" style="font-size: 12px;" onclick="window.quickDetection?.toggleAllChecks('performance')">全选</button>
            </div>
            <div style="display: grid; gap: 12px;">
              ${performanceChecks.map(check => renderCheckItem(check, 'performance')).join('')}
            </div>
          </div>
        </div>

        <!-- 检测历史 -->
        <div style="margin-top: 48px; border-top: 1px solid var(--border-color); padding-top: 24px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <h3 style="margin: 0; font-size: 16px; color: var(--text-primary); font-weight: 600; display: flex; align-items: center;">
              <span style="margin-right: 8px; display: inline-flex;">
                ${History({ theme: 'outline', size: '18', fill: 'currentColor' })}
              </span>
              检测历史
            </h3>
            <button class="modern-btn secondary small" style="font-size: 12px;" onclick="window.quickDetection?.clearHistory()">清空历史</button>
          </div>
          <div id="detection-history-list" style="display: flex; flex-direction: column; gap: 12px;">
            <div style="text-align: center; padding: 32px; color: var(--text-secondary); background: var(--bg-secondary); border-radius: var(--border-radius); border: 1px dashed var(--border-color); font-size: 13px;">
              暂无历史记录
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染快速检测报告模态框
   */
  renderDetectionReportModal(): string {
    return `
      <div id="detection-report-modal" class="modal" style="display: none;">
        <div class="modal-overlay" onclick="window.quickDetection?.closeReportModal()"></div>
        <div class="modal-content" style="
          max-width: 1000px;
          max-height: 90vh;
          overflow-y: auto;
          background: var(--bg-primary);
          border-radius: var(--border-radius-lg);
          padding: var(--spacing-lg);
        ">
          <!-- 报告头部 -->
          <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--spacing-lg);
            padding-bottom: var(--spacing-md);
            border-bottom: 1px solid var(--border-color);
          ">
            <div>
              <h2 style="margin: 0; font-size: 24px; color: var(--text-primary); font-weight: 600;">检测报告</h2>
              <p id="report-timestamp" style="margin: 4px 0 0 0; font-size: 14px; color: var(--text-secondary);"></p>
            </div>
            <button onclick="window.quickDetection?.closeReportModal()" style="
              background: transparent;
              border: none;
              font-size: 24px;
              color: var(--text-secondary);
              cursor: pointer;
              padding: 4px 8px;
            ">×</button>
          </div>

          <!-- 评分卡片 -->
          <div style="
            display: grid;
            grid-template-columns: 1fr 2fr;
            gap: var(--spacing-lg);
            margin-bottom: var(--spacing-lg);
          ">
            <!-- 总体评分 -->
            <div class="modern-card" style="
              border: 1px solid var(--border-color);
              border-radius: var(--border-radius-lg);
              padding: var(--spacing-lg);
              text-align: center;
              background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%);
            ">
              <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">安全评分</div>
              <div style="display: flex; align-items: baseline; justify-content: center; gap: 4px;">
                <span id="report-overall-score" style="font-size: 64px; font-weight: 700; color: var(--primary-color);">--</span>
                <span style="font-size: 32px; color: var(--text-secondary);">/100</span>
              </div>
              <div id="report-score-label" style="
                margin-top: 8px;
                font-size: 16px;
                font-weight: 600;
                color: var(--primary-color);
              ">优秀</div>
            </div>

            <!-- 问题统计 -->
            <div class="modern-card" style="
              border: 1px solid var(--border-color);
              border-radius: var(--border-radius-lg);
              padding: var(--spacing-lg);
              background: var(--bg-primary);
            ">
              <div style="font-size: 16px; color: var(--text-primary); margin-bottom: var(--spacing-md); font-weight: 600;">问题统计</div>
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-sm);">
                <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-secondary); border-radius: var(--border-radius);">
                  <div style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></div>
                  <div style="flex: 1;">
                    <div style="font-size: 12px; color: var(--text-secondary);">严重</div>
                    <div id="report-critical-count" style="font-size: 24px; font-weight: 600; color: #ef4444;">0</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-secondary); border-radius: var(--border-radius);">
                  <div style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;"></div>
                  <div style="flex: 1;">
                    <div style="font-size: 12px; color: var(--text-secondary);">高危</div>
                    <div id="report-high-count" style="font-size: 24px; font-weight: 600; color: #f59e0b;">0</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-secondary); border-radius: var(--border-radius);">
                  <div style="width: 8px; height: 8px; border-radius: 50%; background: #eab308;"></div>
                  <div style="flex: 1;">
                    <div style="font-size: 12px; color: var(--text-secondary);">中危</div>
                    <div id="report-medium-count" style="font-size: 24px; font-weight: 600; color: #eab308;">0</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-secondary); border-radius: var(--border-radius);">
                  <div style="width: 8px; height: 8px; border-radius: 50%; background: #3b82f6;"></div>
                  <div style="flex: 1;">
                    <div style="font-size: 12px; color: var(--text-secondary);">低危</div>
                    <div id="report-low-count" style="font-size: 24px; font-weight: 600; color: #3b82f6;">0</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 检测项目详情 -->
          <div id="report-details-container" style="margin-bottom: var(--spacing-lg);">
            <!-- 将由 JavaScript 动态填充 -->
          </div>

          <!-- 底部操作按钮 -->
          <div style="
            display: flex;
            justify-content: flex-end;
            gap: var(--spacing-sm);
            padding-top: var(--spacing-md);
            border-top: 1px solid var(--border-color);
          ">
            <button class="modern-btn secondary" onclick="window.quickDetection?.exportReport()">
              导出报告
            </button>
            <button class="modern-btn primary" onclick="window.quickDetection?.closeReportModal()">
              关闭
            </button>
          </div>
        </div>
      </div>
    `;
  }


  /**
   * 渲染状态栏
   */
  renderStatusBar(): string {
    const connectedIcon = CheckOne({ theme: 'filled', size: '12', fill: '#22c55e' });
    const disconnectedIcon = CloseOne({ theme: 'filled', size: '12', fill: '#ef4444' });

    return `
      <div class="status-bar">
        <div class="status-left">
          ${this.state.isConnected ? `<span style="margin-left: var(--spacing-md); display: flex; align-items: center; gap: 4px;">${connectedIcon} 已连接</span>` : `<span style="margin-left: var(--spacing-md); display: flex; align-items: center; gap: 4px;">${disconnectedIcon} 未连接</span>`}
        </div>

        <div class="status-right">
          <span>LovelyRes v0.60</span>
        </div>
      </div>
    `;
  }

  /**
   * 渲染 SSH 终端重定向页面
   */
  private renderSSHTerminalRedirect(): string {
    return `
      <div class="ssh-terminal-redirect" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
        padding: 2rem;
      ">
        <div style="
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 2rem;
          max-width: 500px;
          width: 100%;
        ">
          <div style="
            font-size: 48px;
            margin-bottom: 1rem;
            color: var(--text-secondary);
          ">🖥️</div>

          <h2 style="
            color: var(--text-primary);
            margin-bottom: 1rem;
            font-size: 1.5rem;
          ">SSH 终端已在新窗口中打开</h2>

          <p style="
            color: var(--text-secondary);
            margin-bottom: 1.5rem;
            line-height: 1.6;
          ">
            SSH 终端现在在独立窗口中运行，这样可以：<br>
            • 保持会话持久性<br>
            • 不影响主界面操作<br>
            • 提供更好的终端体验
          </p>

          <button
            onclick="openSSHTerminalWindow()"
            style="
              background: var(--primary-color);
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 6px;
              cursor: pointer;
              font-size: 1rem;
              transition: all 0.2s;
            "
            onmouseover="this.style.opacity='0.9'"
            onmouseout="this.style.opacity='1'"
          >
            重新打开 SSH 终端
          </button>
        </div>
      </div>
    `;
  }



  /**
   * 渲染设置页面（覆盖层模式）
   */
  renderSettingsPage(): string {
    return `
      <div class="settings-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
      ">
        <div class="settings-page" style="
          width: 90%;
          max-width: 800px;
          max-height: 90%;
          padding: var(--spacing-lg);
          background: var(--bg-primary);
          border-radius: var(--border-radius-lg);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          overflow-y: auto;
          position: relative;
        ">
          <!-- 关闭按钮 -->
          <button class="settings-close-btn" style="
            position: absolute;
            top: var(--spacing-md);
            right: var(--spacing-md);
            background: none;
            border: none;
            color: var(--text-secondary);
            font-size: 20px;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s;
          " title="关闭设置">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>

          <div class="settings-container" style="
            margin: 0;
          ">
          <div class="settings-header" style="
            margin-bottom: var(--spacing-xl);
            padding-bottom: var(--spacing-lg);
            border-bottom: 1px solid var(--border-color);
          ">
            <h1 style="
              font-size: 24px;
              font-weight: 600;
              color: var(--text-primary);
              margin: 0 0 var(--spacing-sm) 0;
            ">设置</h1>
            <p style="
              color: var(--text-secondary);
              margin: 0;
              font-size: 14px;
            ">配置应用程序的基础设置和AI功能</p>
          </div>

          <div class="settings-tabs" style="
            display: flex;
            gap: var(--spacing-sm);
            margin-bottom: var(--spacing-xl);
            border-bottom: 1px solid var(--border-color);
          ">
            <button class="settings-tab active" data-tab="basic" onclick="window.switchSettingsTab('basic')" style="
              padding: var(--spacing-md) var(--spacing-lg);
              background: none;
              border: none;
              color: var(--text-primary);
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              border-bottom: 2px solid var(--accent-color);
              transition: all 0.2s;
            ">基础设置</button>
            <button class="settings-tab" data-tab="ai" onclick="window.switchSettingsTab('ai')" style="
              padding: var(--spacing-md) var(--spacing-lg);
              background: none;
              border: none;
              color: var(--text-secondary);
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              border-bottom: 2px solid transparent;
              transition: all 0.2s;
            ">AI设置</button>
          </div>

          <div class="settings-content">
            <!-- 基础设置 -->
            <div class="settings-panel" id="basic-settings" style="display: block;">
              <div class="settings-section" style="
                background: var(--bg-secondary);
                border-radius: var(--border-radius-lg);
                padding: var(--spacing-lg);
                margin-bottom: var(--spacing-lg);
              ">
                <h3 style="
                  font-size: 16px;
                  font-weight: 600;
                  color: var(--text-primary);
                  margin: 0 0 var(--spacing-md) 0;
                ">界面设置</h3>

                <div class="setting-item" style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: var(--spacing-md);
                ">
                  <div>
                    <label style="
                      font-size: 14px;
                      font-weight: 500;
                      color: var(--text-primary);
                      display: block;
                      margin-bottom: 4px;
                    ">全局字体</label>
                    <p style="
                      font-size: 12px;
                      color: var(--text-secondary);
                      margin: 0;
                    ">设置应用程序的全局字体</p>
                  </div>
                  <select id="global-font" style="
                    padding: 8px 12px;
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-size: 14px;
                    min-width: 200px;
                  ">
                    <option value="system">正在加载字体...</option>
                  </select>
                </div>

                <div class="setting-item" style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: var(--spacing-md);
                ">
                  <div>
                    <label style="
                      font-size: 14px;
                      font-weight: 500;
                      color: var(--text-primary);
                      display: block;
                      margin-bottom: 4px;
                    ">字体大小</label>
                    <p style="
                      font-size: 12px;
                      color: var(--text-secondary);
                      margin: 0;
                    ">设置应用程序的全局字体大小（10-24px）</p>
                  </div>
                  <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <input type="range" id="global-font-size" min="10" max="24" step="1" value="14" style="
                      width: 120px;
                      accent-color: var(--accent-color);
                    " />
                    <span id="font-size-value" style="
                      font-size: 14px;
                      color: var(--text-primary);
                      min-width: 40px;
                      text-align: right;
                    ">14px</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- AI设置 -->
            <div class="settings-panel" id="ai-settings" style="display: none;">
              <div class="settings-section" style="
                background: var(--bg-secondary);
                border-radius: var(--border-radius-lg);
                padding: var(--spacing-lg);
                margin-bottom: var(--spacing-lg);
              ">
                <h3 style="
                  font-size: 16px;
                  font-weight: 600;
                  color: var(--text-primary);
                  margin: 0 0 var(--spacing-md) 0;
                ">AI配置</h3>

                <!-- AI提供商选择 -->
                <div class="setting-item" style="margin-bottom: var(--spacing-lg);">
                  <label style="
                    font-size: 14px;
                    font-weight: 500;
                    color: var(--text-primary);
                    display: block;
                    margin-bottom: 8px;
                  ">AI提供商</label>
                  <div style="display: flex; gap: var(--spacing-sm); align-items: flex-end;">
                    <div style="flex: 1; position: relative;">
                      <select id="ai-provider" style="
                        width: 100%;
                        padding: 10px 12px;
                        border: 1px solid var(--border-color);
                        border-radius: var(--border-radius);
                        background: var(--bg-primary);
                        color: var(--text-primary);
                        font-size: 14px;
                        box-sizing: border-box;
                      ">
                        <option value="openai">OpenAI (GPT-4o/GPT-3.5)</option>
                        <option value="deepseek">DeepSeek (国产大模型)</option>
                        <option value="claude">Claude (Anthropic)</option>
                        <option value="custom">自定义 API</option>
                      </select>
                    </div>
                    <button id="delete-ai-provider" class="modern-btn danger" style="
                      padding: 10px 12px;
                      font-size: 13px;
                      white-space: nowrap;
                      display: none;
                      align-items: center;
                      gap: 6px;
                    ">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                      删除
                    </button>
                    <button id="add-ai-provider" class="modern-btn secondary" style="
                      padding: 10px 16px;
                      font-size: 13px;
                      white-space: nowrap;
                      display: flex;
                      align-items: center;
                      gap: 6px;
                    ">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                      </svg>
                      新增
                    </button>
                  </div>
                </div>

                <!-- 当前提供商配置 -->
                <div id="ai-provider-config">
                  <div class="setting-item" style="margin-bottom: var(--spacing-md);">
                    <label style="
                      font-size: 14px;
                      font-weight: 500;
                      color: var(--text-primary);
                      display: block;
                      margin-bottom: 8px;
                    ">API Key</label>
                    <input type="password" id="ai-api-key" placeholder="输入您的AI API Key" style="
                      width: 100%;
                      padding: 10px 12px;
                      border: 1px solid var(--border-color);
                      border-radius: var(--border-radius);
                      background: var(--bg-primary);
                      color: var(--text-primary);
                      font-size: 14px;
                      box-sizing: border-box;
                    ">
                  </div>

                  <div class="setting-item" style="margin-bottom: var(--spacing-md);">
                    <label style="
                      font-size: 14px;
                      font-weight: 500;
                      color: var(--text-primary);
                      display: block;
                      margin-bottom: 8px;
                    ">模型</label>
                    <input type="text" id="ai-model" placeholder="例如: gpt-3.5-turbo" style="
                      width: 100%;
                      padding: 10px 12px;
                      border: 1px solid var(--border-color);
                      border-radius: var(--border-radius);
                      background: var(--bg-primary);
                      color: var(--text-primary);
                      font-size: 14px;
                      box-sizing: border-box;
                    ">
                  </div>

                  <div class="setting-item" style="margin-bottom: var(--spacing-lg);">
                    <label style="
                      font-size: 14px;
                      font-weight: 500;
                      color: var(--text-primary);
                      display: block;
                      margin-bottom: 8px;
                    ">Base URL</label>
                    <input type="url" id="ai-base-url" placeholder="例如: https://api.openai.com/v1" style="
                      width: 100%;
                      padding: 10px 12px;
                      border: 1px solid var(--border-color);
                      border-radius: var(--border-radius);
                      background: var(--bg-primary);
                      color: var(--text-primary);
                      font-size: 14px;
                      box-sizing: border-box;
                    ">
                  </div>

                  <!-- 代理设置 -->
                  <div class="setting-item" style="margin-bottom: var(--spacing-lg);">
                    <label style="
                      display: flex;
                      align-items: center;
                      gap: 8px;
                      font-size: 14px;
                      font-weight: 500;
                      color: var(--text-primary);
                      margin-bottom: 12px;
                      cursor: pointer;
                    ">
                      <input type="checkbox" id="ai-use-proxy" style="
                        width: 18px;
                        height: 18px;
                        cursor: pointer;
                      ">
                      使用代理
                    </label>

                    <div id="ai-proxy-settings" style="
                      display: none;
                      padding: 12px;
                      border: 1px solid var(--border-color);
                      border-radius: var(--border-radius);
                      background: var(--bg-secondary);
                    ">
                      <div style="margin-bottom: 12px;">
                        <label style="
                          font-size: 13px;
                          color: var(--text-secondary);
                          display: block;
                          margin-bottom: 6px;
                        ">代理类型</label>
                        <select id="ai-proxy-type" style="
                          width: 100%;
                          padding: 8px 10px;
                          border: 1px solid var(--border-color);
                          border-radius: var(--border-radius);
                          background: var(--bg-primary);
                          color: var(--text-primary);
                          font-size: 14px;
                          cursor: pointer;
                        ">
                          <option value="http">HTTP</option>
                          <option value="https">HTTPS</option>
                          <option value="socks5">SOCKS5</option>
                        </select>
                      </div>

                      <div>
                        <label style="
                          font-size: 13px;
                          color: var(--text-secondary);
                          display: block;
                          margin-bottom: 6px;
                        ">代理地址</label>
                        <input type="text" id="ai-proxy-url" placeholder="例如: 127.0.0.1:7890" style="
                          width: 100%;
                          padding: 8px 10px;
                          border: 1px solid var(--border-color);
                          border-radius: var(--border-radius);
                          background: var(--bg-primary);
                          color: var(--text-primary);
                          font-size: 14px;
                          box-sizing: border-box;
                        ">
                        <div style="
                          font-size: 12px;
                          color: var(--text-secondary);
                          margin-top: 4px;
                        ">格式: 主机:端口 或 协议://主机:端口</div>
                      </div>
                    </div>
                  </div>

                  <!-- AI测试功能 -->
                  <div class="setting-item" style="margin-bottom: var(--spacing-md);">
                    <div style="
                      display: flex;
                      align-items: center;
                      gap: var(--spacing-md);
                      margin-bottom: var(--spacing-sm);
                    ">
                      <button id="test-ai-connection" class="modern-btn secondary" style="
                        padding: 8px 16px;
                        font-size: 13px;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                      ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        测试连接
                      </button>
                      <span id="ai-test-status" style="
                        font-size: 13px;
                        color: var(--text-secondary);
                      ">点击测试AI连接状态</span>
                    </div>
                    <div id="ai-test-result" style="
                      padding: 10px;
                      border-radius: var(--border-radius);
                      background: var(--bg-primary);
                      border: 1px solid var(--border-color);
                      font-size: 13px;
                      color: var(--text-secondary);
                      display: none;
                      max-height: 100px;
                      overflow-y: auto;
                    "></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 保存按钮 -->
            <div class="settings-actions" style="
              display: flex;
              justify-content: flex-end;
              gap: var(--spacing-md);
              padding-top: var(--spacing-lg);
              border-top: 1px solid var(--border-color);
            ">
              <button class="modern-btn secondary" id="reset-settings" style="
                padding: 10px 20px;
                font-size: 14px;
              ">重置默认</button>
              <button class="modern-btn primary" id="save-settings" style="
                padding: 10px 20px;
                font-size: 14px;
              ">保存设置</button>
            </div>
          </div>
        </div>

        <!-- 新增AI提供商弹窗 -->
        <div id="add-provider-modal" style="
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          z-index: 10001;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            background: var(--bg-primary);
            border-radius: var(--border-radius-lg);
            padding: var(--spacing-xl);
            width: 90%;
            max-width: 500px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            border: 1px solid var(--border-color);
          ">
            <div style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: var(--spacing-lg);
            ">
              <h3 style="
                font-size: 18px;
                font-weight: 600;
                color: var(--text-primary);
                margin: 0;
              ">新增AI提供商</h3>
              <button id="close-add-provider-modal" style="
                background: none;
                border: none;
                color: var(--text-secondary);
                cursor: pointer;
                padding: 4px;
                border-radius: var(--border-radius);
                transition: all 0.2s;
              ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>

            <form id="add-provider-form">
              <div class="setting-item" style="margin-bottom: var(--spacing-md);">
                <label style="
                  font-size: 14px;
                  font-weight: 500;
                  color: var(--text-primary);
                  display: block;
                  margin-bottom: 8px;
                ">提供商名称 *</label>
                <input type="text" id="new-provider-name" placeholder="例如: 我的Claude、公司AI等" required style="
                  width: 100%;
                  padding: 10px 12px;
                  border: 1px solid var(--border-color);
                  border-radius: var(--border-radius);
                  background: var(--bg-primary);
                  color: var(--text-primary);
                  font-size: 14px;
                  box-sizing: border-box;
                ">
              </div>

              <div class="setting-item" style="margin-bottom: var(--spacing-md);">
                <label style="
                  font-size: 14px;
                  font-weight: 500;
                  color: var(--text-primary);
                  display: block;
                  margin-bottom: 8px;
                ">API Key</label>
                <input type="password" id="new-provider-api-key" placeholder="输入API Key" style="
                  width: 100%;
                  padding: 10px 12px;
                  border: 1px solid var(--border-color);
                  border-radius: var(--border-radius);
                  background: var(--bg-primary);
                  color: var(--text-primary);
                  font-size: 14px;
                  box-sizing: border-box;
                ">
              </div>

              <div class="setting-item" style="margin-bottom: var(--spacing-md);">
                <label style="
                  font-size: 14px;
                  font-weight: 500;
                  color: var(--text-primary);
                  display: block;
                  margin-bottom: 8px;
                ">模型</label>
                <input type="text" id="new-provider-model" placeholder="例如: gpt-4、claude-3等" style="
                  width: 100%;
                  padding: 10px 12px;
                  border: 1px solid var(--border-color);
                  border-radius: var(--border-radius);
                  background: var(--bg-primary);
                  color: var(--text-primary);
                  font-size: 14px;
                  box-sizing: border-box;
                ">
              </div>

              <div class="setting-item" style="margin-bottom: var(--spacing-lg);">
                <label style="
                  font-size: 14px;
                  font-weight: 500;
                  color: var(--text-primary);
                  display: block;
                  margin-bottom: 8px;
                ">Base URL</label>
                <input type="url" id="new-provider-base-url" placeholder="例如: https://api.anthropic.com/v1" style="
                  width: 100%;
                  padding: 10px 12px;
                  border: 1px solid var(--border-color);
                  border-radius: var(--border-radius);
                  background: var(--bg-primary);
                  color: var(--text-primary);
                  font-size: 14px;
                  box-sizing: border-box;
                ">
              </div>

              <div style="
                display: flex;
                gap: var(--spacing-md);
                justify-content: flex-end;
              ">
                <button type="button" id="cancel-add-provider" class="modern-btn secondary" style="
                  padding: 10px 20px;
                  font-size: 14px;
                ">取消</button>
                <button type="submit" id="save-new-provider" class="modern-btn primary" style="
                  padding: 10px 20px;
                  font-size: 14px;
                ">保存</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染SSH终端标题栏按钮
   */
  renderSSHTerminalTitleButton(): string {
    return `
      <button id="ssh-terminal-title-btn" class="modern-btn secondary" style="padding: 6px 12px; font-size: 11px; margin-right: var(--spacing-sm); display: flex; align-items: center; gap: 6px;" title="打开SSH终端">
        <svg width="14" height="14" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="8" width="40" height="32" rx="2" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="bevel"/>
          <path d="M12 18L19 24L12 30" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="bevel"/>
          <path d="M23 32H36" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="bevel"/>
        </svg>
        终端
      </button>
    `;
  }
}
