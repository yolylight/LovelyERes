//! 内置纯静态 ELF 二进制资源（基于 Alpine musl 静态编译，无 glibc 或任何动态链接依赖）

pub const BUSYBOX_X86_64: &[u8] = include_bytes!("../resources/bin/busybox-x86_64");
pub const BUSYBOX_AARCH64: &[u8] = include_bytes!("../resources/bin/busybox-aarch64");
