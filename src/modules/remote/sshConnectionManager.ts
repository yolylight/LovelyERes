/**
 * SSH连接管理器
 * 处理实际的SSH连接操作和状态管理
 * 与ssh/connectionManager.ts协同工作
 */

import { SSHConnectionManager as ConfigManager } from '../ssh/connectionManager';

export interface SSHConnectionInfo {
  id?: string; // 连接配置ID
  sessionId?: string; // 后端会话ID (用于多服务器支持)
  host: string;
  port: number;
  username: string;
  connected: boolean;
  lastActivity?: Date;
}

export class SSHConnectionManager {
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
   * 获取当前会话的后端 session_id
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
   */
  async connect(host: string, port: number, username: string, password: string, useSudo: boolean = false, sudoPassword?: string): Promise<void> {
    try {
      console.log('📞 [sshConnectionManager] connect 方法被调用');
      console.log('  参数详情:', {
        host,
        port,
        portType: typeof port,
        portValue: port,
        username,
        passwordLength: password?.length || 0,
        useSudo
      });

      // 确保端口是数字类型
      const portNumber = typeof port === 'string' ? parseInt(port, 10) : port;
      if (isNaN(portNumber) || portNumber <= 0 || portNumber > 65535) {
        throw new Error(`无效的端口号: ${port} (类型: ${typeof port})`);
      }

      console.log('  转换后的端口:', portNumber, typeof portNumber);

      // 查找是否已存在配置，以获取保存的 sudo 密码
      let finalSudoPassword = sudoPassword;
      if (useSudo && !finalSudoPassword) {
        const existingConnections = this.configManager.getConnections();
        const connection = existingConnections.find(conn =>
            conn.host === host && conn.port === port && conn.username === username
        );
        
        if (connection && connection.encryptedSudoPassword) {
            try {
                // 解密保存的 sudo 密码
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

      // 调用 Tauri 命令建立连接
      const sessionId = await (window as any).__TAURI__.core.invoke('ssh_connect_direct', {
        host,
        port: portNumber,
        username,
        password, // 如有加密密码，此处应传入解密后的密码（由调用方处理）
        useSudo,  // 传递 sudo 选项
        sudoPassword: finalSudoPassword // 传递 sudo 密码
      }) as string;
      

      // 更新连接状态，包含从后端返回的 session_id
      this.connectionStatus = {
        sessionId,
        host,
        port,
        username,
        connected: true,
        lastActivity: new Date()
      };

      // 注册到多会话管理器
      const { multiSessionManager } = await import('./multiSessionManager');
      multiSessionManager.addSession(sessionId, this.connectionStatus);

      // 保存连接配置（包含useSudo选项）
      await this.saveConnectionConfig(host, port, username, useSudo, sudoPassword, password);

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
        
        // 传递 session_id 以断开指定会话
        await (window as any).__TAURI__.core.invoke('ssh_disconnect_direct', {
          sessionId: sessionId || null
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
  private async saveConnectionConfig(host: string, port: number, username: string, useSudo: boolean = false, sudoPassword?: string, password?: string): Promise<void> {
    try {
      // 检查是否已存在相同的连接配置
      const existingConnections = this.configManager.getConnections();
      const exists = existingConnections.some(conn =>
        conn.host === host && conn.port === port && conn.username === username
      );

      if (!exists) {
        // 加密sudo密码
        let encryptedSudoPassword = undefined;
        if (sudoPassword) {
            try {
                // 使用后端提供的加密命令
                encryptedSudoPassword = await (window as any).__TAURI__.core.invoke('encrypt_password', {
                  password: sudoPassword
                }) as string;
            } catch (error) {
                console.error('Sudo密码加密失败:', error);
                // 加密失败时不保存密码，避免明文泄露
                encryptedSudoPassword = undefined;
            }
        }

        // 创建新的连接配置
        const connectionName = `${username}@${host}:${port}`;
        await this.configManager.addConnection({
          name: connectionName,
          host,
          port,
          username,
          authType: 'password' as const,
          tags: ['auto-saved'],
          useSudo,  // 保存sudo配置
          encryptedSudoPassword, // 保存加密的sudo密码

          accounts: [{
            username,
            authType: 'password' as const,
            password: password, // 传入明文密码，AddConnection 内部会处理加密
            encryptedPassword: undefined, // 主密码由其他逻辑处理或这里暂不保存
            keyPath: undefined,
            keyPassphrase: undefined,
            certificatePath: undefined,
            isDefault: true
          }]
        });
        console.log('✅ 连接配置已自动保存:', connectionName, useSudo ? '(使用sudo)' : '');
      } else {
        // 更新现有连接配置
        // 找到对应的连接并更新 useSudo 和 encryptedSudoPassword
        const connection = existingConnections.find(conn =>
            conn.host === host && conn.port === port && conn.username === username
        );

        if (connection) {
            const updates: any = {
                useSudo
            };

            if (sudoPassword) {
                try {
                     const encrypted = await (window as any).__TAURI__.core.invoke('encrypt_password', {
                        password: sudoPassword
                     }) as string;
                     updates.encryptedSudoPassword = encrypted;
                } catch (e) {
                    console.error('更新Sudo密码加密失败:', e);
                }
            }
            
            // 如果提供了新密码，更新它
            if (password) {
                 (updates as any).password = password;
            } else if (sudoPassword === '') {
                 // 如果显式传了空字符串，可能意味着清除密码？
                 // 或者，在Dialog中如果我们没填，就不更新（保持原样）？
                 // 目前 connect 调用时，如果不填是 undefined。
            }
            
            // 如果 sudoPassword 是 undefined，则不更新（保留原密码）
            
            await this.configManager.updateConnection(connection.id!, updates);
        }
      }
    } catch (error) {
      console.error('保存连接配置失败:', error);
      // 不抛出错误，因为这不应该影响连接本身
    }
  }

  /**
   * 更新当前会话的Sudo密码
   */
  async updateSessionSudoPassword(sessionId: string, password: string): Promise<void> {
    try {
        await (window as any).__TAURI__.core.invoke('ssh_update_session_sudo_password_direct', {
            sessionId: sessionId,
            password: password
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
   * @param commandName Tauri invoke command name
   * @param args Arguments for the command
   * @param sessionId Session ID for password updating
   */
  async executeCommandWithSudoRetry(commandName: string, args: any, sessionId: string | null): Promise<any> {
    try {
        return await (window as any).__TAURI__.core.invoke(commandName, args);
    } catch (error: any) {
        const errorMsg = String(error);
        
        // 检测Sudo密码错误
        if (errorMsg.includes('Sudo密码错误') && sessionId) {
            console.warn('⚠️ 检测到Sudo密码错误，尝试请求新密码...');
            
            // 提示用户输入新密码
            // TODO: 使用更漂亮的自定义Modal代替 prompt
            const newPassword = window.prompt("Sudo 密码错误，请重新输入:\n(输入的新密码将用于当前会话)");
            
            if (newPassword !== null) {
                // 更新密码
                await this.updateSessionSudoPassword(sessionId, newPassword);
                
                // 重试命令 (后端现在使用新密码)
                console.log('🔄 使用新密码重试命令...');
                return await (window as any).__TAURI__.core.invoke(commandName, args);
            }
        }
        
        // 如果不是Sudo错误或用户取消，则抛出原错误
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
export const sshConnectionManager = new SSHConnectionManager();
