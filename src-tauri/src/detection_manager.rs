/**
 * 蹇€熸娴嬬鐞嗗櫒 - Rust 鍚庣瀹炵幇
 * 鎻愪緵瀹夊叏妫€娴嬪拰鎬ц兘妫€娴嬪姛鑳? */

use serde::{Deserialize, Serialize};
use crate::ssh_manager_russh::SSHManagerRussh;

// 端口信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PortInfo {
    pub port: u16,
    pub service: Option<String>,
    pub state: String,
}

// 端口扫描结果
#[derive(Debug, Serialize, Deserialize)]
pub struct PortScanResult {
    pub open_ports: Vec<PortInfo>,
    pub total_scanned: usize,
}

// 用户信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserInfo {
    pub username: String,
    pub uid: u32,
    pub gid: u32,
    pub shell: String,
    pub home: String,
}

// 用户审计结果
#[derive(Debug, Serialize, Deserialize)]
pub struct UserAuditResult {
    pub root_users: Vec<UserInfo>,
    pub empty_password_users: Vec<String>,
    pub recent_users: Vec<UserInfo>,
}

// 鍚庨棬妫€娴嬬粨鏋?#[derive(Debug, Serialize, Deserialize)]
pub struct BackdoorScanResult {
    pub suspicious_cron: Vec<String>,
    pub suspicious_autostart: Vec<String>,
    pub suspicious_ssh_keys: Vec<String>,
}

// 进程信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub user: String,
    pub cpu: f32,
    pub mem: f32,
    pub command: String,
}

// 进程分析结果
#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessAnalysisResult {
    pub suspicious_processes: Vec<ProcessInfo>,
    pub high_resource_processes: Vec<ProcessInfo>,
}

// 鏂囦欢鏉冮檺妫€娴嬬粨鏋?#[derive(Debug, Serialize, Deserialize)]
pub struct FilePermissionResult {
    pub suid_files: Vec<String>,
    pub sensitive_file_issues: Vec<String>,
}

// SSH 审计结果
#[derive(Debug, Serialize, Deserialize)]
pub struct SSHAuditResult {
    pub permit_root_login: bool,
    pub password_authentication: bool,
    pub default_port: bool,
}

// 日志分析结果
#[derive(Debug, Serialize, Deserialize)]
pub struct LogAnalysisResult {
    pub brute_force_attempts: u32,
    pub brute_force_details: Vec<String>,
    pub abnormal_logins: Vec<String>,
}

// 闃茬伀澧欐鏌ョ粨鏋?#[derive(Debug, Serialize, Deserialize)]
pub struct FirewallCheckResult {
    pub firewall_active: bool,
    pub risky_rules: Vec<String>,
}

// CPU 娴嬭瘯缁撴灉
#[derive(Debug, Serialize, Deserialize)]
pub struct CpuTestResult {
    pub cores: u32,
    pub frequency: String,
    pub usage: f32,
}

// 内存测试结果
#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryTestResult {
    pub total: u64,
    pub available: u64,
    pub usage_percent: f32,
}

// 纾佺洏娴嬭瘯缁撴灉
#[derive(Debug, Serialize, Deserialize)]
pub struct DiskTestResult {
    pub read_speed: f64,
    pub write_speed: f64,
}

// 网络测试结果
#[derive(Debug, Serialize, Deserialize)]
pub struct NetworkTestResult {
    pub latency: f64,
    pub bandwidth: f64,
}

