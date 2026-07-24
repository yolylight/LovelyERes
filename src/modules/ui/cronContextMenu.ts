/**
 * 计划任务右键菜单管理器
 */

import * as IconPark from '@icon-park/svg'
import { BaseContextMenu, type MenuAction } from './contextMenu/baseContextMenu'

export class CronContextMenu extends BaseContextMenu {
  private currentCron: {
    user: string
    schedule: string
    command: string
    source: string
  } | null = null

  constructor() {
    super('cron')
  }

  protected onShowContextMenu(cronInfo: { user: string; schedule: string; command: string; source: string }) {
    this.currentCron = cronInfo
  }

  protected getMenuItemsHTML(): string {
    return `
      <div class="menu-item menu-parent">
        <span class="menu-label">
          ${IconPark.FileCode({ theme: 'outline', size: '16', fill: 'currentColor' })}
          <span>源文件操作</span>
        </span>
        <span class="arrow">▶</span>
        <div class="submenu">
          <div class="menu-item" data-action="view-source">
            <span class="menu-label">
              ${IconPark.Find({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>查看源文件内容</span>
            </span>
          </div>
          <div class="menu-item" data-action="delete-task-file">
            <span class="menu-label">
              ${IconPark.Delete({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>删除任务及文件</span>
            </span>
          </div>
        </div>
      </div>

      <div class="menu-item menu-parent">
        <span class="menu-label">
          ${IconPark.Info({ theme: 'outline', size: '16', fill: 'currentColor' })}
          <span>基本信息</span>
        </span>
        <span class="arrow">▶</span>
        <div class="submenu">
          <div class="menu-item" data-action="details">
            <span class="menu-label">
              ${IconPark.FileText({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>查看任务详情</span>
            </span>
          </div>
          <div class="menu-item" data-action="schedule">
            <span class="menu-label">
              ${IconPark.Schedule({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>查看执行时间表</span>
            </span>
          </div>
          <div class="menu-item" data-action="command">
            <span class="menu-label">
              ${IconPark.Terminal({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>查看执行命令</span>
            </span>
          </div>
          <div class="menu-item" data-action="copy-command">
            <span class="menu-label">
              ${IconPark.Copy({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>复制命令</span>
            </span>
          </div>
        </div>
      </div>

      <div class="menu-item menu-parent">
        <span class="menu-label">
          ${IconPark.SettingConfig({ theme: 'outline', size: '16', fill: 'currentColor' })}
          <span>任务管理</span>
        </span>
        <span class="arrow">▶</span>
        <div class="submenu">
          <div class="menu-item" data-action="run-now">
            <span class="menu-label">
              ${IconPark.Play({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>立即执行</span>
            </span>
          </div>
          <div class="menu-item" data-action="test-command">
            <span class="menu-label">
              ${IconPark.Experiment({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>测试命令</span>
            </span>
          </div>
          <div class="menu-item" data-action="view-crontab">
            <span class="menu-label">
              ${IconPark.FileSearch({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>查看完整crontab</span>
            </span>
          </div>
        </div>
      </div>

      <div class="menu-item menu-parent">
        <span class="menu-label">
          ${IconPark.Log({ theme: 'outline', size: '16', fill: 'currentColor' })}
          <span>执行历史</span>
        </span>
        <span class="arrow">▶</span>
        <div class="submenu">
          <div class="menu-item" data-action="execution-logs">
            <span class="menu-label">
              ${IconPark.FileText({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>查看执行日志</span>
            </span>
          </div>
          <div class="menu-item" data-action="recent-runs">
            <span class="menu-label">
              ${IconPark.History({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>最近执行记录</span>
            </span>
          </div>
          <div class="menu-item" data-action="error-logs">
            <span class="menu-label">
              ${IconPark.Caution({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>查看错误日志</span>
            </span>
          </div>
        </div>
      </div>

      <div class="menu-item menu-parent">
        <span class="menu-label">
          ${IconPark.Time({ theme: 'outline', size: '16', fill: 'currentColor' })}
          <span>时间分析</span>
        </span>
        <span class="arrow">▶</span>
        <div class="submenu">
          <div class="menu-item" data-action="parse-cron">
            <span class="menu-label">
              ${IconPark.Analysis({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>解析cron表达式</span>
            </span>
          </div>
          <div class="menu-item" data-action="next-run">
            <span class="menu-label">
              ${IconPark.Timer({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>下次执行时间</span>
            </span>
          </div>
          <div class="menu-item" data-action="frequency">
            <span class="menu-label">
              ${IconPark.ChartLine({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>执行频率分析</span>
            </span>
          </div>
        </div>
      </div>

      <div class="menu-item menu-parent">
        <span class="menu-label">
          ${IconPark.Protection({ theme: 'outline', size: '16', fill: 'currentColor' })}
          <span>安全检查</span>
        </span>
        <span class="arrow">▶</span>
        <div class="submenu">
          <div class="menu-item" data-action="security-check">
            <span class="menu-label">
              ${IconPark.Shield({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>命令安全性检查</span>
            </span>
          </div>
          <div class="menu-item" data-action="check-path">
            <span class="menu-label">
              ${IconPark.FolderOpen({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>检查命令路径</span>
            </span>
          </div>
          <div class="menu-item" data-action="suspicious-check">
            <span class="menu-label">
              ${IconPark.Attention({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>可疑命令检测</span>
            </span>
          </div>
        </div>
      </div>

      <div class="menu-item menu-parent">
        <span class="menu-label">
          ${IconPark.SettingTwo({ theme: 'outline', size: '16', fill: 'currentColor' })}
          <span>高级操作</span>
        </span>
        <span class="arrow">▶</span>
        <div class="submenu">
          <div class="menu-item" data-action="backup">
            <span class="menu-label">
              ${IconPark.Save({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>备份crontab</span>
            </span>
          </div>
          <div class="menu-item" data-action="export">
            <span class="menu-label">
              ${IconPark.Export({ theme: 'outline', size: '14', fill: 'currentColor' })}
              <span>导出任务配置</span>
            </span>
          </div>
        </div>
      </div>
    `
  }

