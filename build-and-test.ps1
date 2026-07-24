<#
.SYNOPSIS
    本地编译与测试运行 LovelyERes (Tauri + Vue3) 项目的 PowerShell 脚本。

.DESCRIPTION
    本脚本自动化执行以下流程：
    1. 前端类型检查与单元测试 (npm run test / vue-tsc)
    2. 本地编译打包或启动开发测试环境

.PARAMETER Mode
    运行模式:
    - "Build" (默认): 执行完整的前端打包与 Tauri 编译
    - "Dev": 启动开发实时预览模式 (npm run tauri dev)

.PARAMETER SkipTest
    指定该参数可跳过单元测试步骤。

.EXAMPLE
    .\build-and-test.ps1
    执行默认编译打包与测试

.EXAMPLE
    .\build-and-test.ps1 -Mode Dev
    启动开发预览模式

.EXAMPLE
    .\build-and-test.ps1 -SkipTest
    编译打包但跳过单元测试
#>

param (
    [ValidateSet("Build", "Dev")]
    [string]$Mode = "Build",

    [switch]$SkipTest
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param (
        [string]$Message,
        [string]$Color = "Cyan"
    )
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

Write-Log "=== 开始 LovelyERes 本地构建与测试流程 ===" "Green"

# 1. 环境依赖检查
Write-Log "正在检查 Node.js 与 npm 环境..."
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Log "错误: 未找到 npm 环境，请先安装 Node.js！" "Red"
    exit 1
}

# 2. 执行单元测试与类型检查
if (-not $SkipTest) {
    Write-Log "运行单元测试 (npm run test)..." "Yellow"
    try {
        npm run test
        Write-Log "单元测试通过！" "Green"
    } catch {
        Write-Log "单元测试失败，终止构建流程！" "Red"
        exit 1
    }
} else {
    Write-Log "跳过单元测试步骤。" "DarkYellow"
}

# 3. 根据模式选择编译或测试运行
if ($Mode -eq "Build") {
    Write-Log "开始执行生产环境编译打包 (Tauri Build)..." "Yellow"
    try {
        # 执行前端打包校验及 Tauri 编译
        npx tauri build
        Write-Log "编译与打包成功完成！输出文件存放在 src-tauri/target/release 目录下。" "Green"
    } catch {
        Write-Log "编译过程发生错误！" "Red"
        exit 1
    }
} elseif ($Mode -eq "Dev") {
    Write-Log "启动 Tauri 开发运行测试环境 (tauri dev)..." "Yellow"
    try {
        npx tauri dev
    } catch {
        Write-Log "开发环境运行异常中断！" "Red"
        exit 1
    }
}

Write-Log "=== 流程执行完毕 ===" "Green"
