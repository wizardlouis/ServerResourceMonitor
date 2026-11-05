# 服务器资源监控器

跨平台本地桌面客户端，通过系统 SSH 实时查看多台 Linux 服务器的 CPU、内存、GPU 和进程。支持服务器横组 / 竖组、简略面板、多 GPU 合并、自定义组名及键盘排序。

## 下载

在 [GitHub Releases](https://github.com/wizardlouis/ServerResourceMonitor/releases) 下载 v1.0.2：

| 系统 | 下载 |
|---|---|
| macOS 13+ · Apple Silicon | mac-arm64.dmg 或 zip |
| macOS 13+ · Intel | mac-x64.dmg 或 zip |
| Windows 10/11 · x64 | win-x64.exe |
| Ubuntu 24.04 / 现代 Linux · x64 | linux-x64.AppImage 或 deb |

文件名前缀为 ServerResourceMonitor-1.0.2-。应用未进行商业代码签名或 Apple 公证。Linux AppImage 可能需要 FUSE 兼容组件，deb 适用于 Debian/Ubuntu 系列。暂不提供 Windows/Linux ARM 或 32 位安装包。

## 使用

1. 安装系统 OpenSSH 客户端；客户端无需 Python 或 Node.js。
2. 在本机 SSH 配置中添加 Host 别名。Windows 配置为 `%USERPROFILE%\.ssh\config`，macOS/Linux 为 `~/.ssh/config`。
3. 先用系统终端执行 `ssh 别名`，核对主机指纹，配置公钥或 ssh-agent 免交互认证。
4. 启动应用，添加别名。服务器须为 Linux + Python 3；NVIDIA GPU 指标需要 nvidia-smi。
5. “分组与顺序”可创建/编辑/解散分组。选择列标牌按左右键移动，编辑组内成员时按上下键排序。

每 5 秒独立采集，超时 18 秒；CPU 核心使用率来自约 0.4 秒采样窗口。暂停时正在进行的采集仍可能完成。离线显示最后数据和错误，不计入在线汇总。趋势保留最近 120 次成功采样，退出清空。关闭最后一个窗口即退出并停止 SSH 采集。

## 使用 IP 地址连接

添加栏接受 SSH 别名，也接受 IPv4 地址，例如 `203.0.113.10`（仅为文档示例地址）。应用目前没有独立的用户名、端口或密码输入框；不接受 `用户名@IP` 或 `IP:端口` 写法，IPv6 字面地址也不支持。

如需直接在应用中填写 IPv4，可在本机 OpenSSH 配置中指定对应账号与端口：

```sshconfig
Host 203.0.113.10
    HostName 203.0.113.10
    User your_username
    Port 22
```

先在终端运行 `ssh 203.0.113.10`，核对主机指纹并配置公钥 / ssh-agent 免交互登录，再把该 IP 添加到应用。未指定 SSH 用户时沿用系统 SSH 默认用户；仅有 IP 和密码不能直接在应用内完成连接。

新用户首次启动为空列表，发布包不预置作者的服务器别名、IP、SSH 配置或凭据。macOS 若存在本机旧版配置，会导入该用户自己的服务器与分组。

## 升级与配置

macOS 首次启动新版会导入 `~/Library/Application Support/ServerResourceMonitor/servers.json` 中的服务器与分组，不覆盖旧文件。核心粒度与顶部折叠初始为默认值，新版设置后独立保存。

新版配置目录：macOS 为 `~/Library/Application Support/ServerResourceMonitorDesktop/`，Windows 为 `%APPDATA%\ServerResourceMonitorDesktop\`，Linux 为 `~/.config/ServerResourceMonitorDesktop/`（遵循 XDG_CONFIG_HOME）。配置损坏时保留原文件并显示错误，修复后重启。

发布包不含个人服务器列表、SSH 配置或凭据。应用只读取系统 OpenSSH 配置，不存储密码；采集脚本通过标准输入发送，不在服务器安装服务。

## 开发与验证

Node.js 24、pnpm 11.25.0：

```sh
pnpm install --frozen-lockfile --dangerously-allow-all-builds
pnpm test
pnpm smoke
pnpm start
pnpm dist
```

Linux 无显示器的 CI 环境使用 `xvfb-run -a pnpm smoke`。烟雾测试使用合成数据，不连接个人服务器。GitHub Actions 为四种系统/架构分别测试、打包；只有所有构建成功后，v1.* 标签才发布正式 Release。包内含 Chromium/Electron，因此体积大于旧版 SwiftUI 应用。

`desktop/` 为跨平台客户端；`collector.py` 为只读远程采集器；`native/` 保留 macOS SwiftUI v0.6 客户端；`web/` 和 `server.py` 为历史浏览器版。旧版构建与使用说明见 [native/README-v0.6.md](native/README-v0.6.md)。

详见 [v1.0.2 发布说明](RELEASE_NOTES_1.0.2.md) 中的平台限制和测试范围。

## 正式开发文档

- [v1.0.1 完整功能、架构、平台与发布记录](docs/DEVELOPMENT-v1.0.1.md)
- [原生 Apple Silicon 后续开发记录](docs/NATIVE-DEVELOPMENT.md)

## v1.0.2 跨平台更新

当前跨平台版本为 v1.0.2，新增设置、十六进制核心编号、简略面板、按用户汇总 GPU 进程、多 GPU 合并和横组布局。升级保留现有配置。

- [v1.0.2 发布说明](RELEASE_NOTES_1.0.2.md)
- [v1.0.2 开发记录](docs/DEVELOPMENT-v1.0.2.md)