// ==================== 绔炶禌绾ф娴嬬粨鏋勪綋 ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct WebshellFinding {
    pub path: String,
    pub matched_pattern: String,
    pub file_size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WebshellScanResult {
    pub suspicious_files: Vec<WebshellFinding>,
    pub scanned_dirs: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RootkitScanResult {
    pub hidden_processes: Vec<String>,
    pub suspicious_modules: Vec<String>,
    pub ld_preload_hooks: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PersistenceScanResult {
    pub suspicious_cron: Vec<String>,
    pub bashrc_trojans: Vec<String>,
    pub systemd_trojans: Vec<String>,
    pub rc_local_entries: Vec<String>,
    pub at_jobs: Vec<String>,
    pub ld_preload_files: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LogTamperResult {
    pub truncated_logs: Vec<String>,
    pub deleted_open_logs: Vec<String>,
    pub timestamp_gaps: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NetworkBackdoorResult {
    pub suspicious_listeners: Vec<String>,
    pub c2_connections: Vec<String>,
    pub reverse_shell_indicators: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EnhancedUserResult {
    pub uid_conflicts: Vec<String>,
    pub shell_without_home: Vec<String>,
    pub sudo_anomalies: Vec<String>,
    pub suspicious_history: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SSHKeyAuditResult {
    pub unauthorized_keys: Vec<String>,
    pub weak_keys: Vec<String>,
    pub config_issues: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimestompResult {
    pub suspicious_files: Vec<String>,
}

/// 端口安全扫描
pub fn detect_port_scan(manager: &SSHManagerRussh) -> Result<PortScanResult, String> {
    // 执行端口扫描命令
    let cmd = r#"
        # 扫描常见端口
        netstat -tlnp 2>/dev/null | grep LISTEN || ss -tlnp 2>/dev/null | grep LISTEN
    "#;

    let output_result = manager.execute_command(cmd)
        .map_err(|e| format!("执行端口扫描命令失败: {}", e))?;

    let output = output_result.output;
    let mut open_ports = Vec::new();

    // 瑙ｆ瀽杈撳嚭
    for line in output.lines() {
        if line.contains("LISTEN") {
            // 鎻愬彇绔彛鍙?            if let Some(port_str) = extract_port_from_netstat(line) {
                if let Ok(port) = port_str.parse::<u16>() {
                    let service = identify_service(port);
                    open_ports.push(PortInfo {
                        port,
                        service: Some(service.to_string()),
                        state: "LISTEN".to_string(),
                    });
                }
            }
        }
    }

    // 鍘婚噸
    open_ports.sort_by_key(|p| p.port);
    open_ports.dedup_by_key(|p| p.port);

    Ok(PortScanResult {
        total_scanned: open_ports.len(),
        open_ports,
    })
}

/// 用户权限审计
pub fn detect_user_audit(manager: &SSHManagerRussh) -> Result<UserAuditResult, String> {
    // 获取用户列表
    let cmd = "cat /etc/passwd";
    let passwd_result = manager.execute_command(cmd)
        .map_err(|e| format!("璇诲彇 /etc/passwd 失败: {}", e))?;

    let passwd_output = passwd_result.output;
    let mut root_users = Vec::new();
    let mut recent_users = Vec::new();

    for line in passwd_output.lines() {
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() >= 7 {
            let username = parts[0].to_string();
            let uid = parts[2].parse::<u32>().unwrap_or(9999);
            let gid = parts[3].parse::<u32>().unwrap_or(9999);
            let home = parts[5].to_string();
            let shell = parts[6].to_string();

            let user_info = UserInfo {
                username,
                uid,
                gid,
                shell,
                home,
            };

            // UID 涓?0 的是 root 鐢ㄦ埛
            if uid == 0 {
                root_users.push(user_info.clone());
            }

            // 妫€鏌ユ渶杩戝垱寤虹殑鐢ㄦ埛锛堢畝鍖栫増锛?            if uid >= 1000 && uid < 60000 {
                recent_users.push(user_info);
            }
        }
    }

    // 妫€鏌ョ┖瀵嗙爜鐢ㄦ埛
    let shadow_cmd = "sudo cat /etc/shadow 2>/dev/null | grep -E '^[^:]+::' | cut -d: -f1";
    let empty_password_output = manager.execute_command(shadow_cmd)
        .map(|r| r.output)
        .unwrap_or_default();

    let empty_password_users: Vec<String> = empty_password_output
        .lines()
        .filter(|line| !line.is_empty())
        .map(|s| s.to_string())
        .collect();

    Ok(UserAuditResult {
        root_users,
        empty_password_users,
        recent_users: recent_users.into_iter().take(5).collect(),
    })
}

/// 鍚庨棬妫€娴?pub fn detect_backdoor(manager: &SSHManagerRussh) -> Result<BackdoorScanResult, String> {
    // 妫€鏌ュ彲鐤戠殑璁″垝浠诲姟
    let cron_cmd = r#"
        (crontab -l 2>/dev/null; sudo crontab -l 2>/dev/null; cat /etc/crontab 2>/dev/null) | \
        grep -v '^#' | grep -v '^$' | grep -E '(curl|wget|nc|bash|sh|python)'
    "#;
    let cron_output = manager.execute_command(cron_cmd)
        .map(|r| r.output)
        .unwrap_or_default();

    let suspicious_cron: Vec<String> = cron_output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|s| s.to_string())
        .collect();

    // 妫€鏌ュ彲鐤戠殑鍚姩椤?    let autostart_cmd = r#"
        find /etc/init.d /etc/systemd/system /etc/rc*.d -type f 2>/dev/null | \
        head -50
    "#;
    let autostart_output = manager.execute_command(autostart_cmd)
        .map(|r| r.output)
        .unwrap_or_default();

    let suspicious_autostart: Vec<String> = autostart_output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .take(10)
        .map(|s| s.to_string())
        .collect();

    // 妫€鏌?SSH authorized_keys
    let ssh_keys_cmd = r#"
        find /home /root -name authorized_keys 2>/dev/null | \
        xargs cat 2>/dev/null | grep -v '^#' | grep -v '^$' | wc -l
    "#;
    let keys_count_output = manager.execute_command(ssh_keys_cmd)
        .map(|r| r.output)
        .unwrap_or_default();

    let mut suspicious_ssh_keys = Vec::new();
    if let Ok(count) = keys_count_output.trim().parse::<usize>() {
        if count > 0 {
            let keys_cmd = r#"
                find /home /root -name authorized_keys 2>/dev/null | \
                xargs cat 2>/dev/null | grep -v '^#' | grep -v '^$' | head -5
            "#;
            let keys_output = manager.execute_command(keys_cmd)
                .map(|r| r.output)
                .unwrap_or_default();
            suspicious_ssh_keys = keys_output
                .lines()
                .filter(|line| !line.trim().is_empty())
                .map(|s| format!("{}...", &s[..s.len().min(60)]))
                .collect();
        }
    }

    Ok(BackdoorScanResult {
        suspicious_cron,
        suspicious_autostart,
        suspicious_ssh_keys,
    })
}

/// 进程分析
pub fn detect_process_analysis(manager: &SSHManagerRussh) -> Result<ProcessAnalysisResult, String> {
    // 获取进程列表
    let cmd = "ps aux | head -200";
    let output_result = manager.execute_command(cmd)
        .map_err(|e| format!("获取进程列表失败: {}", e))?;

    let output = output_result.output;
    let mut high_resource_processes = Vec::new();
    let mut suspicious_processes = Vec::new();

    for (i, line) in output.lines().skip(1).enumerate() {
        if i >= 20 { break; }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 11 {
            let user = parts[0].to_string();
            let pid = parts[1].parse::<u32>().unwrap_or(0);
            let cpu = parts[2].parse::<f32>().unwrap_or(0.0);
            let mem = parts[3].parse::<f32>().unwrap_or(0.0);
            let command = parts[10..].join(" ");
            let name = parts[10].to_string();

            let process = ProcessInfo {
                pid,
                name,
                user,
                cpu,
                mem,
                command: command.chars().take(500).collect(),
            };

            // 楂樿祫婧愬崰鐢ㄨ繘绋?            if cpu > 50.0 || mem > 50.0 {
                high_resource_processes.push(process.clone());
            }

            // 鍙枒杩涚▼妫€娴?            if command.contains("(deleted)")
                || command.starts_with("/tmp/")
                || command.starts_with("/dev/shm/")
                || command.starts_with("/var/tmp/")
                || command.contains("bash -i")
                || command.contains("/dev/tcp")
                || command.contains("/dev/udp") {
                suspicious_processes.push(process.clone());
            }
        }
    }

    Ok(ProcessAnalysisResult {
        suspicious_processes,
        high_resource_processes,
    })
}

/// 鏂囦欢鏉冮檺妫€娴?pub fn detect_file_permission(manager: &SSHManagerRussh) -> Result<FilePermissionResult, String> {
    // 鏌ユ壘 SUID 文件
    let suid_cmd = "find / -perm -4000 -type f 2>/dev/null | head -50";
    let suid_output = manager.execute_command(suid_cmd)
        .map(|r| r.output)
        .unwrap_or_default();

    let suid_files: Vec<String> = suid_output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|s| s.to_string())
        .collect();

    // 妫€鏌ユ晱鎰熸枃浠舵潈闄?    let sensitive_cmd = r#"
        ls -l /etc/passwd /etc/shadow /etc/sudoers 2>/dev/null
    "#;
    let sensitive_output = manager.execute_command(sensitive_cmd)
        .map(|r| r.output)
        .unwrap_or_default();

    let mut sensitive_file_issues = Vec::new();

    for line in sensitive_output.lines() {
        if line.contains("/etc/shadow") && !line.starts_with("----------") {
            sensitive_file_issues.push("/etc/shadow 鏉冮檺杩囧".to_string());
        }
        if line.contains("/etc/passwd") && line.chars().nth(8) == Some('w') {
            sensitive_file_issues.push("/etc/passwd 鍏佽缁勫啓鍏?.to_string());
        }
    }

    Ok(FilePermissionResult {
        suid_files,
        sensitive_file_issues,
    })
}

/// SSH 安全审计
pub fn detect_ssh_audit(manager: &SSHManagerRussh) -> Result<SSHAuditResult, String> {
    // 璇诲彇 SSH 配置
    let cmd = "cat /etc/ssh/sshd_config 2>/dev/null | grep -v '^#' | grep -v '^$'";
    let output = manager.execute_command(cmd)
        .map(|r| r.output)
        .unwrap_or_default();

    let mut permit_root_login = false;
    let mut password_authentication = true;
    let mut default_port = true;

    for line in output.lines() {
        let line = line.trim();
        if line.starts_with("PermitRootLogin") && line.contains("yes") {
            permit_root_login = true;
        }
        if line.starts_with("PasswordAuthentication") && line.contains("no") {
            password_authentication = false;
        }
        if line.starts_with("Port") && !line.contains("22") {
            default_port = false;
        }
    }

    Ok(SSHAuditResult {
        permit_root_login,
        password_authentication,
        default_port,
    })
}

/// 日志分析
pub fn detect_log_analysis(manager: &SSHManagerRussh) -> Result<LogAnalysisResult, String> {
    // 妫€鏌ユ毚鍔涚牬瑙ｅ皾璇?    let brute_force_cmd = r#"
        grep -i 'failed password' /var/log/auth.log /var/log/secure 2>/dev/null | wc -l
    "#;
    let brute_force_count_result = manager.execute_command(brute_force_cmd)
        .unwrap_or_else(|_| crate::ssh_manager_russh::TerminalOutput {
            command: brute_force_cmd.to_string(),
            output: "0".to_string(),
            exit_code: Some(0),
            timestamp: chrono::Utc::now(),
            duration_ms: 0,
            timed_out: false,
        });

    let brute_force_count = brute_force_count_result.output;
    let attempts = brute_force_count.trim().parse::<u32>().unwrap_or(0);

    // 鑾峰彇璇︽儏
    let details_cmd = r#"
        grep -i 'failed password' /var/log/auth.log /var/log/secure 2>/dev/null | tail -5
    "#;
    let details_output = manager.execute_command(details_cmd)
        .map(|r| r.output)
        .unwrap_or_default();

    let brute_force_details: Vec<String> = details_output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|s| s.to_string())
        .collect();

    // 妫€鏌ュ紓甯哥櫥褰?    let abnormal_cmd = r#"
        last -10 2>/dev/null | grep -v 'wtmp begins'
    "#;
    let abnormal_output = manager.execute_command(abnormal_cmd)
        .map(|r| r.output)
        .unwrap_or_default();

    let abnormal_logins: Vec<String> = abnormal_output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .take(5)
        .map(|s| s.to_string())
        .collect();

    Ok(LogAnalysisResult {
        brute_force_attempts: attempts,
        brute_force_details,
        abnormal_logins,
    })
}

