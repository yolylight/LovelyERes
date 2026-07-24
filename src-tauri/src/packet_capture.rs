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
pub fn generate_list_interfaces_command() -> String {
    "ip -o -4 addr show | awk '{print $2, $4}'".to_string()
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
}
