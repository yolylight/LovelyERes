// 日志分析模块 鈥?搴旀€ュ搷搴斿寮虹増
// 鏀寔锛氬▉鑳佸垎鏋愩€両P/鐢ㄦ埛鎻愬彇銆乤uditd 瑙ｆ瀽銆佸鏃ュ織鍏宠仈銆両OC 鎼滅储

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ==================== 数据结构 ====================

/// 鏃ュ織鏉＄洰
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub service: String,
    pub message: String,
    pub raw: String,
    pub highlighted: bool,
    /// 日志来源文件（多日志关联时使用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// 日志文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogFileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: String,
    pub readable: bool,
}

/// IP 缁熻
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpCount {
    pub ip: String,
    pub count: usize,
    pub last_seen: String,
    /// 鍏宠仈鐨勫姩浣滅被鍨? failed_login, accepted_login, sudo, other
    pub action_type: String,
}

/// 鐢ㄦ埛鍚嶇粺璁?#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserCount {
    pub username: String,
    pub count: usize,
    pub success_count: usize,
    pub fail_count: usize,
}

/// 威胁分析摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatSummary {
    pub brute_force_count: usize,
    pub successful_login_count: usize,
    pub privilege_escalation_count: usize,
    pub suspicious_activity_count: usize,
    pub top_source_ips: Vec<IpCount>,
    pub top_target_users: Vec<UserCount>,
    /// 24 灏忔椂鍒嗗竷 (绱㈠紩 0-23)
    pub hourly_distribution: Vec<usize>,
    /// critical / high / medium / low / none
    pub threat_level: String,
}

/// 鏃ュ織鍒嗘瀽缁撴灉锛堝寮虹増锛?#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogAnalysisResult {
    pub entries: Vec<LogEntry>,
    pub total_count: usize,
    pub highlighted_count: usize,
    pub file_info: Option<LogFileInfo>,
    /// 濞佽儊鍒嗘瀽鎽樿锛堜粎鍦ㄨ姹傚垎鏋愭椂濉厖锛?    #[serde(skip_serializing_if = "Option::is_none")]
    pub threat_summary: Option<ThreatSummary>,
}

/// IOC 鎼滅储缁撴灉
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IocSearchResult {
    pub results: Vec<IocMatch>,
    pub total_matches: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IocMatch {
    pub indicator: String,
    pub log_file: String,
    pub count: usize,
    pub sample_lines: Vec<String>,
}

/// 澶氭棩蹇楀叧鑱旂粨鏋?#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiLogResult {
    pub entries: Vec<LogEntry>,
    pub total_count: usize,
    pub sources: Vec<String>,
    pub threat_summary: Option<ThreatSummary>,
}

// ==================== 甯搁噺 ====================

pub const COMMON_LOG_FILES: &[(&str, &str)] = &[
    ("/var/log/auth.log", "认证日志"),
    ("/var/log/secure", "安全日志"),
    ("/var/log/syslog", "系统日志"),
    ("/var/log/messages", "系统消息"),
    ("/var/log/kern.log", "内核日志"),
    ("/var/log/cron", "计划任务日志"),
    ("/var/log/maillog", "邮件日志"),
    ("/var/log/boot.log", "启动日志"),
    ("/var/log/dmesg", "设备消息"),
    ("/var/log/audit/audit.log", "审计日志"),
];

pub const HIGHLIGHT_KEYWORDS: &[&str] = &[
    "Failed password", "failed", "Failed", "FAILED",
    "Accepted", "accepted",
    "sudo", "SUDO", "su:",
    "authentication failure", "Invalid user", "invalid",
    "error", "Error", "ERROR",
    "warning", "Warning", "WARNING",
    "denied", "Denied", "DENIED",
    "unauthorized", "Unauthorized",
    "root", "ROOT",
    "attack", "Attack", "ATTACK",
    "intrusion", "Intrusion",
    "breach", "Breach",
    "segfault", "oom-killer", "Out of memory",
    "reverse mapping", "COMMAND=",
];