/// 闃茬伀澧欐鏌?pub fn detect_firewall_check(manager: &SSHManagerRussh) -> Result<FirewallCheckResult, String> {
    // 妫€鏌ラ槻鐏鐘舵€?    let status_cmd = r#"
        systemctl is-active iptables firewalld ufw 2>/dev/null | grep -q 'active' && echo 'active' || echo 'inactive'
    "#;
    let status_output = manager.execute_command(status_cmd)
        .map(|r| r.output)
        .unwrap_or_else(|_| "inactive".to_string());

    let firewall_active = status_output.trim() == "active";

    // 鑾峰彇瑙勫垯
    let rules_cmd = r#"
        iptables -L -n 2>/dev/null | head -20 || firewall-cmd --list-all 2>/dev/null || ufw status 2>/dev/null
    "#;
    let rules_output = manager.execute_command(rules_cmd)
        .map(|r| r.output)
        .unwrap_or_default();

    let mut risky_rules = Vec::new();

    for line in rules_output.lines() {
        if line.contains("ACCEPT") && line.contains("0.0.0.0/0") {
            risky_rules.push(format!("鍏佽鎵€鏈塈P璁块棶: {}", line));
        }
    }

    Ok(FirewallCheckResult {
        firewall_active,
        risky_rules,
    })
}

/// CPU 娴嬭瘯
pub fn detect_cpu_test(manager: &SSHManagerRussh) -> Result<CpuTestResult, String> {
    // 鑾峰彇 CPU 信息
    let cmd = r#"
        echo "cores:$(nproc)"
        cat /proc/cpuinfo | grep 'cpu MHz' | head -1 | awk '{print $4}'
        top -bn1 | grep 'Cpu(s)' | awk '{print $2}'
    "#;
    let output_result = manager.execute_command(cmd)
        .map_err(|e| format!("鑾峰彇 CPU 信息失败: {}", e))?;

    let output = output_result.output;
    let lines: Vec<&str> = output.lines().collect();

    let cores = if let Some(line) = lines.get(0) {
        if let Some(num_str) = line.strip_prefix("cores:") {
            num_str.parse::<u32>().unwrap_or(1)
        } else {
            1
        }
    } else {
        1
    };

    let frequency = lines.get(1).unwrap_or(&"unknown").trim().to_string();
    let usage = lines.get(2).unwrap_or(&"0.0")
        .trim()
        .trim_end_matches("%us")
        .parse::<f32>()
        .unwrap_or(0.0);

    Ok(CpuTestResult {
        cores,
        frequency,
        usage,
    })
}

/// 内存测试
pub fn detect_memory_test(manager: &SSHManagerRussh) -> Result<MemoryTestResult, String> {
    // 获取内存信息
    let cmd = "free -m | grep Mem";
    let output_result = manager.execute_command(cmd)
        .map_err(|e| format!("获取内存信息失败: {}", e))?;

    let output = output_result.output;
    let parts: Vec<&str> = output.split_whitespace().collect();

    let total = parts.get(1)
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    let available = parts.get(6)
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    let usage_percent = if total > 0 {
        ((total - available) as f32 / total as f32) * 100.0
    } else {
        0.0
    };

    Ok(MemoryTestResult {
        total,
        available,
        usage_percent,
    })
}

/// 纾佺洏娴嬭瘯
pub fn detect_disk_test(manager: &SSHManagerRussh) -> Result<DiskTestResult, String> {
    // 绠€鍖栫増纾佺洏娴嬭瘯 - 使用 dd 命令
    let cmd = r#"
        dd if=/dev/zero of=/tmp/test_disk_speed bs=1M count=100 2>&1 | grep copied | awk '{print $(NF-1)}'
        rm -f /tmp/test_disk_speed
    "#;
    let output = manager.execute_command(cmd)
        .map(|r| r.output)
        .unwrap_or_else(|_| "50".to_string());

    let speed = output.trim().parse::<f64>().unwrap_or(50.0);

    Ok(DiskTestResult {
        read_speed: speed,
        write_speed: speed * 0.9, // 鍐欏叆閫熷害閫氬父鐣ヤ綆浜庤鍙?    })
}

/// 网络测试
pub fn detect_network_test(manager: &SSHManagerRussh) -> Result<NetworkTestResult, String> {
    // 娴嬭瘯寤惰繜
    let ping_cmd = "ping -c 3 8.8.8.8 2>/dev/null | grep 'avg' | awk -F'/' '{print $5}'";
    let ping_output = manager.execute_command(ping_cmd)
        .map(|r| r.output)
        .unwrap_or_else(|_| "10".to_string());

    let latency = ping_output.trim().parse::<f64>().unwrap_or(10.0);

    Ok(NetworkTestResult {
        latency,
        bandwidth: 100.0, // 绠€鍖栫増锛屽疄闄呴渶瑕佷娇鐢?iperf 绛夊伐鍏锋祴璇?    })
}

/// 杈呭姪鍑芥暟锛氫粠 netstat 输出提取端口
fn extract_port_from_netstat(line: &str) -> Option<String> {
    let parts: Vec<&str> = line.split_whitespace().collect();

    for part in parts {
        if part.contains(':') {
            let port_part: Vec<&str> = part.split(':').collect();
            if let Some(port_str) = port_part.last() {
                return Some(port_str.to_string());
            }
        }
    }

    None
}

/// 杈呭姪鍑芥暟锛氳瘑鍒湇鍔?fn identify_service(port: u16) -> &'static str {
    match port {
        22 => "SSH",
        80 => "HTTP",
        443 => "HTTPS",
        3306 => "MySQL",
        5432 => "PostgreSQL",
        6379 => "Redis",
        27017 => "MongoDB",
        9200 => "Elasticsearch",
        8080 => "HTTP-Alt",
        3000 => "Node.js",
        _ => "Unknown",
    }
}
// ========== 鏂板鍩虹嚎妫€娴嬫暟鎹粨鏋?==========

/// 閫氱敤妫€娴嬮棶棰?#[derive(Debug, Serialize, Deserialize)]
pub struct SecurityIssue {
    pub title: String,
    pub description: String,
    pub severity: String,
    pub recommendation: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

/// 閫氱敤妫€娴嬬粨鏋?#[derive(Debug, Serialize, Deserialize)]
pub struct GenericDetectionResult {
    pub issues: Vec<SecurityIssue>,
}

// ========== 鏂板鍩虹嚎妫€娴嬪嚱鏁?==========

/// 瀵嗙爜绛栫暐妫€鏌?pub fn detect_password_policy(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 妫€鏌?/etc/login.defs 中的密码策略
    let cmd = r#"grep -E "^PASS_MAX_DAYS|^PASS_MIN_DAYS|^PASS_MIN_LEN|^PASS_WARN_AGE" /etc/login.defs 2>/dev/null || echo "NOT_FOUND""#;
    let output_result = manager.execute_command(cmd)?;
    let output = output_result.output.trim();

    if output.contains("NOT_FOUND") || output.is_empty() {
        issues.push(SecurityIssue {
            title: "瀵嗙爜绛栫暐鏂囦欢鏈壘鍒?.to_string(),
            description: "绯荤粺鏈厤缃瘑鐮佺瓥鐣ユ枃浠?/etc/login.defs".to_string(),
            severity: "medium".to_string(),
            recommendation: "閰嶇疆瀵嗙爜绛栫暐锛岀‘淇濆瘑鐮佸畨鍏ㄦ€?.to_string(),
            details: None,
        });
    } else {
        // 妫€鏌ュ瘑鐮佹渶澶т娇鐢ㄥぉ鏁?        if !output.contains("PASS_MAX_DAYS") {
            issues.push(SecurityIssue {
                title: "鏈缃瘑鐮佹渶澶т娇鐢ㄥぉ鏁?.to_string(),
                description: "鏈厤缃瘑鐮佽繃鏈熺瓥鐣?.to_string(),
                severity: "medium".to_string(),
                recommendation: "设置 PASS_MAX_DAYS 涓?90 澶╂垨鏇村皯".to_string(),
                details: None,
            });
        }
    }

    Ok(GenericDetectionResult { issues })
}

/// Sudo 配置审计
pub fn detect_sudo_config(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 妫€鏌?sudoers 文件中的 NOPASSWD 配置
    let cmd = r#"sudo grep -r "NOPASSWD" /etc/sudoers /etc/sudoers.d/ 2>/dev/null || echo "NO_NOPASSWD""#;
    let output_result = manager.execute_command(cmd)?;
    let output = output_result.output.trim();

    if !output.contains("NO_NOPASSWD") && output.contains("NOPASSWD") {
        issues.push(SecurityIssue {
            title: "鍙戠幇鏃犲瘑鐮?sudo 配置".to_string(),
            description: format!("瀛樺湪 NOPASSWD 閰嶇疆锛屽彲鑳藉瓨鍦ㄦ潈闄愭彁鍗囬闄? {}", output.lines().take(3).collect::<Vec<_>>().join("; ")),
            severity: "high".to_string(),
            recommendation: "绉婚櫎 NOPASSWD 閰嶇疆锛岃姹傛墍鏈?sudo 鎿嶄綔閮介渶瑕佸瘑鐮侀獙璇?.to_string(),
            details: Some(output.to_string()),
        });
    }

    Ok(GenericDetectionResult { issues })
}

/// PAM 閰嶇疆妫€鏌?pub fn detect_pam_config(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 妫€鏌?PAM 瀵嗙爜澶嶆潅搴︽ā鍧?    let cmd = r#"grep -r "pam_pwquality\|pam_cracklib" /etc/pam.d/ 2>/dev/null || echo "NOT_CONFIGURED""#;
    let output_result = manager.execute_command(cmd)?;
    let output = output_result.output.trim();

    if output.contains("NOT_CONFIGURED") {
        issues.push(SecurityIssue {
            title: "鏈厤缃瘑鐮佸鏉傚害妫€鏌?.to_string(),
            description: "PAM 未配置密码复杂度模块（pam_pwquality 鎴?pam_cracklib锛?.to_string(),
            severity: "medium".to_string(),
            recommendation: "配置 pam_pwquality 模块以强制密码复杂度要求".to_string(),
            details: None,
        });
    }

    Ok(GenericDetectionResult { issues })
}

/// 璐﹀彿閿佸畾绛栫暐妫€鏌?pub fn detect_account_lockout(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 妫€鏌?PAM 账号锁定模块
    let cmd = r#"grep "pam_faillock\|pam_tally" /etc/pam.d/system-auth /etc/pam.d/password-auth /etc/pam.d/common-auth 2>/dev/null || echo "NOT_CONFIGURED""#;
    let output_result = manager.execute_command(cmd)?;
    let output = output_result.output.trim();

    if output.contains("NOT_CONFIGURED") {
        issues.push(SecurityIssue {
            title: "鏈厤缃处鍙烽攣瀹氱瓥鐣?.to_string(),
            description: "绯荤粺鏈厤缃櫥褰曞け璐ラ攣瀹氭満鍒?.to_string(),
            severity: "high".to_string(),
            recommendation: "配置 pam_faillock 妯″潡锛屽湪澶氭鐧诲綍澶辫触鍚庨攣瀹氳处鍙?.to_string(),
            details: None,
        });
    }

    Ok(GenericDetectionResult { issues })
}

