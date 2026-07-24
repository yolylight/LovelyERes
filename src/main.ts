/**
 * LovelyRes 主入口文件
 * Linux Emergency Response Tool
 */

import './css/main.css';
import './styles/session-tabs.css';
import 'xterm/css/xterm.css';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

// 注入全局对象以兼容其他模块的调用
(window as any).hljs = hljs;

import type { LovelyResApp } from './modules/core/app';

import { initNotificationManager } from './modules/ui/notificationManager';

let app: LovelyResApp | null = null;
let bootPromise: Promise<void> | null = null;
let postBootDomListenersBound = false;

function removeLoadingScreen(): void {
  const loadingScreen = document.getElementById('loading-screen');
  if (!loadingScreen) return;

  loadingScreen.classList.add('hidden');
  setTimeout(() => loadingScreen.remove(), 600);
}

function removeLegacyAccessArtifacts(): void {
  document.body.classList.remove('auth-locked');

  try {
    [
      'lovelyres-access-token',
      'lovelyres-refresh-token',
      'lovelyres-user-info'
    ].forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn('清理旧访问状态失败:', error);
  }

  document
    .querySelectorAll(
      '#login-modal, #bind-device-modal, #account-settings-modal, .auth-required-toast, .license-card, .license-modal'
    )
    .forEach((element) => element.remove());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showStartupFailure(error: unknown): void {
  removeLoadingScreen();

  const appEl = document.getElementById('app');
  if (!appEl) return;

  appEl.innerHTML = `
    <div style="
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100vh; background: #f8fafc; color: #1e293b;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="font-size: 42px; margin-bottom: 24px;">启动失败</div>
      <h2 style="margin-bottom: 16px;">应用启动失败</h2>
      <p style="color: #64748b; text-align: center; max-width: 420px; line-height: 1.7;">
        LovelyRes 在启动过程中遇到了问题。请检查控制台获取详细错误信息。
      </p>
      <pre style="
        margin-top: 16px; max-width: 520px; white-space: pre-wrap; word-break: break-word;
        color: #dc2626; background: #fee2e2; padding: 12px; border-radius: 8px; font-size: 12px;
      ">${escapeHtml(String(error))}</pre>
      <button onclick="location.reload()" style="
        margin-top: 24px; padding: 12px 24px;
        background: #4299e1; color: white; border: none;
        border-radius: 8px; cursor: pointer; font-size: 14px;
      ">重新加载</button>
    </div>
  `;
}

/**
 * 在新窗口中打开 SSH 终端
 */
async function openSSHTerminalWindow(): Promise<void> {
  const sessionId = (window as any).sshConnectionManager?.getCurrentSessionId?.();
  const safeLabel = sessionId
    ? `ssh-terminal-${sessionId.replace(/[^a-zA-Z0-9]/g, '-')}`
    : 'ssh-terminal';
  const url = sessionId
    ? `/ssh-terminal.html?sessionId=${encodeURIComponent(sessionId)}`
    : '/ssh-terminal.html';

  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existingWindow = await WebviewWindow.getByLabel(safeLabel);
    if (existingWindow) {
      await existingWindow.setFocus();
      await existingWindow.unminimize();
      return;
    }

    const isMacOS = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const sshWindow = new WebviewWindow(safeLabel, {
      url,
      title: 'SSH Terminal - LovelyRes',
      width: 1000,
      height: 700,
      minWidth: 600,
      minHeight: 400,
      resizable: true,
      maximizable: true,
      minimizable: true,
      closable: true,
      center: true,
      decorations: isMacOS,
      alwaysOnTop: false,
      skipTaskbar: false
    });

    sshWindow.once('tauri://error', (error) => console.error('SSH 终端窗口创建错误:', error));
  } catch (error) {
    console.error('创建 SSH 终端窗口失败:', error);

    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existingWindow = await WebviewWindow.getByLabel(safeLabel);
      if (existingWindow) {
        await existingWindow.setFocus();
        await existingWindow.unminimize();
        return;
      }
    } catch (focusError) {
      console.error('聚焦 SSH 终端窗口失败:', focusError);
    }

    const fallbackWindow = window.open(url, '_blank', 'width=1000,height=700,resizable=yes');
    if (!fallbackWindow) {
      window.showNotification?.('无法打开 SSH 终端窗口', 'error');
    }
  }
}

