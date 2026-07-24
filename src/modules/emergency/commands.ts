export type EmergencyCommand = {
  id: string;
  name: string;
  cmd?: string;  // 默认命令（向后兼容）
  desc?: string;
  outputType?: 'files' | 'text';  // 'files': 解析路径/权限; 'text': 仅原始输出
  // 多系统命令支持
  commands?: {
    default: string;      // 通用命令
    ubuntu?: string;      // Ubuntu 特定
    debian?: string;      // Debian 特定
    centos?: string;      // CentOS 特定
    rhel?: string;        // RHEL 特定
    fedora?: string;      // Fedora 特定
    kylin?: string;       // 麒麟特定
    uos?: string;         // 统信特定
    deepin?: string;      // 深度特定
    openeuler?: string;   // 开放欧拉特定
    anolis?: string;      // 龙蜥特定
    arch?: string;        // Arch Linux 特定
    opensuse?: string;    // openSUSE 特定
    alpine?: string;      // Alpine 特定
  };
};

export type EmergencyCategory = {
  id: string;
  title: string;
  hint?: string;
  items: EmergencyCommand[];
};

const SERVICE_LIST_COMMAND = '(systemctl list-unit-files --type=service --no-pager 2>/dev/null || rc-status -a 2>/dev/null || service --status-all 2>/dev/null || find /etc/init.d -maxdepth 1 -type f -exec basename {} \\; 2>/dev/null || echo "service manager not available") | sed -n "1,300p"';
const RUNNING_SERVICE_COMMAND = '(systemctl list-units --type=service --state=running --no-pager 2>/dev/null || rc-status 2>/dev/null || service --status-all 2>/dev/null || ps -eo pid,comm,args 2>/dev/null | sed -n "1,120p" || echo "service manager not available") | sed -n "1,300p"';
const AUDITD_STATUS_COMMAND = 'systemctl status auditd 2>/dev/null || service auditd status 2>/dev/null || rc-service auditd status 2>/dev/null || echo "auditd not available"';
const LISTEN_PORTS_COMMAND = `(ss -tulpen 2>/dev/null || netstat -tulpen 2>/dev/null || netstat -tuln 2>/dev/null || echo 'ss/netstat 不可用')`;
const ESTABLISHED_CONNECTIONS_COMMAND = `(ss -tanp 2>/dev/null || netstat -tanp 2>/dev/null || netstat -tan 2>/dev/null || echo 'ss/netstat 不可用')`;

