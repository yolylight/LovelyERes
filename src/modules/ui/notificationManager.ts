/**
 * 通知管理器
 * 全局通知显示系统 — 底部居中/顶部悬浮 Toast 风格
 * 支持长显示时间、复制内容、手动关闭及悬停暂停倒计时
 */

import { eventBus } from '../core/eventBus';

export interface NotificationOptions {
  /** 显示持续时间 (毫秒)，设为 0 表示不自动关闭 */
  duration?: number;
  /** 是否包含复制按钮 (默认为 true) */
  copyable?: boolean;
  /** 是否包含显式关闭按钮 (默认为 true) */
  closable?: boolean;
}

declare global {
  interface Window {
    /** 全局通知; 由 initNotificationManager 在启动时挂载 */
    showNotification?: (
      message: string,
      type?: 'success' | 'error' | 'info' | 'warning',
      options?: NotificationOptions | number,
    ) => void;
  }
}

const typeColorMap: Record<string, string> = {
  success: 'var(--success-color, #10b981)',
  error: 'var(--error-color, #ef4444)',
  info: 'var(--info-color, #3b82f6)',
  warning: 'var(--warning-color, #f59e0b)'
};

const typeIconMap: Record<string, string> = {
  success: '<polyline points="20 6 9 17 4 12"></polyline>',
  error: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
  info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',
  warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>'
};

const COPY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const CHECK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const CLOSE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

const TOP_LAYER_Z_INDEX = 2147483647;

function ensureContainer(): HTMLElement {
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
  }

  if (container.parentElement !== document.body || container !== document.body.lastElementChild) {
    document.body.appendChild(container);
  }

  container.style.position = 'fixed';
  container.style.zIndex = String(TOP_LAYER_Z_INDEX);
  container.style.top = '24px';
  container.style.bottom = 'auto';
  container.style.left = '50%';
  container.style.transform = 'translateX(-50%)';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.gap = '8px';
  container.style.maxWidth = '90vw';
  container.style.pointerEvents = 'none';
  container.style.isolation = 'isolate';
  return container;
}

function ensureAnimations(): void {
  if (!document.getElementById('notification-animations')) {
    const style = document.createElement('style');
    style.id = 'notification-animations';
    style.textContent = `
      @keyframes toastIn {
        from { transform: translateY(16px) scale(0.96); opacity: 0; }
        to   { transform: translateY(0) scale(1); opacity: 1; }
      }
      @keyframes toastOut {
        from { transform: translateY(0) scale(1); opacity: 1; }
        to   { transform: translateY(16px) scale(0.96); opacity: 0; }
      }
      .notification-btn {
        background: transparent;
        border: none;
        outline: none;
        color: var(--text-tertiary, #9ca3af);
        padding: 4px;
        border-radius: 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      .notification-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-primary, #f3f4f6);
      }
      .notification-btn.close-btn:hover {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
      }
    `;
    document.head.appendChild(style);
  }
}

function dismissNotification(notification: HTMLElement): void {
  notification.style.animation = 'toastOut 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards';
  setTimeout(() => notification.remove(), 250);
}

export function showNotification(
  message: string,
  type: 'success' | 'error' | 'info' | 'warning' = 'info',
  options?: NotificationOptions | number,
): void {
  const container = ensureContainer();
  ensureAnimations();

  const opts: NotificationOptions = typeof options === 'number'
    ? { duration: options }
    : (options || {});

  // 默认显示时长：错误类型 15 秒，警告 8 秒，成功/常规 3.5 秒
  let defaultDuration = 3500;
  if (type === 'error') {
    defaultDuration = 15000;
  } else if (type === 'warning') {
    defaultDuration = 8000;
  }

  const duration = opts.duration !== undefined ? opts.duration : defaultDuration;
  const copyable = opts.copyable !== false;
  const closable = opts.closable !== false;

  const color = typeColorMap[type];
  const iconSvg = typeIconMap[type];

  const notification = document.createElement('div');
  notification.className = `modern-notification notification-${type}`;
  notification.style.cssText = `
    position: relative;
    z-index: ${TOP_LAYER_Z_INDEX};
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    border-radius: 8px;
    background: var(--bg-secondary, #1e1e2e);
    color: var(--text-primary, #ffffff);
    border: 1px solid var(--border-color, rgba(255,255,255,0.1));
    box-shadow: 0 4px 20px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.1);
    font-size: 13px;
    line-height: 1.45;
    pointer-events: auto;
    animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    backdrop-filter: blur(12px);
    max-width: 560px;
    user-select: text;
  `;

  notification.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      style="width:16px; height:16px; flex-shrink:0; margin-top: 1px;">
      ${iconSvg}
    </svg>
    <span class="notification-text" style="color: var(--text-primary); word-break: break-word; user-select: text; -webkit-user-select: text; flex: 1; cursor: text;">${escapeHtml(message)}</span>
    <div class="notification-actions" style="display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: 6px; user-select: none;">
      ${copyable ? `<button class="notification-btn copy-btn" title="复制完整消息" aria-label="复制">${COPY_ICON_SVG}</button>` : ''}
      ${closable ? `<button class="notification-btn close-btn" title="关闭" aria-label="关闭">${CLOSE_ICON_SVG}</button>` : ''}
    </div>
  `;

  // 绑定复制按钮事件
  const copyBtn = notification.querySelector('.copy-btn') as HTMLButtonElement | null;
  if (copyBtn) {
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(message).then(() => {
        copyBtn.innerHTML = CHECK_ICON_SVG;
        copyBtn.title = '已复制';
        setTimeout(() => {
          copyBtn.innerHTML = COPY_ICON_SVG;
          copyBtn.title = '复制完整消息';
        }, 1500);
      }).catch((err) => {
        console.error('复制错误信息失败:', err);
      });
    });
  }

  // 绑定关闭按钮事件
  const closeBtn = notification.querySelector('.close-btn') as HTMLButtonElement | null;
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissNotification(notification);
    });
  }

  container.appendChild(notification);

  // 定时倒计时与悬停暂停机制
  if (duration > 0) {
    let timer: number | null = null;

    const startTimer = (delay: number) => {
      clearTimer();
      timer = window.setTimeout(() => {
        if (notification.parentElement) {
          dismissNotification(notification);
        }
      }, delay);
    };

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // 初始启动定时器
    startTimer(duration);

    // 鼠标悬停暂停自动关闭，移除悬停后重置至少 5 秒的倒计时
    notification.addEventListener('mouseenter', () => clearTimer());
    notification.addEventListener('mouseleave', () => {
      startTimer(Math.max(5000, duration / 2));
    });
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 初始化通知管理器，注册全局函数和 EventBus 监听
 */
export function initNotificationManager(): void {
  window.showNotification = showNotification;

  eventBus.on('notification', ({ message, type, options }) => {
    showNotification(message, type, options);
  });
}

