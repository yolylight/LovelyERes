/**
 * 内核模块右键菜单管理器
 */

import * as IconPark from '@icon-park/svg'
import { BaseContextMenu, type MenuAction } from './contextMenu/baseContextMenu'

export class KernelModuleContextMenu extends BaseContextMenu {
  private currentModule: any = {}

  constructor() {
    super('kernelmodule')
  }

  protected onShowContextMenu(mod: any) {
    this.currentModule = mod
  }

  protected async handleSpecialAction(action: string): Promise<boolean> {
    if (action === 'copy-name') {
      try {
        await navigator.clipboard.writeText(this.currentModule.name || '')
        ;window.showNotification?.('模块名已复制', 'success')
      } catch { /* ignore */ }
      return true
    }
    return false
  }

  protected getMenuItemsHTML(): string {
    return `
      <div class="menu-item menu-parent">
        <span class="menu-label">
          ${IconPark.Info({ theme: 'outline', size: '16', fill: 'currentColor' })}
          <span>模块信息</span>
        </span>
        <span class="arrow">▶</span>
        <div class="submenu">
          <div class="menu-item" data-action="module-info">
            <span class="menu-label">
              ${IconPark.FileText({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>模块详情(modinfo)</span>
            </span>
          </div>
          <div class="menu-item" data-action="module-deps">
            <span class="menu-label">
              ${IconPark.LinkOne({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>模块依赖关系</span>
            </span>
          </div>
          <div class="menu-item" data-action="module-params">
            <span class="menu-label">
              ${IconPark.SettingConfig({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>模块参数</span>
            </span>
          </div>
          <div class="menu-item" data-action="module-path">
            <span class="menu-label">
              ${IconPark.FolderOpen({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>模块文件路径</span>
            </span>
          </div>
          <div class="menu-item" data-action="copy-name">
            <span class="menu-label">
              ${IconPark.Copy({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>复制模块名</span>
            </span>
          </div>
        </div>
      </div>

      <div class="menu-item menu-parent">
        <span class="menu-label">
          ${IconPark.Shield({ theme: 'outline', size: '16', fill: 'currentColor' })}
          <span>安全检查</span>
        </span>
        <span class="arrow">▶</span>
        <div class="submenu">
          <div class="menu-item" data-action="check-signing">
            <span class="menu-label">
              ${IconPark.Key({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>检查模块签名</span>
            </span>
          </div>
          <div class="menu-item" data-action="check-taint">
            <span class="menu-label">
              ${IconPark.Caution({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>检查内核污染标志</span>
            </span>
          </div>
          <div class="menu-item" data-action="check-hash">
            <span class="menu-label">
              ${IconPark.Lock({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>模块文件哈希</span>
            </span>
          </div>
          <div class="menu-item" data-action="dmesg-module">
            <span class="menu-label">
              ${IconPark.Log({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>相关dmesg日志</span>
            </span>
          </div>
        </div>
      </div>

      <div class="menu-divider"></div>

      <div class="menu-item menu-parent">
        <span class="menu-label">
          ${IconPark.Caution({ theme: 'outline', size: '16', fill: 'currentColor' })}
          <span>应急操作</span>
        </span>
        <span class="arrow">▶</span>
        <div class="submenu">
          <div class="menu-item" data-action="unload-module">
            <span class="menu-label">
              ${IconPark.ReduceOne({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>卸载模块(rmmod)</span>
            </span>
          </div>
          <div class="menu-item" data-action="blacklist-module">
            <span class="menu-label">
              ${IconPark.CloseOne({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>加入黑名单</span>
            </span>
          </div>
        </div>
      </div>
    `
  }