/// SELinux/AppArmor 鐘舵€佹鏌?pub fn detect_selinux_status(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 妫€鏌?SELinux 鐘舵€?    let selinux_cmd = "getenforce 2>/dev/null || echo 'NOT_INSTALLED'";
    let selinux_result = manager.execute_command(selinux_cmd)?;
    let selinux_status = selinux_result.output.trim();

    // 妫€鏌?AppArmor 鐘舵€?    let apparmor_cmd = "aa-status 2>/dev/null || echo 'NOT_INSTALLED'";
    let apparmor_result = manager.execute_command(apparmor_cmd)?;
    let apparmor_status = apparmor_result.output.trim();

    if selinux_status.contains("NOT_INSTALLED") && apparmor_status.contains("NOT_INSTALLED") {
        issues.push(SecurityIssue {
            title: "鏈惎鐢ㄥ己鍒惰闂帶鍒?.to_string(),
            description: "系统未安装或启用 SELinux 鎴?AppArmor".to_string(),
            severity: "medium".to_string(),
            recommendation: "启用 SELinux 鎴?AppArmor 浠ュ寮虹郴缁熷畨鍏ㄦ€?.to_string(),
            details: None,
        });
    } else if selinux_status.contains("Permissive") {
        issues.push(SecurityIssue {
            title: "SELinux 澶勪簬瀹藉妯″紡".to_string(),
            description: "SELinux 宸插畨瑁呬絾澶勪簬 Permissive 模式，未强制执行安全策略".to_string(),
            severity: "low".to_string(),
            recommendation: "灏?SELinux 璁剧疆涓?Enforcing 妯″紡".to_string(),
            details: None,
        });
    }

    Ok(GenericDetectionResult { issues })
}

