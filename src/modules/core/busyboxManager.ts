/**
 * Busybox 管理器
 * 内置纯静态二进制（无 glibc 依赖，支持容器环境）全自动部署与可信命令执行
 *
 * 启用后，所有通过 Rust 后端 execute_command 执行的 SSH 命令
 * 都会自动用 busybox sh -c 包裹执行，绕过被篡改的系统命令和 LD_PRELOAD
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export type BusyboxStatus = 'unknown' | 'not-installed' | 'installed' | 'enabled';

class BusyboxManager {
  private status: BusyboxStatus = 'unknown';
  private path: string = '';
  private listeners: Array<(status: BusyboxStatus, path: string) => void> = [];

  /** 重置状态（会话断开或切换新连接时调用，防止跨会话状态污染） */
  reset(): void {
    this.status = 'unknown';
    this.path = '';
    this.notify();
  }

  /** 检测远端 busybox 状态 */
  async detect(): Promise<{ status: BusyboxStatus; path: string }> {
    try {
      const enabledPath = await invoke('busybox_status') as string | null;
      if (enabledPath) {
        this.status = 'enabled';
        this.path = enabledPath;
        this.notify();
        return { status: this.status, path: this.path };
      }

      const detected = await invoke('busybox_detect') as string;
      if (detected && detected.trim()) {
        this.status = 'installed';
        this.path = detected.trim();
      } else {
        this.status = 'not-installed';
        this.path = '';
      }
    } catch {
      this.status = 'unknown';
      this.path = '';
    }
    this.notify();
    return { status: this.status, path: this.path };
  }

  /** 自动部署客户端内置的纯静态 Busybox（无 glibc 依赖，支持容器环境）并激活 */
  async autoDeploy(): Promise<string> {
    const remotePath = await invoke('busybox_auto_deploy') as string;
    this.path = remotePath;
    this.status = 'enabled';
    this.notify();
    return remotePath;
  }

  /** 打开文件选择器，选择本地 busybox 二进制，通过 SFTP 上传到远端（备用高级功能） */
  async uploadFromLocal(): Promise<string> {
    let localPath: string | null = null;
    try {
      const selected = await open({
        title: '选择本地 busybox 静态二进制文件',
        multiple: false,
        filters: [{ name: 'All Files', extensions: ['*'] }],
      });
      if (typeof selected === 'string') {
        localPath = selected;
      } else if (selected && typeof selected === 'object' && 'path' in selected) {
        localPath = (selected as any).path;
      }
    } catch {
      localPath = null;
    }

    if (!localPath) {
      throw new Error('未选择文件');
    }

    const output = await invoke('busybox_install', { localPath }) as string;
    if (output.includes('INSTALL_OK')) {
      this.path = '/tmp/busybox';
      this.status = 'installed';
      this.notify();
    } else {
      throw new Error('上传或验证失败: ' + output);
    }
    return output;
  }

  /** 直接指定本地路径上传 (不弹文件选择器) */
  async uploadFromPath(localPath: string): Promise<string> {
    const output = await invoke('busybox_install', { localPath }) as string;
    if (output.includes('INSTALL_OK')) {
      this.path = '/tmp/busybox';
      this.status = 'installed';
      this.notify();
    } else {
      throw new Error('上传或验证失败: ' + output);
    }
    return output;
  }

  /** 启用 busybox 模式 */
  async enable(path?: string): Promise<void> {
    const p = path || this.path || '/dev/shm/.busybox';
    await invoke('busybox_enable', { path: p });
    this.status = 'enabled';
    this.path = p;
    this.notify();
  }

  /** 禁用 busybox 模式 */
  async disable(): Promise<void> {
    await invoke('busybox_disable');
    this.status = this.path ? 'installed' : 'not-installed';
    this.notify();
  }

  /** 一键部署: 检测 → 内置自动部署(优先)/手动上传 → 启用 */
  async deployAndEnable(): Promise<string> {
    let log = '';

    // 1. 检测远端是否已有
    const { status } = await this.detect();
    log += `检测状态: ${status}\n`;

    if (status === 'enabled') {
      log += `Busybox 已启用: ${this.path}\n`;
      return log;
    }

    // 2. 远端已有但未启用 → 直接启用
    if (status === 'installed') {
      log += `远端已有 Busybox: ${this.path}，正在启用...\n`;
      await this.enable();
      log += 'Busybox 模式已启用。\n';
      return log;
    }

    // 3. 远端没有 → 优先通过内置静态二进制全自动部署（免手动上传）
    log += '远端未找到 Busybox，正在自动配置内置纯静态 Busybox...\n';
    try {
      const installedPath = await this.autoDeploy();
      log += `内置 Busybox 自动部署成功并已激活: ${installedPath}\n`;
      return log;
    } catch (e: any) {
      log += `内置自动部署未成功 (${e})，回退到手动文件上传...\n`;
      const uploadLog = await this.uploadFromLocal();
      log += uploadLog + '\n';
      await this.enable();
      log += `Busybox 模式已启用: ${this.path}\n`;
      return log;
    }
  }

  // ──── 首次连接决策持久化 ────

  private getStorageKey(serverKey: string): string {
    return `lovely_bb_decision_${serverKey.trim()}`;
  }

  isServerDecisionMade(serverKey: string): boolean {
    if (!serverKey) return false;
    return !!localStorage.getItem(this.getStorageKey(serverKey));
  }

  getServerDecision(serverKey: string): 'enabled' | 'disabled' | null {
    if (!serverKey) return null;
    return localStorage.getItem(this.getStorageKey(serverKey)) as 'enabled' | 'disabled' | null;
  }

  setServerDecision(serverKey: string, decision: 'enabled' | 'disabled'): void {
    if (!serverKey) return;
    localStorage.setItem(this.getStorageKey(serverKey), decision);
  }

  /**
   * 每次首次连接到新服务器时弹窗确认一次
   * 1. 若此前已确认过：已开启的自动静默激活，未开启的保持默认模式，不弹窗打扰；
   * 2. 若首次连接该服务器：弹出确认模态框，引导用户选择是否启用内置 Busybox；
   */
  async promptFirstConnect(serverKey: string): Promise<void> {
    if (!serverKey) return;

    // 先重置上一个连接可能残留的状态
    this.reset();

    const decision = this.getServerDecision(serverKey);

    if (decision === 'disabled') {
      // 之前已明确确认使用默认模式，不再弹窗打扰
      return;
    }

    if (decision === 'enabled') {
      // 之前已选择启用，后台自动静默激活
      try {
        const { status } = await this.detect();
        if (status === 'enabled') return;
        if (status === 'installed') {
          await this.enable();
        } else {
          await this.autoDeploy();
        }
      } catch (err) {
        console.warn('[busybox] 自动恢复启用 Busybox 失败，回退为默认模式:', err);
      }
      return;
    }

    // 首次连接：未记录过该服务器的选择，弹窗确认一次
    const { showConfirm } = await import('../ui/confirmDialog');

    const { status, path } = await this.detect();
    const promptMsg = status === 'installed'
      ? `检测到目标服务器已有 Busybox (${path})。\n\n是否启用 Busybox 可信命令执行模式？\n\n• 启用：所有命令优先经 Busybox 执行，防御环境劫持与命令篡改。\n• 默认：使用系统自带原生命令。`
      : `这是您首次连接到新服务器/容器 (${serverKey})。\n\n是否启用内置 Busybox 可信模式？\n\n• 启用（推荐）：系统将自动注入纯静态 Musl Busybox（无 glibc 依赖，支持容器环境），防篡改、防 LD_PRELOAD 劫持，全自动配置无需手动选择文件。\n• 默认模式：直接使用目标系统的原生环境命令及内置轻量垫片。`;

    const userChoseBusybox = await showConfirm({
      title: '选择命令执行模式（首次连接）',
      message: promptMsg,
      confirmText: status === 'installed' ? '启用 Busybox 模式' : '启用内置 Busybox（推荐）',
      cancelText: '使用默认模式',
    });

    if (userChoseBusybox) {
      try {
        window.showNotification?.('正在配置 Busybox 可信执行环境...', 'info');
        if (status === 'installed') {
          await this.enable();
          this.setServerDecision(serverKey, 'enabled');
          window.showNotification?.(`Busybox 可信模式已启用 (${path})`, 'success');
        } else {
          const deployedPath = await this.autoDeploy();
          this.setServerDecision(serverKey, 'enabled');
          window.showNotification?.(`内置 Busybox 部署并启用成功 (${deployedPath})`, 'success');
        }
      } catch (e: any) {
        window.showNotification?.(`Busybox 部署提示: ${e?.message || e}，已采用默认模式`, 'warning');
        this.setServerDecision(serverKey, 'disabled');
      }
    } else {
      this.setServerDecision(serverKey, 'disabled');
      window.showNotification?.('已采用默认命令执行模式', 'info');
    }
  }

  getStatus(): BusyboxStatus { return this.status; }
  getPath(): string { return this.path; }
  isEnabled(): boolean { return this.status === 'enabled'; }

  onStatusChange(fn: (status: BusyboxStatus, path: string) => void): void {
    this.listeners.push(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try { fn(this.status, this.path); } catch { /* ignore */ }
    }
  }
}

export const busyboxManager = new BusyboxManager();
