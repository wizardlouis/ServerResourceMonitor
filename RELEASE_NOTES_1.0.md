# v1.0.0 跨平台桌面版

基于 v0.6.0 的监控功能推出统一的跨平台桌面客户端。原 SwiftUI 客户端源码和 v0.6.0 下载仍保留。

## 下载选择

| 系统 | 架构 | 文件 |
|---|---|---|
| macOS 13 及以上 | Apple Silicon | mac-arm64.dmg / zip |
| macOS 13 及以上 | Intel | mac-x64.dmg / zip |
| Windows 10 / 11 | x64 | win-x64.exe |
| Ubuntu 24.04、兼容的现代 Linux 桌面 | x64 | linux-x64.AppImage / deb |

完整文件名以 ServerResourceMonitor-1.0.0- 开头。Windows ARM、Linux ARM、32 位系统、移动系统不在此次发布范围。

## 功能

- CPU/内存、逻辑核心灯阵；1/2/4/8/16 核心聚合，缺失采样灰色。
- 每行两张 GPU 卡片、型号简称、标题总显存、利用率/显存百分比、温度与功耗。
- GPU 进程用户、PID、显存及短期 CPU/GPU 趋势。
- 自定义服务器分组、成员移入/移出/解散；同组纵向排列。
- 点击选中标牌后左右移动整列，组内上下排序；边界不移动、点击其他位置取消选择。
- 顶部总览折叠、暂停/恢复采集、立即刷新和独立服务器连接。
- 服务器配置、分组、核心粒度和折叠状态本地保存。

## 使用与升级

客户端不需要另装 Python 或 Node.js。需要系统 OpenSSH 客户端，先在系统终端核对主机指纹并完成公钥/ssh-agent 免交互登录。应用沿用系统 SSH 配置，不保存密码。服务器需为 Linux，安装 Python 3；NVIDIA 指标需要 nvidia-smi。

macOS 首次启动自动导入原生版的服务器及分组，新旧版之后各自保存配置。核心粒度和顶部折叠偏好在新版首次使用时设为默认值；随后独立保存。旧版仍可运行，但建议只开一个版本，避免重复采集。

应用尚无商业代码签名与 Apple 公证；Windows/macOS 可能显示未验证发布者提示。Linux AppImage 可能需要发行版的 FUSE 兼容组件及允许该应用使用用户命名空间的沙箱策略；Ubuntu 24.04 优先使用 .deb。Linux .deb 适用于 Debian/Ubuntu 系列。

## 验证范围

发布流水线在 macOS Intel、macOS Apple Silicon、Windows x64、Ubuntu x64 环境执行配置/SSH 接口自动测试、Electron 界面启动与交互烟雾测试，生成安装包后再验证解包应用启动。macOS Apple Silicon 另进行本机真实 SSH 采集验证。自动测试不能替代每个发行版、每台电脑上的安装和真实 SSH 环境测试；Windows/Linux 未声称完成手工真实服务器测试。