function bindPostBootDomListeners(logContextMenu: { showContextMenu(x: number, y: number, content: string): void }): void {
  if (postBootDomListenersBound) return;
  postBootDomListenersBound = true;

  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    const logEntry = target.closest('.log-entry');
    if (!logEntry) return;

    e.preventDefault();
    const content = logEntry.textContent?.trim().replace(/\s+/g, ' ') || '';
    if (content) {
      logContextMenu.showContextMenu(e.clientX, e.clientY, content);
    }
  });

  document.body.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const terminalBtn = target.closest('#ssh-terminal-title-btn');
    if (terminalBtn) {
      event.preventDefault();
      event.stopPropagation();
      void openSSHTerminalWindow();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest('tr') && !target.closest('[id$="-context-menu"]')) {
      document.querySelectorAll('.system-table tr.selected').forEach(row => {
        row.classList.remove('selected');
      });
    }
  });
}

async function bootstrapApp(): Promise<void> {
  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = (async () => {
    removeLegacyAccessArtifacts();
    console.log('LovelyRes 启动中...');

    const [
      { LovelyResApp },
      { remoteOperationsManager },
      { sshTerminalManager },
      { SettingsManager },
      { SettingsPageManager },
      { FileViewerModal },
      { PermissionsModal },
      { EmergencyResultModal },
      { CommandHistoryModal },
      { FileContextMenu },
      { LogContextMenu },
      { UploadModal },
      { CreateFolderModal },
      { initSftpContextMenuHandler },
      { initServerModalManager },
      { initTableFilterManager },
      { initSystemInfoTabManager },
      { initTableUpdateManager },
      { initLogAnalysisManager },
      { initCommandPalette },
      { initKeyboardShortcuts },
      { initGlobalFunctions },
      { logger },
      { i18n },
      { forensicManager }
    ] = await Promise.all([
      import('./modules/core/app'),
      import('./modules/remote/remoteOperationsManager'),
      import('./modules/ssh/sshTerminalManager'),
      import('./modules/settings/settingsManager'),
      import('./modules/settings/settingsPageManager'),
      import('./modules/ui/fileViewerModal'),
      import('./modules/ui/permissionsModal'),
      import('./modules/ui/emergencyModal'),
      import('./modules/ui/commandHistoryModal'),
      import('./modules/ui/fileContextMenu'),
      import('./modules/ui/logContextMenu'),
      import('./modules/ui/uploadModal'),
      import('./modules/ui/createFolderModal'),
      import('./modules/ui/sftpContextMenuHandler'),
      import('./modules/ui/serverModalManager'),
      import('./modules/ui/tableFilterManager'),
      import('./modules/ui/systemInfoTabManager'),
      import('./modules/ui/tableUpdateManager'),
      import('./modules/ui/logAnalysisManager'),
      import('./modules/ui/commandPalette'),
      import('./modules/ui/keyboardShortcuts'),
      import('./modules/ui/globalFunctions'),
      import('./modules/core/logger'),
      import('./modules/i18n'),
      import('./modules/emergency/forensicManager')
    ]);

    initTableFilterManager();
    initTableUpdateManager();
    initSystemInfoTabManager();
    initServerModalManager();
    initSftpContextMenuHandler();
    initLogAnalysisManager();

    const log = logger.module('App');
    log.info(`LovelyRes 启动中... (语言: ${i18n.lang})`);
    forensicManager.loadFromStorage();

    const settingsManager = new SettingsManager();
    const settingsPageManager = new SettingsPageManager(settingsManager);

    app = new LovelyResApp();

    const fileViewerModal = new FileViewerModal();
    const permissionsModal = new PermissionsModal();
    const emergencyResultModal = new EmergencyResultModal();
    const commandHistoryModal = new CommandHistoryModal();
    const fileContextMenu = new FileContextMenu();
    const logContextMenu = new LogContextMenu();
    const uploadModal = new UploadModal();
    const createFolderModal = new CreateFolderModal();

    (window as any).fileViewerModal = fileViewerModal;
    (window as any).permissionsModal = permissionsModal;
    (window as any).emergencyResultModal = emergencyResultModal;
    (window as any).commandHistoryModal = commandHistoryModal;
    (window as any).fileContextMenu = fileContextMenu;
    (window as any).logContextMenu = logContextMenu;
    (window as any).uploadModal = uploadModal;
    (window as any).createFolderModal = createFolderModal;

    bindPostBootDomListeners(logContextMenu);

    await app.initialize();
    removeLoadingScreen();

    (window as any).app = app;
    (window as any).lovelyResApp = app;
    (window as any).openSSHTerminalWindow = openSSHTerminalWindow;

    setTimeout(() => {
      if (document.getElementById('ssh-terminal-container')) {
        sshTerminalManager.mountTerminal();
      }
    }, 1000);

    initGlobalFunctions({ app, settingsPageManager, openSSHTerminalWindow });

    await remoteOperationsManager.initialize();
    await sshTerminalManager.initialize();
    await settingsManager.initialize();

    initCommandPalette();
    initKeyboardShortcuts(app);

    await setupMainWindowCloseListener();

    console.log('LovelyRes 启动完成');
  })().catch((error) => {
    bootPromise = null;
    console.error('LovelyRes 启动失败:', error);
    showStartupFailure(error);
  });

  return bootPromise;
}