/// 鐢ㄤ簬搴旀€ュ搷搴旂殑楂樺嵄鍏抽敭璇嶏紙鏉冮噸鏇撮珮锛?const SUSPICIOUS_KEYWORDS: &[&str] = &[
    "reverse shell", "nc -e", "ncat", "/dev/tcp", "/dev/udp",
    "base64", "eval", "wget http", "curl http",
    "chmod 777", "chmod +s", "setuid",
    "LD_PRELOAD", "LD_LIBRARY_PATH",
    "crontab -e", "/etc/cron",
    "useradd", "usermod", "passwd",
    "iptables -F", "ufw disable", "firewalld stop",
    "history -c", "unset HISTFILE",
    ".ssh/authorized_keys",
];

// ==================== 瑙ｆ瀽鍑芥暟 ====================

/// 瑙ｆ瀽鏃ュ織琛岋紙澧炲己鐗?鈥?鏀寔 syslog / journalctl / auditd 鏍煎紡锛?pub fn parse_log_line(line: &str, keywords: &[&str]) -> LogEntry {
    let highlighted = keywords.iter().any(|kw| line.contains(kw));

    // 浼樺厛灏濊瘯 auditd 鏍煎紡: type=XXX msg=audit(1234567890.123:456): ...
    if line.contains("type=") && line.contains("msg=audit(") {
        return parse_audit_line(line, highlighted);
    }

    // syslog / journalctl 鏍煎紡
    let fields: Vec<&str> = line.split_whitespace().collect();

    let timestamp = if fields.len() >= 3 {
        format!("{} {} {}", fields.get(0).unwrap_or(&""),
                fields.get(1).unwrap_or(&""),
                fields.get(2).unwrap_or(&""))
    } else {
        String::new()
    };

    let service = if fields.len() >= 5 {
        fields.get(4).unwrap_or(&"").trim_end_matches(':').to_string()
    } else {
        "unknown".to_string()
    };

    let message = if let Some(pos) = line.find(':') {
        line[pos + 1..].trim().to_string()
    } else {
        line.to_string()
    };

    let level = detect_level(line);

    LogEntry {
        timestamp,
        level,
        service,
        message,
        raw: line.to_string(),
        highlighted,
        source: None,
    }
}

/// 瑙ｆ瀽 auditd 鏃ュ織琛?fn parse_audit_line(line: &str, highlighted: bool) -> LogEntry {
    // type=SYSCALL msg=audit(1709234567.123:456): arch=c000003e syscall=59 success=yes ...
    let audit_type = extract_field(line, "type=");
    let timestamp = extract_audit_timestamp(line);
    let success = extract_field(line, "success=");
    let exe = extract_field(line, "exe=").replace('"', "");
    let comm = extract_field(line, "comm=").replace('"', "");

    let level = if audit_type == "EXECVE" || audit_type == "SYSCALL" {
        if success == "no" { "ERROR".to_string() } else { "WARN".to_string() }
    } else if audit_type.contains("USER_AUTH") || audit_type.contains("USER_LOGIN") {
        if success == "no" { "ERROR".to_string() } else { "INFO".to_string() }
    } else {
        "INFO".to_string()
    };

    let service = format!("audit({})", audit_type);
    let message = if !exe.is_empty() {
        format!("{} exe={} comm={}", line.split("):").nth(1).unwrap_or("").trim(), exe, comm)
    } else {
        line.split("):").nth(1).unwrap_or(line).trim().to_string()
    };

    LogEntry {
        timestamp,
        level,
        service,
        message,
        raw: line.to_string(),
        highlighted,
        source: None,
    }
}

fn extract_field(line: &str, prefix: &str) -> String {
    if let Some(start) = line.find(prefix) {
        let rest = &line[start + prefix.len()..];
        if rest.starts_with('"') {
            // quoted value
            rest[1..].split('"').next().unwrap_or("").to_string()
        } else {
            rest.split_whitespace().next().unwrap_or("").to_string()
        }
    } else {
        String::new()
    }
}