/// 鍐呮牳鍙傛暟妫€鏌?pub fn detect_kernel_params(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 妫€鏌ュ叧閿殑瀹夊叏鍐呮牳鍙傛暟
    let params_to_check = vec![
        ("net.ipv4.conf.all.accept_source_route", "0", "IP 婧愯矾鐢?),
        ("net.ipv4.conf.all.accept_redirects", "0", "ICMP 閲嶅畾鍚?),
        ("net.ipv4.icmp_echo_ignore_broadcasts", "1", "ICMP 骞挎挱"),
        ("net.ipv4.tcp_syncookies", "1", "SYN Cookies"),
    ];

    for (param, expected, desc) in params_to_check {
        let cmd = format!("sysctl {} 2>/dev/null || echo 'NOT_SET'", param);
        let result = manager.execute_command(&cmd)?;
        let output = result.output.trim();

        if output.contains("NOT_SET") || !output.contains(&format!("= {}", expected)) {
            issues.push(SecurityIssue {
                title: format!("{} 鍙傛暟鏈纭厤缃?, desc),
                description: format!("内核参数 {} 鏈缃负鎺ㄨ崘鍊?{}", param, expected),
                severity: "low".to_string(),
                recommendation: format!("鍦?/etc/sysctl.conf 涓缃?{} = {}", param, expected),
                details: Some(output.to_string()),
            });
        }
    }

    Ok(GenericDetectionResult { issues })
}

/// 绯荤粺琛ヤ竵鐘舵€佹鏌?pub fn detect_system_updates(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 妫€鏌ュ彲鐢ㄦ洿鏂帮紙鏍规嵁涓嶅悓鍙戣鐗堬級
    let check_cmd = r#"
        if command -v yum >/dev/null 2>&1; then
            yum check-update 2>/dev/null | grep -v "^$" | tail -n +2 | wc -l
        elif command -v apt >/dev/null 2>&1; then
            apt list --upgradable 2>/dev/null | grep -c "upgradable"
        else
            echo "0"
        fi
    "#;

    let result = manager.execute_command(check_cmd)?;
    let count: usize = result.output.trim().parse().unwrap_or(0);

    if count > 0 {
        let severity = if count > 50 { "high" } else if count > 20 { "medium" } else { "low" };
        issues.push(SecurityIssue {
            title: "瀛樺湪鍙敤鐨勭郴缁熸洿鏂?.to_string(),
            description: format!("绯荤粺鏈?{} 个可用更新包", count),
            severity: severity.to_string(),
            recommendation: "寤鸿鍙婃椂鏇存柊绯荤粺琛ヤ竵浠ヤ慨澶嶅凡鐭ユ紡娲?.to_string(),
            details: Some(format!("{} 涓洿鏂板寘寰呭畨瑁?, count)),
        });
    }

    Ok(GenericDetectionResult { issues })
}

/// 涓嶅繀瑕佹湇鍔℃鏌?pub fn detect_unnecessary_services(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 瀹氫箟甯歌鐨勪笉蹇呰鏈嶅姟
    let unnecessary_services = vec!["telnet", "ftp", "rsh", "rlogin", "vsftpd", "tftp"];

    let cmd = "systemctl list-units --type=service --state=running --no-pager 2>/dev/null | awk '{print $1}' || service --status-all 2>/dev/null";
    let result = manager.execute_command(cmd)?;
    let running_services = result.output.to_lowercase();

    for service in unnecessary_services {
        if running_services.contains(service) {
            issues.push(SecurityIssue {
                title: format!("检测到不安全的服务: {}", service),
                description: format!("鏈嶅姟 {} 姝ｅ湪杩愯锛岃繖鏄竴涓凡鐭ョ殑涓嶅畨鍏ㄦ湇鍔?, service),
                severity: "high".to_string(),
                recommendation: format!("鍋滄骞剁鐢?{} 鏈嶅姟锛屼娇鐢ㄦ洿瀹夊叏鐨勬浛浠ｆ柟妗堬紙濡?SSH 浠ｆ浛 telnet锛?, service),
                details: None,
            });
        }
    }

    Ok(GenericDetectionResult { issues })
}

/// 鑷惎鍔ㄦ湇鍔″璁?pub fn detect_auto_start_services(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 鑾峰彇鎵€鏈夊惎鐢ㄧ殑鏈嶅姟
    let cmd = "systemctl list-unit-files --type=service --state=enabled --no-pager 2>/dev/null | wc -l || echo '0'";
    let result = manager.execute_command(cmd)?;
    let count: usize = result.output.trim().parse().unwrap_or(0);

    if count > 30 {
        issues.push(SecurityIssue {
            title: "鑷惎鍔ㄦ湇鍔¤繃澶?.to_string(),
            description: format!("绯荤粺閰嶇疆浜?{} 个自启动服务，可能增加攻击面", count),
            severity: "low".to_string(),
            recommendation: "审查并禁用不必要的自启动服务".to_string(),
            details: Some(format!("{} 个自启动服务", count)),
        });
    }

    Ok(GenericDetectionResult { issues })
}

/// 瀹¤閰嶇疆妫€鏌?pub fn detect_audit_config(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 妫€鏌?auditd 鏈嶅姟鐘舵€?    let cmd = "systemctl is-active auditd 2>/dev/null || service auditd status 2>/dev/null || echo 'NOT_RUNNING'";
    let result = manager.execute_command(cmd)?;
    let status = result.output.trim();

    if status.contains("NOT_RUNNING") || status.contains("inactive") {
        issues.push(SecurityIssue {
            title: "瀹¤鏈嶅姟鏈繍琛?.to_string(),
            description: "auditd 审计服务未启动，无法记录系统安全事件".to_string(),
            severity: "medium".to_string(),
            recommendation: "鍚姩骞跺惎鐢?auditd 鏈嶅姟浠ヨ褰曠郴缁熷畨鍏ㄤ簨浠?.to_string(),
            details: None,
        });
    }

    Ok(GenericDetectionResult { issues })
}

/// 历史命令审计
pub fn detect_history_audit(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 妫€鏌ュ彲鐤戠殑鍘嗗彶鍛戒护
    let suspicious_patterns = vec!["wget http", "curl http", "nc -", "bash -i", "/dev/tcp", "base64 -d"];
    let cmd = "cat ~/.bash_history 2>/dev/null | tail -100";
    let result = manager.execute_command(cmd)?;
    let history = result.output.to_lowercase();

    for pattern in suspicious_patterns {
        if history.contains(&pattern.to_lowercase()) {
            issues.push(SecurityIssue {
                title: "发现可疑历史命令".to_string(),
                description: format!("鍘嗗彶鍛戒护涓寘鍚彲鐤戞ā寮? {}", pattern),
                severity: "medium".to_string(),
                recommendation: "瀹℃煡鐩稿叧鍛戒护鐨勬墽琛岀洰鐨勫拰涓婁笅鏂?.to_string(),
                details: Some(pattern.to_string()),
            });
            break; // 鍙姤鍛婁竴娆?        }
    }

    Ok(GenericDetectionResult { issues })
}

/// NTP 閰嶇疆妫€鏌?pub fn detect_ntp_config(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 妫€鏌ユ椂闂村悓姝ユ湇鍔?    let cmd = "systemctl is-active chronyd ntpd systemd-timesyncd 2>/dev/null || echo 'NONE_ACTIVE'";
    let result = manager.execute_command(cmd)?;
    let output = result.output;

    let has_active_ntp = output.lines().any(|line| line.trim() == "active");

    if !has_active_ntp {
        issues.push(SecurityIssue {
            title: "鏃堕棿鍚屾鏈嶅姟鏈繍琛?.to_string(),
            description: "系统未配置或启动时间同步服务（NTP/Chrony锛?.to_string(),
            severity: "medium".to_string(),
            recommendation: "閰嶇疆骞跺惎鍔?chronyd 鎴?ntpd 鏈嶅姟浠ョ‘淇濈郴缁熸椂闂村噯纭?.to_string(),
            details: None,
        });
    }

    Ok(GenericDetectionResult { issues })
}

/// DNS 閰嶇疆妫€鏌?pub fn detect_dns_config(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 妫€鏌?DNS 配置
    let cmd = "cat /etc/resolv.conf 2>/dev/null | grep -v '^#' | grep nameserver || echo 'NO_DNS'";
    let result = manager.execute_command(cmd)?;
    let output = result.output.trim();

    if output.contains("NO_DNS") || output.is_empty() {
        issues.push(SecurityIssue {
            title: "DNS 鏈厤缃?.to_string(),
            description: "绯荤粺鏈厤缃?DNS 鏈嶅姟鍣?.to_string(),
            severity: "high".to_string(),
            recommendation: "閰嶇疆鍙潬鐨?DNS 鏈嶅姟鍣紙濡?8.8.8.8, 1.1.1.1锛?.to_string(),
            details: None,
        });
    } else {
        // 妫€鏌ユ槸鍚︿娇鐢ㄥ叕鍏?DNS
        if !output.contains("8.8.8.8") && !output.contains("1.1.1.1") && !output.contains("114.114.114.114") {
            issues.push(SecurityIssue {
                title: "浣跨敤闈炲叕鍏?DNS 鏈嶅姟鍣?.to_string(),
                description: format!("褰撳墠 DNS 配置: {}", output),
                severity: "info".to_string(),
                recommendation: "纭 DNS 鏈嶅姟鍣ㄧ殑鍙潬鎬у拰瀹夊叏鎬?.to_string(),
                details: Some(output.to_string()),
            });
        }
    }

    Ok(GenericDetectionResult { issues })
}

/// 内存马排查
pub fn detect_memshell(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    // 1. 检查运行中的 Java 进程
    let java_cmd = "ps -ef | grep java | grep -v grep || echo 'NO_JAVA'";
    let java_result = manager.execute_command(java_cmd)?;
    let java_output = java_result.output.trim();

    if java_output.contains("NO_JAVA") || java_output.is_empty() {
        return Ok(GenericDetectionResult { issues });
    }

    // 2. 检查 Java 进程启动参数中的 Java Agent
    let mut has_java_agent = false;
    let mut suspicious_agents = Vec::new();
    for line in java_output.lines() {
        if line.contains("-javaagent:") {
            has_java_agent = true;
            if let Some(idx) = line.find("-javaagent:") {
                let agent_part = &line[idx..];
                let agent_path = agent_part.split_whitespace().next().unwrap_or("");
                suspicious_agents.push(agent_path.to_string());
            }
        }
    }

    if has_java_agent {
        issues.push(SecurityIssue {
            title: "检测到 Java Agent 挂载".to_string(),
            description: format!("发现 Java 进程挂载了代理: {:?}", suspicious_agents),
            severity: "medium".to_string(),
            recommendation: "确认该 Java Agent 是否为授权的安全监控（如 RASP）或 APM 工具，防范恶意 Java Agent 内存马פ留。".to_string(),
            details: Some(java_output.to_string()),
        });
    }

    // 3. 检查 JVM 进程的文件句柄，查找已ɾ除的可疑 JAR/Class 文件 (FD泄露检测)
    let fd_cmd = "find /proc/*/fd/ -type l 2>/dev/null | xargs ls -l 2>/dev/null | grep -E '\\.jar|\\.class' | grep 'deleted' || echo 'CLEAN'";
    let fd_result = manager.execute_command(fd_cmd)?;
    let fd_output = fd_result.output.trim();

    if !fd_output.contains("CLEAN") && !fd_output.is_empty() {
        issues.push(SecurityIssue {
            title: "检测到 JVM 进程ռ用已ɾ除的 JAR/Class 文件".to_string(),
            description: "发现有 Java 进程的文件句柄ָ向已ɾ除的 jar 或 class 文件，这是不落地内存马的典型特征。".to_string(),
            severity: "high".to_string(),
            recommendation: "使用 lsof -p <PID> 详细排查该进程，检查其加载的类，必要时在隔离环境下 Dump JVM 内存进行分析。".to_string(),
            details: Some(fd_output.to_string()),
        });
    }

    // 4. 扫描 Web Ŀ¼下最近修改且包含敏感关键字的 JSP/JSPX 文件 (注入器/后门检测)
    let scan_dirs = ["/var/www", "/usr/local/tomcat/webapps", "/opt", "/tmp"];
    let mut jsp_findings = Vec::new();
    for dir in &scan_dirs {
        let dir_exists_cmd = format!("test -d {} && echo 'YES' || echo 'NO'", dir);
        let dir_exists = manager.execute_command(&dir_exists_cmd)?.output.trim().to_string();
        if dir_exists == "YES" {
            let grep_jsp_cmd = format!(
                "find {} -type f -name '*.jsp' -o -name '*.jspx' 2>/dev/null | xargs grep -l -E 'defineClass|ClassLoader|base64|Cipher|AES|exec|getRuntime' 2>/dev/null | head -10 || echo 'NONE'",
                dir
            );
            let grep_result = manager.execute_command(&grep_jsp_cmd)?;
            let grep_output = grep_result.output.trim();
            if grep_output != "NONE" && !grep_output.is_empty() {
                for file in grep_output.lines() {
                    jsp_findings.push(file.to_string());
                }
            }
        }
    }

    if !jsp_findings.is_empty() {
        issues.push(SecurityIssue {
            title: "发现可疑内存马ע入器脚本".to_string(),
            description: format!("在 Web 目录下发现包含敏感执行/反射关键字的 JSP/JSPX 脚本: {:?}", jsp_findings),
            severity: "critical".to_string(),
            recommendation: "立即隔离相关文件，检查其内容是否为 WebShell 或内存马注入器（如哥斯拉、冰蝎等工具）。".to_string(),
            details: Some(jsp_findings.join("\n")),
        });
    }

    // 5. 检查 Tomcat/Nginx 访问日志中异常的静态资源 POST 流量 (流量行为异常)
    let log_dirs = ["/var/log/nginx", "/usr/local/tomcat/logs", "/var/log/tomcat*"];
    let mut log_issues = Vec::new();
    for dir in &log_dirs {
        let log_exists_cmd = format!("find {} -name '*access*.log' 2>/dev/null | head -3 || echo 'NONE'", dir);
        let logs = manager.execute_command(&log_exists_cmd)?.output.trim().to_string();
        if logs != "NONE" && !logs.is_empty() {
            for log_file in logs.lines() {
                let log_scan_cmd = format!(
                    "grep -E 'POST .+\\.(ico|css|js|png|jpg|html) HTTP' {} 2>/dev/null | head -5 || echo 'NONE'",
                    log_file
                );
                let log_scan_result = manager.execute_command(&log_scan_cmd)?;
                let log_scan_output = log_scan_result.output.trim();
                if log_scan_output != "NONE" && !log_scan_output.is_empty() {
                    log_issues.push(format!("日志文件 {}:\n{}", log_file, log_scan_output));
                }
            }
        }
    }

    if !log_issues.is_empty() {
        issues.push(SecurityIssue {
            title: "访问日志中存在异常静态资源 POST 请求".to_string(),
            description: "在 web 访问日志中发现有 POST 请求发送至静态资源（如 favicon.ico、html、js 等），可能存在内存马ͨ信行Ϊ。".to_string(),
            severity: "high".to_string(),
            recommendation: "核实这些 POST 请求的源 IP 和请求体。如果不是合法的服务接口，˵明该资Դ可能已被篡改或绑定了 Filter/Servlet 内存马。".to_string(),
            details: Some(log_issues.join("\n\n")),
        });
    }

    Ok(GenericDetectionResult { issues })
}

// ==================== 绔炶禌绾ф娴嬪嚱鏁?====================

/// Webshell 扫描
pub fn detect_webshell(manager: &SSHManagerRussh) -> Result<WebshellScanResult, String> {
    let dirs = ["/var/www", "/usr/share/nginx/html", "/opt/lampp/htdocs", "/srv/www"];
    let scan_dirs: Vec<String> = dirs.iter().map(|d| d.to_string()).collect();

    let cmd = r#"find /var/www /usr/share/nginx/html /opt/lampp/htdocs /srv/www -type f \( -name "*.php" -o -name "*.jsp" -o -name "*.asp" -o -name "*.aspx" -o -name "*.cgi" \) -exec grep -l -E '(eval\s*\(|base64_decode|system\s*\(|passthru|shell_exec|assert\s*\(|\$_POST\[|gzinflate|str_rot13)' {} \; 2>/dev/null | head -50"#;

    let output = match manager.execute_command(cmd) {
        Ok(r) => r.output,
        Err(_) => String::new(),
    };

    let suspicious_files: Vec<WebshellFinding> = output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|path| WebshellFinding {
            path: path.trim().to_string(),
            matched_pattern: "eval/system/passthru/base64_decode".to_string(),
            file_size: 0,
        })
        .collect();

    Ok(WebshellScanResult { suspicious_files, scanned_dirs: scan_dirs })
}

