/**
 * SSH连接管理器
 * 处理实际的SSH连接操作和状态管理
 * 与ssh/connectionManager.ts协同工作
 */

import { SSHConfigManager as ConfigManager } from '../ssh/connectionManager';

export interface SSHConnectionInfo {
  id?: string; // 连接配置ID
  sessionId?: string; // 后端会话ID（格式 username@host:port）
  host: string;
  port: number;
  username: string;
  connected: boolean;
  useSudo?: boolean; // 是否使用 sudo 提权
  lastActivity?: Date;
}

export class SSHSessionManager {
  private connectionStatus: SSHConnectionInfo | null = null;
  private listeners: Array<(status: SSHConnectionInfo | null) => void> = [];
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }

  /**
   * 获取当前连接状态
   */
  getConnectionStatus(): SSHConnectionInfo | null {
    return this.connectionStatus;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connectionStatus?.connected || false;
  }

  /**
   * 获取当前连接的ID
   */
  getCurrentConnectionId(): string | undefined {
    return this.connectionStatus?.id;
  }

  /**
   * 获取当前会话ID（后端会话键，格式 username@host:port）
   */
  getCurrentSessionId(): string | undefined {
    return this.connectionStatus?.sessionId;
  }

  /**
   * 手动设置连接状态（用于同步主界面连接状态）
   */
  setConnectionStatus(status: SSHConnectionInfo | null): void {
    this.connectionStatus = status;
    this.notifyListeners();
  }

  /**
   * 建立SSH连接
   * 兼容密码/密钥认证（authType/keyPath/keyPassphrase）以及 sudo 提权（useSudo/sudoPassword）。
   */
  async connect(
    host: string,
    port: number,
    username: string,
    password: string,
    authType: string = 'password',
    keyPath?: string,
    keyPassphrase?: string,
    useSudo: boolean = false,
    sudoPassword?: string
  ): Promise<void> {
    try {
      console.log('📞 [sshConnectionManager] connect 方法被调用');
      console.log('  参数详情:', { host, port, username, authType, hasPassword: !!password, hasKeyPath: !!keyPath, useSudo });

      const portNumber = typeof port === 'string' ? parseInt(port, 10) : port;
      if (isNaN(portNumber) || portNumber <= 0 || portNumber > 65535) {
        throw new Error(`无效的端口号: ${port} (类型: ${typeof port})`);
      }

      // 如果启用 sudo 但没有传入 sudo 密码，尝试从已保存的连接配置中解密
      let finalSudoPassword = sudoPassword;
      if (useSudo && !finalSudoPassword) {
        const existingConnections = this.configManager.getConnections();
        const connection = existingConnections.find(conn =>
          conn.host === host && conn.port === portNumber && conn.username === username
        );

        if (connection && connection.encryptedSudoPassword) {
          try {
            finalSudoPassword = await (window as any).__TAURI__.core.invoke('decrypt_password', {
              encryptedPassword: connection.encryptedSudoPassword
            }) as string;
            console.log('🔓 已自动解密 Sudo 密码');
          } catch (error) {
            console.error('❌ 解密 Sudo 密码失败:', error);
            // 解密失败，依然尝试连接（可能不需要密码）
          }
        }
      }

      console.log('⚡ 调用 Tauri invoke: ssh_connect_direct, authType:', authType);
      // 后端返回会话 ID（格式 username@host:port）
      const sessionId = await (window as any).__TAURI__.core.invoke('ssh_connect_direct', {
        host,
        port: portNumber,
        username,
        password: authType === 'password' ? password : undefined,
        authType,
        keyPath: authType === 'key' ? keyPath : undefined,
        keyPassphrase: authType === 'key' ? keyPassphrase : undefined,
        useSudo,             // 传递 sudo 选项
        sudoPassword: finalSudoPassword // 传递 sudo 密码
      }) as string;

      console.log('✅ [sshConnectionManager] Tauri invoke 返回成功, sessionId:', sessionId);

      // 更新连接状态，使用后端返回的 session_id
      this.connectionStatus = {
        host,
        port: portNumber,
        username,
        connected: true,
        useSudo,
        sessionId: sessionId || `${username}@${host}:${portNumber}#${crypto.randomUUID()}`,
        lastActivity: new Date()
      };

      // 注册到多会话管理器（多标签页支持）
      const { multiSessionManager } = await import('./multiSessionManager');
      multiSessionManager.addSession(this.connectionStatus.sessionId!, this.connectionStatus);

      // 保存连接配置（包含 useSudo 选项）
      await this.saveConnectionConfig(host, portNumber, username, useSudo, sudoPassword, authType === 'password' ? password : undefined);

      // 通知监听器
      this.notifyListeners();

      // 初始化终端工作目录
      if ((window as any).terminalManager && (window as any).terminalManager.initializeWorkingDirectory) {
        setTimeout(() => {
          (window as any).terminalManager.initializeWorkingDirectory();
        }, 500);
      }

    } catch (error) {
      console.error('SSH连接失败:', error);
      throw error;
    }
  }

  /**
   * 断开SSH连接
   */
  async disconnect(): Promise<void> {
    try {
      if (this.connectionStatus?.connected) {
        const sessionId = this.connectionStatus.sessionId;

        // 多标签页：显式传入 sessionId，只断开当前会话，避免断错会话
        await (window as any).__TAURI__.core.invoke('ssh_disconnect_direct', {
          sessionId
        });

        // 从多会话管理器中移除
        if (sessionId) {
          const { multiSessionManager } = await import('./multiSessionManager');
          multiSessionManager.removeSession(sessionId);
        }

        this.connectionStatus = null;
        this.notifyListeners();
      }
    } catch (error) {
      console.error('断开SSH连接失败:', error);
    }
  }

  /**
   * 更新最后活动时间（仅本地更新，不触发全局监听，以避免循环刷新）
   */
  updateLastActivity(): void {
    if (this.connectionStatus) {
      this.connectionStatus.lastActivity = new Date();
      // 不再调用 notifyListeners()，防止触发 UI 刷新循环
    }
  }

  /**
   * 添加状态监听器
   */
  addListener(listener: (status: SSHConnectionInfo | null) => void): void {
    this.listeners.push(listener);
  }

  /**
   * 移除状态监听器
   */
  removeListener(listener: (status: SSHConnectionInfo | null) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 保存连接配置
   */
  private async saveConnectionConfig(
    host: string,
    port: number,
    username: string,
    useSudo: boolean = false,
    sudoPassword?: string,
    password?: string
  ): Promise<void> {
    try {
      // 检查是否已存在相同的连接配置
      const existingConnections = this.configManager.getConnections();
      const existing = existingConnections.find(conn =>
        conn.host === host && conn.port === port && conn.username === username
      );

      // 加密 sudo 密码（如提供）
      let encryptedSudoPassword: string | undefined;
      if (sudoPassword) {
        try {
          encryptedSudoPassword = await (window as any).__TAURI__.core.invoke('encrypt_password', {
            password: sudoPassword
          }) as string;
        } catch (error) {
          console.error('Sudo密码加密失败:', error);
          // 加密失败时不保存密码，避免明文泄露
          encryptedSudoPassword = undefined;
        }
      }

      if (!existing) {
        // 创建新的连接配置
        const connectionName = `${username}@${host}:${port}`;
        await this.configManager.addConnection({
          name: connectionName,
          host,
          port,
          username,
          authType: 'password' as const,
          tags: ['auto-saved'],
          useSudo,                 // 保存sudo配置
          encryptedSudoPassword,   // 保存加密的sudo密码
          accounts: [{
            username,
            authType: 'password' as const,
            password,              // 明文密码，addConnection 内部会处理加密
            isDefault: true
          }]
        });
        console.log('✅ 连接配置已自动保存:', connectionName, useSudo ? '(使用sudo)' : '');
      } else {
        // 更新现有连接配置的 sudo 设置
        const updates: any = { useSudo };
        if (encryptedSudoPassword !== undefined) {
          updates.encryptedSudoPassword = encryptedSudoPassword;
        }
        // sudoPassword 为 undefined 时不更新，保留原密码
        await this.configManager.updateConnection(existing.id!, updates);
      }
    } catch (error) {
      console.error('保存连接配置失败:', error);
      // 不抛出错误，因为这不应该影响连接本身
    }
  }

  /**
   * 更新当前会话的 Sudo 密码（sudo 密码错误重试时使用）
   */
  async updateSessionSudoPassword(sessionId: string, password: string): Promise<void> {
    try {
      await (window as any).__TAURI__.core.invoke('ssh_update_session_sudo_password_direct', {
        sessionId,
        password
      });
      console.log('🔑 会话Sudo密码更新成功');
    } catch (error) {
      console.error('更新会话Sudo密码失败:', error);
      throw error;
    }
  }

  /**
   * 执行SSH命令并带有Sudo重试逻辑
   * 如果遇到Sudo密码错误，会提示用户重新输入并重试
   * @param commandName Tauri invoke 命令名
   * @param args 命令参数
   * @param sessionId 会话ID（用于更新密码）
   */
  async executeCommandWithSudoRetry(commandName: string, args: any, sessionId: string | null): Promise<any> {
    try {
      return await (window as any).__TAURI__.core.invoke(commandName, args);
    } catch (error: any) {
      const errorMsg = String(error);

      // 检测 Sudo 密码错误
      if (errorMsg.includes('Sudo密码错误') && sessionId) {
        console.warn('⚠️ 检测到Sudo密码错误，尝试请求新密码...');

        // 提示用户输入新密码
        const newPassword = window.prompt('Sudo 密码错误，请重新输入:\n(输入的新密码将用于当前会话)');

        if (newPassword !== null) {
          // 更新密码
          await this.updateSessionSudoPassword(sessionId, newPassword);

          // 重试命令（后端现在使用新密码）
          console.log('🔄 使用新密码重试命令...');
          return await (window as any).__TAURI__.core.invoke(commandName, args);
        }
      }

      // 如果不是 Sudo 错误或用户取消，则抛出原错误
      throw error;
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.connectionStatus);
      } catch (error) {
        console.error('SSH连接状态监听器执行失败:', error);
      }
    });
  }

  /**
   * 检查连接状态（从后端获取最新状态）
   */
  async checkConnectionStatus(): Promise<SSHConnectionInfo | null> {
    try {
      const status = await (window as any).__TAURI__.core.invoke('ssh_get_connection_status');
      if (status) {
        this.connectionStatus = {
          host: status.host,
          port: status.port,
          username: status.username,
          connected: status.connected,
          sessionId: status.session_id,
          lastActivity: new Date(status.last_activity)
        };
        this.notifyListeners();
      } else {
        this.connectionStatus = null;
        this.notifyListeners();
      }
      return this.connectionStatus;
    } catch (error) {
      console.error('检查SSH连接状态失败:', error);
      return null;
    }
  }
}

// 全局SSH连接管理器实例
export const sshConnectionManager = new SSHSessionManager();