fn extract_audit_timestamp(line: &str) -> String {
    // msg=audit(1709234567.123:456)
    if let Some(start) = line.find("audit(") {
        let rest = &line[start + 6..];
        if let Some(end) = rest.find(':') {
            if let Ok(epoch) = rest[..end].parse::<f64>() {
                let secs = epoch as i64;
                // 绠€鍗曟牸寮忓寲涓?YYYY-MM-DD HH:MM:SS
                let dt = chrono::DateTime::from_timestamp(secs, 0);
                if let Some(dt) = dt {
                    return dt.format("%Y-%m-%d %H:%M:%S").to_string();
                }
            }
        }
    }
    String::new()
}

fn detect_level(line: &str) -> String {
    let lower = line.to_lowercase();
    if lower.contains("fail") || lower.contains("error") || lower.contains("denied")
        || lower.contains("invalid user") || lower.contains("authentication failure") {
        "ERROR".to_string()
    } else if lower.contains("warn") {
        "WARN".to_string()
    } else if lower.contains("debug") {
        "DEBUG".to_string()
    } else if lower.contains("accepted") || lower.contains("success") {
        "INFO".to_string()
    } else {
        "INFO".to_string()
    }
}

// ==================== 威胁分析 ====================

/// 瀵瑰凡瑙ｆ瀽鐨勬棩蹇楁潯鐩繘琛屽▉鑳佸垎鏋?pub fn analyze_threats(entries: &[LogEntry]) -> ThreatSummary {
    let mut brute_force = 0usize;
    let mut success_login = 0usize;
    let mut priv_esc = 0usize;
    let mut suspicious = 0usize;

    let mut ip_map: HashMap<String, (usize, String, String)> = HashMap::new(); // ip -> (count, last_seen, action)
    let mut user_map: HashMap<String, (usize, usize)> = HashMap::new(); // user -> (success, fail)
    let mut hourly: Vec<usize> = vec![0; 24];

    for entry in entries {
        let raw = &entry.raw;
        let lower = raw.to_lowercase();

        // 暴力破解
        if lower.contains("failed password") || lower.contains("authentication failure") {
            brute_force += 1;
            if let Some(ip) = extract_ip(raw) {
                let e = ip_map.entry(ip).or_insert((0, String::new(), "failed_login".to_string()));
                e.0 += 1;
                e.1 = entry.timestamp.clone();
                e.2 = "failed_login".to_string();
            }
            if let Some(user) = extract_target_user(raw) {
                let e = user_map.entry(user).or_insert((0, 0));
                e.1 += 1;
            }
        }

        // 成功登录
        if lower.contains("accepted password") || lower.contains("accepted publickey") {
            success_login += 1;
            if let Some(ip) = extract_ip(raw) {
                let e = ip_map.entry(ip).or_insert((0, String::new(), "accepted_login".to_string()));
                e.0 += 1;
                e.1 = entry.timestamp.clone();
            }
            if let Some(user) = extract_target_user(raw) {
                let e = user_map.entry(user).or_insert((0, 0));
                e.0 += 1;
            }
        }

        // 鎻愭潈
        if lower.contains("sudo") || lower.contains("su:") || lower.contains("command=") {
            priv_esc += 1;
        }

        // 鍙枒娲诲姩
        for kw in SUSPICIOUS_KEYWORDS {
            if raw.contains(kw) {
                suspicious += 1;
                break;
            }
        }

        // 灏忔椂鍒嗗竷
        if let Some(hour) = extract_hour(&entry.timestamp) {
            if hour < 24 {
                hourly[hour] += 1;
            }
        }
    }

    // Top 10 IP
    let mut top_ips: Vec<IpCount> = ip_map.into_iter()
        .map(|(ip, (count, last_seen, action))| IpCount { ip, count, last_seen, action_type: action })
        .collect();
    top_ips.sort_by(|a, b| b.count.cmp(&a.count));
    top_ips.truncate(20);

    // Top 20 鐢ㄦ埛
    let mut top_users: Vec<UserCount> = user_map.into_iter()
        .map(|(username, (success, fail))| UserCount {
            count: success + fail,
            username, success_count: success, fail_count: fail
        })
        .collect();
    top_users.sort_by(|a, b| b.count.cmp(&a.count));
    top_users.truncate(20);

    // 濞佽儊绛夌骇
    let threat_level = if brute_force > 100 || suspicious > 10 {
        "critical".to_string()
    } else if brute_force > 50 || suspicious > 5 {
        "high".to_string()
    } else if brute_force > 10 || suspicious > 0 {
        "medium".to_string()
    } else if brute_force > 0 {
        "low".to_string()
    } else {
        "none".to_string()
    };

    ThreatSummary {
        brute_force_count: brute_force,
        successful_login_count: success_login,
        privilege_escalation_count: priv_esc,
        suspicious_activity_count: suspicious,
        top_source_ips: top_ips,
        top_target_users: top_users,
        hourly_distribution: hourly,
        threat_level,
    }
}