/**
 * 监听主窗口关闭请求，确保关闭主窗口前对应的终端窗口与 Session 已安全关闭
 */
async function setupMainWindowCloseListener(): Promise<void> {
  try {
    const { getCurrentWebviewWindow, getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
    const appWindow = getCurrentWebviewWindow();

    await appWindow.onCloseRequested(async (event) => {
      // 1. 阻止默认直接关闭
      event.preventDefault();
      console.log('🛑 [Main] 收到主窗口关闭请求，开始安全清理关联终端窗口与 SSH 连接...');

      const cleanup = async () => {
        // 2. 遍历所有 Webview 窗口，将所有终端子窗口彻底 destroy
        const windows = await getAllWebviewWindows();
        for (const win of windows) {
          if (win.label !== appWindow.label) {
            console.log(`🔌 [Main] 正在安全关闭终端窗口: ${win.label}`);
            await win.destroy();
          }
        }

        // 3. 清理后端所有 SSH 终端通道
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('ssh_close_all_terminal_sessions');

        // 4. 清理所有 SSH 活动会话
        const { multiSessionManager } = await import('./modules/remote/multiSessionManager');
        const sessions = multiSessionManager.getSessions();
        for (const session of sessions) {
          try {
            await invoke('ssh_disconnect_direct', { sessionId: session.sessionId });
          } catch (e) {
            console.warn(`断开会话 ${session.sessionId} 提示:`, e);
          }
        }
      };

      // 最多等待 5 秒完成清理，超时后强制销毁，避免主窗口无法关闭
      try {
        await Promise.race([
          cleanup(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('cleanup timeout')), 5000)),
        ]);
        console.log('✅ 所有终端窗口与连接已安全关闭，正在销毁主窗口');
      } catch (cleanError) {
        console.warn('⚠️ 清理超时或出错，强制关闭主窗口:', cleanError);
      } finally {
        await appWindow.destroy();
      }
    });
  } catch (error) {
    console.warn('⚠️ 注册主窗口关闭监听器提示（可能处在非 Tauri 环境）:', error);
  }
}


async function initializeApp(): Promise<void> {
  initNotificationManager();
  removeLegacyAccessArtifacts();
  await bootstrapApp();
}

window.addEventListener('error', (event) => {
  const msg = (event as any).message as string | undefined;
  if (msg && typeof msg === 'string' && msg.includes('ResizeObserver loop')) return;
  if ((event as any).error) {
    console.error('全局错误:', (event as any).error);
  } else {
    console.error('全局错误:', event.message, event.filename, event.lineno, event.colno);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的 Promise 拒绝:', event.reason);
});

window.addEventListener('beforeunload', () => {
  if (app) {
    console.log('LovelyRes 正在清理资源...');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  void initializeApp();
});