/// Rootkit 妫€娴?pub fn detect_rootkit(manager: &SSHManagerRussh) -> Result<RootkitScanResult, String> {
    // 1. 闅愯棌杩涚▼妫€娴? ps 鍒楀嚭鐨?PID vs /proc 涓嬬殑 PID
    let cmd_hidden = r#"diff <(ps -eo pid --no-headers | sort -n) <(ls -1 /proc | grep -E '^[0-9]+$' | sort -n) 2>/dev/null | grep '>' | awk '{print $2}'"#;
    let hidden_output = manager.execute_command(&format!("bash -c '{}'", cmd_hidden.replace('\'', "'\\''")))
        .map(|r| r.output).unwrap_or_default();
    let hidden_processes: Vec<String> = hidden_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| format!("隐藏进程 PID: {}", l.trim()))
        .collect();

    // 2. 可疑内核模块
    let cmd_modules = "lsmod 2>/dev/null | awk 'NR>1 && $3==0 {print $1}' | head -50";
    let mod_output = manager.execute_command(cmd_modules).map(|r| r.output).unwrap_or_default();
    let suspicious_modules: Vec<String> = mod_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| format!("鏈寮曠敤鐨勫唴鏍告ā鍧? {}", l.trim()))
        .collect();

    // 3. LD_PRELOAD 妫€娴?    let cmd_preload = "cat /etc/ld.so.preload 2>/dev/null; echo '---'; env | grep LD_PRELOAD 2>/dev/null";
    let preload_output = manager.execute_command(cmd_preload).map(|r| r.output).unwrap_or_default();
    let ld_preload_hooks: Vec<String> = preload_output.lines()
        .filter(|l| !l.trim().is_empty() && l.trim() != "---")
        .map(|l| l.trim().to_string())
        .collect();

    Ok(RootkitScanResult { hidden_processes, suspicious_modules, ld_preload_hooks })
}