  protected resolveAction(action: string): MenuAction | null {
    const name = this.currentModule.name || ''

    const actions: Record<string, MenuAction> = {
      'module-info': {
        command: `modinfo ${name} 2>/dev/null || echo '无法获取模块信息'`,
        title: `模块详情 - ${name}`,
        actionName: '查看模块详情'
      },
      'module-deps': {
        command: `modinfo -F depends ${name} 2>/dev/null && echo '---被依赖:' && lsmod | grep ${name}`,
        title: `依赖关系 - ${name}`,
        actionName: '查看依赖关系'
      },
      'module-params': {
        command: `modinfo -p ${name} 2>/dev/null || echo '无参数信息' && echo '---当前参数:' && cat /sys/module/${name}/parameters/* 2>/dev/null || echo '无运行时参数'`,
        title: `参数 - ${name}`,
        actionName: '查看模块参数'
      },
      'module-path': {
        command: `modinfo -n ${name} 2>/dev/null && echo '---' && modinfo -F filename ${name} 2>/dev/null | xargs ls -la`,
        title: `文件路径 - ${name}`,
        actionName: '查看模块路径'
      },
      'check-signing': {
        command: `modinfo -F sig_id ${name} 2>/dev/null && modinfo -F signer ${name} 2>/dev/null || echo '模块未签名或无签名信息'`,
        title: `签名 - ${name}`,
        actionName: '检查模块签名'
      },
      'check-taint': {
        command: `mod="${name}"; echo "=== 模块 [$mod] 污染标志 ==="; if [ -f "/sys/module/$mod/taint" ]; then t=$(cat "/sys/module/$mod/taint" 2>/dev/null); if [ -n "$t" ]; then echo "模块污染标志: $t"; else echo "模块污染标志: 无 (Clean)"; fi; else echo "模块污染标志: 无 (Clean)"; fi; echo ""; echo "=== 系统内核全局污染状态 ==="; val=$(cat /proc/sys/kernel/tainted 2>/dev/null || echo 0); echo "全局污染掩码值: $val"; if [ "$val" -eq 0 ] 2>/dev/null; then echo "全局内核状态: 干净 (0 - 无污染)"; else echo "全局内核状态: 已污染 ($val)"; echo "包含的污染位分析:"; [ $((val & 1)) -ne 0 ] && echo "  - Bit 0 (1): 加载了专有模块 (Proprietary/Out-of-tree)"; [ $((val & 2)) -ne 0 ] && echo "  - Bit 1 (2): 强制加载模块 (Forced load)"; [ $((val & 4)) -ne 0 ] && echo "  - Bit 2 (4): SMP CPU 不匹配"; [ $((val & 8)) -ne 0 ] && echo "  - Bit 3 (8): 强制卸载模块 (Forced unload)"; [ $((val & 16)) -ne 0 ] && echo "  - Bit 4 (16): 硬件 MCE 异常"; [ $((val & 32)) -ne 0 ] && echo "  - Bit 5 (32): Bad page 引用"; [ $((val & 64)) -ne 0 ] && echo "  - Bit 6 (64): 用户显式请求污染"; [ $((val & 128)) -ne 0 ] && echo "  - Bit 7 (128): 内核曾发生 Die/Panic"; [ $((val & 256)) -ne 0 ] && echo "  - Bit 8 (256): ACPI 表被覆盖"; [ $((val & 512)) -ne 0 ] && echo "  - Bit 9 (512): 加载了未经数字签名的模块 (Unsigned module loaded)"; [ $((val & 1024)) -ne 0 ] && echo "  - Bit 10 (1024): 发生过 Soft lockup"; [ $((val & 2048)) -ne 0 ] && echo "  - Bit 11 (2048): 内核进行了 Livepatch 热补丁"; [ $((val & 4096)) -ne 0 ] && echo "  - Bit 12 (4096): 辅助污染标志 (Auxiliary taint)"; [ $((val & 8192)) -ne 0 ] && echo "  - Bit 13 (8192): 安全策略结构被屏蔽 (Security ops blinded)"; true; fi`,
        title: `内核污染标志 - ${name}`,
        actionName: '检查内核污染'
      },
      'check-hash': {
        command: `modpath=$(modinfo -n ${name} 2>/dev/null) && echo "MD5:" && md5sum "$modpath" && echo "SHA256:" && sha256sum "$modpath"`,
        title: `哈希 - ${name}`,
        actionName: '计算模块哈希'
      },
      'dmesg-module': {
        command: `dmesg | grep -i "${name}" | tail -30 || echo '无相关日志'`,
        title: `dmesg - ${name}`,
        actionName: '查看dmesg日志'
      },
      'unload-module': {
        command: `rmmod ${name} 2>&1 && echo '✓ 模块已卸载' || echo '❌ 卸载失败（可能正在使用）'`,
        title: `卸载 - ${name}`,
        actionName: '卸载模块'
      },
      'blacklist-module': {
        command: `echo "blacklist ${name}" >> /etc/modprobe.d/blacklist-emergency.conf && echo "install ${name} /bin/false" >> /etc/modprobe.d/blacklist-emergency.conf && echo '✓ 已加入黑名单: /etc/modprobe.d/blacklist-emergency.conf'`,
        title: `黑名单 - ${name}`,
        actionName: '加入黑名单'
      }
    }

    return actions[action] || null
  }
}
