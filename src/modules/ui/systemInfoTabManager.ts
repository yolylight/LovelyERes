/**
 * 系统信息标签管理器
 * 管理系统信息页面的标签切换、数据加载和仪表盘自动刷新
 * 支持渐进式加载 - 每个数据类别完成后立即更新UI
 */

import { sshConnectionManager } from '../remote/sshConnectionManager';

// tabId → detailedInfo 属性名映射（模块级常量）
const dataKeyMap: Record<string, string> = {
  processes: 'processes',
  network: 'networkDetails',
  services: 'services',
  users: 'users',
  autostart: 'autostart',
  cron: 'cronJobs',
  firewall: 'firewallRules',
  sshkeys: 'sshKeys',
  loginhistory: 'loginHistory',
  suidfiles: 'suidFiles',
  envvars: 'envVariables',
  shellconfigs: 'shellConfigs',
  packages: 'installedPackages',
  sudoers: 'sudoersConfig',
  timers: 'systemdTimers',
  kernelmodules: 'kernelModules',
  recentfiles: 'recentFiles',
  docker: 'dockerContainers',
  kubernetes: 'kubernetesPods',
  webapps: 'webApps',
  openports: 'openPorts',
  established: 'established',
  autoruns: 'autoruns',
  rootcheck: 'rootcheck',
  sensitive: 'sensitiveFiles'
};

// detailedInfo 属性名 → tabId 反向映射
const keyToTabMap: Record<string, string> = {};
for (const [tabId, key] of Object.entries(dataKeyMap)) {
  keyToTabMap[key] = tabId;
}

// tabId → 更新函数名映射
const updateMap: Record<string, string> = {
  processes: 'updateProcessesTable',
  network: 'updateNetworkTable',
  services: 'updateServicesTable',
  users: 'updateUsersTable',
  autostart: 'updateAutostartTable',
  cron: 'updateCronTable',
  firewall: 'updateFirewallTable',
  sshkeys: 'updateSSHKeysTable',
  loginhistory: 'updateLoginHistoryTable',
  suidfiles: 'updateSUIDFilesTable',
  envvars: 'updateEnvVariablesTable',
  shellconfigs: 'updateShellConfigsTable',
  packages: 'updateInstalledPackagesTable',
  sudoers: 'updateSudoersTable',
  timers: 'updateSystemdTimersTable',
  kernelmodules: 'updateKernelModulesTable',
  recentfiles: 'updateRecentFilesTable',
  docker: 'updateDockerTable',
  kubernetes: 'updateKubernetesTable',
  webapps: 'updateGenericTable_webapps',
  openports: 'updateGenericTable_openports',
  established: 'updateGenericTable_established',
  autoruns: 'updateGenericTable_autoruns',
  rootcheck: 'updateGenericTable_rootcheck',
  sensitive: 'updateGenericTable_sensitive'
};

/**
 * 在表格中显示加载状态
 */
