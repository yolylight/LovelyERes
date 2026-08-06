/**
 * SFTP 文件详情侧栏（右侧常驻可收缩面板）
 *
 * 点击文件行 → 在 #sftp-side-body 渲染详情（基本信息 / 时间 / SHA-256 / 快速预览 /
 * 调查标记 / 操作），并异步拉取哈希、预览、访问/创建时间。
 */

import { invoke } from '@tauri-apps/api/core';

const I_COPY = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`;
const I_DOWN = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/></svg>`;

let currentFile: any = null;

function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtSize(bytes: number): string {
  if (bytes == null || isNaN(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024, i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

function shellQuote(p: string): string {
  return `'${String(p).replace(/'/g, `'\\''`)}'`;
}

function riskBadge(file: any): string {
  const perms = parseInt(file.permissions || '0', 8) || 0;
  if ((perms & 0o4000) || (perms & 0o2000) || ((perms & 0o777) === 0o777)) return '<span class="pd-rbadge high">可疑</span>';
  const n = (file.name || '').toLowerCase();
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(n) || /\.(pem|key)$/.test(n) || (n.startsWith('.') && file.file_type === 'file')) return '<span class="pd-rbadge warn">敏感</span>';
  return '';
}

function fileTags(file: any, path: string): string[] {
  const tags: string[] = [];
  const n = (file.name || '').toLowerCase();
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(n) || /(authorized_keys|known_hosts)/.test(n) || /\.(pem|key|pub)$/.test(n) || path.includes('/.ssh')) tags.push('SSH密钥');
  if (path.includes('cron') || path.includes('init.d') || path.includes('/.ssh') || /\.service$/.test(n)) tags.push('持久化');
  return tags;
}

function detailHTML(file: any): string {
  const path = file.path || '';
  const isDir = file.file_type === 'directory';
  const tags = fileTags(file, path);
  return `
    <div class="sftp-detail-id">
      <span class="sftp-detail-fileicon">${isDir ? '📁' : '📄'}</span>
      <div class="sftp-detail-idtext">
        <div class="sftp-detail-name" title="${esc(file.name)}">${esc(file.name)}</div>
        <div class="sftp-detail-sub">${isDir ? '文件夹' : '文件'}</div>
      </div>
      ${riskBadge(file)}
    </div>

    <div class="pd-section">基本信息</div>
    <div class="pd-kv">
      <div class="pd-k">路径</div><div class="pd-v">${esc(path)}</div>
      <div class="pd-k">大小</div><div class="pd-v">${isDir ? '-' : esc(fmtSize(file.size))}</div>
      <div class="pd-k">所有者</div><div class="pd-v">${esc(file.owner || '-')}${file.group ? ':' + esc(file.group) : ''}</div>
      <div class="pd-k">权限</div><div class="pd-v">${esc(file.permissions || '-')}</div>
    </div>

    <div class="pd-section">时间信息</div>
    <div class="pd-kv">
      <div class="pd-k">修改</div><div class="pd-v">${esc(file.modified || '-')}</div>
      <div class="pd-k">访问</div><div class="pd-v" id="sftp-detail-atime">-</div>
      <div class="pd-k">创建</div><div class="pd-v" id="sftp-detail-ctime">-</div>
    </div>

    <div class="pd-section">文件摘要</div>
    <div class="pd-code">
      <code id="sftp-detail-hash">${isDir ? '—（目录）' : '计算中…'}</code>
      <button class="pd-copy" title="复制" onclick="window.sftpCopyHash && window.sftpCopyHash()">${I_COPY}</button>
    </div>

    ${!isDir ? `
    <div class="pd-section">快速预览</div>
    <pre class="sftp-detail-preview" id="sftp-detail-preview">加载中…</pre>` : ''}

    ${tags.length ? `
    <div class="pd-section">调查标记</div>
    <div class="sftp-detail-tags">${tags.map(t => `<span class="sftp-detail-tag">${esc(t)}</span>`).join('')}</div>` : ''}

    <div class="sftp-detail-actions">
      <button class="pd-action" onclick="window.sftpDetailCopyPath && window.sftpDetailCopyPath()">${I_COPY} 复制路径</button>
      <button class="pd-action" onclick="window.sftpDetailHash && window.sftpDetailHash()">计算哈希</button>
      <button class="pd-action primary" onclick="window.sftpDetailDownload && window.sftpDetailDownload()">${I_DOWN} 下载</button>
    </div>
  `;
}

async function fetchDetail(file: any): Promise<void> {
  const path = file.path || '';
  const q = shellQuote(path);

  if (file.file_type !== 'directory') {
    invoke('ssh_execute_dashboard_command_direct', { command: `sha256sum ${q} 2>/dev/null | awk '{print $1}'` })
      .then((res: any) => {
        const hash = String(res?.output || '').trim().split('\n')[0];
        const el = document.getElementById('sftp-detail-hash');
        if (el) el.textContent = hash || '无法计算';
      }).catch(() => { const el = document.getElementById('sftp-detail-hash'); if (el) el.textContent = '无法计算'; });

    invoke('ssh_execute_dashboard_command_direct', { command: `head -c 4000 ${q} 2>/dev/null` })
      .then((res: any) => {
        const el = document.getElementById('sftp-detail-preview');
        if (el) el.textContent = String(res?.output || '').slice(0, 4000) || '（空）';
      }).catch(() => { const el = document.getElementById('sftp-detail-preview'); if (el) el.textContent = '无法预览'; });
  }

  invoke('ssh_execute_dashboard_command_direct', { command: `stat -c '%x|%w' ${q} 2>/dev/null` })
    .then((res: any) => {
      const [atime, ctime] = String(res?.output || '').trim().split('|');
      const a = document.getElementById('sftp-detail-atime');
      if (a && atime && atime !== '-') a.textContent = atime.split('.')[0];
      const c = document.getElementById('sftp-detail-ctime');
      if (c && ctime && ctime !== '-' && ctime !== '') c.textContent = ctime.split('.')[0];
    }).catch(() => { /* stat 不可用 */ });
}

function openSftpDetail(index: number): void {
  const files = (window as any).sftpManager?.getCurrentFiles?.() || [];
  const f = files[index];
  if (!f) return;
  currentFile = f;

  document.querySelectorAll('#sftp-file-list .sftp-file-row').forEach((r) => r.classList.remove('selected'));
  document.querySelector(`#sftp-file-list .sftp-file-row[data-file-index="${index}"]`)?.classList.add('selected');

  const body = document.getElementById('sftp-side-body');
  if (!body) return;
  body.innerHTML = detailHTML(f);

  const side = document.getElementById('sftp-side');
  if (side?.classList.contains('collapsed')) {
    side.classList.remove('collapsed');
    try { localStorage.setItem('sftp-side-collapsed', 'false'); } catch { /* ignore */ }
  }

  void fetchDetail(f);
}

function toggleSftpSide(): void {
  const side = document.getElementById('sftp-side');
  if (!side) return;
  const collapsed = side.classList.toggle('collapsed');
  try { localStorage.setItem('sftp-side-collapsed', collapsed ? 'true' : 'false'); } catch { /* ignore */ }
}

function sftpToggleAll(checked: boolean): void {
  document.querySelectorAll('#sftp-file-list .sftp-row-check').forEach((cb) => { (cb as HTMLInputElement).checked = checked; });
}

function copyText(t: string): void {
  if (!t) return;
  navigator.clipboard.writeText(t)
    .then(() => (window as any).showNotification?.('已复制', 'success'))
    .catch(() => (window as any).showNotification?.('复制失败', 'error'));
}

export function initSftpDetailPanel(): void {
  const w = window as any;
  w.openSftpDetail = openSftpDetail;
  w.toggleSftpSide = toggleSftpSide;
  w.sftpToggleAll = sftpToggleAll;
  w.sftpDetailCopyPath = () => { if (currentFile) copyText(currentFile.path); };
  w.sftpCopyHash = () => copyText(document.getElementById('sftp-detail-hash')?.textContent || '');
  w.sftpDetailHash = () => { if (currentFile) void fetchDetail(currentFile); };
  w.sftpDetailDownload = () => {
    if (!currentFile) return;
    if (w.sftpDownloadSelected) { w.sftpDownloadSelected(); return; }
    invoke('sftp_download', { remotePath: currentFile.path }).catch(() => {});
    w.showNotification?.('开始下载…', 'info');
  };

  // 侧栏拖拽调整宽度
  initSideResize();
  // 表格列拖拽调整宽度
  initColumnResize();
}

/** 各列对应的最小宽度 */
const MIN_COL_WIDTHS: Record<string, number> = {
  check: 34,
  name: 120,
  type: 55,
  size: 65,
  perms: 80,
  owner: 80,
  time: 100,
  risk: 60,
};

let isColumnResizeInitialized = false;

/** 初始化 SFTP 表格列拖拽调整宽度（使用全局事件委托，不受 DOM 重新渲染影响） */
function initColumnResize(): void {
  if (isColumnResizeInitialized) return;
  isColumnResizeInitialized = true;

  // 1. 全局 document mousedown 事件委托
  document.addEventListener('mousedown', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const resizer = target?.closest('.sftp-th-resizer') as HTMLElement | null;
    if (!resizer) return;

    const table = resizer.closest('table') as HTMLTableElement | null;
    if (!table) return;

    const colName = resizer.getAttribute('data-col');
    if (!colName) return;

    // 关键：阻止默认行为和冒泡，防止触发 th 元素的 onclick 排序
    e.preventDefault();
    e.stopPropagation();

    const thElem = resizer.closest('th') as HTMLTableCellElement | null;
    const colElem = table.querySelector<HTMLTableColElement>(`col[data-col="${colName}"]`);

    const startX = e.clientX;
    const startWidth = thElem?.getBoundingClientRect().width || colElem?.offsetWidth || 100;

    resizer.classList.add('resizing');
    document.body.classList.add('sftp-col-resizing');

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const delta = moveEvent.clientX - startX;
      const minW = MIN_COL_WIDTHS[colName] || 50;
      const newWidth = Math.max(minW, Math.round(startWidth + delta));

      // 同时更新 col 元素与 th 元素的 style.width，确保按像素实时精准变宽
      if (colElem) colElem.style.width = `${newWidth}px`;
      if (thElem) thElem.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      resizer.classList.remove('resizing');
      document.body.classList.remove('sftp-col-resizing');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // 持久化列宽设置
      saveColumnWidths(table);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // 2. 页面载入或表格 DOM 挂载时恢复保存的列宽
  const restoreIfTableExists = () => {
    const table = document.getElementById('sftp-file-table');
    if (table) {
      restoreColumnWidths(table);
    }
  };

  restoreIfTableExists();

  // 3. 监听 DOM 树变化，在 SFTP 表格重新渲染后自动恢复列宽
  const observer = new MutationObserver(() => {
    const table = document.getElementById('sftp-file-table');
    if (table && !table.hasAttribute('data-widths-restored')) {
      table.setAttribute('data-widths-restored', 'true');
      restoreColumnWidths(table);
    }
  });
  try {
    observer.observe(document.body, { childList: true, subtree: true });
  } catch {
    /* ignore */
  }
}

/** 保存列宽配置到 localStorage */
function saveColumnWidths(table: HTMLElement): void {
  try {
    const cols = table.querySelectorAll<HTMLTableColElement>('col[data-col]');
    const widths: Record<string, string> = {};
    cols.forEach((col) => {
      const colName = col.getAttribute('data-col');
      if (colName && col.style.width) {
        widths[colName] = col.style.width;
      }
    });
    localStorage.setItem('sftp-col-widths', JSON.stringify(widths));
  } catch {
    /* ignore */
  }
}

/** 从 localStorage 恢复列宽配置 */
function restoreColumnWidths(table: HTMLElement): void {
  try {
    const saved = localStorage.getItem('sftp-col-widths');
    if (!saved) return;
    const widths = JSON.parse(saved) as Record<string, string>;
    Object.entries(widths).forEach(([colName, widthStr]) => {
      const col = table.querySelector<HTMLTableColElement>(`col[data-col="${colName}"]`);
      const th = table.querySelector<HTMLTableCellElement>(`th.sftp-col-${colName}`);
      if (col && widthStr) {
        col.style.width = widthStr;
      }
      if (th && widthStr) {
        th.style.width = widthStr;
      }
    });
  } catch {
    /* ignore */
  }
}

/** 初始化侧栏拖拽调整宽度 */
function initSideResize(): void {
  // 延迟绑定，因为DOM可能还未渲染
  const bind = () => {
    const handle = document.getElementById('sftp-side-resize');
    const side = document.getElementById('sftp-side');
    if (!handle || !side) return;

    let startX = 0;
    let startWidth = 0;
    let dragging = false;

    const onMouseDown = (e: MouseEvent) => {
      if (side.classList.contains('collapsed')) return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startWidth = side.offsetWidth;
      side.style.transition = 'none'; // 拖拽时禁用过渡动画
      handle.classList.add('active');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      // 向左拖 = clientX 减小 = 侧栏变宽（因为侧栏在右侧）
      const delta = startX - e.clientX;
      const newWidth = Math.max(240, Math.min(600, startWidth + delta));
      side.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      side.style.transition = '';
      handle.classList.remove('active');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // 记住用户选择的宽度
      try { localStorage.setItem('sftp-side-width', side.style.width); } catch { /* ignore */ }
    };

    handle.addEventListener('mousedown', onMouseDown);

    // 恢复上次保存的宽度
    try {
      const saved = localStorage.getItem('sftp-side-width');
      if (saved && !side.classList.contains('collapsed')) {
        side.style.width = saved;
      }
    } catch { /* ignore */ }
  };

  // 尝试立即绑定，若DOM未就绪则延迟
  if (document.getElementById('sftp-side-resize')) {
    bind();
  } else {
    setTimeout(bind, 300);
  }
}

initSftpDetailPanel();