/// 鎸佷箙鍖栨満鍒跺叏闈㈡壂鎻?pub fn detect_persistence(manager: &SSHManagerRussh) -> Result<PersistenceScanResult, String> {
    // 1. 鍏ㄩ噺 cron 妫€鏌?    let cmd_cron = r#"{ for user in $(cut -f1 -d: /etc/passwd); do crontab -u "$user" -l 2>/dev/null | grep -v '^#' | grep -v '^$' | sed "s/^/[$user] /"; done; cat /etc/crontab 2>/dev/null | grep -v '^#' | grep -v '^$' | grep -v '^[A-Z]'; find /etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly -type f -exec grep -l -E '(curl|wget|nc|python|perl|bash|sh -c)' {} \; 2>/dev/null; cat /var/spool/cron/crontabs/* /var/spool/cron/* 2>/dev/null | grep -v '^#' | grep -v '^$'; } 2>/dev/null | head -100"#;
    let cron_output = manager.execute_command(cmd_cron).map(|r| r.output).unwrap_or_default();
    let suspicious_cron: Vec<String> = cron_output.lines()
        .filter(|l| !l.trim().is_empty())
        .filter(|l| {
            let low = l.to_lowercase();
            low.contains("curl") || low.contains("wget") || low.contains("nc ") || low.contains("python") || low.contains("perl") || low.contains("bash -") || low.contains("/dev/tcp")
        })
        .map(|l| l.trim().to_string())
        .collect();

    // 2. .bashrc/.profile 鏈ㄩ┈
    let cmd_bashrc = r#"grep -rn -E '(curl|wget|nc |socat|python.*-c|perl.*-e|bash -i|/dev/tcp|/dev/udp|eval|base64)' /root/.bashrc /root/.bash_profile /root/.profile /home/*/.bashrc /home/*/.bash_profile /home/*/.profile 2>/dev/null | head -50"#;
    let bashrc_output = manager.execute_command(cmd_bashrc).map(|r| r.output).unwrap_or_default();
    let bashrc_trojans: Vec<String> = bashrc_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    // 3. systemd 单元后门
    let cmd_systemd = r#"grep -rn -E 'ExecStart.*(curl|wget|nc|bash|python|perl|/tmp/|/dev/shm/)' /etc/systemd/system/ /usr/lib/systemd/system/ 2>/dev/null | head -50"#;
    let systemd_output = manager.execute_command(cmd_systemd).map(|r| r.output).unwrap_or_default();
    let systemd_trojans: Vec<String> = systemd_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    // 4. rc.local
    let cmd_rclocal = "cat /etc/rc.local /etc/rc.d/rc.local 2>/dev/null | grep -v '^#' | grep -v '^$' | grep -v 'exit 0'";
    let rclocal_output = manager.execute_command(cmd_rclocal).map(|r| r.output).unwrap_or_default();
    let rc_local_entries: Vec<String> = rclocal_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    // 5. at 任务
    let cmd_at = "atq 2>/dev/null | head -20";
    let at_output = manager.execute_command(cmd_at).map(|r| r.output).unwrap_or_default();
    let at_jobs: Vec<String> = at_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    // 6. LD_PRELOAD 文件
    let cmd_ldpreload = "cat /etc/ld.so.preload 2>/dev/null; find /etc/ld.so.conf.d -type f -exec grep -l '/tmp\\|/dev/shm' {} \\; 2>/dev/null";
    let ld_output = manager.execute_command(cmd_ldpreload).map(|r| r.output).unwrap_or_default();
    let ld_preload_files: Vec<String> = ld_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    Ok(PersistenceScanResult {
        suspicious_cron, bashrc_trojans, systemd_trojans,
        rc_local_entries, at_jobs, ld_preload_files,
    })
}

/// 鏃ュ織绡℃敼妫€娴?pub fn detect_log_tamper(manager: &SSHManagerRussh) -> Result<LogTamperResult, String> {
    // 1. 闆跺瓧鑺?寮傚父灏忔棩蹇?    let cmd_truncated = r#"find /var/log -maxdepth 2 -type f \( -name "*.log" -o -name "auth.log" -o -name "secure" -o -name "syslog" -o -name "messages" \) -size 0 2>/dev/null; find /var/log -maxdepth 2 -name "auth.log" -o -name "secure" 2>/dev/null | xargs ls -la 2>/dev/null | awk '$5<100 {print "寮傚父灏忔枃浠? "$NF" ("$5" bytes)"}'"#;
    let trunc_output = manager.execute_command(cmd_truncated).map(|r| r.output).unwrap_or_default();
    let truncated_logs: Vec<String> = trunc_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    // 2. 宸插垹闄や絾浠嶆墦寮€鐨勬棩蹇楁枃浠?    let cmd_deleted = "lsof +L1 2>/dev/null | grep -E '/var/log|syslog|auth' | head -20";
    let deleted_output = manager.execute_command(cmd_deleted).map(|r| r.output).unwrap_or_default();
    let deleted_open_logs: Vec<String> = deleted_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    // 3. wtmp/lastlog 寮傚父
    let cmd_gaps = r#"last -F 2>/dev/null | head -50 | awk '{print $1}' | sort | uniq -c | sort -rn | head -10"#;
    let gaps_output = manager.execute_command(cmd_gaps).map(|r| r.output).unwrap_or_default();
    let timestamp_gaps: Vec<String> = gaps_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| format!("登录频率: {}", l.trim()))
        .collect();

    Ok(LogTamperResult { truncated_logs, deleted_open_logs, timestamp_gaps })
}

/// 缃戠粶鍚庨棬妫€娴?pub fn detect_network_backdoor(manager: &SSHManagerRussh) -> Result<NetworkBackdoorResult, String> {
    // 1. 可疑监听端口（高端口 + 闈炴爣鍑嗙▼搴忥級
    let cmd_listeners = r#"ss -tlnp 2>/dev/null | awk 'NR>1 {split($4,a,":"); port=a[length(a)]; if(port>30000 || port==4444 || port==5555 || port==6666 || port==8888 || port==1234 || port==31337) print $0}' | head -50"#;
    let listener_output = manager.execute_command(cmd_listeners).map(|r| r.output).unwrap_or_default();
    let suspicious_listeners: Vec<String> = listener_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    // 2. C2 连接（已建立的可疑外连）
    let cmd_c2 = r#"ss -tnp state established 2>/dev/null | awk '{split($5,a,":"); port=a[length(a)]; if(port==4444 || port==5555 || port==6666 || port==8888 || port==1234 || port==31337 || port==9999 || port==443) print $0}' | head -50"#;
    let c2_output = manager.execute_command(cmd_c2).map(|r| r.output).unwrap_or_default();
    let c2_connections: Vec<String> = c2_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    // 3. 鍙嶅脊 shell 鎸囩ず鍣紙/tmp 鎴栧凡鍒犻櫎浜岃繘鍒剁殑缃戠粶杩涚▼锛?    let cmd_reverse = r#"ls -la /proc/*/exe 2>/dev/null | grep -E '(deleted)|/tmp/|/dev/shm/' | head -50"#;
    let reverse_output = manager.execute_command(cmd_reverse).map(|r| r.output).unwrap_or_default();
    let reverse_shell_indicators: Vec<String> = reverse_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    Ok(NetworkBackdoorResult { suspicious_listeners, c2_connections, reverse_shell_indicators })
}

/// 增强用户审计
pub fn detect_enhanced_user(manager: &SSHManagerRussh) -> Result<EnhancedUserResult, String> {
    // 1. UID 鍐茬獊
    let cmd_uid = "awk -F: '{print $3}' /etc/passwd | sort -n | uniq -d";
    let uid_output = manager.execute_command(cmd_uid).map(|r| r.output).unwrap_or_default();
    let uid_conflicts: Vec<String> = uid_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| format!("UID 鍐茬獊: {}", l.trim()))
        .collect();

    // 2. 鏈?Shell 浣嗘棤 Home 目录
    let cmd_shell = r#"awk -F: '$NF ~ /bash|sh|zsh/ {print $1":"$6}' /etc/passwd | while IFS=: read user home; do [ ! -d "$home" ] && echo "$user (home=$home 涓嶅瓨鍦?"; done 2>/dev/null"#;
    let shell_output = manager.execute_command(cmd_shell).map(|r| r.output).unwrap_or_default();
    let shell_without_home: Vec<String> = shell_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    // 3. sudo 缁勫紓甯?    let cmd_sudo = "getent group sudo wheel 2>/dev/null | cut -d: -f4";
    let sudo_output = manager.execute_command(cmd_sudo).map(|r| r.output).unwrap_or_default();
    let sudo_anomalies: Vec<String> = sudo_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| format!("sudo/wheel 缁勬垚鍛? {}", l.trim()))
        .collect();

    // 4. 鍏ㄧ敤鎴峰彲鐤戝巻鍙插懡浠?    let cmd_history = r#"for f in /root/.bash_history /home/*/.bash_history; do [ -f "$f" ] && grep -n -E '(wget http|curl http|nc -|bash -i|/dev/tcp|base64 -d|python.*-c|perl.*-e|chmod 777|chmod \+s)' "$f" 2>/dev/null | head -20 | sed "s|^|[$f] |"; done"#;
    let history_output = manager.execute_command(cmd_history).map(|r| r.output).unwrap_or_default();
    let suspicious_history: Vec<String> = history_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    Ok(EnhancedUserResult { uid_conflicts, shell_without_home, sudo_anomalies, suspicious_history })
}