function showTableLoadingState(tabId: string): void {
  const tbody = document.getElementById(`${tabId}-table-body`);
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 40px; color: var(--text-secondary);">
      <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
        <div class="progressive-loading-spinner"></div>
        <span>正在加载数据...</span>
      </div>
    </td></tr>`;
  }
}

// 当前激活的标签页 ID 模块级缓存
let currentActiveTabId = 'processes';

/**
 * 获取当前活跃标签页的tabId
 */
function getActiveTabId(): string {
  const activeTab = document.querySelector('.sidebar-item[data-tab].active');
  if (activeTab) {
    const tabId = activeTab.getAttribute('data-tab');
    if (tabId) {
      currentActiveTabId = tabId;
      return tabId;
    }
  }
  return currentActiveTabId || 'processes';
}

function switchSystemInfoTab(tabId: string): void {
  currentActiveTabId = tabId;
  console.log('🔄 切换系统信息标签页:', tabId);

  // 更新主侧边栏中系统信息 tab 叶子的 active 状态，并同步分组高亮
  document.querySelectorAll('.sidebar-item[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  (window as any).syncSidebarActiveGroup && (window as any).syncSidebarActiveGroup();

  // 更新标签页内容
  const contentContainer = document.getElementById('system-info-content');
  if (contentContainer) {
    const renderer = (window as any).app?.modernUIRenderer;
    if (renderer) {
      const currentContent = contentContainer.innerHTML;
      const expectedContent = renderer.renderSystemInfoTab(tabId);
      if (!currentContent || !currentContent.includes(`id="${tabId}-table-body"`)) {
        contentContainer.innerHTML = expectedContent;
      }

      const cache = (window as any).systemInfoCache;
      const dataKey = dataKeyMap[tabId];

      // 特殊 Tab: 独立获取数据（不走渐进式加载）
      const extraTabs = ['docker', 'kubernetes', 'webapps', 'openports', 'established', 'autoruns', 'rootcheck', 'sensitive'];
      if (extraTabs.includes(tabId)) {
        showTableLoadingState(tabId);
        fetchExtraTabData(tabId).then(data => {
          if (!cache.detailedInfo) cache.detailedInfo = {};
          cache.detailedInfo[dataKey] = data;
          loadSystemInfoTabData(tabId, cache.detailedInfo);
        }).catch(() => {
          const tbody = document.getElementById(`${tabId}-table-body`);
          if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--text-secondary);">获取数据失败或服务未运行</td></tr>';
        });
      } else
        // 检查此标签页的数据是否已存在于缓存中（只要属性为 Array 类型）
        if (cache.detailedInfo && Array.isArray(cache.detailedInfo[dataKey])) {
          // 数据已就绪，立即渲染（无需阻断在 isLoading 动画）
          loadSystemInfoTabData(tabId, cache.detailedInfo);
        } else if (cache.isLoading) {
          // 正在渐进式加载中且此 tab 尚未回传，显示加载状态
          showTableLoadingState(tabId);
        } else {
          // 缓存里没有该 tab 的数据（或未初始化）：
          // 定向重新拉取该项自愈，避免卡住。
          showTableLoadingState(tabId);
          fetchSingleTabData(tabId).then(data => {
            if (!cache.detailedInfo) cache.detailedInfo = {};
            cache.detailedInfo[dataKey] = data;
            loadSystemInfoTabData(tabId, cache.detailedInfo);
          }).catch(() => {
            (window as any).loadSystemDetailedInfo();
          });
        }
    }
  }
}

async function loadSystemDetailedInfo(forceRefresh = false): Promise<any> {
  try {
    const isConnected = sshConnectionManager.isConnected();
    if (!isConnected) {
      console.log('❌ SSH未连接，无法获取系统详细信息');
      return null;
    }

    const cache = (window as any).systemInfoCache;
    const cacheValid = cache.detailedInfo &&
      cache.lastUpdate &&
      (Date.now() - cache.lastUpdate) < 5 * 60 * 1000;

    if (!forceRefresh && cacheValid && !cache.isLoading) {
      console.log('📋 使用缓存的系统详细信息');
      const activeTabId = getActiveTabId() || 'processes';
      const contentContainer = document.getElementById('system-info-content');
      if (contentContainer && (window as any).app?.modernUIRenderer) {
        const currentContent = contentContainer.innerHTML;
        if (!currentContent || !currentContent.includes(`id="${activeTabId}-table-body"`)) {
          contentContainer.innerHTML = (window as any).app.modernUIRenderer.renderSystemInfoTab(activeTabId);
        }
      }
      loadSystemInfoTabData(activeTabId, cache.detailedInfo);
      const app = (window as any).app;
      if (app?.modernUIRenderer?.updateSystemInfoTabs) {
        app.modernUIRenderer.updateSystemInfoTabs(cache.detailedInfo);
      }
      return cache.detailedInfo;
    }

    if (cache.isLoading && !forceRefresh) {
      console.log('⏳ 系统详细信息正在渐进式加载中...');
      return;
    }

    console.log('🔍 开始渐进式加载系统详细信息...');
    cache.isLoading = true;
    cache.detailedInfo = cache.detailedInfo || {};
    const loadedCount = { value: 0 };
    const totalTasks = Object.keys(dataKeyMap).length;

    // 显示当前标签页的加载状态
    const currentTabId = getActiveTabId();
    if (currentTabId) {
      showTableLoadingState(currentTabId);
    }

    // 更新加载进度指示
    function updateLoadingProgress(): void {
      const progressEl = document.getElementById('system-info-loading-progress');
      if (progressEl) {
        progressEl.textContent = `${loadedCount.value}/${totalTasks}`;
      }
    }

    const app = (window as any).app;
    if (app?.systemInfoManager) {
      if (forceRefresh) {
        app.systemInfoManager.clearCache();
      }

      const detailedInfo = await app.systemInfoManager.fetchDetailedInfoProgressive(
        (key: string, data: any[]) => {
          // 渐进式回调：每个数据类别完成后立即更新UI
          cache.detailedInfo[key] = data;
          loadedCount.value++;

          console.log(`📦 ${key} 加载完成 (${loadedCount.value}/${totalTasks})`);
          updateLoadingProgress();

          // 更新所有标签页的计数徽章
          if (app.modernUIRenderer?.updateSystemInfoTabs) {
            app.modernUIRenderer.updateSystemInfoTabs(cache.detailedInfo);
          }

          // 如果此数据对应当前活跃标签页，或者活跃标签页的数据已在缓存中，更新 UI
          const activeTabId = getActiveTabId();
          if (activeTabId) {
            const activeDataKey = dataKeyMap[activeTabId];
            if (activeDataKey === key || (cache.detailedInfo[activeDataKey] && Array.isArray(cache.detailedInfo[activeDataKey]))) {
              loadSystemInfoTabData(activeTabId, cache.detailedInfo);
            }
          }
        }
      );

      cache.detailedInfo = detailedInfo;
      cache.lastUpdate = Date.now();
      cache.isLoading = false;

      // 更新"上次更新"时间戳
      const tsEl = document.getElementById('system-info-last-update');
      if (tsEl) {
        const now = new Date();
        tsEl.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')} 更新`;
      }

      // 确保当前标签页显示最终数据
      const activeTabId = getActiveTabId();
      if (activeTabId) {
        loadSystemInfoTabData(activeTabId, detailedInfo);
      }

      console.log('✅ 所有系统详细信息渐进式加载完成');
      return detailedInfo;
    }
  } catch (error) {
    console.error('❌ 加载系统详细信息失败:', error);
    const cache = (window as any).systemInfoCache;
    cache.isLoading = false;
  }
}