/// 浠庢棩蹇楄涓彁鍙?IP 地址
fn extract_ip(line: &str) -> Option<String> {
    // 鍖归厤 "from X.X.X.X" 鎴?"rhost=X.X.X.X" 鎴?"SRC=X.X.X.X"
    let patterns = ["from ", "rhost=", "SRC=", "src=", "addr="];
    for pat in &patterns {
        if let Some(pos) = line.find(pat) {
            let rest = &line[pos + pat.len()..];
            let token = rest.split(|c: char| !c.is_ascii_digit() && c != '.').next()?;
            if is_valid_ip(token) {
                return Some(token.to_string());
            }
        }
    }
    // 闄嶇骇锛氭壘浠绘剰 IP 妯″紡
    for word in line.split_whitespace() {
        let clean = word.trim_matches(|c: char| !c.is_ascii_digit() && c != '.');
        if is_valid_ip(clean) && clean != "127.0.0.1" && clean != "0.0.0.0" {
            return Some(clean.to_string());
        }
    }
    None
}

fn is_valid_ip(s: &str) -> bool {
    let parts: Vec<&str> = s.split('.').collect();
    if parts.len() != 4 { return false; }
    parts.iter().all(|p| p.parse::<u8>().is_ok())
}

/// 浠庢棩蹇楄涓彁鍙栫洰鏍囩敤鎴峰悕
fn extract_target_user(line: &str) -> Option<String> {
    // "for <user> from" / "user=<user>" / "Invalid user <user>"
    let patterns = [
        ("for ", " from"),
        ("for invalid user ", " from"),
        ("Invalid user ", " from"),
        ("user=", " "),
        ("user ", " "),
    ];
    for (start_pat, end_pat) in &patterns {
        if let Some(start) = line.find(start_pat) {
            let rest = &line[start + start_pat.len()..];
            let user = if let Some(end) = rest.find(end_pat) {
                &rest[..end]
            } else {
                rest.split_whitespace().next().unwrap_or("")
            };
            let user = user.trim();
            if !user.is_empty() && user.len() < 64 && !user.contains('/') {
                return Some(user.to_string());
            }
        }
    }
    None
}

/// 浠庢椂闂存埑涓彁鍙栧皬鏃?fn extract_hour(timestamp: &str) -> Option<usize> {
    // "Nov 22 19:43:01" 鈫?19  鎴? "2024-01-15 19:43:01" 鈫?19
    for part in timestamp.split_whitespace() {
        if part.contains(':') {
            if let Some(hour_str) = part.split(':').next() {
                if let Ok(h) = hour_str.parse::<usize>() {
                    return Some(h);
                }
            }
        }
    }
    None
}

// ==================== 命令生成 ====================

pub fn generate_log_read_command(log_path: &str, page: usize, page_size: usize, filter: Option<&str>, date_filter: Option<&str>) -> String {
    let total_lines = page * page_size;

    // 是否有过滤
    let mut grep_filters = Vec::new();
    if let Some(filter_text) = filter {
        let trimmed = filter_text.trim();
        if !trimmed.is_empty() {
            // 使用 -E 支持扩展正则，-i 忽略大小写
            grep_filters.push(format!("grep -iE '{}'", escape_grep_pattern(trimmed)));
        }
    }
    if let Some(date) = date_filter {
        let trimmed = date.trim();
        if !trimmed.is_empty() {
            grep_filters.push(format!("grep '{}'", escape_grep_pattern(trimmed)));
        }
    }

    if grep_filters.is_empty() {
        if page == 1 {
            format!("tail -n {} {} 2>/dev/null || echo 'Log file not found'", page_size, log_path)
        } else {
            format!("tail -n {} {} 2>/dev/null | head -n {} || echo 'Log file not found'", total_lines, log_path, page_size)
        }
    } else {
        let grep_chain = grep_filters.join(" | ");
        if page == 1 {
            format!(
                "cat {} 2>/dev/null | {} | tail -n {} || echo 'No matching entries'",
                log_path, grep_chain, page_size
            )
        } else {
            format!(
                "cat {} 2>/dev/null | {} | tail -n {} | head -n {} || echo 'No matching entries'",
                log_path, grep_chain, total_lines, page_size
            )
        }
    }
}