/// 闅愯棌璁″垝浠诲姟妫€娴?pub fn detect_hidden_cron(manager: &SSHManagerRussh) -> Result<GenericDetectionResult, String> {
    let mut issues = Vec::new();

    let cmd = r#"{ find /etc/cron.d /var/spool/cron /var/spool/cron/crontabs -type f 2>/dev/null | while read f; do echo "=== $f ==="; cat "$f" 2>/dev/null | grep -v '^#' | grep -v '^$'; done; echo "=== at queue ==="; atq 2>/dev/null; } | head -100"#;
    let output = manager.execute_command(cmd).map(|r| r.output).unwrap_or_default();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("===") { continue; }
        let low = trimmed.to_lowercase();
        if low.contains("curl") || low.contains("wget") || low.contains("nc ") || low.contains("python") || low.contains("bash -") || low.contains("/dev/tcp") {
            issues.push(SecurityIssue {
                title: "可疑计划任务".to_string(),
                description: trimmed.to_string(),
                severity: "high".to_string(),
                recommendation: "妫€鏌ヨ璁″垝浠诲姟鏄惁涓哄悎娉曚换鍔★紝濡備笉鏄绔嬪嵆鍒犻櫎".to_string(),
                details: Some(trimmed.to_string()),
            });
        }
    }

    if issues.is_empty() {
        issues.push(SecurityIssue {
            title: "璁″垝浠诲姟妫€鏌ラ€氳繃".to_string(),
            description: "未发现可疑的隐藏计划任务".to_string(),
            severity: "info".to_string(),
            recommendation: "瀹氭湡妫€鏌ヨ鍒掍换鍔″彉鏇?.to_string(),
            details: None,
        });
    }

    Ok(GenericDetectionResult { issues })
}

/// SSH 密钥审计
pub fn detect_ssh_key_audit(manager: &SSHManagerRussh) -> Result<SSHKeyAuditResult, String> {
    // 1. 鎵€鏈?authorized_keys
    let cmd_keys = r#"find /root /home -name authorized_keys -type f 2>/dev/null | while read f; do user=$(echo "$f" | awk -F/ '{if($2=="root") print "root"; else print $3}'); wc -l < "$f" | xargs -I{} echo "$user: {} keys in $f"; done"#;
    let keys_output = manager.execute_command(cmd_keys).map(|r| r.output).unwrap_or_default();
    let unauthorized_keys: Vec<String> = keys_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    // 2. 寮卞瘑閽ユ娴?(DSA 鎴?RSA < 2048)
    let cmd_weak = r#"find /root /home -name authorized_keys -type f 2>/dev/null | xargs grep -h 'ssh-dss\|ssh-rsa' 2>/dev/null | awk '{print $1" "$3}' | head -50"#;
    let weak_output = manager.execute_command(cmd_weak).map(|r| r.output).unwrap_or_default();
    let weak_keys: Vec<String> = weak_output.lines()
        .filter(|l| l.contains("ssh-dss"))
        .map(|l| format!("寮卞瘑閽?(DSA): {}", l.trim()))
        .collect();

    // 3. SSH 配置异常
    let cmd_config = "grep -n -E '(AuthorizedKeysCommand|ForceCommand|PermitUserEnvironment\\s+yes)' /etc/ssh/sshd_config 2>/dev/null";
    let config_output = manager.execute_command(cmd_config).map(|r| r.output).unwrap_or_default();
    let config_issues: Vec<String> = config_output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    Ok(SSHKeyAuditResult { unauthorized_keys, weak_keys, config_issues })
}

/// 鏃堕棿鎴崇鏀规娴?pub fn detect_timestomp(manager: &SSHManagerRussh) -> Result<TimestompResult, String> {
    // 鏌ユ壘 mtime 杩滄棭浜?ctime 的文件（timestomping 鐗瑰緛锛?    let cmd = r#"find /tmp /var/tmp /dev/shm /var/www 2>/dev/null -type f -printf '%p|mtime=%T@|ctime=%C@\n' 2>/dev/null | awk -F'|' '{split($2,m,"="); split($3,c,"="); if(c[2]-m[2]>86400) print $1" mtime涓巆time宸紓>"int((c[2]-m[2])/3600)"灏忔椂"}' | head -30"#;
    let output = manager.execute_command(cmd).map(|r| r.output).unwrap_or_default();
    let suspicious_files: Vec<String> = output.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    Ok(TimestompResult { suspicious_files })
}

/// 澧炲己杩涚▼鍒嗘瀽锛堝鐢ㄤ慨澶嶅悗鐨?detect_process_analysis锛?pub fn detect_enhanced_process(manager: &SSHManagerRussh) -> Result<ProcessAnalysisResult, String> {
    // 鎵╁睍鎵弿鑼冨洿鍒?100 涓繘绋?    let cmd = "ps aux --sort=-%cpu | head -200";
    let output_result = manager.execute_command(cmd)
        .map_err(|e| format!("获取进程列表失败: {}", e))?;

    let output = output_result.output;
    let mut high_resource_processes = Vec::new();
    let mut suspicious_processes = Vec::new();

    for (i, line) in output.lines().skip(1).enumerate() {
        if i >= 80 { break; }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 11 {
            let user = parts[0].to_string();
            let pid = parts[1].parse::<u32>().unwrap_or(0);
            let cpu = parts[2].parse::<f32>().unwrap_or(0.0);
            let mem = parts[3].parse::<f32>().unwrap_or(0.0);
            let command = parts[10..].join(" ");
            let name = parts[10].to_string();

            let process = ProcessInfo {
                pid, name, user, cpu, mem,
                command: command.chars().take(500).collect(),
            };

            if cpu > 50.0 || mem > 50.0 {
                high_resource_processes.push(process.clone());
            }

            // 鍙枒杩涚▼妫€娴?            if command.contains("(deleted)")
                || command.starts_with("/tmp/")
                || command.starts_with("/dev/shm/")
                || command.starts_with("/var/tmp/")
                || command.contains("bash -i")
                || command.contains("/dev/tcp")
                || command.contains("/dev/udp")
                || command.contains("xmrig")
                || command.contains("cryptonight") {
                suspicious_processes.push(process.clone());
            }
        }
    }

    Ok(ProcessAnalysisResult { suspicious_processes, high_resource_processes })
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// bin/sbin 绡℃敼妫€娴?+ 鏂囦欢涓嶅彲鍙樺睘鎬ф娴?// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
/// 妫€娴?/usr/bin /usr/sbin /bin /sbin 涓鏇挎崲涓鸿剼鏈殑鍛戒护锛堝懡浠ゅ姭鎸?绡℃敼锛?pub fn detect_bin_tamper(manager: &SSHManagerRussh) -> Result<Vec<String>, String> {
    let cmd = r#"for d in /usr/bin /usr/sbin /bin /sbin; do [ -d "$d" ] && file "$d"/* 2>/dev/null; done | grep -E 'script|text|ASCII' | grep -v '\.sh:' | grep -v '\.py:' | grep -v '\.pl:' | grep -v '\.rb:' | head -50"#;
    let output = manager.execute_command(cmd)
        .map_err(|e| format!("bin绡℃敼妫€娴嬪け璐? {}", e))?;
    let findings: Vec<String> = output.output
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.chars().take(200).collect())
        .collect();
    Ok(findings)
}

/// 妫€娴嬪叿鏈変笉鍙彉灞炴€?immutable/append-only)鐨勫彲鐤戞枃浠?pub fn detect_immutable_files(manager: &SSHManagerRussh) -> Result<Vec<String>, String> {
    let cmd = r#"lsattr -R /etc /var/www /usr/bin /usr/sbin /tmp /root 2>/dev/null | grep -E '^....i|^....a' | head -50"#;
    let output = manager.execute_command(cmd)
        .map_err(|e| format!("涓嶅彲鍙樻枃浠舵娴嬪け璐? {}", e))?;
    let findings: Vec<String> = output.output
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.chars().take(200).collect())
        .collect();
    Ok(findings)
}