  protected async handleSpecialAction(action: string): Promise<boolean> {
    if (!this.currentCron) return false

    const { command, source } = this.currentCron

    if (action === 'copy-command') {
      navigator.clipboard.writeText(command)
      this.showModal('复制成功', `已复制命令: ${command}`)
      return true
    }

    if (action === 'view-source') {
      if (source && source.startsWith('/')) {
        // Handled by resolveAction
        return false
      } else if (source && source.startsWith('crontab:')) {
        // Handled by resolveAction
        return false
      } else {
        this.showModal('提示', '无法确定源文件位置')
        return true
      }
    }

    if (action === 'delete-task-file') {
      if (source && source.startsWith('/')) {
        if (source === '/etc/crontab') {
          this.showModal('错误', '不能删除系统主crontab文件 (/etc/crontab)')
          return true
        }
        // Valid path, let resolveAction handle
        return false
      } else {
        this.showModal('提示', '此任务不是通过独立文件配置的，无法通过删除文件来删除任务。\n\n如果是用户任务，请使用"crontab -e"编辑。')
        return true
      }
    }

    return false
  }

  protected resolveAction(action: string): MenuAction | null {
    if (!this.currentCron) return null

    const { user, schedule, command, source } = this.currentCron

    const actions: Record<string, MenuAction | (() => MenuAction)> = {
      // 源文件操作
      'view-source': () => {
        if (source && source.startsWith('/')) {
          return { command: `echo "=== 源文件: ${source} ==="; echo ""; cat "${source}" 2>&1 || echo "无法读取文件"`, title: `源文件 - ${source}`, actionName: '查看源文件' }
        } else {
          const u = source.split(':')[1]
          return { command: `echo "=== 用户Crontab: ${u} ==="; echo ""; crontab -u ${u} -l`, title: `用户Crontab - ${u}`, actionName: '查看源文件' }
        }
      },
      'schedule': {
        command: `echo "=== 执行时间表分析 ==="; echo ""; echo "Cron 表达式: ${schedule}"; echo ""; pybin=$(command -v python3 || command -v python || command -v python2); if [ -n "$pybin" ]; then "$pybin" -c '
import sys

try:
    expr = "${schedule}"
    shortcuts = {
        "@reboot": "系统启动/重启时自动执行",
        "@hourly": "每小时整点执行 (00:00, 01:00, 02:00 ...)",
        "@daily": "每天凌晨 00:00 执行一次",
        "@midnight": "每天午夜 00:00 执行一次",
        "@weekly": "每周日凌晨 00:00 执行一次",
        "@monthly": "每月 1 日凌晨 00:00 执行一次",
        "@yearly": "每年 1 月 1 日凌晨 00:00 执行一次",
        "@annually": "每年 1 月 1 日凌晨 00:00 执行一次"
    }

    if expr in shortcuts:
        print("💡 含义解读:")
        print("👉 %s" % shortcuts[expr])
    else:
        parts = expr.split()
        if len(parts) == 5:
            m, h, dom, mon, dow = parts[0], parts[1], parts[2], parts[3], parts[4]
            dow_names = {"0":"周日","1":"周一","2":"周二","3":"周三","4":"周四","5":"周五","6":"周六","7":"周日"}
            
            # 1. 日期/星期/月份说明
            date_desc = ""
            if dow != "*":
                if dow == "1-5": date_desc = "每周一至周五"
                elif dow in ["0,6","6,0","6,7","7,6"]: date_desc = "每周六、周日"
                elif "-" in dow and "," not in dow:
                    s, e = dow.split("-")
                    date_desc = "每周%s至%s" % (dow_names.get(s,s), dow_names.get(e,e))
                else:
                    d_items = [dow_names.get(x,x) for x in dow.split(",")]
                    date_desc = "每" + "、".join(d_items)
            elif dom != "*":
                if "-" in dom:
                    s, e = dom.split("-")
                    date_desc = "每月 %s 到 %s 日" % (s, e)
                else:
                    date_desc = "每月 %s 日" % "、".join(dom.split(","))
            else:
                date_desc = "每天"

            if mon != "*":
                date_desc = ("每年 %s 月 " % "、".join(mon.split(","))) + date_desc

            # 2. 分钟详细解析
            m_detail = ""
            if m == "*":
                m_detail = "每分钟"
            elif m.startswith("*/"):
                m_detail = "每隔 %s 分钟" % m.split("/")[1]
            elif "/" in m:
                r_p, st = m.split("/")
                if "-" in r_p:
                    sm, em = r_p.split("-")
                    m_detail = "在第 %s 至 %s 分钟期间每隔 %s 分钟" % (sm, em, st)
                else:
                    m_detail = "从第 %s 分钟起每隔 %s 分钟" % (r_p, st)
            elif "-" in m:
                sm, em = m.split("-")
                m_detail = "在第 %s 至 %s 分钟" % (sm, em)
            elif "," in m:
                m_detail = "在第 %s 分钟" % "、".join(m.split(","))
            elif m.isdigit():
                m_detail = "第 %s 分钟" % m
            else:
                m_detail = m

            # 3. 小时详细解析
            h_detail = ""
            if h == "*":
                h_detail = "每小时"
            elif h.startswith("*/") or "/" in h:
                st = h.split("/")[1]
                h_detail = "每隔 %s 小时" % st
            elif "-" in h and "," not in h:
                sh, eh = h.split("-")
                if sh.isdigit() and eh.isdigit():
                    h_detail = "在 %02d:00 至 %02d:00 期间" % (int(sh), int(eh))
                else:
                    h_detail = "在 %s 点至 %s 点期间" % (sh, eh)
            elif "," in h:
                h_detail = "在 %s 点" % "、".join(h.split(","))
            elif h.isdigit():
                h_detail = "%02d 点" % int(h)
            else:
                h_detail = h

            # 4. 自然语言合成
            human_readable = ""
            if m == "*" and h == "*":
                human_readable = "每分钟执行一次" if date_desc == "每天" else date_desc + "的每分钟执行一次"
            elif m.startswith("*/") and h == "*":
                human_readable = "%s执行一次" % m_detail if date_desc == "每天" else "%s的 %s执行一次" % (date_desc, m_detail)
            elif "/" in m and h == "*":
                human_readable = "每小时%s执行一次" % m_detail if date_desc == "每天" else "%s每小时%s执行一次" % (date_desc, m_detail)
            elif m.isdigit() and h == "*":
                human_readable = "每小时的第 %d 分钟执行 (例如 00:%02d, 01:%02d ...)" % (int(m), int(m), int(m))
                if date_desc != "每天": human_readable = date_desc + "的" + human_readable
            elif m.isdigit() and h.isdigit():
                time_str = "%02d:%02d" % (int(h), int(m))
                human_readable = "%s的 %s 执行" % (date_desc, time_str) if date_desc != "每天" else "每天的 %s 执行" % time_str
            else:
                human_readable = "%s的 %s %s 执行" % (date_desc, h_detail, m_detail) if date_desc != "每天" else "%s %s 执行" % (h_detail, m_detail)

            print("💡 含义解读:")
            print("👉 %s" % human_readable)
            print("")
            print("📋 字段拆解说明:")
            print("- 分钟 (%s): %s" % (m, m_detail))
            print("- 小时 (%s): %s" % (h, h_detail))
            print("- 日期 (%s): %s" % (dom, "每天" if dom=="*" else ("第 %s 日" % dom)))
            print("- 月份 (%s): %s" % (mon, "每月" if mon=="*" else ("%s 月" % mon)))
            print("- 星期 (%s): %s" % (dow, "每星期" if dow=="*" else ("%s" % dow)))
        else:
            print("非标准 5 字段 Cron 表达式: %s" % expr)
except Exception as err:
    print("表达式说明: %s" % str(err))
'; else if [ "${schedule}" = "@hourly" ]; then echo "含义: 每小时执行一次 (0 * * * *)"; elif [ "${schedule}" = "@daily" ] || [ "${schedule}" = "@midnight" ]; then echo "含义: 每天午夜执行 (0 0 * * *)"; elif [ "${schedule}" = "@weekly" ]; then echo "含义: 每周日午夜执行 (0 0 * * 0)"; elif [ "${schedule}" = "@monthly" ]; then echo "含义: 每月1号午夜执行 (0 0 1 * *)"; else echo "${schedule}" | awk '{print "分钟: "$1" (0-59)"; print "小时: "$2" (0-23)"; print "日期: "$3" (1-31)"; print "月份: "$4" (1-12)"; print "星期: "$5" (0-7)"}'; fi; fi; true`,
        title: `执行时间表 - ${schedule}`,
        actionName: '查看执行时间表'
      },
      'delete-task-file': {
        command: `echo "正在删除文件: ${source}"; rm -f "${source}" && echo "✓ 删除成功" || echo "✗ 删除失败"`,
        title: `删除任务文件 - ${source}`,
        actionName: '删除任务文件'
      },

      // 基本信息
      'details': {
        command: `echo "=== 计划任务详情 ==="; echo ""; echo "用户: ${user}"; echo "时间表: ${schedule}"; echo "命令: ${command}"; echo ""; echo "=== 任务状态 ==="; crontab -u ${user} -l 2>/dev/null | grep -F "${command}" || echo "任务可能已被删除或修改"`,
        title: `计划任务详情 - ${user}`,
        actionName: '查看任务详情'
      },
      'command': {
        command: `echo "=== 执行命令 ==="; echo ""; echo "${command}"; echo ""; echo "=== 命令分析 ==="; which ${command.split(' ')[0]} 2>/dev/null || echo "命令路径: 未找到或不在PATH中"`,
        title: `执行命令 - ${command.substring(0, 120)}...`,
        actionName: '查看执行命令'
      },

      // 任务管理
      'run-now': {
        command: `echo "立即执行计划任务"; echo ""; echo "用户: ${user}"; echo "命令: ${command}"; echo ""; echo "执行中..."; echo ""; ${command}`,
        title: `立即执行 - ${command.substring(0, 120)}...`,
        actionName: '立即执行任务'
      },
      'test-command': {
        command: `echo "=== 测试命令 ==="; echo ""; echo "命令: ${command}"; echo ""; echo "检查命令语法..."; bash -n -c "${command}" 2>&1 && echo "✓ 语法检查通过" || echo "✗ 语法错误"; echo ""; echo "⚠️ 提示：这只是语法检查，实际执行可能需要其他条件"`,
        title: `测试命令 - ${command.substring(0, 120)}...`,
        actionName: '测试命令'
      },
      'view-crontab': {
        command: `crontab -u ${user} -l 2>/dev/null || echo "用户 ${user} 没有crontab"`,
        title: `完整crontab - ${user}`,
        actionName: '查看完整crontab'
      },

      // 执行历史
      'execution-logs': {
        command: `echo "=== 计划任务执行日志 ==="; echo ""; echo "搜索关键词: ${command.split(' ')[0]}"; echo ""; grep CRON /var/log/syslog 2>/dev/null | grep "${user}" | grep "${command.split(' ')[0]}" | tail -50 || journalctl -u cron 2>/dev/null | grep "${user}" | grep "${command.split(' ')[0]}" | tail -50 || echo "无执行日志或日志文件不可访问"`,
        title: `执行日志 - ${command.substring(0, 120)}...`,
        actionName: '查看执行日志'
      },
      'recent-runs': {
        command: `echo "=== 最近执行记录 ==="; echo ""; grep CRON /var/log/syslog 2>/dev/null | grep "(${user})" | tail -20 || journalctl -u cron 2>/dev/null | grep "${user}" | tail -20 || echo "无执行记录"`,
        title: `最近执行记录 - ${user}`,
        actionName: '查看最近执行记录'
      },
      'error-logs': {
        command: `echo "=== 错误日志 ==="; echo ""; grep -i "error\\|fail\\|cron" /var/log/syslog 2>/dev/null | grep "${user}" | tail -30 || journalctl -p err 2>/dev/null | grep cron | grep "${user}" | tail -30 || echo "无错误日志"`,
        title: `错误日志 - ${user}`,
        actionName: '查看错误日志'
      },

      // 时间分析
      'parse-cron': {
        command: `echo "=== Cron表达式解析 ==="; echo ""; echo "Cron 表达式: ${schedule}"; echo ""; pybin=$(command -v python3 || command -v python || command -v python2); if [ -n "$pybin" ]; then "$pybin" -c '
import sys

expr = "${schedule}"
shortcuts = {
    "@reboot": "系统启动/重启时自动执行",
    "@hourly": "每小时整点执行 (00:00, 01:00, 02:00 ...)",
    "@daily": "每天凌晨 00:00 执行一次",
    "@midnight": "每天午夜 00:00 执行一次",
    "@weekly": "每周日凌晨 00:00 执行一次",
    "@monthly": "每月 1 日凌晨 00:00 执行一次",
    "@yearly": "每年 1 月 1 日凌晨 00:00 执行一次",
    "@annually": "每年 1 月 1 日凌晨 00:00 执行一次"
}

if expr in shortcuts:
    print("💡 含义解读: 👉 %s" % shortcuts[expr])
else:
    parts = expr.split()
    if len(parts) == 5:
        m, h, dom, mon, dow = parts[0], parts[1], parts[2], parts[3], parts[4]
        dow_names = {"0":"周日","1":"周一","2":"周二","3":"周三","4":"周四","5":"周五","6":"周六","7":"周日"}
        
        date_desc = ""
        if dow != "*":
            if dow == "1-5": date_desc = "每周一至周五"
            elif dow in ["0,6","6,0","6,7","7,6"]: date_desc = "每周六、周日"
            elif "-" in dow and "," not in dow:
                s, e = dow.split("-")
                date_desc = "每周%s至%s" % (dow_names.get(s,s), dow_names.get(e,e))
            else:
                d_items = [dow_names.get(x,x) for x in dow.split(",")]
                date_desc = "每" + "、".join(d_items)
        elif dom != "*":
            if "-" in dom:
                s, e = dom.split("-")
                date_desc = "每月 %s 到 %s 日" % (s, e)
            else:
                date_desc = "每月 %s 日" % "、".join(dom.split(","))
        else:
            date_desc = "每天"

        if mon != "*":
            date_desc = ("每年 %s 月 " % "、".join(mon.split(","))) + date_desc

        time_desc = ""
        is_interval = False
        if m == "*" and h == "*":
            time_desc = "每分钟"
            is_interval = True
        elif m.startswith("*/") and h == "*":
            step = m.split("/")[1]
            time_desc = "每隔 %s 分钟" % step
            is_interval = True
        elif m.startswith("*/") and h.isdigit():
            step = m.split("/")[1]
            time_desc = "在 %02d 点期间每隔 %s 分钟" % (int(h), step)
            is_interval = True
        elif m.isdigit() and h == "*":
            time_desc = "每小时的第 %d 分钟 (如 00:%02d, 01:%02d ...)" % (int(m), int(m), int(m))
            is_interval = True
        elif m.isdigit() and h.isdigit():
            time_desc = "%02d:%02d" % (int(h), int(m))
        elif m.isdigit() and "-" in h and "," not in h:
            s, e = h.split("-")
            time_desc = "在 %02d:%02d 至 %02d:%02d 期间每小时" % (int(s), int(m), int(e), int(m))
            is_interval = True
        elif m.isdigit() and "," in h:
            h_list = ["%02d:%02d" % (int(x), int(m)) for x in h.split(",") if x.isdigit()]
            time_desc = "在 " + "、".join(h_list)
        else:
            time_desc = "%s点%s分" % (h, m)

        if is_interval and date_desc == "每天":
            human_readable = time_desc + "执行"
        else:
            human_readable = date_desc + "的 " + time_desc + " 执行"

        print("💡 含义解读: 👉 %s" % human_readable)
        print("📋 字段拆解说明:")
        print("- 分钟 (%s): %s" % (m, "每分钟" if m=="*" else ("每隔 %s 分钟" % m.split("/")[1] if m.startswith("*/") else ("第 %s 分钟" % m))))
        print("- 小时 (%s): %s" % (h, "每小时" if h=="*" else ("%s 点" % h)))
        print("- 日期 (%s): %s" % (dom, "每天" if dom=="*" else ("第 %s 日" % dom)))
        print("- 月份 (%s): %s" % (mon, "每月" if mon=="*" else ("%s 月" % mon)))
        print("- 星期 (%s): %s" % (dow, "每星期" if dow=="*" else ("%s" % dow)))
    else:
        print("非标准 5 字段 Cron 表达式: %s" % expr)
' 2>/dev/null; else if [ "${schedule}" = "@hourly" ]; then echo "含义: 每小时执行一次 (0 * * * *)"; elif [ "${schedule}" = "@daily" ] || [ "${schedule}" = "@midnight" ]; then echo "含义: 每天午夜执行 (0 0 * * *)"; elif [ "${schedule}" = "@weekly" ]; then echo "含义: 每周日午夜执行 (0 0 * * 0)"; elif [ "${schedule}" = "@monthly" ]; then echo "含义: 每月1号午夜执行 (0 0 1 * *)"; else echo "${schedule}" | awk '{print "分钟: "$1" (0-59)"; print "小时: "$2" (0-23)"; print "日期: "$3" (1-31)"; print "月份: "$4" (1-12)"; print "星期: "$5" (0-7)"}'; fi; fi; true`,
        title: `Cron表达式解析 - ${schedule}`,
        actionName: '解析cron表达式'
      },
      'next-run': {
        command: `echo "=== 下次执行时间 ==="; echo ""; echo "当前时间: $(date '+%Y-%m-%d %H:%M:%S')"; echo "时间表: ${schedule}"; echo ""; pybin=$(command -v python3 || command -v python || command -v python2); if [ -n "$pybin" ]; then "$pybin" -c '
import sys, datetime
schedule = "${schedule}"
shortcuts = {"@hourly":"0 * * * *","@daily":"0 0 * * *","@midnight":"0 0 * * *","@weekly":"0 0 * * 0","@monthly":"0 0 1 * *","@yearly":"0 0 1 1 *"}
schedule = shortcuts.get(schedule, schedule)
if schedule == "@reboot":
    print("下次执行时间: 系统下次启动/重启时")
else:
    parts = schedule.split()
    if len(parts) == 5:
        def parse(f, mi, ma):
            r = set()
            for p in f.split(","):
                if "/" in p:
                    sub, st = p.split("/"); st = int(st)
                    if sub == "*": a, b = mi, ma
                    elif "-" in sub: a, b = map(int, sub.split("-"))
                    else: a, b = int(sub), ma
                    r.update(range(a, b + 1, st))
                elif "-" in p:
                    a, b = map(int, p.split("-")); r.update(range(a, b + 1))
                elif p == "*": r.update(range(mi, ma + 1))
                elif p.isdigit(): r.add(int(p))
            return r
        try:
            mins, hrs, days, mos, dows = parse(parts[0],0,59), parse(parts[1],0,23), parse(parts[2],1,31), parse(parts[3],1,12), parse(parts[4],0,7)
            if 7 in dows: dows.add(0)
            now = datetime.datetime.now().replace(second=0, microsecond=0)
            curr = now + datetime.timedelta(minutes=1)
            limit = now + datetime.timedelta(days=366)
            found = None
            while curr <= limit:
                if curr.month in mos and curr.day in days and curr.hour in hrs and curr.minute in mins and (curr.weekday()+1)%7 in dows:
                    found = curr; break
                curr += datetime.timedelta(minutes=1)
            if found:
                diff = int((found - datetime.datetime.now()).total_seconds())
                h, rem = divmod(diff, 3600); m, _ = divmod(rem, 60)
                ds = "%d 小时 %d 分钟" % (h, m) if h > 0 else "%d 分钟" % m
                print("下次执行时间: %s (约 %s 后)" % (found.strftime("%Y-%m-%d %H:%M:%S"), ds))
            else:
                print("下次执行时间: 未能在未来一年内匹配到有效执行时刻")
        except Exception as e:
            print("计算失败: %s" % str(e))
    else:
        print("非标准 5 字段 Cron 表达式: %s" % schedule)
' 2>/dev/null; else if [ "${schedule}" = "@hourly" ]; then echo "下次执行时间: 下一个整点"; elif [ "${schedule}" = "@daily" ]; then echo "下次执行时间: 明天 00:00"; elif [ "${schedule}" = "@weekly" ]; then echo "下次执行时间: 下周日 00:00"; elif [ "${schedule}" = "@monthly" ]; then echo "下次执行时间: 下月1日 00:00"; else echo "下次执行时间: 请参考 Cron 规则计算 (${schedule})"; fi; fi; true`,
        title: `下次执行时间 - ${schedule}`,
        actionName: '查看下次执行时间'
      },
      'frequency': {
        command: `echo "=== 执行频率分析 ==="; echo ""; echo "时间表: ${schedule}"; echo ""; if [[ "${schedule}" == "@hourly" ]]; then echo "频率: 每小时1次"; echo "每天: 24次"; echo "每月: ~720次"; elif [[ "${schedule}" == "@daily" ]]; then echo "频率: 每天1次"; echo "每月: ~30次"; echo "每年: 365次"; elif [[ "${schedule}" == "@weekly" ]]; then echo "频率: 每周1次"; echo "每月: ~4次"; echo "每年: 52次"; elif [[ "${schedule}" == "@monthly" ]]; then echo "频率: 每月1次"; echo "每年: 12次"; elif [[ "${schedule}" =~ ^\\*.*\\*.*\\*.*\\*.*\\*$ ]]; then echo "频率: 每分钟1次"; echo "每小时: 60次"; echo "每天: 1440次"; else echo "自定义频率"; echo "请根据cron表达式计算"; fi`,
        title: `执行频率 - ${schedule}`,
        actionName: '执行频率分析'
      },

      // 安全检查
      'security-check': {
        command: `echo "=== 命令安全性检查 ==="; echo ""; echo "命令: ${command}"; echo ""; echo "1. 检查危险命令:"; if echo "${command}" | grep -qE "rm -rf|dd if=|mkfs|fdisk|>/dev/"; then echo "⚠️ 包含危险命令"; else echo "✓ 未发现明显危险命令"; fi; echo ""; echo "2. 检查网络操作:"; if echo "${command}" | grep -qE "wget|curl|nc|telnet|ssh"; then echo "⚠️ 包含网络操作命令"; else echo "✓ 未检测到网络操作"; fi; echo ""; echo "3. 检查权限提升:"; if echo "${command}" | grep -qE "sudo|su -"; then echo "⚠️ 包含权限提升命令"; else echo "✓ 未检测到权限提升"; fi`,
        title: `安全检查 - ${command.substring(0, 120)}...`,
        actionName: '命令安全性检查'
      },
      'check-path': {
        command: `echo "=== 命令路径检查 ==="; echo ""; cmd_name="${command.split(' ')[0]}"; echo "命令: $cmd_name"; echo ""; which "$cmd_name" 2>/dev/null && echo "" && ls -la $(which "$cmd_name") 2>/dev/null || echo "⚠️ 命令不在PATH中或不存在"`,
        title: `路径检查 - ${command.split(' ')[0]}`,
        actionName: '检查命令路径'
      },
      'suspicious-check': {
        command: `echo "=== 可疑命令检测 ==="; echo ""; echo "命令: ${command}"; echo ""; echo "检测项:"; echo ""; echo "1. 编码/混淆:"; if echo "${command}" | grep -qE "base64|eval|exec"; then echo "⚠️ 可能包含编码或混淆"; else echo "✓ 未发现编码"; fi; echo ""; echo "2. 反弹shell:"; if echo "${command}" | grep -qE "bash -i|/bin/sh|nc.*-e"; then echo "⚠️ 可能是反弹shell"; else echo "✓ 未发现反弹shell特征"; fi; echo ""; echo "3. 下载执行:"; if echo "${command}" | grep -qE "curl.*\\||wget.*\\||chmod\\+x"; then echo "⚠️ 可能下载并执行文件"; else echo "✓ 未发现下载执行"; fi`,
        title: `可疑检测 - ${command.substring(0, 120)}...`,
        actionName: '可疑命令检测'
      },

      // 高级操作
      'backup': {
        command: `echo "=== 备份crontab ==="; echo ""; backup_file="/tmp/crontab_${user}_$(date +%Y%m%d_%H%M%S).bak"; crontab -u ${user} -l > "$backup_file" 2>/dev/null && echo "✓ 备份成功" && echo "备份文件: $backup_file" && echo "" && cat "$backup_file" || echo "✗ 备份失败"`,
        title: `备份crontab - ${user}`,
        actionName: '备份crontab'
      },
      'export': {
        command: `echo "=== 导出任务配置 ==="; echo ""; echo "用户: ${user}"; echo "时间表: ${schedule}"; echo "命令: ${command}"; echo ""; echo "JSON格式:"; echo "{"; echo '  "user": "'${user}'",'; echo '  "schedule": "'${schedule}'",'; echo '  "command": "'${command}'"'; echo "}"`,
        title: `导出配置 - ${command.substring(0, 120)}...`,
        actionName: '导出任务配置'
      },
    }

    const entry = actions[action]
    if (!entry) return null

    if (typeof entry === 'function') {
      return entry()
    }
    return entry
  }
}