function loadSystemInfoTabData(tabId: string, detailedInfo?: any): void {
  if (!detailedInfo) {
    console.log('⏳ 等待详细信息加载...');
    return;
  }

  console.log('📊 更新标签页数据:', tabId);

  const funcName = updateMap[tabId];
  const dataKey = dataKeyMap[tabId];
  if (funcName && typeof (window as any)[funcName] === 'function') {
    (window as any)[funcName](detailedInfo[dataKey] || []);
  }
  // 填充该 tab 的标题计数与功能特色统计卡片（进程页有独立逻辑，updateSysTabChips 跳过）
  (window as any).updateSysTabChips?.(tabId, detailedInfo[dataKey] || []);

  // 行点击 → 右侧详情侧栏（仅对启用了详情侧栏的 tab）
  const sideTabs = (window as any).__sysDetailTabs;
  if (sideTabs && typeof sideTabs.has === 'function' && sideTabs.has(tabId)) {
    const tbody = document.getElementById(`${tabId}-table-body`);
    if (tbody) (window as any).bindSysDetailRows?.(tbody, tabId, detailedInfo[dataKey] || []);
  }
}

async function refreshAllSystemInfo(): Promise<void> {
  console.log('🔄 开始刷新所有系统信息...');

  try {
    const app = (window as any).app;
    if (!app || !app.systemInfoManager) {
      console.error('❌ 应用实例或系统信息管理器未找到');
      const content = document.getElementById('system-info-content');
      if (content) {
        content.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; padding: 40px; color: var(--text-error);">
            <div style="text-align: center;">
              <div style="font-size: 24px; margin-bottom: 10px;">❌</div>
              <div>应用实例未找到，请刷新页面重试</div>
            </div>
          </div>
        `;
      }
      return;
    }

    // 清除缓存，开始渐进式刷新
    app.systemInfoManager.clearCache();
    const cache = (window as any).systemInfoCache;
    cache.detailedInfo = null;
    cache.lastUpdate = null;

    // 显示当前标签页的加载状态（不替换整个容器）
    const currentTabId = getActiveTabId();
    if (currentTabId) {
      showTableLoadingState(currentTabId);
    }

    // 使用渐进式加载
    const detailedInfo = await loadSystemDetailedInfo(true);

    // 更新应用状态
    const state = app.stateManager.getState();
    if (state.serverInfo) {
      state.serverInfo.detailedInfo = detailedInfo;
      app.stateManager.setState(state);
    }

    window.showNotification?.('系统信息已刷新', 'success');
  } catch (error) {
    console.error('❌ 刷新系统信息失败:', error);
    window.showNotification?.(`系统信息刷新失败: ${error}`, 'error');
    const content = document.getElementById('system-info-content');
    if (content) {
      content.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; padding: 40px; color: var(--text-error);">
          <div style="text-align: center;">
            <div style="font-size: 24px; margin-bottom: 10px;">❌</div>
            <div>刷新失败: ${error}</div>
            <button onclick="window.refreshAllSystemInfo()" style="
              margin-top: 10px;
              padding: 8px 16px;
              background: var(--bg-primary);
              border: 1px solid var(--border-color);
              border-radius: var(--border-radius);
              cursor: pointer;
              font-size: 14px;
            ">重试</button>
          </div>
        </div>
      `;
    }
  }
}

/**
 * 注入渐进式加载的CSS样式
 */
function injectLoadingStyles(): void {
  if (document.querySelector('#progressive-loading-styles')) return;
  const style = document.createElement('style');
  style.id = 'progressive-loading-styles';
  style.textContent = `
    @keyframes progressive-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .progressive-loading-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--border-color, #e0e0e0);
      border-top-color: var(--primary-color, #1890ff);
      border-radius: 50%;
      animation: progressive-spin 0.8s linear infinite;
    }
    .tab-btn .tab-loading-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--primary-color, #1890ff);
      animation: progressive-spin 1s linear infinite;
      margin-left: 4px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Docker/K8s 数据获取 (通过 SSH 直接获取)
 */
/** 定向重新拉取单个常规 tab 的数据（自愈用，不重跑全量采集） */
async function fetchSingleTabData(tabId: string): Promise<any[]> {
  const key = dataKeyMap[tabId];
  const mgr = (window as any).app?.systemInfoManager;
  if (!key || typeof mgr?.fetchSingleKey !== 'function') {
    throw new Error('无单项采集能力，回退全量加载');
  }
  return await mgr.fetchSingleKey(key);
}

/**
 * 智能解析 ss 或 netstat 输出的 Socket 连接单行文本
 */
function parseSocketRow(line: string) {
  const str = line.trim();
  if (!str) return null;

  // 匹配形如 192.168.1.1:22, [::ffff:192.168.1.1]:80, *:80, 0.0.0.0:443, :::22, :::* 的 Socket 地址模式
  const socketRegex = /(?:\[[0-9a-fA-F:]+\]|[0-9a-fA-F.]+|\*):[0-9*]+/g;
  const matches = str.match(socketRegex) || [];

  if (matches.length === 0) return null;

  const localFull = matches[0] || '';
  const remoteFull = matches[1] || '';

  // 拆分 local 地址与端口
  let localAddr = '';
  let localPort = '';
  if (localFull) {
    const lastColon = localFull.lastIndexOf(':');
    localAddr = localFull.substring(0, lastColon).replace(/^\[|\]$/g, '');
    localPort = localFull.substring(lastColon + 1);
    if (localPort === '*') localPort = '';
  }

  // 拆分 remote 地址与端口
  let remoteAddr = '';
  let remotePort = '';
  if (remoteFull) {
    const lastColon = remoteFull.lastIndexOf(':');
    remoteAddr = remoteFull.substring(0, lastColon).replace(/^\[|\]$/g, '');
    remotePort = remoteFull.substring(lastColon + 1);
    if (remotePort === '*') remotePort = '';
  }

  // 提取 PID
  let pid = '';
  const pidMatch = str.match(/pid=(\d+)/) || str.match(/\b(\d+)\/[^\s]+/);
  if (pidMatch) {
    pid = pidMatch[1];
  }

  // 提取进程名
  let processName = '';
  const ssNameMatch = str.match(/"([^"]+)"\s*,\s*pid=/) || str.match(/"([^"]+)"/) || str.match(/users:\s*\(\(\s*"([^"]+)"/);
  const netstatNameMatch = str.match(/\b\d+\/([^\s]+)/);

  if (ssNameMatch && ssNameMatch[1]) {
    processName = ssNameMatch[1];
  } else if (netstatNameMatch && netstatNameMatch[1]) {
    processName = netstatNameMatch[1];
  } else if (pid) {
    const procMatch = str.match(/users:\s*\(\((.+)\)\)/) || str.match(/\s+([^\s]+)$/);
    if (procMatch) {
      processName = procMatch[1].replace(/["\(\)]/g, '').trim();
    }
  }

  // 协议
  let proto = 'tcp';
  if (/\budp\b/i.test(str) || /^udp/i.test(str)) {
    proto = 'udp';
  } else if (/\btcp\b/i.test(str) || /^tcp/i.test(str)) {
    proto = 'tcp';
  }

  return {
    proto,
    localFull,
    localAddr,
    localPort,
    remoteFull,
    remoteAddr,
    remotePort,
    pid,
    process: processName,
    user: '-'
  };
}

async function fetchExtraTabData(tabId: string): Promise<any[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  const exec = async (cmd: string) => {
    const r = await invoke('ssh_execute_command_direct', { command: cmd }) as any;
    return r?.output || '';
  };

  if (tabId === 'docker') {
    const out = await exec("docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}' 2>/dev/null | head -50");
    return out.split('\n').filter(Boolean).map((line: string) => {
      const [id, name, image, status, ports, created] = line.split('|');
      return {
        id: id?.substring(0, 12) || '', name: name || '', image: image || '',
        status: status || '', ports: ports || '', created: created || '',
      };
    });
  }

  if (tabId === 'kubernetes') {
    const out = await exec("kubectl get pods -A --no-headers 2>/dev/null | head -50 || echo ''");
    return out.split('\n').filter(Boolean).map((line: string) => {
      const parts = line.trim().split(/\s+/);
      return {
        namespace: parts[0] || '', name: parts[1] || '', ready: parts[2] || '',
        status: parts[3] || '', restarts: parts[4] || '', age: parts[5] || '',
      };
    });
  }

  if (tabId === 'webapps') {
    // 检测 Nginx/Apache/Tomcat/PHP-FPM 站点
    const out = await exec(`echo "=== Nginx ===" && (nginx -T 2>/dev/null | grep -E 'server_name|listen|root' | head -20 || echo "未安装") && echo "=== Apache ===" && (apachectl -S 2>/dev/null | head -15 || httpd -S 2>/dev/null | head -15 || echo "未安装") && echo "=== Tomcat ===" && (ls /opt/tomcat*/webapps/ /var/lib/tomcat*/webapps/ 2>/dev/null | head -10 || echo "未安装") && echo "=== PHP-FPM ===" && (php-fpm -t 2>/dev/null | head -3 || echo "未安装")`);
    return out.split('\n').filter(Boolean).map((line: string) => {
      const isHeader = line.startsWith('===');
      return { type: isHeader ? '' : 'config', path: line, status: '', config: '', user: '' };
    });
  }

  if (tabId === 'openports') {
    // 所有监听端口 + 进程
    const out = await exec("ss -tlnp 2>/dev/null | tail -n +2 | head -50 || netstat -tlnp 2>/dev/null | tail -n +2 | head -50");
    return out.split('\n').filter(Boolean).map((line: string) => {
      const parsed = parseSocketRow(line);
      if (!parsed) return null;
      return { proto: parsed.proto, addr: parsed.localAddr, port: parsed.localPort, pid: parsed.pid, process: parsed.process, user: '' };
    }).filter(Boolean);
  }

  if (tabId === 'established') {
    // 外连排查: ESTABLISHED 连接
    const out = await exec("ss -tnp state established 2>/dev/null | tail -n +2 | head -50 || netstat -tnp 2>/dev/null | grep ESTABLISHED | head -50");
    return out.split('\n').filter(Boolean).map((line: string) => {
      const parsed = parseSocketRow(line);
      if (!parsed) return null;
      return { local: parsed.localFull, remote: parsed.remoteAddr, remotePort: parsed.remotePort, pid: parsed.pid, process: parsed.process, user: '' };
    }).filter(Boolean);
  }

  if (tabId === 'autoruns') {
    // 启动项汇总: systemd enabled + cron + rc.local + init.d + bashrc
    const out = await exec(`echo "=SYSTEMD=" && systemctl list-unit-files --type=service --state=enabled --no-pager 2>/dev/null | grep enabled | head -20 && echo "=CRON=" && for u in $(cut -d: -f1 /etc/passwd | head -20); do c=$(crontab -l -u $u 2>/dev/null | grep -v '^#' | grep -v '^$'); [ -n "$c" ] && echo "$u: $c"; done | head -15 && echo "=RCLOCAL=" && cat /etc/rc.local 2>/dev/null | grep -v '^#' | grep -v '^$' | head -5 && echo "=INITD=" && ls /etc/init.d/ 2>/dev/null | head -10`);
    const items: any[] = [];
    let currentType = '';
    out.split('\n').filter(Boolean).forEach((line: string) => {
      if (line.startsWith('=')) { currentType = line.replace(/=/g, ''); return; }
      const typeMap: Record<string, string> = { SYSTEMD: 'systemd', CRON: 'crontab', RCLOCAL: 'rc.local', INITD: 'init.d' };
      items.push({ type: typeMap[currentType] || currentType, name: line.split(/\s+/)[0] || line, status: 'enabled', path: line, user: '' });
    });
    return items;
  }

  if (tabId === 'rootcheck') {
    // Rootkit 快速检查
    const out = await exec(`
# LD_PRELOAD
preload=$(cat /etc/ld.so.preload 2>/dev/null | tr '\\n' ' ' | xargs)
if [ -n "$preload" ]; then echo "ROW|LD_PRELOAD|suspicious|/etc/ld.so.preload 存在内容: $preload"; else echo "ROW|LD_PRELOAD|clean|/etc/ld.so.preload 为空或不存在"; fi
# SUID脚本
suid_scripts=$(find /usr/bin /usr/sbin /bin /sbin -perm -4000 -type f 2>/dev/null | xargs file 2>/dev/null | grep -E "script|text" | awk -F: '{print $1}' | tr '\\n' ' ')
if [ -n "$suid_scripts" ]; then echo "ROW|SUID脚本|suspicious|以下SUID文件为脚本(可被利用): $suid_scripts"; else echo "ROW|SUID脚本|clean|未发现SUID脚本文件"; fi
# 隐藏进程
ps_cnt=$(ps -eo pid --no-headers 2>/dev/null | wc -l)
proc_cnt=$(ls /proc/ 2>/dev/null | grep -cE '^[0-9]+$')
diff=$((proc_cnt - ps_cnt))
if [ "$diff" -gt 3 ]; then echo "ROW|隐藏进程|suspicious|/proc下PID数($proc_cnt)比ps输出($ps_cnt)多\${diff}个，可能存在隐藏进程"; else echo "ROW|隐藏进程|clean|ps进程数($ps_cnt)与/proc PID数($proc_cnt)基本一致"; fi
# 可疑内核模块: 匹配已知rootkit名称，或modinfo查不到磁盘文件(疑似注入的隐藏模块)
km_out=$(lsmod 2>/dev/null | awk 'NR>1 {print $1}' | while read name; do
  low=$(echo "$name" | tr 'A-Z' 'a-z')
  case "$low" in
    *rootkit*|*diamorphine*|*reptile*|*suterusu*|*adore*|*knark*|*modhide*|*hide*|*kbeast*|*enyelkm*|*azazel*|*bdvl*|*rkit*)
      echo "ROW|内核模块|suspicious|模块 $name 名称匹配已知rootkit特征，高度可疑，请用 modinfo $name 确认" ;;
    *)
      if ! modinfo "$name" >/dev/null 2>&1; then
        echo "ROW|内核模块|suspicious|模块 $name 已加载但 modinfo 查不到磁盘文件，疑似注入的隐藏模块"
      fi ;;
  esac
done)
if [ -n "$km_out" ]; then echo "$km_out"; else echo "ROW|内核模块|clean|未发现名称匹配rootkit特征或无磁盘文件的可疑模块"; fi
# PAM后门
pam_new=$(find /lib/security /lib64/security /usr/lib/security /usr/lib64/security -name '*.so' -newer /etc/passwd 2>/dev/null | head -5)
if [ -n "$pam_new" ]; then echo "ROW|PAM后门|suspicious|发现近期修改的PAM模块(比/etc/passwd新): $pam_new"; else echo "ROW|PAM后门|clean|未发现异常PAM模块"; fi
# SSH后门
ssh_matches=$(strings /usr/sbin/sshd 2>/dev/null | grep -iE 'backdoor|secret_pass|h4ck|r00t' | head -3 | tr '\\n' '; ')
if [ -n "$ssh_matches" ]; then echo "ROW|SSH后门|suspicious|sshd二进制中发现可疑字符串: $ssh_matches"; else echo "ROW|SSH后门|clean|sshd二进制未发现已知后门特征字符串"; fi
`);
    const items: any[] = [];
    out.split('\n').filter(Boolean).forEach((line: string) => {
      if (!line.startsWith('ROW|')) return;
      const p = line.split('|');
      items.push({ check: p[1] || '', result: p[2] || '', detail: p.slice(3).join('|') || '' });
    });
    return items;
  }

  if (tabId === 'sensitive') {
    // 敏感文件: SSH密钥/密码文件/配置文件/数据库凭据
    const out = await exec(`find / -maxdepth 4 \\( -name "*.pem" -o -name "*.key" -o -name "id_rsa*" -o -name "id_ed25519*" -o -name ".env" -o -name "wp-config.php" -o -name "config.php" -o -name "database.yml" -o -name ".git-credentials" -o -name ".netrc" -o -name ".pgpass" -o -name ".my.cnf" -o -name "shadow" -o -name "gshadow" \\) -type f 2>/dev/null | head -30 | while read f; do echo "$f|$(stat -c '%a|%U|%Y' "$f" 2>/dev/null)"; done`);
    return out.split('\n').filter(Boolean).map((line: string) => {
      const [path, perms, owner, mtime] = line.split('|');
      const ext = (path || '').split('.').pop() || '';
      const typeMap: Record<string, string> = { pem: 'SSL证书', key: '私钥', env: '环境变量', php: 'PHP配置', yml: 'DB配置' };
      const ts = mtime ? new Date(parseInt(mtime) * 1000).toLocaleString() : '';
      return { path: path || line, type: typeMap[ext] || '敏感文件', perms: perms || '', owner: owner || '', modified: ts };
    });
  }

  return [];
}

/**
 * 初始化系统信息标签管理器
 */
export function initSystemInfoTabManager(): void {
  // 注入加载动画样式
  injectLoadingStyles();

  // 系统信息数据缓存
  (window as any).systemInfoCache = {
    detailedInfo: null,
    lastUpdate: null,
    isLoading: false
  };

  (window as any).getActiveTabId = getActiveTabId;
  (window as any).switchSystemInfoTab = switchSystemInfoTab;
  (window as any).loadSystemDetailedInfo = loadSystemDetailedInfo;
  (window as any).loadSystemInfoTabData = loadSystemInfoTabData;
  (window as any).refreshAllSystemInfo = refreshAllSystemInfo;
}
