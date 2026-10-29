use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PacketEntry {
    pub id: usize,
    pub timestamp: String,
    pub protocol: String,
    pub src: String,
    pub dst: String,
    pub length: String,
    pub info: String,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInterface {
    pub name: String,
    pub index: u32,
    pub mac: Option<String>,
    pub ips: Vec<String>,
}

/// 从端口号推断应用层协议
fn infer_protocol_from_port(addr: &str) -> Option<&'static str> {
    // tcpdump 格式: 192.168.1.1.80 或 192.168.1.1.443
    if let Some(pos) = addr.rfind('.') {
        if let Ok(port) = addr[pos + 1..].parse::<u16>() {
            return match port {
                80 | 8080 | 8000 | 8888 => Some("HTTP"),
                443 | 8443 => Some("HTTPS"),
                53 => Some("DNS"),
                22 => Some("SSH"),
                21 => Some("FTP"),
                25 | 465 | 587 => Some("SMTP"),
                110 | 995 => Some("POP3"),
                143 | 993 => Some("IMAP"),
                3306 => Some("MySQL"),
                5432 => Some("PgSQL"),
                6379 => Some("Redis"),
                27017 => Some("MongoDB"),
                _ => None,
            };
        }
    }
    None
}

/// 从 info 字段提取 length
fn extract_length(info: &str) -> String {
    // 匹配 "length N" 或 "len N"
    for word_pair in info.split_whitespace().collect::<Vec<&str>>().windows(2) {
        if word_pair[0] == "length" || word_pair[0] == "len" {
            if let Some(num_str) = word_pair[1].strip_suffix(',').or(Some(word_pair[1])) {
                if num_str.parse::<u64>().is_ok() {
                    return num_str.to_string();
                }
            }
        }
    }
    String::new()
}

