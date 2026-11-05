# v1.0.2 跨平台桌面版

将本机 SwiftUI v0.6.1–v0.6.4 的显示与布局功能同步至跨平台客户端。

## 新增功能

- 新增设置窗口：CPU 核心编号支持十进制 / 十六进制；悬停与辅助朗读保留十进制实际编号。
- 服务器面板支持详细 / 简略。简略模式精简说明和核心编号，CPU、内存和 GPU 标签与数值同行，隐藏温度及功耗。
- 简略模式按用户汇总 GPU 计算进程，显示实际 GPU 编号及显存合计 MiB；连续至少三个编号压缩为范围。数据缺失明确标注，不当作完整合计。
- 每台服务器可独立选择单卡 / 2 / 4 / 8 卡合并。利用率取平均，显存按已用总量 / 总容量计算，温度取最高值，功耗求和；缺失指标保留未知。
- 支持竖组（每组一列）和横组（每组一行、成员并排）。两种模式排序标牌均左右排列；横组标牌从左到右对应各组从上到下，左键上移、右键下移。
- 显示偏好及 GPU 合并档位自动保存；已有 v1.0.1 服务器、分组、核心粒度和总览折叠设置继续保留。

## 下载

| 系统 | 架构 | 安装包 |
|---|---|---|
| macOS 13+ | Apple Silicon / arm64 | `ServerResourceMonitor-1.0.2-mac-arm64.dmg` / `.zip` |
| macOS 13+ | Intel / x64 | `ServerResourceMonitor-1.0.2-mac-x64.dmg` / `.zip` |
| Windows 10 / 11 | x64 | `ServerResourceMonitor-1.0.2-win-x64.exe` |
| Ubuntu 24.04 / 兼容的现代 Linux | x64 | `ServerResourceMonitor-1.0.2-linux-amd64.deb` / `ServerResourceMonitor-1.0.2-linux-x86_64.AppImage` |

另附 `SHA256SUMS.txt`。Windows ARM、Linux ARM、32 位及移动平台不在本次发布范围。

## 升级与连接

直接安装对应系统的新版本，沿用跨平台版独立配置目录。新设置默认详细面板、十进制、竖组、单卡；可在设置及各服务器 GPU 菜单中调整。macOS 首次使用跨平台版仍只导入原生版服务器与分组，不导入原生版 UserDefaults 显示偏好。

使用系统 OpenSSH 配置和免交互公钥 / ssh-agent 登录，不保存密码。远端需要 Linux、Python 3；NVIDIA 指标需要 nvidia-smi。客户端无需另装 Python 或 Node.js。

## 验证与限制

发布流水线在 macOS arm64、macOS x64、Windows x64、Linux x64 上执行数据与配置测试、界面交互烟雾测试、安装包构建和解包应用启动检查；macOS 额外检查签名。新增检查覆盖旧配置兼容、设置持久化、十六进制、用户汇总、多卡合并、缺失数据、横组排序和边界。

macOS 使用临时签名，未做 Apple 公证；Windows 未商业签名。系统可能显示未验证发布者提示。Linux AppImage 可能需要 FUSE 及兼容的用户命名空间策略，Ubuntu 24.04 优先使用 deb。自动化验证不等于所有用户机器、所有 Linux 发行版或 Windows/Linux 真实 SSH 环境的人工验证。