// 常用应急命令清单（按类别组织）
export const emergencyCategories: EmergencyCategory[] = [
  {
    id: 'permissions',
    title: '权限安全',
    hint: '快速查看 SUID/SGID、可写、能力集等',
    items: [
      { id: 'perm-suid', name: 'SUID 可执行', outputType: 'files', cmd: `find / -xdev -perm -4000 -type f 2>/dev/null | sort | head -n 300`, desc: '含SUID位的可执行文件' },
      { id: 'perm-sgid', name: 'SGID 可执行', outputType: 'files', cmd: `find / -xdev -perm -2000 -type f 2>/dev/null | sort | head -n 300`, desc: '含SGID位的可执行文件' },
      { id: 'perm-ww-dirs', name: 'World-writable 目录', outputType: 'files', cmd: `find / -xdev -type d -perm -0002 -not -path '/proc/*' -not -path '/sys/*' 2>/dev/null | sort | head -n 200`, desc: '可能被任意用户写入' },
      { id: 'perm-ww-files', name: 'World-writable 文件', outputType: 'files', cmd: `find / -xdev -type f -perm -0002 -not -path '/proc/*' -not -path '/sys/*' 2>/dev/null | sort | head -n 200`, desc: '可能被任意用户写入' },
      { id: 'perm-cap', name: 'Capabilities 概览', cmd: `command -v getcap >/dev/null 2>&1 && getcap -r / 2>/dev/null | head -n 300 || echo 'getcap 未安装'`, desc: 'Linux capabilities 检查' },
      { id: 'perm-unowned', name: 'No Owner/Nogroup 文件', outputType: 'files', cmd: `find / -xdev \\( -nouser -o -nogroup \\) 2>/dev/null | head -n 200`, desc: '潜在遗留或异常文件' },
      { id: 'perm-sudoers', name: 'sudoers 配置', cmd: `echo '[group sudo]'; getent group sudo; echo; echo '[sudoers]'; grep -vE '^(#|$)' /etc/sudoers 2>/dev/null; ls -l /etc/sudoers.d 2>/dev/null`, desc: 'sudoers 基本核查' },
      {
        id: 'perm-ssh-login-users',
        name: '可登录 SSH 账号',
        cmd: `cat /etc/shadow 2>/dev/null | grep '^[^:]*:[^\\*!]' | cut -d: -f1 | while read i; do grep "^$i:" /etc/passwd 2>/dev/null | grep -vE "/bin/false|/nologin"; done | cut -d: -f1 | sort | uniq`,
        desc: 'Shadow密码有效且Shell可登录'
      },
    ],
  },
  {
    id: 'baseline',
    title: '安全基线',
    hint: '账户策略、SSH、服务与计划任务等',
    items: [
      { id: 'base-users', name: 'Users & Shells', cmd: `getent passwd | cut -d: -f1,3,7 | sort`, desc: '用户名/UID/登录Shell' },
      { id: 'base-passwd-policy', name: '密码策略 login.defs', cmd: `grep -E 'PASS_MAX_DAYS|PASS_MIN_DAYS|PASS_MIN_LEN|PASS_WARN_AGE' /etc/login.defs 2>/dev/null || echo '# 未检索到口令策略显式配置'`, desc: '账号口令策略' },
      { id: 'base-ssh', name: 'sshd_config 核查', cmd: `grep -iE '^\\s*#?\\s*(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|ChallengeResponseAuthentication|KbdInteractiveAuthentication)\\b' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null || echo '# 未匹配到相关配置项（可能使用默认设置）'`, desc: 'sshd 配置快照' },
      {
        id: 'base-services-enabled',
        name: '已启用服务列表',
        desc: '查看系统中已启用的服务',
        commands: {
          default: SERVICE_LIST_COMMAND,
          alpine: SERVICE_LIST_COMMAND,
        }
      },
      {
        id: 'base-services-running',
        name: '运行中的服务',
        desc: '查看当前正在运行的服务',
        commands: {
          default: RUNNING_SERVICE_COMMAND,
          alpine: RUNNING_SERVICE_COMMAND,
        }
      },
      { id: 'base-cron', name: 'cron 任务总览', cmd: 'cut -f1 -d: /etc/passwd | while read u; do echo "===== $u ====="; crontab -u "$u" -l 2>/dev/null; done; echo "===== system ====="; ls -l /etc/cron.* /etc/cron.d 2>/dev/null', desc: '用户/系统定时任务' },
      { id: 'base-packages', name: '核心组件版本', cmd: `uname -a; echo; bash --version 2>/dev/null | head -n1; echo; openssl version 2>/dev/null; echo; ssh -V 2>&1 | head -n1`, desc: '内核/常见组件' },
      {
        id: 'base-selinux-status',
        name: 'SELinux/AppArmor 状态',
        desc: '检查强制访问控制状态',
        commands: {
          default: 'getenforce 2>/dev/null || echo "SELinux not available"; echo "---"; aa-status 2>/dev/null || echo "AppArmor not available"',
          ubuntu: 'aa-status 2>/dev/null || echo "AppArmor not available"',
          debian: 'aa-status 2>/dev/null || echo "AppArmor not available"',
          centos: 'getenforce 2>/dev/null; echo "---"; sestatus 2>/dev/null',
          rhel: 'getenforce 2>/dev/null; echo "---"; sestatus 2>/dev/null',
          fedora: 'getenforce 2>/dev/null; echo "---"; sestatus 2>/dev/null',
          kylin: 'getenforce 2>/dev/null; echo "---"; sestatus 2>/dev/null || aa-status 2>/dev/null',
          uos: 'aa-status 2>/dev/null || getenforce 2>/dev/null',
          deepin: 'aa-status 2>/dev/null || echo "AppArmor not available"',
          openeuler: 'getenforce 2>/dev/null; echo "---"; sestatus 2>/dev/null',
          anolis: 'getenforce 2>/dev/null; echo "---"; sestatus 2>/dev/null',
          arch: 'aa-status 2>/dev/null || echo "AppArmor not available"',
          opensuse: 'aa-status 2>/dev/null || echo "AppArmor not available"',
          alpine: 'echo "SELinux/AppArmor not typically used on Alpine"'
        }
      },
      {
        id: 'base-password-aging',
        name: '密码过期策略检查',
        desc: '检查用户密码过期设置',
        cmd: 'cut -d: -f1 /etc/passwd | while read user; do chage -l "$user" 2>/dev/null | grep -E "Password expires|Maximum|Minimum|Warning" | head -n 4 && echo "---"; done | head -n 200'
      },
      {
        id: 'base-empty-password',
        name: '空密码账户检查',
        desc: '检查是否存在空密码账户',
        cmd: 'awk -F: \'($2 == "") {print $1}\' /etc/shadow 2>/dev/null | head -n 50'
      },
      {
        id: 'base-uid-0-accounts',
        name: 'UID 0 账户检查',
        desc: '检查除root外是否有其他UID为0的账户',
        cmd: 'awk -F: \'($3 == 0) {print $1 " (UID=" $3 ")"}\' /etc/passwd'
      },
      {
        id: 'base-sudo-nopasswd',
        name: 'sudo 免密配置检查',
        desc: '检查sudo免密配置',
        cmd: 'grep -r "NOPASSWD" /etc/sudoers /etc/sudoers.d/ 2>/dev/null'
      },
      {
        id: 'base-ssh-keys',
        name: 'SSH 密钥检查',
        desc: '检查所有用户的SSH授权密钥',
        cmd: 'ls -d /root /home/* 2>/dev/null | while read home; do if [ -f "$home/.ssh/authorized_keys" ]; then echo "=== $home ==="; cat "$home/.ssh/authorized_keys" 2>/dev/null; fi; done; true'
      },
      {
        id: 'base-failed-logins',
        name: '失败登录尝试',
        desc: '查看最近的失败登录记录',
        cmd: 'lastb -n 50 2>/dev/null || echo "lastb command not available"'
      },
      {
        id: 'base-umask',
        name: 'umask 设置检查',
        desc: '检查系统默认umask设置',
        cmd: 'echo "Current umask: $(umask)"; echo "---"; grep -r "umask" /etc/profile /etc/bashrc /etc/bash.bashrc /etc/profile.d/ 2>/dev/null | head -n 20'
      },
      {
        id: 'base-core-dumps',
        name: 'Core Dump 配置',
        desc: '检查core dump设置',
        cmd: 'ulimit -c; echo "---"; cat /etc/security/limits.conf 2>/dev/null | grep -v "^#" | grep -v "^$" | head -n 30'
      },
      {
        id: 'base-kernel-params',
        name: '内核安全参数',
        desc: '检查关键内核安全参数',
        cmd: 'sysctl kernel.randomize_va_space kernel.exec-shield kernel.dmesg_restrict kernel.kptr_restrict net.ipv4.conf.all.accept_source_route net.ipv4.conf.all.accept_redirects net.ipv4.icmp_echo_ignore_broadcasts 2>/dev/null'
      }
    ],
  },
  {
    id: 'network',
    title: '网络安全排查',
    hint: '端口、连接、路由、防火墙与DNS',
    items: [
      { id: 'net-listen', name: '监听端口', cmd: `${LISTEN_PORTS_COMMAND} | sed -n '1,300p'`, desc: 'TCP/UDP 监听' },
      { id: 'net-established', name: '活动连接', cmd: `${ESTABLISHED_CONNECTIONS_COMMAND} | sed -n '1,500p'`, desc: '活动 TCP 连接' },
      { id: 'net-route', name: '路由表 ip route', cmd: `ip route 2>/dev/null || route -n 2>/dev/null`, desc: '网络路由' },
      { id: 'net-dns', name: '/etc/resolv.conf', cmd: `cat /etc/resolv.conf 2>/dev/null`, desc: 'nameserver/搜索域' },
      {
        id: 'net-firewall-status',
        name: '防火墙状态',
        desc: '检查防火墙配置和状态',
        commands: {
          default: 'iptables -L -n -v 2>/dev/null | head -n 100',
          ubuntu: 'ufw status verbose 2>/dev/null || iptables -L -n -v | head -n 100',
          debian: 'iptables -L -n -v | head -n 100',
          centos: 'firewall-cmd --state 2>/dev/null; echo "---"; firewall-cmd --list-all 2>/dev/null || iptables -L -n -v | head -n 100',
          rhel: 'firewall-cmd --state 2>/dev/null; echo "---"; firewall-cmd --list-all 2>/dev/null || iptables -L -n -v | head -n 100',
          fedora: 'firewall-cmd --state 2>/dev/null; echo "---"; firewall-cmd --list-all 2>/dev/null',
          kylin: 'firewall-cmd --state 2>/dev/null; echo "---"; firewall-cmd --list-all 2>/dev/null || ufw status verbose 2>/dev/null',
          uos: 'ufw status verbose 2>/dev/null || firewall-cmd --list-all 2>/dev/null || iptables -L -n -v | head -n 100',
          deepin: 'ufw status verbose 2>/dev/null || iptables -L -n -v | head -n 100',
          openeuler: 'firewall-cmd --state 2>/dev/null; echo "---"; firewall-cmd --list-all 2>/dev/null',
          anolis: 'firewall-cmd --state 2>/dev/null; echo "---"; firewall-cmd --list-all 2>/dev/null',
          arch: 'iptables -L -n -v | head -n 100',
          opensuse: 'firewall-cmd --state 2>/dev/null; echo "---"; firewall-cmd --list-all 2>/dev/null || iptables -L -n -v | head -n 100',
          alpine: 'iptables -L -n -v | head -n 100'
        }
      },
      {
        id: 'net-iptables-rules',
        name: 'iptables 详细规则',
        desc: '查看iptables所有链的规则',
        cmd: 'iptables -L -n -v --line-numbers 2>/dev/null | head -n 200'
      },
      {
        id: 'net-nftables-rules',
        name: 'nftables 规则集',
        desc: '查看nftables规则',
        cmd: 'nft list ruleset 2>/dev/null | head -n 200 || echo "nftables not available"'
      },
      {
        id: 'net-open-ports',
        name: '开放端口统计',
        desc: '统计所有监听端口',
        cmd: `${LISTEN_PORTS_COMMAND} | grep -E 'LISTEN|tcp|udp' | awk '{print $5}' | awk -F: '{print $NF}' | sort -n | uniq -c | sort -rn`
      },
      {
        id: 'net-suspicious-connections',
        name: '可疑外部连接',
        desc: '检查非常见端口的外部连接',
        cmd: `${ESTABLISHED_CONNECTIONS_COMMAND} | grep -E 'ESTAB|ESTABLISHED' | grep -vE ":(80|443|22|3306|6379|27017|5432|9200|8080)" | head -n 100`
      },
      {
        id: 'net-interfaces',
        name: '网络接口配置',
        desc: '查看所有网络接口详细信息',
        cmd: 'ip addr show 2>/dev/null || ifconfig -a 2>/dev/null'
      },
      {
        id: 'net-arp-table',
        name: 'ARP 缓存表',
        desc: '查看ARP缓存',
        cmd: 'ip neigh show 2>/dev/null || arp -an 2>/dev/null | head -n 100'
      },
      {
        id: 'net-hosts-file',
        name: '/etc/hosts 文件',
        desc: '检查hosts文件配置',
        cmd: 'cat /etc/hosts 2>/dev/null | grep -v "^#" | grep -v "^$"'
      },
      {
        id: 'net-tcp-wrappers',
        name: 'TCP Wrappers 配置',
        desc: '检查hosts.allow和hosts.deny',
        cmd: 'echo "=== /etc/hosts.allow ==="; cat /etc/hosts.allow 2>/dev/null | grep -v "^#" | grep -v "^$"; echo "=== /etc/hosts.deny ==="; cat /etc/hosts.deny 2>/dev/null | grep -v "^#" | grep -v "^$"'
      },
      {
        id: 'net-ipv6-status',
        name: 'IPv6 状态',
        desc: '检查IPv6是否启用',
        cmd: 'val=$(cat /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null); if [ "$val" = "0" ]; then echo "[IPv6 内核状态]: 已启用 (disable_ipv6=0)"; elif [ "$val" = "1" ]; then echo "[IPv6 内核状态]: 已禁用 (disable_ipv6=1)"; else echo "[IPv6 内核状态]: 未知/文件不可读"; fi; echo ""; echo "=== IPv6 网络接口与地址 ==="; (ip -6 addr show 2>/dev/null | grep -v "^$" || echo "# 未检测到活动的 IPv6 地址") | head -n 50'
      },
      {
        id: 'net-syn-flood-protection',
        name: 'SYN Flood 防护',
        desc: '检查SYN flood防护参数',
        cmd: 'sysctl net.ipv4.tcp_syncookies net.ipv4.tcp_max_syn_backlog net.ipv4.tcp_synack_retries 2>/dev/null'
      },
      {
        id: 'net-icmp-settings',
        name: 'ICMP 设置',
        desc: '检查ICMP相关安全设置',
        cmd: 'sysctl net.ipv4.icmp_echo_ignore_all net.ipv4.icmp_echo_ignore_broadcasts net.ipv4.icmp_ignore_bogus_error_responses 2>/dev/null'
      },
      {
        id: 'net-ip-forwarding',
        name: 'IP 转发状态',
        desc: '检查IP转发是否启用',
        cmd: 'sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding 2>/dev/null'
      },
      {
        id: 'net-rp-filter',
        name: '反向路径过滤',
        desc: '检查反向路径过滤设置',
        cmd: 'sysctl net.ipv4.conf.all.rp_filter net.ipv4.conf.default.rp_filter 2>/dev/null'
      }
    ],
  },
  {
    id: 'system',
    title: '系统安全排查',
    hint: '进程、模块、文件修改与异常检测',
    items: [
      { id: 'sys-proc-top', name: 'Top CPU 进程', cmd: `ps aux --sort=-%cpu | sed -n '1,60p'`, desc: 'CPU 占用排行' },
      { id: 'sys-root-proc', name: 'Root 进程', cmd: `ps -U root -u root u 2>/dev/null | sed -n '1,200p'`, desc: '以root运行的进程' },
      { id: 'sys-recent-files', name: '24h Modified 文件', outputType: 'files', cmd: `find / -xdev -type f -mtime -1 2>/dev/null | head -n 200`, desc: '最近修改排查' },
      { id: 'sys-modules', name: '内核模块 lsmod', cmd: `lsmod 2>/dev/null | sed -n '1,200p'`, desc: '已加载模块' },
      { id: 'sys-logins', name: '登录历史 last/lastlog', cmd: `last -n 80 2>/dev/null || lastlog 2>/dev/null | tail -n 120`, desc: 'last/lastlog 摘要' },
      { id: 'sys-path', name: 'PATH 可写检测', cmd: `echo $PATH; echo; echo $PATH | tr ':' '\n' | while read d; do ls -ld "$d" 2>/dev/null; done`, desc: '可写PATH风险' },
      {
        id: 'sys-hidden-processes',
        name: '隐藏进程检测',
        desc: '检测可能被隐藏的进程',
        cmd: 'ps aux | wc -l; echo "---"; ls /proc | grep -E "^[0-9]+$" | wc -l; echo "---"; ps aux | awk \'{print $2}\' | sort -n | uniq | wc -l'
      },
      {
        id: 'sys-suspicious-processes',
        name: '可疑进程检测',
        desc: '检测可疑的进程名称',
        cmd: 'ps aux | grep -E "(nc|ncat|netcat|/dev/tcp|/dev/udp|base64|python -c|perl -e|ruby -e|php -r)" | grep -v grep | head -n 50'
      },
      {
        id: 'sys-deleted-running',
        name: '已删除但仍运行的程序',
        desc: '检测被删除但仍在运行的可执行文件',
        cmd: 'lsof +L1 2>/dev/null | head -n 100 || echo "lsof not available"'
      },
      {
        id: 'sys-memory-usage',
        name: '内存使用排行',
        desc: '查看内存占用最高的进程',
        cmd: 'ps aux --sort=-%mem | head -n 30'
      },
      {
        id: 'sys-zombie-processes',
        name: '僵尸进程检测',
        desc: '检测系统中的僵尸进程',
        cmd: 'ps aux | awk \'$8=="Z" {print}\' | head -n 50'
      },
      {
        id: 'sys-startup-scripts',
        name: '启动脚本检查',
        desc: '检查系统启动脚本',
        cmd: 'ls -la /etc/rc*.d/ 2>/dev/null | head -n 100; echo "---"; ls -la /etc/init.d/ 2>/dev/null | head -n 50'
      },
      {
        id: 'sys-systemd-units',
        name: 'systemd 单元文件',
        desc: '列出systemd/OpenRC/init服务文件',
        cmd: `${SERVICE_LIST_COMMAND} | head -n 200`
      },
      {
        id: 'sys-environment-vars',
        name: '环境变量检查',
        desc: '检查系统环境变量',
        cmd: 'env | sort | head -n 100'
      },
      {
        id: 'sys-ld-preload',
        name: 'LD_PRELOAD 检查',
        desc: '检查LD_PRELOAD劫持',
        cmd: 'cat /etc/ld.so.preload 2>/dev/null || echo "No ld.so.preload file"; echo "---"; echo $LD_PRELOAD; echo "---"; cat /etc/ld.so.conf 2>/dev/null | head -n 30'
      },
      {
        id: 'sys-shared-libraries',
        name: '共享库检查',
        desc: '检查系统共享库配置',
        cmd: 'ldconfig -p 2>/dev/null | head -n 100'
      },
      {
        id: 'sys-tmp-files',
        name: '/tmp 可疑文件',
        desc: '检查/tmp目录中的可疑文件',
        cmd: 'find /tmp /var/tmp -type f -mtime -7 2>/dev/null | head -n 100; echo "---"; ls -lah /tmp /var/tmp 2>/dev/null | head -n 50'
      },
      {
        id: 'sys-dev-shm',
        name: '/dev/shm 检查',
        desc: '检查共享内存目录',
        cmd: 'ls -lah /dev/shm 2>/dev/null; echo "---"; find /dev/shm -type f 2>/dev/null'
      },
      {
        id: 'sys-unusual-files',
        name: '异常文件名检测',
        outputType: 'files',
        desc: '检测包含特殊字符的文件名',
        cmd: 'find / -xdev -type f \\( -name "*[[:space:]]*" -o -name ".*[[:space:]]*" \\) 2>/dev/null | head -n 100'
      },
      {
        id: 'sys-large-files',
        name: '大文件检测',
        outputType: 'files',
        desc: '查找大于100MB的文件',
        cmd: 'find / -xdev -type f -size +100M 2>/dev/null | head -n 50'
      },
      {
        id: 'sys-immutable-files',
        name: '不可变文件检查',
        desc: '检查设置了不可变属性的文件',
        cmd: 'lsattr / 2>/dev/null | grep -E "i-|a-" | head -n 100 || echo "lsattr not available"'
      }
    ],
  },
  {
    id: 'audit',
    title: '日志审计与监控',
    hint: '认证、系统错误、审计日志',
    items: [
      {
        id: 'audit-auth-fail',
        name: '认证失败日志',
        desc: '查看认证失败记录',
        commands: {
          default: 'grep -iE "fail|invalid|error|refused" /var/log/auth.log 2>/dev/null | tail -n 200 || grep -iE "fail|invalid|error|refused" /var/log/secure 2>/dev/null | tail -n 200',
          ubuntu: 'grep -iE "fail|invalid|error|refused" /var/log/auth.log 2>/dev/null | tail -n 200',
          debian: 'grep -iE "fail|invalid|error|refused" /var/log/auth.log 2>/dev/null | tail -n 200',
          centos: 'grep -iE "fail|invalid|error|refused" /var/log/secure 2>/dev/null | tail -n 200',
          rhel: 'grep -iE "fail|invalid|error|refused" /var/log/secure 2>/dev/null | tail -n 200',
          fedora: 'grep -iE "fail|invalid|error|refused" /var/log/secure 2>/dev/null | tail -n 200 || journalctl -u sshd -p err -n 200 --no-pager',
          kylin: 'grep -iE "fail|invalid|error|refused" /var/log/secure 2>/dev/null | tail -n 200 || grep -iE "fail|invalid|error|refused" /var/log/auth.log 2>/dev/null | tail -n 200',
          uos: 'grep -iE "fail|invalid|error|refused" /var/log/auth.log 2>/dev/null | tail -n 200',
          deepin: 'grep -iE "fail|invalid|error|refused" /var/log/auth.log 2>/dev/null | tail -n 200',
          openeuler: 'grep -iE "fail|invalid|error|refused" /var/log/secure 2>/dev/null | tail -n 200',
          anolis: 'grep -iE "fail|invalid|error|refused" /var/log/secure 2>/dev/null | tail -n 200',
          arch: 'journalctl -u sshd -p err -n 200 --no-pager 2>/dev/null',
          opensuse: 'grep -iE "fail|invalid|error|refused" /var/log/messages 2>/dev/null | tail -n 200',
          alpine: 'grep -iE "fail|invalid|error|refused" /var/log/messages 2>/dev/null | tail -n 200'
        }
      },
      { id: 'audit-journal-err', name: 'journalctl 错误', cmd: `journalctl -p err -n 200 --no-pager 2>/dev/null || echo 'journalctl 不可用'`, desc: '优先级 error' },
      { id: 'audit-syslog', name: 'Syslog Warning/Error', cmd: `grep -iE 'error|warn|critical' /var/log/syslog 2>/dev/null | tail -n 200 || grep -iE 'error|warn|critical' /var/log/messages 2>/dev/null | tail -n 200`, desc: 'syslog 快照' },
      { id: 'audit-sudo', name: 'sudo 使用记录', cmd: `grep -i sudo /var/log/auth.log 2>/dev/null | tail -n 200 || grep -i sudo /var/log/secure 2>/dev/null | tail -n 200`, desc: 'sudo 关键记录' },
      {
        id: 'audit-auditd-status',
        name: 'auditd 审计状态',
        desc: '检查auditd审计服务状态',
        commands: {
          default: AUDITD_STATUS_COMMAND,
          alpine: AUDITD_STATUS_COMMAND,
        }
      },
      {
        id: 'audit-rules',
        name: 'auditd 审计规则',
        desc: '查看当前审计规则',
        cmd: 'auditctl -l 2>/dev/null | head -n 100 || echo "auditd not available or no rules configured"'
      },
      {
        id: 'audit-log-size',
        name: '日志文件大小',
        desc: '检查关键日志文件大小',
        cmd: 'du -sh /var/log/* 2>/dev/null | sort -rh | head -n 30'
      },
      {
        id: 'audit-log-rotation',
        name: '日志轮转配置',
        desc: '检查logrotate配置',
        cmd: 'cat /etc/logrotate.conf 2>/dev/null | grep -v "^#" | grep -v "^$" | head -n 50; echo "---"; ls -lh /etc/logrotate.d/ 2>/dev/null'
      },
      {
        id: 'audit-rsyslog-config',
        name: 'rsyslog 配置',
        desc: '检查rsyslog配置',
        cmd: '(systemctl status rsyslog 2>/dev/null || service rsyslog status 2>/dev/null || rc-service rsyslog status 2>/dev/null || echo "rsyslog service status not available"); echo "---"; cat /etc/rsyslog.conf 2>/dev/null | grep -v "^#" | grep -v "^$" | head -n 50'
      },
      {
        id: 'audit-ssh-logins',
        name: 'SSH 登录记录',
        desc: '查看SSH登录历史',
        cmd: 'last -n 50 2>/dev/null | grep -vE "wtmp.*begins" || grep "Accepted" /var/log/auth.log 2>/dev/null | tail -n 100 || grep "Accepted" /var/log/secure 2>/dev/null | tail -n 100 || journalctl -u sshd | grep "Accepted" | tail -n 100'
      },
      {
        id: 'audit-failed-ssh',
        name: 'SSH 失败登录',
        desc: '查看SSH失败登录尝试',
        cmd: 'grep "Failed password" /var/log/auth.log 2>/dev/null | tail -n 100 || grep "Failed password" /var/log/secure 2>/dev/null | tail -n 100'
      },
      {
        id: 'audit-user-commands',
        name: '用户命令历史',
        desc: '查看用户 bash/zsh 命令历史',
        cmd: 'ls -d /root /home/* 2>/dev/null | while read home; do for f in "$home"/.bash_history "$home"/.zsh_history "$home"/.sh_history "$home"/.history; do if [ -s "$f" ]; then echo "=== $f ==="; tail -n 30 "$f" 2>/dev/null; fi; done; done | head -n 500; true'
      },
      {
        id: 'audit-file-integrity',
        name: '关键文件完整性',
        desc: '检查关键系统文件的修改时间',
        cmd: 'ls -lt /etc/passwd /etc/shadow /etc/group /etc/sudoers /etc/ssh/sshd_config /etc/hosts /etc/crontab 2>/dev/null'
      },
      {
        id: 'audit-wtmp-btmp',
        name: 'wtmp/btmp 日志',
        desc: '查看登录日志文件信息',
        cmd: 'ls -lh /var/log/wtmp /var/log/btmp /var/log/lastlog 2>/dev/null; echo "---"; last -n 50 2>/dev/null'
      }
    ],
  },
  {
    id: 'containers',
    title: '容器排查',
    hint: '容器环境与特权风险',
    items: [
      { id: 'ctn-docker-ps', name: 'docker ps 概览', cmd: `docker ps -a --format 'table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}\t{{.Ports}}' 2>/dev/null || echo 'docker 不可用或权限不足'`, desc: '所有容器含停止的' },
      { id: 'ctn-docker-group', name: 'docker 组 & id', cmd: `getent group docker 2>/dev/null; echo; id 2>/dev/null`, desc: 'docker 组与当前用户' },
      { id: 'ctn-docker-root', name: '/var/lib/docker 权限', cmd: `ls -l /var/lib/docker 2>/dev/null || echo '目录不可访问'`, desc: '数据目录可见性' },
      { id: 'ctn-docker-images', name: 'Docker 镜像列表', cmd: `docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}' 2>/dev/null | head -n 50`, desc: '所有本地镜像' },
      { id: 'ctn-docker-volumes', name: 'Docker 卷挂载', cmd: `docker volume ls 2>/dev/null; echo "---"; docker ps --format '{{.Names}}' 2>/dev/null | while read c; do echo "=== $c ==="; docker inspect "$c" --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} ({{.Mode}}){{println}}{{end}}' 2>/dev/null; done | head -n 100`, desc: '容器卷/挂载检查' },
      { id: 'ctn-docker-privileged', name: '特权容器检测', cmd: `docker ps --format '{{.Names}}' 2>/dev/null | while read c; do priv=$(docker inspect "$c" --format '{{.HostConfig.Privileged}}' 2>/dev/null); [ "$priv" = "true" ] && echo "[PRIVILEGED] $c"; caps=$(docker inspect "$c" --format '{{.HostConfig.CapAdd}}' 2>/dev/null); [ "$caps" != "[]" ] && [ -n "$caps" ] && echo "[CAPS: $caps] $c"; done`, desc: '特权或额外 capability 容器' },
      { id: 'ctn-docker-network', name: '容器网络模式', cmd: `docker ps --format '{{.Names}}' 2>/dev/null | while read c; do mode=$(docker inspect "$c" --format '{{.HostConfig.NetworkMode}}' 2>/dev/null); echo "$c: $mode"; done | head -n 50`, desc: 'host/bridge/none 网络模式' },
      { id: 'ctn-docker-logs', name: '容器异常日志', cmd: `docker ps --format '{{.Names}}' 2>/dev/null | while read c; do echo "=== $c ==="; docker logs --tail 20 "$c" 2>&1 | grep -iE "error|warn|fail|panic|fatal" | head -n 5; done | head -n 100`, desc: '各容器最近的错误日志' },
      { id: 'ctn-k8s-pods', name: 'K8s Pod 概览', cmd: `kubectl get pods -A -o wide 2>/dev/null | head -n 100 || echo 'kubectl 不可用'`, desc: '所有命名空间的 Pod' },
      { id: 'ctn-k8s-privileged', name: 'K8s 特权 Pod', cmd: `kubectl get pods -A -o json 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);[print(f'{i[\"metadata\"][\"namespace\"]}/{i[\"metadata\"][\"name\"]}') for i in d.get('items',[]) for c in i.get('spec',{}).get('containers',[]) if c.get('securityContext',{}).get('privileged')]" 2>/dev/null || echo 'kubectl/python3 不可用'`, desc: '检测特权 Pod' },
      { id: 'ctn-container-detect', name: '容器环境检测', cmd: `echo "=== cgroup ==="; head -n5 /proc/1/cgroup 2>/dev/null; echo "=== dockerenv ==="; ls -la /.dockerenv 2>/dev/null; echo "=== k8s ==="; ls /var/run/secrets/kubernetes.io 2>/dev/null; echo "=== hostname ==="; hostname; echo "=== overlay ==="; mount | grep overlay | head -n5`, desc: '判断当前是否在容器内' },
      { id: 'ctn-k8s-reverse-shell', name: 'K8s 反弹Shell Pod', cmd: `kubectl get pods -A -o json 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);[print(f'[CRITICAL] {p[\"metadata\"][\"namespace\"]}/{p[\"metadata\"][\"name\"]} -> {\" \".join(c.get(\"command\",[]))} {\" \".join(c.get(\"args\",[]))}') for p in d.get('items',[]) for c in p.get('spec',{}).get('containers',[]) if any(k in ' '.join(c.get('command',[])+c.get('args',[])) for k in ['/dev/tcp/','bash -i >&','nc -e','ncat '])]" 2>/dev/null || echo 'kubectl/python3 不可用'`, desc: '检测包含反弹Shell命令的Pod' },
      { id: 'ctn-k8s-cronjob-check', name: 'K8s CronJob 安全检查', cmd: `kubectl get cronjobs -A -o json 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);[print(f'{cj[\"metadata\"][\"namespace\"]}/{cj[\"metadata\"][\"name\"]} schedule={cj[\"spec\"][\"schedule\"]} cmd={\" \".join(c.get(\"command\",[])+c.get(\"args\",[]))}') for cj in d.get('items',[]) for c in cj.get('spec',{}).get('jobTemplate',{}).get('spec',{}).get('template',{}).get('spec',{}).get('containers',[])]" 2>/dev/null || echo 'kubectl/python3 不可用'`, desc: '列出所有CronJob及命令，排查恶意定时任务' },
      { id: 'ctn-k8s-sa-highrisk', name: 'K8s 高权限SA检测', cmd: `kubectl get clusterrolebindings -o json 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);[print(f'[{b[\"roleRef\"][\"name\"]}] SA={s[\"name\"]} NS={s.get(\"namespace\",\"cluster\")} via CRB={b[\"metadata\"][\"name\"]}') for b in d.get('items',[]) if b['roleRef']['name'] in ['cluster-admin','admin'] for s in b.get('subjects',[]) if s.get('kind')=='ServiceAccount' and not s.get('name','').startswith('system:')]" 2>/dev/null || echo 'kubectl/python3 不可用'`, desc: '检测绑定cluster-admin的非系统ServiceAccount' },
      { id: 'ctn-k8s-etcd-pods', name: 'K8s etcd Pod键检查', cmd: `echo "需要在控制面节点执行:"; echo "ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=<ca> --cert=<cert> --key=<key> get /registry/pods/ --prefix --keys-only"`, desc: '检查etcd中Pod键名是否被篡改（与metadata.name不匹配）' },
      { id: 'ctn-k8s-node-persistence', name: 'K8s节点持久化检查', cmd: `echo "=== 非标准服务 ==="; ${SERVICE_LIST_COMMAND} | grep -vE 'snap|systemd|network|docker|containerd|ssh|cron|rsyslog|apparmor|udev|dbus|accounts-daemon|getty|grub|polkit|irqbalance|fstrim|logrotate|lvm|multipathd|open-vm|blk-availability' | head -20; echo "=== 可疑二进制 ==="; find /usr/bin /usr/local/bin /usr/sbin -newer /etc/hostname -type f -executable 2>/dev/null | head -10; echo "=== 静态Pod清单 ==="; ls -la /etc/kubernetes/manifests/ 2>/dev/null; echo "=== crontab ==="; crontab -l 2>/dev/null || echo "无crontab"`, desc: '检查宿主机持久化：systemd服务、可疑二进制、静态Pod、crontab' },
    ],
  },
  {
    id: 'incident-triage',
    title: '应急快排',
    hint: '快速定位异常进程/端口/账号/取证',
    items: [
      { id: 'is-hot-proc', name: 'Top CPU/内存 25', cmd: `ps -eo pid,ppid,user,%cpu,%mem,etime,cmd --sort=-%cpu | head -n 25`, desc: '排查高负载或异常进程' },
      { id: 'is-susp-listen', name: 'LISTEN 非标准端口', cmd: `${LISTEN_PORTS_COMMAND} | awk 'NR==1 || ($5 !~ /:(22|80|443|3306|5432|6379)$/)'`, desc: '监听非常见端口的后门服务' },
      { id: 'is-recent-suid', name: '3天内新 SUID', outputType: 'files', cmd: `find / -xdev -type f -perm -4000 -mtime -3 2>/dev/null`, desc: '最近被赋予 SUID 的二进制' },
      { id: 'is-home-recent', name: '/home 7日内新目录', cmd: `find /home -mindepth 1 -maxdepth 1 -type d -mtime -7 -exec ls -ld {} \\; 2>/dev/null`, desc: '发现新增或可疑用户目录' },
      { id: 'is-failed-service', name: 'Failed Units/Services', cmd: `systemctl list-units --state=failed --no-pager 2>/dev/null || rc-status -a 2>/dev/null | grep -Ei 'crashed|stopped|failed' || echo 'failed service query not available'`, desc: '失败服务排查潜在破坏行为' },
      { id: 'is-reboots', name: '近期重启记录', cmd: `(last reboot -n 10 2>/dev/null; true) | { grep . || who -b 2>/dev/null || echo "上次启动时间: $(uptime -s 2>/dev/null || echo '未知')"; }`, desc: '定位异常重启时间线' },
    ],
  },
  {
    id: 'forensics',
    title: '取证采集',
    hint: 'CTF / 比赛常见取证 Artefacts',
    items: [
      { id: 'fx-bash-history', name: '普通用户 Shell 历史', cmd: `getent passwd | awk -F: '$3>=1000 && $3!=65534 {print $1}' | while read u; do home=$(eval echo ~$u); for f in "$home"/.bash_history "$home"/.zsh_history "$home"/.sh_history "$home"/.history; do if [ -s "$f" ]; then echo "===== $u ($f) ====="; tail -n 40 "$f" 2>/dev/null; echo; fi; done; done; true`, desc: '抽取普通账号最近的命令历史 (bash/zsh)' },
      { id: 'fx-root-history', name: 'root Shell 历史', cmd: `found=0; for f in /root/.bash_history /root/.zsh_history /root/.sh_history /root/.zhistory /root/.history; do if [ -s "$f" ]; then echo "=== $f ==="; tail -n 80 "$f" 2>/dev/null; found=1; fi; done; if [ $found -eq 0 ]; then echo "# 未在 /root 下找到非空的 Shell 历史记录文件（.bash_history / .zsh_history 等）"; fi`, desc: '快速查看管理员历史命令 (bash/zsh)' },
      { id: 'fx-tmp-recent', name: '/tmp 近期文件', cmd: `find /tmp /var/tmp -maxdepth 2 -type f -mtime -1 -size -5M -exec ls -lh {} \\; 2>/dev/null`, desc: '木马常驻的临时文件' },
      { id: 'is-new-users-7d', name: '7天内新建用户', cmd: `awk -F: '$3>=1000 && $3!=65534{print $1,$3}' /etc/passwd | while read u uid; do [ -d "/home/$u" ] && find "/home/$u" -maxdepth 0 -mtime -7 -exec echo "$u (UID=$uid) home changed recently" \\; 2>/dev/null; chage -l "$u" 2>/dev/null | grep "Last password change" | sed "s/^/$u: /"; done | head -n 30`, desc: '近期新增账号排查' },
      { id: 'is-passwd-shadow-diff', name: 'passwd/shadow 一致性', cmd: `echo "=== passwd 用户数 ==="; awk 'END{print NR}' /etc/passwd; echo "=== shadow 用户数 ==="; awk 'END{print NR}' /etc/shadow 2>/dev/null || echo "无法读取 shadow"; echo "=== 仅在 passwd 中的账号 ==="; (awk -F: 'NR==FNR{s[$1]=1; next} !($1 in s){print $1}' /etc/shadow 2>/dev/null /etc/passwd | head -n 20; true) | { grep . || echo "# passwd 与 shadow 账号完全一致"; }`, desc: 'passwd 与 shadow 不一致可能被篡改' },
      { id: 'is-open-fd', name: '异常打开文件描述符', cmd: `if command -v lsof >/dev/null 2>&1; then echo "句柄数(FD)  进程名称"; echo "----------------------------------------"; lsof -nP 2>/dev/null | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn | head -n 20 | awk '{printf "%-10s %s\\n", $1, $2}'; else echo "句柄数(FD)  进程名称(PID)"; echo "----------------------------------------"; ls -l /proc/[0-9]*/fd 2>/dev/null | awk -F/ '{print $3}' | sort | uniq -c | sort -rn | head -n 20 | while read cnt pid; do comm=$(cat /proc/$pid/comm 2>/dev/null || echo "unknown"); printf "%-10s %s(PID:%s)\\n" "$cnt" "$comm" "$pid"; done; fi`, desc: '排查文件描述符泄漏或恶意打开' },
      { id: 'is-proc-tree', name: '进程父子关系树', cmd: `ps -ef --forest 2>/dev/null | head -n 100 || pstree -pa 2>/dev/null | head -n 100`, desc: '进程树，发现异常父子关系' },
      { id: 'is-login-ips', name: '登录 IP 统计 Top20', cmd: `last -i -n 200 2>/dev/null | awk '$3 ~ /^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$/ {print $3}' | sort | uniq -c | sort -rn | head -n 20 || last -n 200 2>/dev/null | awk '{print $3}' | grep -E '^[0-9]+\\.' | sort | uniq -c | sort -rn | head -n 20 || grep "Accepted" /var/log/auth.log 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' | sort | uniq -c | sort -rn | head -n 20 || grep "Accepted" /var/log/secure 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' | sort | uniq -c | sort -rn | head -n 20`, desc: '登录来源 IP 频率统计' },
      { id: 'is-bruteforce-ips', name: '暴力破解 IP Top20', cmd: `grep "Failed password" /var/log/auth.log 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' | sort | uniq -c | sort -rn | head -n 20 || grep "Failed password" /var/log/secure 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' | sort | uniq -c | sort -rn | head -n 20`, desc: '暴力破解来源 IP 统计' },
      { id: 'is-disk-usage', name: '磁盘占用异常', cmd: `df -hT 2>/dev/null; echo "---"; du -sh /var/log /tmp /var/tmp /root /home 2>/dev/null | sort -rh`, desc: '磁盘空间和关键目录占用' },
      { id: 'is-network-connections-by-proc', name: '各进程网络连接数', cmd: `${ESTABLISHED_CONNECTIONS_COMMAND} | grep -E 'ESTAB|ESTABLISHED' | awk '{print $NF}' | sort | uniq -c | sort -rn | head -n 20`, desc: '哪些进程建立了最多连接' },
    ],
  },
  {
    id: 'privesc',
    title: '提权检测',
    hint: '提权线索枚举 · SUID/Capabilities/PATH/凭据',
    items: [
      { id: 'ctf-sudo-l', name: 'sudo -l 调查', cmd: `sudo -n -l 2>/dev/null || echo '需要交互式口令或无sudo权限'`, desc: '可无密码执行的命令' },
      { id: 'ctf-suid-interesting', name: 'SUID 可提权组件', cmd: `find / -xdev -perm -4000 -type f 2>/dev/null | xargs -r ls -la 2>/dev/null | egrep 'bash|sh|nmap|find|python|perl|ruby|vim|nano|less|more|cp|mv|tar|rsync' || true`, desc: '常见可滥用的 SUID 二进制' },
      { id: 'ctf-cap-interesting', name: 'Capabilities 提权', cmd: `command -v getcap >/dev/null 2>&1 && getcap -r / 2>/dev/null | egrep 'cap_setuid|cap_setgid|cap_dac_read_search' || echo 'getcap 未安装'`, desc: '可提权的 capabilities' },
      { id: 'ctf-path-writable', name: 'PATH 可写路径', cmd: `echo $PATH | tr ':' '\n' | while read d; do [ -w "$d" ] && echo "$d"; done 2>/dev/null`, desc: '路径投毒风险' },
      { id: 'ctf-cron-writable', name: '可写 cron 文件', cmd: `find /etc/cron* -type f -writable 2>/dev/null | head -n 200`, desc: '不安全的计划任务' },
      { id: 'ctf-secrets-home', name: '/home 敏感信息', cmd: `grep -R --exclude-dir=.git -iE 'password|passwd|secret|token|apikey|api_key' /home 2>/dev/null | head -n 200`, desc: '快速凭据枚举' },
    ],
  },
  {
    id: 'threat-detection',
    title: '威胁检测与入侵排查',
    hint: 'Rootkit、后门、恶意软件检测',
    items: [
      {
        id: 'threat-rootkit-check',
        name: 'Rootkit 基础检测',
        desc: '检测常见rootkit特征',
        cmd: 'echo "=== Checking /dev ==="; ls -la /dev | grep -E "(tcp|udp|raw)" | head -n 20; echo "=== Checking hidden processes ==="; ps aux | wc -l; ls /proc | grep -E "^[0-9]+$" | wc -l'
      },
      {
        id: 'threat-chkrootkit',
        name: 'chkrootkit 扫描',
        desc: '运行chkrootkit检测',
        cmd: 'which chkrootkit >/dev/null 2>&1 && chkrootkit -q 2>/dev/null | head -n 100 || echo "chkrootkit not installed"'
      },
      {
        id: 'threat-rkhunter',
        name: 'rkhunter 扫描',
        desc: '运行rkhunter检测',
        cmd: 'which rkhunter >/dev/null 2>&1 && rkhunter --check --skip-keypress --report-warnings-only 2>/dev/null | head -n 100 || echo "rkhunter not installed"'
      },
      {
        id: 'threat-reverse-shells',
        name: '反向Shell检测',
        desc: '检测可能的反向shell连接',
        cmd: `${ESTABLISHED_CONNECTIONS_COMMAND} | grep -E "ESTAB|ESTABLISHED|SYN_SENT|SYN-SENT" | grep -vE ":(80|443|22|3306|53)" | head -n 100`
      },
      {
        id: 'threat-webshell-scan',
        name: 'Webshell 特征扫描',
        desc: '扫描常见webshell特征',
        cmd: 'find /var/www /usr/share/nginx /opt -type f \\( -name "*.php" -o -name "*.jsp" -o -name "*.asp" \\) -exec grep -l -E "(eval|base64_decode|gzinflate|system|exec|shell_exec|passthru)" {} \\; 2>/dev/null | head -n 50'
      },
      {
        id: 'threat-suspicious-scripts',
        name: '可疑脚本检测',
        desc: '检测可疑的shell脚本',
        cmd: 'find /tmp /var/tmp /dev/shm -type f \\( -name "*.sh" -o -name "*.py" -o -name "*.pl" \\) 2>/dev/null | head -n 50'
      },
      {
        id: 'threat-malware-signatures',
        name: '恶意软件特征',
        desc: '检测常见恶意软件特征',
        cmd: 'ps aux | grep -E "(miner|xmrig|cryptonight|stratum)" | grep -v grep; echo "---"; find / -xdev \\( -name "*miner*" -o -name "*xmrig*" \\) 2>/dev/null | head -n 50'
      },
      {
        id: 'threat-suspicious-network',
        name: '可疑网络活动',
        desc: '检测异常网络连接',
        cmd: `${ESTABLISHED_CONNECTIONS_COMMAND} | awk '$1=="ESTAB" || $1=="ESTABLISHED" {print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -n 30`
      },
      {
        id: 'threat-dns-tunneling',
        name: 'DNS隧道检测',
        desc: '检测可能的DNS隧道',
        cmd: '(ss -anup 2>/dev/null || netstat -anup 2>/dev/null || netstat -anu 2>/dev/null || echo "ss/netstat not available") | grep ":53" | head -n 50; echo "---"; lsof -i :53 2>/dev/null | head -n 30 || echo "lsof not available"'
      },
      {
        id: 'threat-privilege-escalation',
        name: '提权风险检测',
        desc: '检测可能的提权向量',
        cmd: 'find / -xdev -perm -4000 -type f 2>/dev/null | head -n 100; echo "=== Writable /etc/passwd ==="; ls -l /etc/passwd /etc/shadow'
      },
      {
        id: 'threat-container-escape',
        name: '容器逃逸检测',
        desc: '检测容器环境和逃逸风险',
        cmd: 'cat /proc/1/cgroup 2>/dev/null | head -n 10; echo "---"; ls -la /.dockerenv 2>/dev/null; echo "---"; cat /proc/self/mountinfo 2>/dev/null | grep docker | head -n 10'
      },
      {
        id: 'threat-kernel-exploits',
        name: '内核漏洞检测',
        desc: '检查内核版本和已知漏洞',
        cmd: 'uname -a; echo "---"; cat /proc/version; echo "---"; dmesg | grep -i "exploit\\|vulnerability" | tail -n 20'
      },
      { id: 'threat-icmp-backdoor', name: 'ICMP 后门检测', cmd: `(ss -anp 2>/dev/null || netstat -anp 2>/dev/null || echo 'ss/netstat not available') | grep -i icmp | head -n 20; echo "---"; lsof -i 2>/dev/null | grep -i icmp | head -n 20 || echo "lsof not available"`, desc: 'ICMP 隧道/后门进程' },
      { id: 'threat-bind-shell', name: 'Bind Shell 检测', cmd: `${LISTEN_PORTS_COMMAND} | grep -E "0\\.0\\.0\\.0:(4444|5555|6666|7777|8888|9999|1234|31337|12345)" | head -n 20; echo "---"; lsof -i -P 2>/dev/null | grep -E "(LISTEN)" | grep -vE ":(22|80|443|3306|8080|8443)" | head -n 30 || echo "lsof not available"`, desc: '常见 bind shell 端口' },
      { id: 'threat-crypto-mining', name: '挖矿进程检测', cmd: `ps aux | grep -iE "(miner|xmrig|xmr-stak|cpuminer|cgminer|bfgminer|minerd|cryptonight|stratum)" | grep -v grep; echo "---"; find /tmp /var/tmp /dev/shm /opt \\( -name "*miner*" -o -name "*xmrig*" -o -name "*xmr*" \\) 2>/dev/null | head -n 30; echo "---"; top -bn1 | awk '$9>80{print}' | head -n 10`, desc: '挖矿特征进程和文件' },
      { id: 'threat-proc-injection', name: '进程注入检测', cmd: `find /proc/*/maps -exec grep -l "\\[vdso\\]" {} 2>/dev/null | head -n 5; echo "---"; grep -c "deleted" /proc/*/maps 2>/dev/null | awk -F: '$2>0{print}' | sort -t: -k2 -rn | head -n 20`, desc: '内存映射中的可疑删除文件' },
      { id: 'threat-ioc-ip-check', name: '外连 IP 地理分布', cmd: `${ESTABLISHED_CONNECTIONS_COMMAND} | grep -E 'ESTAB|ESTABLISHED' | awk '{print $5}' | cut -d: -f1 | grep -vE "^(127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.|::1|0\\.0\\.0\\.0)" | sort | uniq -c | sort -rn | head -n 30`, desc: '外部连接 IP 频率（排除内网）' },
      { id: 'threat-so-preload', name: '动态库劫持全检', cmd: `echo "=== /etc/ld.so.preload 检查 ==="; if [ -s /etc/ld.so.preload ]; then grep -v '^#' /etc/ld.so.preload 2>/dev/null || echo "# 文件存在但全为注释"; else echo "# 未发现预加载文件或文件内容为空 (正常)"; fi; echo ""; echo "=== LD_PRELOAD 环境变量 ==="; env | grep '^LD_PRELOAD=' 2>/dev/null || echo "# 未检测到 LD_PRELOAD 环境变量 (正常)"; echo ""; echo "=== /etc/ld.so.conf.d 动态库配置目录 ==="; ls -la /etc/ld.so.conf.d/ 2>/dev/null || echo "# 目录不存在"; echo ""; echo "=== 7天内修改的系统 .so 动态库 (Top 30) ==="; (find /lib /lib64 /usr/lib /usr/lib64 -name "*.so*" -mtime -7 2>/dev/null | head -n 30; true) | { grep . || echo "# 最近 7 天内无修改的 .so 动态库"; }`, desc: '全面检测 so 劫持' }
    ],
  },
  {
    id: 'persistence',
    title: '持久化 & Backdoor',
    hint: '持久化后门/定时任务排查',
    items: [
      { id: 'ps-systemd-timers', name: 'Timers / Scheduled Jobs', cmd: `systemctl list-timers --all --no-pager 2>/dev/null || ls -la /etc/periodic /var/spool/cron /var/spool/cron/crontabs 2>/dev/null || echo 'systemd timers not available'`, desc: '查看自定义定时任务或后门执行' },
      { id: 'ps-cron-susp', name: 'cron 恶意关键字', cmd: `grep -R -n -E '(wget|curl|bash|python|perl|nc|sh)' /etc/cron* 2>/dev/null | head -n 120`, desc: '匹配 cron 中的可疑命令' },
      { id: 'ps-ld-preload', name: '/etc/ld.so.preload', cmd: `if [ -f /etc/ld.so.preload ]; then (cat /etc/ld.so.preload 2>/dev/null | grep -v '^#' || echo "# /etc/ld.so.preload 存在但全为注释"); else echo "# /etc/ld.so.preload 文件不存在 (正常)"; fi`, desc: '排查动态库劫持后门' },
      { id: 'ps-systemd-fresh', name: '48h 内新 service', cmd: `find /etc/systemd/system -maxdepth 2 -type f -name '*.service' -mtime -2 -exec ls -l {} \\; 2>/dev/null`, desc: '发现最近被投放的 systemd 服务' },
      { id: 'ps-ssh-keys', name: 'authorized_keys 巡检', cmd: `grep -R -n '' /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys 2>/dev/null || echo "# 系统用户目录下均未检索到 authorized_keys 公钥"`, desc: '查找未授权的 SSH 公钥植入' },
      {
        id: 'ps-bashrc-profile',
        name: 'bashrc/profile 后门',
        desc: '检查bash/zsh配置文件中的后门',
        cmd: '(grep -nE "\\b(wget|curl|nc|netcat|ncat)\\b|/dev/tcp|mkfifo" /etc/profile /etc/profile.d/* /etc/bash.bashrc /etc/bashrc ~/.bashrc ~/.zshrc /home/*/.bashrc /home/*/.zshrc 2>/dev/null | grep -v ":\\s*#" | head -n 50; true) | { grep . || echo "# 未在 shell 启动配置文件中检测到可疑下载或反弹 Shell 命令"; }'
      },
      {
        id: 'ps-motd-backdoor',
        name: 'MOTD 后门检测',
        desc: '检查MOTD脚本',
        cmd: 'ls -la /etc/update-motd.d/ 2>/dev/null; echo "---"; cat /etc/motd 2>/dev/null | head -n 30'
      },
      {
        id: 'ps-pam-backdoor',
        name: 'PAM 后门检测',
        desc: '检查PAM配置',
        cmd: 'ls -la /etc/pam.d/ 2>/dev/null | head -n 50; echo "---"; grep -r "pam_" /etc/pam.d/ 2>/dev/null | grep -v "^#" | head -n 50'
      },
      {
        id: 'ps-kernel-modules',
        name: '可疑内核模块',
        desc: '检测可疑的内核模块',
        cmd: 'lsmod | head -n 50; echo "---"; find /lib/modules/$(uname -r) -type f -name "*.ko" -mtime -30 2>/dev/null | head -n 30'
      },
      {
        id: 'ps-init-scripts',
        name: 'init 脚本后门',
        desc: '检查init脚本',
        cmd: 'ls -la /etc/init.d/ 2>/dev/null | head -n 50; echo "---"; find /etc/init.d/ -type f -mtime -30 2>/dev/null'
      },
      {
        id: 'ps-xinetd-services',
        name: 'xinetd 服务检查',
        desc: '检查xinetd配置的服务',
        cmd: 'echo "=== /etc/xinetd.d 目录 ==="; ls -la /etc/xinetd.d/ 2>/dev/null || echo "# 目录不存在"; echo ""; echo "=== /etc/xinetd.conf ==="; (cat /etc/xinetd.conf 2>/dev/null | grep -v "^#" | grep -v "^$" || echo "# 未安装 xinetd 或无非注释配置")'
      },
      {
        id: 'ps-at-jobs',
        name: 'at 定时任务',
        desc: '检查at定时任务',
        cmd: 'atq 2>/dev/null; echo "---"; ls -la /var/spool/at/ 2>/dev/null | head -n 50'
      },
      { id: 'ps-rc-local', name: 'rc.local 后门', cmd: `echo "=== rc.local 配置排查 ==="; (cat /etc/rc.local /etc/rc.d/rc.local 2>/dev/null | grep -v "^#" | grep -v "^$" || echo "# 未启用 rc.local 或配置全为注释")`, desc: '排查 rc.local 启动后门' },
      { id: 'ps-prelib-hijack', name: '预加载库劫持', cmd: `echo "=== /etc/ld.so.preload ==="; cat /etc/ld.so.preload 2>/dev/null; echo "=== LD_PRELOAD ==="; grep -r "LD_PRELOAD" /etc/profile /etc/profile.d/ /etc/environment /etc/bash.bashrc /home/*/.bashrc 2>/dev/null | head -n 20; echo "=== 近7天新增.so ==="; find /usr/lib /usr/lib64 /lib /lib64 -name "*.so*" -mtime -7 2>/dev/null | head -n 20`, desc: '全面检测预加载劫持' },
      { id: 'ps-socket-backdoor', name: 'Unix Socket 后门', cmd: `(ss -xlp 2>/dev/null || netstat -xlp 2>/dev/null || echo 'ss/netstat not available') | head -n 50; echo "---"; find /tmp /var/tmp /dev/shm -type s 2>/dev/null | head -n 20`, desc: '隐蔽的 Unix Socket 通信' },
      { id: 'ps-alias-backdoor', name: 'alias 命令劫持', cmd: `alias 2>/dev/null; echo "---"; for f in /etc/profile /etc/bashrc /etc/bash.bashrc /root/.bashrc /root/.bash_profile /home/*/.bashrc /home/*/.bash_aliases; do [ -f "$f" ] && grep "alias " "$f" 2>/dev/null | grep -v "^#" && echo "--- $f ---"; done | head -n 50`, desc: '排查恶意 alias 覆盖' },
    ],
  },
  {
    id: 'web-security',
    title: 'Web 应用排查',
    hint: 'Webshell、Web 日志分析、中间件安全',
    items: [
      { id: 'web-shell-php', name: 'PHP Webshell', cmd: `find /var/www /usr/share/nginx /opt/www /srv/www -type f -name "*.php" -exec grep -lE "(eval|assert|base64_decode|gzinflate|gzuncompress|str_rot13|preg_replace.*e|system|exec|passthru|shell_exec|proc_open|popen|\\$_(?:GET|POST|REQUEST|COOKIE)\\s*\\[)" {} \\; 2>/dev/null | head -n 50`, desc: '扫描 PHP Webshell 特征' },
      { id: 'web-shell-jsp', name: 'JSP Webshell', cmd: `find / -type f -name "*.jsp" -o -name "*.jspx" 2>/dev/null | xargs grep -lE "(Runtime\\.getRuntime|ProcessBuilder|exec\\(|cmd|shell)" 2>/dev/null | head -n 30`, desc: '扫描 JSP Webshell' },
      { id: 'web-shell-asp', name: 'ASP Webshell', cmd: `find / -type f \\( -name "*.asp" -o -name "*.aspx" \\) 2>/dev/null | xargs grep -lE "(eval|execute|cmd|shell|wscript)" 2>/dev/null | head -n 30`, desc: '扫描 ASP/ASPX Webshell' },
      { id: 'web-new-files-24h', name: 'Web目录24h新文件', cmd: `find /var/www /usr/share/nginx /opt/www /srv -type f -mtime -1 2>/dev/null | head -n 80`, desc: '最近24小时 Web 目录变更' },
      { id: 'web-access-suspicious', name: 'Web 可疑请求 Top', cmd: `cat /var/log/nginx/access.log /var/log/apache2/access.log /var/log/httpd/access_log 2>/dev/null | grep -iE "(eval|exec|cmd=|/etc/passwd|union.*select|<script|/bin/sh|/bin/bash|wget|curl)" | tail -n 50`, desc: 'Web 日志中的攻击特征' },
      { id: 'web-4xx-5xx', name: 'Web 错误请求统计', cmd: `cat /var/log/nginx/access.log /var/log/apache2/access.log /var/log/httpd/access_log 2>/dev/null | awk '{print $9}' | grep -E "^[45]" | sort | uniq -c | sort -rn | head -n 20`, desc: '4xx/5xx 状态码分布' },
      { id: 'web-attack-ips', name: 'Web 攻击 IP Top20', cmd: `cat /var/log/nginx/access.log /var/log/apache2/access.log /var/log/httpd/access_log 2>/dev/null | grep -iE "(eval|exec|union|select|script|passwd|bash)" | awk '{print $1}' | sort | uniq -c | sort -rn | head -n 20`, desc: '攻击来源 IP 排行' },
      { id: 'web-upload-dirs', name: 'Web 上传目录检查', cmd: `find /var/www /usr/share/nginx /opt/www /srv -type d \\( -name "upload*" -o -name "uploads" -o -name "tmp" -o -name "temp" -o -name "cache" \\) -exec ls -la {} \\; 2>/dev/null | head -n 80`, desc: '检查上传目录中的可疑文件' },
      { id: 'web-nginx-config', name: 'Nginx 配置审计', cmd: `nginx -T 2>/dev/null | head -n 200 || cat /etc/nginx/nginx.conf 2>/dev/null | head -n 100`, desc: 'Nginx 完整配置检查' },
      { id: 'web-apache-config', name: 'Apache 配置审计', cmd: `apachectl -S 2>/dev/null | head -n 50; echo "---"; cat /etc/apache2/apache2.conf /etc/httpd/conf/httpd.conf 2>/dev/null | grep -vE "^(#|$)" | head -n 100`, desc: 'Apache 站点和配置检查' },
      { id: 'web-tomcat-check', name: 'Tomcat 安全检查', cmd: `find / -name "tomcat-users.xml" 2>/dev/null | xargs cat 2>/dev/null | head -n 30; echo "---"; find / -name "server.xml" -path "*/tomcat*" 2>/dev/null | xargs grep -E "(port|Connector)" 2>/dev/null | head -n 20`, desc: 'Tomcat 用户和端口配置' },
      { id: 'web-sensitive-files', name: 'Web 敏感文件泄露', cmd: `for p in /var/www /usr/share/nginx /opt/www /srv; do find "$p" -type f \\( -name ".env" -o -name "*.bak" -o -name "*.sql" -o -name "*.tar.gz" -o -name "*.zip" -o -name "config.php" -o -name "wp-config.php" -o -name "database.yml" \\) 2>/dev/null; done | head -n 50`, desc: '检查 Web 目录中的敏感/备份文件' },
    ],
  },
  {
    id: 'credential-harvest',
    title: '凭据与敏感信息',
    hint: '密码、密钥、Token、数据库凭据采集',
    items: [
      { id: 'cred-ssh-private-keys', name: 'SSH 私钥搜索', outputType: 'files', cmd: `find / -xdev \\( -name "id_rsa" -o -name "id_ed25519" -o -name "id_ecdsa" -o -name "id_dsa" -o -name "*.pem" -o -name "*.key" \\) 2>/dev/null | head -n 50`, desc: '全盘搜索 SSH 私钥' },
      { id: 'cred-passwords-in-files', name: '文件中的密码', cmd: `grep -rn --include="*.conf" --include="*.cfg" --include="*.ini" --include="*.env" --include="*.yml" --include="*.yaml" --include="*.xml" --include="*.properties" -iE "(password|passwd|pwd|secret|token|api_key|apikey)\\s*[=:]" /etc /opt /srv /var/www 2>/dev/null | grep -v "^Binary" | head -n 80`, desc: '配置文件中的硬编码凭据' },
      { id: 'cred-env-secrets', name: '环境变量敏感信息', cmd: `echo "=== 内存环境变量敏感项 ==="; (env | grep -v "^SUDO_COMMAND=" | grep -iE "(pass|secret|token|key|api|credential|auth)" 2>/dev/null | head -n 30; true) | { grep . || echo "# 系统环境变量中未包含敏感词"; }; echo ""; echo "=== /etc/environment 配置文件 ==="; (cat /etc/environment 2>/dev/null | grep -v "^#" | grep -iE "(pass|secret|token|key)" | head -n 20; true) | { grep . || echo "# /etc/environment 中未包含敏感字段"; }`, desc: '环境变量中的密码和密钥' },
      { id: 'cred-mysql-config', name: 'MySQL 凭据', cmd: `cat /etc/mysql/debian.cnf 2>/dev/null; echo "---"; cat /root/.my.cnf 2>/dev/null; echo "---"; grep -rn "password" /etc/mysql/ 2>/dev/null | head -n 20`, desc: 'MySQL 配置中的密码' },
      { id: 'cred-docker-secrets', name: 'Docker 敏感信息', cmd: `docker ps --format '{{.Names}}' 2>/dev/null | while read c; do echo "=== $c ==="; docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -iE "(pass|secret|token|key|api)" | head -n 5; done | head -n 80`, desc: '容器环境变量中的密码' },
      { id: 'cred-git-secrets', name: 'Git 仓库密钥', cmd: `find / -xdev -name ".git" -type d 2>/dev/null | while read d; do echo "=== $d ==="; git -C "$(dirname $d)" log --diff-filter=A --name-only --format="" 2>/dev/null | grep -iE "(password|secret|key|credential|token)" | head -n 5; done | head -n 50`, desc: 'Git 仓库中的敏感文件提交' },
      { id: 'cred-history-secrets', name: '历史命令敏感信息', cmd: `cat /root/.bash_history /root/.zsh_history /home/*/.bash_history /home/*/.zsh_history 2>/dev/null | grep -iE "(pass|mysql.*-p|curl.*token|wget.*auth|ssh.*-i|scp|rsync.*:)" | head -n 40 || echo "# 未在历史命令中检索到敏感信息"`, desc: '命令历史中泄露的密码和密钥' },
      { id: 'cred-cloud-tokens', name: '云平台凭据', cmd: `ls -la /root/.aws /root/.azure /root/.config/gcloud /home/*/.aws /home/*/.azure 2>/dev/null; echo "---"; cat /root/.aws/credentials 2>/dev/null | head -n 20; echo "---"; find / -xdev \\( -name "credentials" -o -name "cloud.cfg" \\) 2>/dev/null | head -n 20`, desc: 'AWS/Azure/GCP 凭据文件' },
      { id: 'cred-redis-config', name: 'Redis 配置密码', cmd: `echo "=== Redis 配置文件认证选项 ==="; (grep -iE "^\\s*#?\\s*(requirepass|masterauth)" /etc/redis/redis.conf /etc/redis.conf /etc/redis/*.conf 2>/dev/null || echo "# 配置文件中未显式设置密码项"); echo ""; echo "=== redis-cli 运行状态验证 ==="; redis-cli CONFIG GET requirepass 2>/dev/null || echo "# redis-cli 未安装或无法连通 Redis 实例"`, desc: 'Redis 认证配置' },
      { id: 'cred-ssl-certs', name: 'SSL 证书检查', cmd: `find /etc/ssl /etc/pki /etc/nginx/ssl /etc/letsencrypt -type f \\( -name "*.pem" -o -name "*.crt" -o -name "*.key" \\) -exec ls -la {} \\; 2>/dev/null | head -n 30; echo "---"; find /etc -name "*.key" -exec ls -la {} \\; 2>/dev/null | head -n 20`, desc: 'SSL 证书和私钥文件' },
    ],
  },
  {
    id: 'system-hardening',
    title: '系统加固检查',
    hint: '安全配置合规检测',
    items: [
      { id: 'hard-banner', name: '登录横幅检查', cmd: `cat /etc/issue /etc/issue.net /etc/motd 2>/dev/null | head -n 30`, desc: '登录前/后警告横幅' },
      { id: 'hard-grub-password', name: 'GRUB 密码保护', cmd: `grep -E "^password|^set superusers" /etc/grub.d/* /boot/grub/grub.cfg /boot/grub2/grub.cfg 2>/dev/null | head -n 10 || echo "未设置 GRUB 密码"`, desc: 'GRUB 引导密码配置' },
      { id: 'hard-usb-storage', name: 'USB 存储禁用', cmd: `lsmod | grep -i usb_storage; echo "---"; cat /etc/modprobe.d/*usb* 2>/dev/null; echo "---"; find /etc/modprobe.d -name "*.conf" -exec grep -l "usb-storage" {} \\; 2>/dev/null`, desc: 'USB 存储设备策略' },
      { id: 'hard-noexec-mount', name: 'noexec/nosuid 挂载', cmd: `mount | grep -vE "^(sysfs|proc|devtmpfs|securityfs|cgroup)" | head -n 30`, desc: '分区挂载选项检查' },
      { id: 'hard-aslr', name: 'ASLR 地址随机化', cmd: `cat /proc/sys/kernel/randomize_va_space; echo "---"; sysctl kernel.randomize_va_space 2>/dev/null`, desc: '2=完全随机化，1=部分，0=关闭' },
      { id: 'hard-nx-bit', name: 'NX/DEP 保护', cmd: `dmesg | grep -i "NX" | head -n 5; echo "---"; grep -c "nx" /proc/cpuinfo`, desc: 'CPU NX 位支持' },
      { id: 'hard-tcp-hardening', name: 'TCP/IP 安全参数', cmd: `sysctl net.ipv4.conf.all.accept_redirects net.ipv4.conf.all.send_redirects net.ipv4.conf.all.accept_source_route net.ipv4.conf.all.log_martians net.ipv4.tcp_syncookies net.ipv4.icmp_echo_ignore_broadcasts 2>/dev/null`, desc: 'TCP/IP 协议栈加固参数' },
      { id: 'hard-password-quality', name: '密码复杂度策略', cmd: `cat /etc/security/pwquality.conf 2>/dev/null | grep -v "^#" | grep -v "^$"; echo "---"; cat /etc/pam.d/common-password 2>/dev/null | grep -v "^#" | head -n 20 || cat /etc/pam.d/system-auth 2>/dev/null | grep -v "^#" | head -n 20`, desc: 'PAM 密码质量策略' },
      { id: 'hard-account-lockout', name: '账户锁定策略', cmd: `grep "pam_tally2\\|pam_faillock" /etc/pam.d/* 2>/dev/null | head -n 20; echo "---"; faillock 2>/dev/null | head -n 20`, desc: '登录失败锁定配置' },
      { id: 'hard-unused-services', name: '不必要服务检测', cmd: `${RUNNING_SERVICE_COMMAND} | grep -iE "(telnet|ftp|rsh|rlogin|rexec|talk|finger|tftp|xinetd|avahi|cups)" | head -n 20`, desc: '运行中的不安全/不必要服务' },
      { id: 'hard-world-readable-keys', name: '密钥权限检查', cmd: `find / -xdev \\( -name "*.key" -o -name "*.pem" -o -name "id_rsa" -o -name "id_ed25519" \\) 2>/dev/null | xargs ls -la 2>/dev/null | grep -v "^total" | awk '{if(substr($1,5,1)=="r" || substr($1,8,1)=="r") print "[WARN] " $0; else print "[OK] " $0}' | head -n 30`, desc: '私钥文件权限过大检测' },
    ],
  },
];