/// 转义 grep 模式中的特殊字符
fn escape_grep_pattern(pattern: &str) -> String {
    // 转义可能导致 shell 注入或 grep 语法错误的字符
    let mut escaped = String::with_capacity(pattern.len() * 2);
    for c in pattern.chars() {
        match c {
            '\'' => escaped.push_str("'\\''"),  // 单引号需要特殊处理
            '\\' | '$' | '`' | '"' | '!' => {
                escaped.push('\\');
                escaped.push(c);
            }
            _ => escaped.push(c),
        }
    }
    escaped
}

pub fn generate_journalctl_command(page: usize, page_size: usize, unit: Option<&str>, filter: Option<&str>, since: Option<&str>, until: Option<&str>) -> String {
    let mut cmd = String::from("journalctl --no-pager");

    if let Some(unit_name) = unit {
        if !unit_name.trim().is_empty() {
            cmd.push_str(&format!(" -u {}", unit_name));
        }
    }
    if let Some(s) = since {
        if !s.trim().is_empty() {
            cmd.push_str(&format!(" --since \"{}\"", s));
        }
    }
    if let Some(u) = until {
        if !u.trim().is_empty() {
            cmd.push_str(&format!(" --until \"{}\"", u));
        }
    }
    if let Some(filter_text) = filter {
        let trimmed = filter_text.trim();
        if !trimmed.is_empty() {
            cmd.push_str(&format!(" | grep -iE '{}'", escape_grep_pattern(trimmed)));
        }
    }

    let total_lines = page * page_size;
    if page == 1 {
        cmd.push_str(&format!(" -n {}", page_size));
    } else {
        cmd.push_str(&format!(" -n {} | head -n {}", total_lines, page_size));
    }

    cmd.push_str(" 2>/dev/null || echo 'journalctl not available'");
    cmd
}

/// 生成威胁分析命令 鈥?璇诲彇鏇村琛岀敤浜庣粺璁★紙鏈€杩?2000 琛岋級
pub fn generate_threat_analysis_command(log_path: &str) -> String {
    format!("tail -n 2000 {} 2>/dev/null || echo ''", log_path)
}

/// 鐢熸垚澶氭棩蹇楀叧鑱旇鍙栧懡浠?pub fn generate_multi_log_command(log_paths: &[String], line_limit: usize) -> Vec<String> {
    log_paths.iter().map(|path| {
        format!("tail -n {} {} 2>/dev/null || echo ''", line_limit, path)
    }).collect()
}

/// 鐢熸垚 IOC 搜索命令（对每个 indicator 在每个日志文件中 grep锛?pub fn generate_ioc_search_command(indicator: &str, log_path: &str) -> String {
    format!(
        "grep -c '{}' {} 2>/dev/null || echo '0'; grep -m 3 '{}' {} 2>/dev/null || true",
        indicator, log_path, indicator, log_path
    )
}

pub fn generate_list_log_files_command() -> String {
    format!(
        r#"find /var/log -maxdepth 2 -type f \( -name "*.log" -o -name "messages" -o -name "secure" -o -name "syslog" -o -name "auth.log" \) -readable -exec stat -c "%s|%n|%Y" {{}} \; 2>/dev/null | head -50"#
    )
}

pub fn generate_log_file_info_command(log_path: &str) -> String {
    format!(
        r#"stat -c "size:%s|modified:%y|readable:yes" {} 2>/dev/null || echo "readable:no""#,
        log_path
    )
}