/// 判断 token 是否为日期 "YYYY-MM-DD"
fn is_date_token(token: &str) -> bool {
    let p: Vec<&str> = token.split('-').collect();
    p.len() == 3 && p.iter().all(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
}

/// 判断 token 是否为时间戳 "HH:MM:SS" 或 "HH:MM:SS.ffffff"
fn is_time_token(token: &str) -> bool {
    let time = token.split('.').next().unwrap_or(token);
    let p: Vec<&str> = time.split(':').collect();
    p.len() == 3 && p.iter().all(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
}

/// 解析 tcpdump 输出行（-tttt 格式，每包一行）
pub fn parse_tcpdump_line(line: &str, id: usize) -> PacketEntry {
    let parts: Vec<&str> = line.split_whitespace().collect();

    let mut entry = PacketEntry {
        id,
        timestamp: String::new(),
        protocol: "OTHER".to_string(),
        src: String::new(),
        dst: String::new(),
        length: String::new(),
        info: line.to_string(),
        raw: line.to_string(),
    };

    if parts.len() < 4 {
        return entry;
    }

    // 检测时间戳。
    // -tttt 格式: "2024-01-15 19:43:01.123456 IP ..."（两个 token）
    // 普通格式:   "19:43:01.123456 IP ..."（一个 token）
    // 若首 token 不是时间（例如 tcpdump -v 的续行以 "192.168.1.1.80 > ..." 开头），
    // 则视为无时间戳，避免把 IP 误当成时间、把 ">" 误当成协议。
    let (ts, offset) = if is_date_token(parts[0]) && parts.len() > 1 && is_time_token(parts[1]) {
        // -tttt 格式: 日期 + 时间
        (format!("{} {}", parts[0], parts[1]), 2)
    } else if is_time_token(parts[0]) {
        // 普通格式: 仅时间
        (parts[0].to_string(), 1)
    } else {
        // 无时间戳（续行或异常行）
        (String::new(), 0)
    };
    entry.timestamp = ts;

    if parts.len() <= offset {
        return entry;
    }

    let proto_token = parts[offset];

    let has_ip_keyword = proto_token == "IP" || proto_token == "IP6";
    let is_arp = proto_token.starts_with("ARP") || proto_token == "ARP,";
    // 是否为裸的 "src > dst:" 行（无 IP/IP6 关键字），例如 tcpdump -v 的续行。
    let bare_ip_flow = !has_ip_keyword && !is_arp && parts[offset..].contains(&">");

    if has_ip_keyword || bare_ip_flow {
        // 有关键字时协议先记为 IP/IP6，随后按端口细化；裸行则直接从端口推断。
        entry.protocol = if has_ip_keyword { proto_token.to_string() } else { "IP".to_string() };
        // 有关键字时地址从 offset+1 起；裸行地址从 offset 起。
        let flow_start = if has_ip_keyword { offset + 1 } else { offset };

        // 找 ">" 分隔 src > dst
        if let Some(arrow_idx) = parts[offset..].iter().position(|&x| x == ">") {
            let abs_arrow = offset + arrow_idx;

            // Source
            if abs_arrow > flow_start {
                entry.src = parts[flow_start..abs_arrow].join(" ");
            }

            // Destination (去掉末尾冒号)
            if abs_arrow + 1 < parts.len() {
                entry.dst = parts[abs_arrow + 1].trim_end_matches(':').to_string();

                // Info
                let info_start = abs_arrow + 2;
                if info_start < parts.len() {
                    entry.info = parts[info_start..].join(" ");
                }
            }

            // 从端口推断应用层协议
            if let Some(app_proto) = infer_protocol_from_port(&entry.src)
                .or_else(|| infer_protocol_from_port(&entry.dst)) {
                entry.protocol = app_proto.to_string();
            }
        }
    } else if is_arp {
        entry.protocol = "ARP".to_string();
        entry.info = parts[offset..].join(" ");
    } else {
        entry.protocol = proto_token.trim_end_matches(',').to_string();
        entry.info = parts[offset..].join(" ");
    }

    // 提取 length
    entry.length = extract_length(&entry.info);

    entry
}

/// 生成 tcpdump 命令
///
/// 关键: 解析器 `parse_tcpdump_line` 期望时间戳之后紧跟 `IP`/`IP6`/`ARP` 关键字，
/// 每个数据包占一行。因此这里不能使用 `-e`（会在时间戳后加入以太网 MAC 头）
/// 或 `-v`（TCP 会拆成两行，续行以 `src > dst:` 开头且无时间戳，导致
/// IP 被误解析为时间、`>` 被误解析为协议）。
/// - `-nn`: 不解析主机名和端口名，保持端口为数字（协议推断依赖数字端口）
/// - `-tttt`: 完整日期时间戳
/// - `-l`: 行缓冲，保证实时输出
pub fn generate_tcpdump_command(interface: &str, filter: Option<&str>, count: Option<u32>) -> String {
    let mut cmd = format!("tcpdump -nn -l -tttt -i {}", interface);

    if let Some(c) = count {
        cmd.push_str(&format!(" -c {}", c));
    }

    if let Some(f) = filter {
        if !f.trim().is_empty() {
            cmd.push_str(&format!(" \"{}\"", f));
        }
    }

    cmd
}

/// 生成获取网络接口的命令
/// 跨环境多层降级，所有 stderr 强制重定向至 /dev/null 防止 command not found 警告污染解析输出：
/// 1. 优先尝试 ip 命令提取接口与 IPv4（现代主流环境）
/// 2. 次选尝试 ifconfig 命令提取接口与 IPv4（传统/精简环境）
/// 3. 再次读取 /sys/class/net 目录列出所有可用接口（无第三方工具的容器环境）
/// 4. 兜底读取 /proc/net/dev 列出所有接口（几乎所有 Linux 内核均支持）
pub fn generate_list_interfaces_command() -> String {
    concat!(
        "if command -v ip >/dev/null 2>&1; then ",
            "ip -o -4 addr show 2>/dev/null | awk '{print $2, $4}'; ",
        "elif command -v ifconfig >/dev/null 2>&1; then ",
            "ifconfig 2>/dev/null | awk '/^[a-zA-Z0-9]/ {iface=$1; sub(/:$/, \"\", iface)} /inet (addr:)?/ {for(i=1;i<=NF;i++) if($i~/^(addr:)?([0-9]+\\.){3}[0-9]+$/) {sub(/^addr:/,\"\",$i); print iface, $i; break}}'; ",
        "elif [ -d /sys/class/net ]; then ",
            "for d in /sys/class/net/*; do [ -e \"$d\" ] && basename \"$d\"; done 2>/dev/null; ",
        "elif [ -f /proc/net/dev ]; then ",
            "awk -F: 'NR>2 {gsub(/^[ \\t]+/, \"\", $1); print $1}' /proc/net/dev 2>/dev/null; ",
        "fi"
    ).to_string()
}

/// 校验网络接口名称合法性（排除 shell 错误输出特征词及异常字符）
fn is_valid_interface_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 32 {
        return false;
    }
    // 排除包含冒号结尾（如 `bash:`, `sh:`, `error:`）或常见 shell 报错词汇
    if name.ends_with(':') {
        return false;
    }
    let lower = name.to_lowercase();
    if lower == "bash"
        || lower == "sh"
        || lower == "dash"
        || lower == "zsh"
        || lower == "line"
        || lower == "command"
        || lower == "not"
        || lower == "found"
        || lower == "sudo"
        || lower == "error"
        || lower == "warning"
        || lower == "permission"
        || lower == "denied"
        || lower == "cannot"
    {
        return false;
    }

    // 合法网卡名：ASCII 字母数字、连字符、下划线、点、冒号（如子接口 eth0:1）
    name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.' || c == ':')
}

/// 校验 IP 地址合法性
fn is_valid_ip_address(ip: &str) -> bool {
    ip.parse::<std::net::IpAddr>().is_ok()
}

/// 解析获取网络接口命令的文本输出
pub fn parse_network_interfaces_output(output: &str) -> Vec<NetworkInterface> {
    let mut interfaces: Vec<NetworkInterface> = Vec::new();
    let mut index = 0u32;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // 防御性过滤 Shell 报错和杂音
        let lower = trimmed.to_lowercase();
        if lower.starts_with("bash:")
            || lower.starts_with("sh:")
            || lower.starts_with("dash:")
            || lower.starts_with("zsh:")
            || lower.contains("command not found")
            || lower.contains("not found")
            || lower.contains("permission denied")
            || lower.contains("operation not permitted")
            || lower.contains("syntax error")
        {
            continue;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        let raw_name = parts[0].trim_end_matches(':');
        if !is_valid_interface_name(raw_name) {
            continue;
        }

        let name = raw_name.to_string();

        // 提取 IP 地址（第二项，如果有且为合法 IP）
        let valid_ip = if parts.len() >= 2 {
            let candidate = parts[1].split('/').next().unwrap_or(parts[1]).trim();
            if is_valid_ip_address(candidate) {
                Some(candidate.to_string())
            } else {
                None
            }
        } else {
            None
        };

        if let Some(existing) = interfaces.iter_mut().find(|i| i.name == name) {
            if let Some(ip) = valid_ip {
                if !existing.ips.contains(&ip) {
                    existing.ips.push(ip);
                }
            }
        } else {
            index += 1;
            let ips = match valid_ip {
                Some(ip) => vec![ip],
                None => Vec::new(),
            };
            interfaces.push(NetworkInterface {
                name,
                index,
                mac: None,
                ips,
            });
        }
    }

    // 始终提供 any 虚拟抓包接口（tcpdump -i any 支持捕获所有接口流量）
    if !interfaces.iter().any(|i| i.name == "any") {
        index += 1;
        interfaces.insert(
            0,
            NetworkInterface {
                name: "any".to_string(),
                index,
                mac: None,
                ips: vec!["所有接口/全部流量".to_string()],
            },
        );
    }

    interfaces
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tttt_tcp_line() {
        let line = "2024-01-15 19:43:01.123456 IP 192.168.100.88.22 > 192.168.42.60.42899: Flags [P.], seq 104015574:104015698, ack 1528948867, win 73, length 124";
        let e = parse_tcpdump_line(line, 1);
        assert_eq!(e.timestamp, "2024-01-15 19:43:01.123456");
        assert_eq!(e.src, "192.168.100.88.22");
        assert_eq!(e.dst, "192.168.42.60.42899");
        assert_eq!(e.protocol, "SSH"); // 端口 22
        assert_eq!(e.length, "124");
    }

    #[test]
    fn bare_flow_line_not_misparsed() {
        // tcpdump -v 的续行样式：无时间戳、无 IP 关键字。
        // 修复前会把 192.168.100.88.22 当成时间、把 ">" 当成协议。
        let line = "192.168.100.88.22 > 192.168.42.60.42899: Flags [P.], cksum 0x107c (incorrect -> 0x79b8), seq 104015574:104015698, ack 1528948867, win 73, length 124";
        let e = parse_tcpdump_line(line, 1);
        assert_eq!(e.timestamp, "");
        assert_eq!(e.src, "192.168.100.88.22");
        assert_eq!(e.dst, "192.168.42.60.42899");
        assert_ne!(e.protocol, ">");
        assert_eq!(e.protocol, "SSH");
        assert_eq!(e.length, "124");
    }

    #[test]
    fn command_has_no_verbose_or_ether_flags() {
        let cmd = generate_tcpdump_command("eth0", None, None);
        assert!(!cmd.contains(" -v"));
        assert!(!cmd.contains("-nne"));
        assert!(cmd.contains("-nn"));
        assert!(cmd.contains("-tttt"));
    }

    #[test]
    fn parses_interfaces_normal_ip_output() {
        let sample = "lo 127.0.0.1/8\neth0 192.168.1.100/24\neth0 10.0.0.2/24\n";
        let ifaces = parse_network_interfaces_output(sample);
        assert!(ifaces.iter().any(|i| i.name == "any"));
        let eth0 = ifaces.iter().find(|i| i.name == "eth0").expect("eth0 must exist");
        assert_eq!(eth0.ips, vec!["192.168.1.100", "10.0.0.2"]);
    }

    #[test]
    fn parses_interfaces_filters_bash_error() {
        // 模拟缺失 ip 命令时返回的典型错误
        let sample = "bash: line 1: ip: command not found\nbash: (ip:)\nsh: ip: not found\n";
        let ifaces = parse_network_interfaces_output(sample);
        // 绝对不能解析出 "bash:" 或 "sh:" 网卡
        assert!(!ifaces.iter().any(|i| i.name.starts_with("bash") || i.name.starts_with("sh")));
        // 兜底包含 any
        assert_eq!(ifaces.len(), 1);
        assert_eq!(ifaces[0].name, "any");
    }

    #[test]
    fn parses_interfaces_names_only() {
        // 模拟从 /sys/class/net 仅读取到接口名的输出
        let sample = "eth0\nlo\ndocker0\n";
        let ifaces = parse_network_interfaces_output(sample);
        assert!(ifaces.iter().any(|i| i.name == "eth0"));
        assert!(ifaces.iter().any(|i| i.name == "docker0"));
        let eth0 = ifaces.iter().find(|i| i.name == "eth0").unwrap();
        assert!(eth0.ips.is_empty());
    }
}
