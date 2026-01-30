/**
 * LovelyRes 核心应用类
 * 负责应用初始化、状态管理和模块协调
 */

import { invoke } from "@tauri-apps/api/core";
import { StateManager } from './stateManager';
import { ModernUIRenderer } from '../ui/modernUIRenderer';
import { ThemeManager } from '../ui/theme';
import { SSHManager } from '../ssh/sshManager';
import { DockerManager } from '../docker/dockerManager';
import { KubernetesManager } from '../kubernetes/kubernetesManager';
import { SettingsManager } from '../settings/settingsManager';
import { SettingsPageManager } from '../settings/settingsPageManager';
import { SystemInfoManager } from '../system/systemInfoManager';
import { sshConnectionManager } from '../remote/sshConnectionManager';
import { sshTerminalManager } from '../ssh/sshTerminalManager';
import { databasePageManager } from '../database/databasePageManager';
import type { AppState } from './types';

export class LovelyResApp {
  private stateManager: StateManager;
  private modernUIRenderer: ModernUIRenderer;
  private themeManager: ThemeManager;
  private sshManager: SSHManager;
  private dockerManager: DockerManager;
  private kubernetesManager: KubernetesManager;
  public settingsManager: SettingsManager;
  public settingsPageManager: SettingsPageManager;
  private systemInfoManager: SystemInfoManager;

  constructor() {
    this.stateManager = new StateManager();
    this.modernUIRenderer = new ModernUIRenderer(this.stateManager);
    this.themeManager = new ThemeManager();
    this.sshManager = new SSHManager();
    this.dockerManager = new DockerManager();
    this.kubernetesManager = new KubernetesManager();
    this.settingsManager = new SettingsManager();
    this.settingsPageManager = new SettingsPageManager(this.settingsManager);
    // 注意：不再单独创建 SystemInfoManager，使用 sshManager 内部的实例
    // 这样可以确保 setSessionId 和 getDetailedSystemInfo 操作的是同一个实例
    this.systemInfoManager = (this.sshManager as any).systemInfoManager;

    // 暴露管理器和应用实例给全局对象，供UI使用
    (window as any).app = {
      sshManager: this.sshManager,
      kubernetesManager: this.kubernetesManager,
      systemInfoManager: this.systemInfoManager, // 现在指向 sshManager 内部的同一个实例
      settingsManager: this.settingsManager,
      settingsPageManager: this.settingsPageManager,
      stateManager: this.stateManager,
      modernUIRenderer: this.modernUIRenderer,
      render: () => this.render() // 暴露render方法
    };
  }

  /**
   * 初始化应用
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 LovelyRes 应用初始化开始...');
      
      // 初始化状态管理器
      await this.stateManager.initialize();

      // 设置UI渲染器到状态管理器
      this.stateManager.setUIRenderer(this.modernUIRenderer);

      // 初始化主题
      await this.initializeTheme();
      
      // 初始化设置
      await this.settingsManager.initialize();

      // 初始化SSH终端管理器
      await sshTerminalManager.initialize();

      // 渲染UI
      this.render();

      // 绑定事件
      this.bindEvents();

      // 监听状态变化
      this.stateManager.addListener((newState) => {
        // 1. 处理数据库页面初始化（当从 Loading 恢复或切换页面时）
        // 如果容器存在但为空（说明可能刚被 Renderer 重置），则初始化
        if (newState.currentPage === 'database' && !newState.loading) {
            requestAnimationFrame(() => {
                const container = document.getElementById('database-page-container');
                if (container && container.innerHTML.trim() === '') {
                    console.log('🔄 检测到数据库容器为空，重新初始化...');
                    databasePageManager.initialize('database-page-container').then(() => {
                        // 初始化后立即同步会话
                        const status = sshConnectionManager.getConnectionStatus();
                        if (status?.sessionId) {
                            databasePageManager.setSession(status.sessionId);
                        }
                    });
                }
            });
        }

        // 2. 确保数据库管理器使用当前活动的 SSH 会话
        // 当连接状态变化或服务器信息更新时
        if (newState.isConnected && newState.serverInfo) {
          // 优先从 sshConnectionManager 获取真实的后端 sessionId
          const status = sshConnectionManager.getConnectionStatus();
          const sessionId = status?.sessionId;
          
          if (newState.currentPage === 'database' && sessionId) {
            databasePageManager.setSession(sessionId).catch(err => {
              console.error('❌ [App] 同步数据库会话失败:', err);
            });
          }
        }
      });

      // 3. 监听 SSH 连接管理器变化（处理多会话切换）
      // StateManager 可能不会在会话切换时立即触发足够的信息变更，直接监听连接管理器更可靠
      sshConnectionManager.addListener((status) => {
        const currentState = this.stateManager.getState();
        // 如果当前在数据库页面，且有有效的会话 ID
        if (currentState.currentPage === 'database' && status?.sessionId) {
             // setSession 内部有防抖，可以安全调用
             databasePageManager.setSession(status.sessionId).catch(err => {
                 console.error('❌ [App] 响应会话切换失败:', err);
             });
        }
      });
      
      console.log('✅ LovelyRes 应用初始化完成');
    } catch (error) {
      console.error('❌ 应用初始化失败:', error);
      throw error;
    }
  }

  /**
   * 初始化主题系统
   */
  private async initializeTheme(): Promise<void> {
    try {
      // 从后端加载主题设置
      const savedTheme = await this.loadThemeFromBackend();
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'sakura')) {
        this.stateManager.setTheme(savedTheme);
      }
      
