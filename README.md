# 服务器资源监控器

跨平台本地桌面客户端，通过系统 SSH 实时查看多台 Linux 服务器的 CPU、内存、GPU 和进程。支持按规模将多台服务器合成一列，自定义组名及键盘排序。

## 下载

在 [GitHub Releases](https://github.com/wizardlouis/ServerResourceMonitor/releases) 下载 v1.0.0：

| 系统 | 下载 |
|---|---|
| macOS 13+ · Apple Silicon | mac-arm64.dmg 或 zip |
| macOS 13+ · Intel | mac-x64.dmg 或 zip |
| Windows 10/11 · x64 | win-x64.exe |
| Ubuntu 24.04 / 现代 Linux · x64 | linux-x64.AppImage 或 deb |

文件名前缀为 ServerResourceMonitor-1.0.0-。应用未进行商业代码签名或 Apple 公证。Linux AppImage 可能需要 FUSE 兼容组件，deb 适用于 Debian/Ubuntu 系列。暂不提供 Windows/Linux ARM 或 32 位安装包。

## 使用

1. 安装系统 OpenSSH 客户端；客户端无需 Python 或 Node.js。
2. 在本机 SSH 配置中添加 Host 别名。Windows 配置为 `%USERPROFILE%\.ssh\config`，macOS/Linux 为 `~/.ssh/config`。
3. 先用系统终端执行 `ssh 别名`，核对主机指纹，配置公钥或 ssh-agent 免交互认证。
4. 启动应用，添加别名。服务器须为 Linux + Python 3；NVIDIA GPU 指标需要 nvidia-smi。
5. “分组与顺序”可创建/编辑/解散分组。选择列标牌按左右键移动，编辑组内成员时按上下键排序。

每 5 秒独立采集，超时 18 秒；CPU 核心使用率来自约 0.4 秒采样窗口。暂停时正在进行的采集仍可能完成。离线显示最后数据和错误，不计入在线汇总。趋势保留最近 120 次成功采样，退出清空。关闭最后一个窗口即退出并停止 SSH 采集。

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

详见 [1.0 发布说明](RELEASE_NOTES_1.0.md) 中的平台限制和测试范围。