      // 应用主题
      this.themeManager.setTheme(this.stateManager.getState().theme);
    } catch (error) {
      console.error('主题初始化失败:', error);
      // 使用默认主题
      this.themeManager.setTheme('light');
    }
  }

  /**
   * 从后端加载主题设置
   */
  private async loadThemeFromBackend(): Promise<string | null> {
    try {
      const themeSettings = await invoke('get_theme_settings') as any;
      return themeSettings?.current_theme || null;
    } catch (error) {
      console.error('从后端加载主题设置失败:', error);
      return null;
    }
  }

  /**
   * 设置主题
   */
  async setTheme(theme: 'light' | 'dark' | 'sakura'): Promise<void> {
    const themeNames = {
      'light': '浅色',
      'dark': '深色',
      'sakura': '樱花粉',
    };

    // 如果已经在该主题，不进行操作
    if (this.stateManager.getState().theme === theme) {
      return;
    }

    try {
      // 保存主题设置到后端
      await invoke('set_current_theme', { theme });
      console.log(`✅ 主题已保存到设置: ${theme}`);
      
      this.showMessage(`已切换到${themeNames[theme] || '未知'}模式`, 'success');
    } catch (error) {
      console.error('❌ 保存主题设置失败:', error);
      // 即使保存失败也继续切换UI
    }

    // 更新状态管理器
    this.stateManager.setTheme(theme);

    // 应用主题
    this.themeManager.setTheme(theme);
    
    // 更新UI
    this.modernUIRenderer.updateState(this.stateManager.getState());
    this.updateTitleBar();
  }

  /**
   * 切换主题
   */
  async toggleTheme(): Promise<void> {
    const currentTheme = this.stateManager.getState().theme;
    const themes: ('light' | 'dark' | 'sakura')[] = ['light', 'dark', 'sakura'];
    const nextIndex = (themes.indexOf(currentTheme) + 1) % themes.length;
    await this.setTheme(themes[nextIndex]);
  }

  /**
   * 渲染应用界面
   */
  render(): void {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div class="app-layout">
          ${this.modernUIRenderer.renderTitleBar()}
          <div class="main-container">
            ${this.modernUIRenderer.renderSidebar()}
            ${this.modernUIRenderer.renderMainWorkspace()}
          </div>
          ${this.modernUIRenderer.renderStatusBar()}
        </div>
      `;

      // 加载样式
      this.loadStyles();

      // 重新渲染多会话 Tab
      // 因为 innerHTML 重写会导致 DOM 元素丢失，需要手动刷新一次
      if ((window as any).sessionTabsRenderer) {
        (window as any).sessionTabsRenderer.refresh();
      }

      // 如果当前是设置页面，自动初始化设置管理器（绑定事件等）
      if (this.stateManager.getState().currentPage === 'settings') {
        console.log('⚙️ 检测到进入设置页面，触发初始化...');
        this.settingsPageManager.initialize();
      }

      // 如果当前是数据库页面，初始化数据库页面管理器
      if (this.stateManager.getState().currentPage === 'database') {
        console.log('🗄️ 检测到进入数据库页面，触发初始化...');
        // 等待下一帧以确保 DOM 已渲染
        requestAnimationFrame(async () => {
            const container = document.getElementById('database-page-container');
            if (container) {
                await databasePageManager.initialize('database-page-container');
                
                // 如果有活跃的 SSH 连接，自动设置会话
                // 优先从 sshConnectionManager 获取真实的后端 sessionId
                const status = sshConnectionManager.getConnectionStatus();
                const session_id = status?.sessionId;
                
                console.log('🗄️ 数据库页面初始化：检查活跃连接', { 
                    sessionId: session_id,
                    connected: sshConnectionManager.isConnected()
                });

                if (session_id) {
                    await databasePageManager.setSession(session_id);
                } else {
                    console.log('⚠️ 数据库页面初始化：无活跃连接');
                }
            }
        });
      }
    }
  }

  /**
   * 加载样式文件
   */
  private loadStyles(): void {
    const existingLink = document.querySelector('link[href*="base.css"]');
    if (!existingLink) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/src/css/base.css';
      document.head.appendChild(link);
    }
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    // 定义全局窗口函数
    this.defineGlobalFunctions();

    // 全局点击事件处理
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // 主题切换 - 分段控制器
      const themeBtn = target.closest('.segmented-btn');
      if (themeBtn && themeBtn.closest('.theme-switcher')) {
        const theme = themeBtn.getAttribute('data-theme-value');
        if (theme && ['light', 'dark', 'sakura'].includes(theme)) {
          this.setTheme(theme as 'light' | 'dark' | 'sakura');
        }
      }

      // 导航点击事件
      const navItem = target.closest('.nav-item');
      // 排除设置按钮（它也有nav-item类，但没有data-nav-id或id不同）
      if (navItem && navItem.getAttribute('data-nav-id')) {
        const navId = navItem.getAttribute('data-nav-id');
        if (navId) {
            // 检查连接状态
            const state = this.stateManager.getState();
            const isConnected = state.isConnected;
            // 未连接时允许访问的页面
            const allowedOffline = ['dashboard', 'settings'];
            
            console.log(`[App] Navigation attempt: ${navId}, Connected: ${isConnected}`);

            if (!isConnected && !allowedOffline.includes(navId)) {
                console.warn(`[App] Blocked navigation to ${navId} (Not connected)`);
                this.showMessage('请先连接服务器以使用此功能', 'warning');
                return;
            }

            this.stateManager.setCurrentPage(navId as any);
            this.modernUIRenderer.updateState(this.stateManager.getState());
            this.render(); // 重新渲染以更新视图
        }
      }

      // 点击外部关闭下拉菜单
      if (!target.closest('.sidebar-settings-container')) {
        (window as any).hideSettingsDropdown && (window as any).hideSettingsDropdown();
      }
      if (!target.closest('.connection-card-wrapper')) {
        (window as any).hideConnectionDropdown && (window as any).hideConnectionDropdown();
      }
    });

    // 窗口控制事件
    this.bindWindowControls();
    
    // SSH连接事件
    this.bindSSHEvents();
    
    // Docker管理事件
    this.bindDockerEvents();
  }



  /**
   * 定义全局窗口函数
   */
  private defineGlobalFunctions(): void {
    // 设置下拉菜单
    (window as any).toggleSettingsDropdown = () => {
      const menu = document.getElementById('settings-dropdown-menu');
      if (menu) {
        menu.classList.toggle('show');
      }
    };

    (window as any).hideSettingsDropdown = () => {
      const menu = document.getElementById('settings-dropdown-menu');
      if (menu) {
        menu.classList.remove('show');
      }
    };

    // 连接下拉菜单
    (window as any).toggleConnectionDropdown = () => {
      const menu = document.getElementById('connection-dropdown-menu');
      if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      }
    };

    (window as any).hideConnectionDropdown = () => {
      const menu = document.getElementById('connection-dropdown-menu');
      if (menu) {
        menu.style.display = 'none';
      }
    };

    // Debug 工具
    (window as any).toggleDevTools = async () => {
      try {
        await invoke('open_devtools');
      } catch (e) {
        console.error('Failed to open devtools:', e);
      }
    };

    // 菜单操作
    (window as any).handleUserMenuAction = (action: string) => {
        if (action === 'settings') {
            this.stateManager.setCurrentPage('settings');
            this.modernUIRenderer.updateState(this.stateManager.getState());
            this.render();
        }
    };
  }

  /**
   * 绑定窗口控制事件
   */
  private bindWindowControls(): void {
    document.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      
      // 使用 closest() 来处理事件冒泡，因为点击的可能是按钮内部的 SVG 图标
      if (target.closest('.minimize-btn')) {
        await invoke('minimize_window');
      } else if (target.closest('.maximize-btn')) {
        await invoke('toggle_maximize');
      } else if (target.closest('.close-btn')) {
        await invoke('close_window');
      }
    });
  }

  /**
   * 绑定SSH事件
   */
  private bindSSHEvents(): void {
    // SSH连接按钮
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (target.classList.contains('ssh-connect-btn')) {
        this.handleSSHConnect();
        return;
      }

      if (target.classList.contains('disconnect-btn') || target.closest('.disconnect-btn')) {
        this.handleSSHDisconnect();
      }
    });
  }

  /**
   * 绑定Docker事件
   */
  private bindDockerEvents(): void {
    // Docker管理按钮
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('docker-manage-btn')) {
        this.handleDockerManage();
      }
    });
  }

  /**
   * 处理SSH连接
   */
  private async handleSSHConnect(): Promise<void> {
    try {
      this.stateManager.setLoading(true);

      // 获取连接列表，如果有连接则连接第一个
      const connections = this.sshManager.getConnections();
      if (connections.length === 0) {
        this.showMessage('请先添加SSH连接配置', 'warning');
        return;
      }

      // 连接到第一个配置的服务器
      await this.sshManager.connect(connections[0].id);
      this.stateManager.setConnected(true, connections[0].name);
      this.showMessage('SSH连接成功', 'success');
    } catch (error) {
      console.error('SSH连接失败:', error);
      this.showMessage('SSH连接失败', 'error');
    } finally {
      this.stateManager.setLoading(false);
    }
  }

  /**
   * 处理SSH断开
   */
  private async handleSSHDisconnect(): Promise<void> {
    try {
      this.stateManager.setLoading(true);
      await this.sshManager.disconnect();
      await sshConnectionManager.disconnect();
      this.stateManager.setConnected(false);
      
      // 如果当前页面不是离线可访问的页面，切换回仪表板
      const allowedOffline = ['dashboard', 'settings'];
      const currentPage = this.stateManager.getState().currentPage;
      if (currentPage && !allowedOffline.includes(currentPage)) {
          this.stateManager.setCurrentPage('dashboard');
      }
      this.showMessage('已断开 SSH 连接', 'info');
      const cache = (window as any).systemInfoCache;
      if (cache) {
        cache.detailedInfo = null;
        cache.lastUpdate = null;
        cache.isLoading = false;
      }
      (window as any).stopDashboardAutoRefresh?.();
      (window as any).refreshServerList?.();
      (window as any).refreshSidebar?.();
      (window as any).refreshDashboard?.();
    } catch (error) {
      console.error('SSH 断开失败:', error);
      this.showMessage('SSH 断开失败', 'error');
    } finally {
      this.stateManager.setLoading(false);
    }
  }

  /**
   * 处理Docker管理
   */
  private async handleDockerManage(): Promise<void> {
    try {
      // Docker管理逻辑将在Docker模块中实现
      await this.dockerManager.listContainers();
      this.showMessage('Docker容器列表已更新', 'info');
    } catch (error) {
      console.error('Docker管理失败:', error);
      this.showMessage('Docker管理失败', 'error');
    }
  }

  /**
   * 更新标题栏
   */
  private updateTitleBar(): void {
    // 只更新主题切换按钮，避免重新渲染整个标题栏
    this.updateThemeToggleButton();
  }

  /**
   * 更新主题切换按钮
   */
  private updateThemeToggleButton(): void {
    const currentTheme = this.stateManager.getState().theme;
    const buttons = document.querySelectorAll('.theme-switcher .segmented-btn');
    
    buttons.forEach(btn => {
      const themeValue = btn.getAttribute('data-theme-value');
      if (themeValue === currentTheme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * 显示消息
   */
  private showMessage(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
    // 简单的消息显示实现
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // 使用系统的通知功能
    if ((window as any).showNotification) {
        (window as any).showNotification(message, type);
    }
  }

  /**
   * 获取应用状态
   */
  getState(): AppState {
    return this.stateManager.getState();
  }

  /**
   * 获取状态管理器
   */
  getStateManager(): StateManager {
    return this.stateManager;
  }

  /**
   * 获取SSH管理器
   */
  getSSHManager(): SSHManager {
    return this.sshManager;
  }

  /**
   * 获取Docker管理器
   */
  getDockerManager(): DockerManager {
    return this.dockerManager;
  }

  /**
   * 获取Kubernetes管理器
   */
  getKubernetesManager(): KubernetesManager {
    return this.kubernetesManager;
  }
}
