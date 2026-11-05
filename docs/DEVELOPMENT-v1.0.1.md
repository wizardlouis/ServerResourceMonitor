# 服务器资源监控器 v1.0.1 正式开发文档

记录日期：2026-10-29。本文固定描述已发布的 v1.0.1，不把后续原生版开发混入正式版本功能。

## 发布基线与版本关系

- 仓库：https://github.com/wizardlouis/ServerResourceMonitor（私有）。
- 正式发布：https://github.com/wizardlouis/ServerResourceMonitor/releases/tag/v1.0.1。
- 标签：`v1.0.1`；提交：`18da2a0a6160d4e585c09bc9672b06544dc80780`。
- v1.0.1 是 Electron 跨平台客户端。v1.0.0 在验证阶段未正式发布；v1.0.1 修复分组窗口快速重新打开时的关闭事件竞争。
- `native/` 是独立的 SwiftUI 原生客户端，已发布基线 v0.6.0，仅 Apple Silicon。两套界面共享远程采集脚本，并非同一程序的不同安装包。
- 本机当前后续开发以原生客户端为对象。原生 v0.6.1 的 CPU 编号进制设置不属于跨平台 v1.0.1。

## 操作系统与应用包汇总

所有下列文件已上传正式 Release，另有 `SHA256SUMS.txt`。

| 客户端系统 | 架构 | v1.0.1 文件 |
|---|---|---|
| macOS 13+ | Apple Silicon / arm64 | `ServerResourceMonitor-1.0.1-mac-arm64.dmg`、`ServerResourceMonitor-1.0.1-mac-arm64.zip` |
| macOS 13+ | Intel / x64 | `ServerResourceMonitor-1.0.1-mac-x64.dmg`、`ServerResourceMonitor-1.0.1-mac-x64.zip` |
| Windows 10/11 | x64 | `ServerResourceMonitor-1.0.1-win-x64.exe` |
| Ubuntu 24.04、兼容的现代 Linux | x64 | `ServerResourceMonitor-1.0.1-linux-amd64.deb`、`ServerResourceMonitor-1.0.1-linux-x86_64.AppImage` |

Windows 为可选择安装目录的用户级 NSIS 安装包；卸载保留用户配置。macOS 使用临时签名，未做 Apple 公证；Windows 无商业签名。首次运行可能提示未验证发布者。Linux deb 面向 Debian/Ubuntu 系列；AppImage 可能需要 FUSE 及兼容的用户命名空间沙箱策略。Ubuntu 24.04 优先使用 deb。未发布 Windows ARM、Linux ARM、32 位或移动客户端，未承诺所有 Linux 发行版均兼容。

## 功能清单

### 服务器管理与采集

- 以本机 SSH Host 别名添加、移除服务器，最多 16 台；新安装为空列表，不预置个人服务器。
- 每台独立每 5 秒采集，单次超时 18 秒，慢服务器不阻塞其他服务器。
- 暂停、继续、立即刷新；暂停前已经发出的请求仍可能完成。关闭最后窗口退出并终止 SSH 子进程。
- 展示连接状态、错误与最后采样；离线保留旧数据但不计入在线总览。
- 顶部显示在线服务器、在线 GPU、可用显存合计及逻辑 CPU 总数；可折叠并保存偏好。合计显存分散于不同卡，不能视为单卡容量。

### CPU、内存与趋势

- CPU 使用率、逻辑核心数量、系统负载；内存使用率及已用/总量 GiB。
- CPU 逻辑核心按数字编号排序，灯阵从绿经黄到红表示 0–100% 占用，无有效采样为灰色。
- 每台独立选择 1/2/4/8/16 核聚合；算术平均、末组按实际数量、任一成员缺失则整组未知；悬停显示明细。
- v1.0.1 核心编号仅十进制。CPU 核心不是 GPU CUDA 核心。
- `/proc/stat` 约 0.4 秒的两次采样差值，不代表整个 5 秒刷新周期的平均值。
- CPU 与 GPU 平均占用短期趋势，保留最近 120 次成功采样，退出清空。

### GPU 与进程

- 每行两张 GPU 卡片；利用率、已用显存与占比、温度、功耗。
- 标题为型号简称及独立显示的总显存 GiB，悬停可看原始名称；下方简化为“显存占用”。缺失总量显示未知。
- 去掉 NVIDIA、GeForce、Tesla 等品牌前缀，保留 Ti、SUPER、D、Ada 等型号差异；A100/H100/H200/V100 简化接口与容量后缀，未知型号保守保留。
- GPU 计算进程展示用户、PID、名称及显存。通过 `/proc/PID/status` 的有效 UID 解析用户；无法解析账号时回退 UID，权限不足或进程退出时未知。

### 布局与分组

- 多列横向浏览，卡片纵向滚动；同组多台服务器从上往下排列，保留各自完整监控卡片。
- 创建、命名、编辑、解散分组；成员可转移、移出，移出恢复独立列，解散不删除服务器。
- 点击列标牌后左右方向键每次移动一列；组内成员上下方向键逐项排序。到边界不动，点其他位置取消选择，输入框编辑不触发排序。
- 分组表单保存后生效，取消保留旧布局；采集更新不会覆盖未保存草稿。
- 列 ID 稳定；无效、重复成员自动整理，服务器仅出现一次；保存失败回退状态。

## 架构与代码入口

| 文件 | 责任 |
|---|---|
| `desktop/main.cjs` | Electron 生命周期、单实例、IPC、采集调度、历史、退出清理、验证入口 |
| `desktop/preload.cjs` | 隔离上下文中的受限界面桥接 |
| `desktop/model.cjs` | 配置规范化、服务器及分组操作、排序与偏好 |
| `desktop/store.cjs` | 配置导入、原子持久化、损坏保护 |
| `desktop/collector.cjs` | 无 shell 的 SSH 子进程、输出限制、超时、返回数据校验 |
| `desktop/index.html`、`style.css`、`renderer.js`、`ui-utils.js` | 深色中文界面、交互、图表、名称与核心格式化 |
| `collector.py` | Linux 只读采集，标准输入下发，调用 nvidia-smi 与读取 proc |
| `test/` | 模型与采集接口测试、合成数据、界面烟雾测试 |
| `native/` | 独立 SwiftUI 原生版本、构建脚本与单元检查 |
| `web/`、`server.py` | 历史浏览器版，不是当前跨平台应用运行依赖 |

Electron 45.1.0，electron-builder 26.18.0，Node.js 24，pnpm 11.25.0；依赖由 `pnpm-lock.yaml` 固定。客户端打包运行时，无需用户另装 Node.js 或 Python。

## 连接、配置与安全边界

客户端须安装系统 OpenSSH，先在终端核对主机指纹并完成公钥或 ssh-agent 免交互登录。macOS/Linux 使用 `~/.ssh/config`，Windows 使用 `%USERPROFILE%\.ssh\config`。SSH 启用批处理与严格主机密钥检查，不经过 shell，不保存密码或复制私钥。界面启用上下文隔离、沙箱与 CSP，禁止外部导航、新窗口及权限请求。

远端须为 Linux + Python 3；NVIDIA 指标需要 nvidia-smi。无需远端常驻服务、提权或修改训练任务。尚不支持 Windows/macOS 远端与 AMD/Intel GPU 指标。

新版持久配置文件为以下目录的 `config.json`：

| 系统 | 目录 |
|---|---|
| macOS | `~/Library/Application Support/ServerResourceMonitorDesktop/` |
| Windows | `%APPDATA%\ServerResourceMonitorDesktop\` |
| Linux | `~/.config/ServerResourceMonitorDesktop/`，遵循 XDG_CONFIG_HOME |

保存服务器、分组、核心粒度与总览折叠。损坏文件保留并显示错误，阻止覆盖，修复后重启。macOS 首次启动从原生版 `~/Library/Application Support/ServerResourceMonitor/servers.json` 导入服务器和分组，之后独立保存，不改旧配置。核心粒度、总览折叠首次使用默认值，随后自行保存。

发布包不含个人服务器列表、SSH 配置或凭据。暂无告警、开机启动、长期历史数据库或自动更新功能。

## 构建与发布

```sh
pnpm install --frozen-lockfile --dangerously-allow-all-builds
pnpm test
pnpm smoke
pnpm start
pnpm dist
```

`.github/workflows/desktop.yml` 在 main 推送和 v1.* 标签触发四个平台构建。执行单元检查、界面烟雾检查、打包后启动检查；macOS 额外检查签名。Linux 无显示器 CI 使用 Xvfb，并仅在临时 runner 配置 Chromium 沙箱辅助程序。四个构建全部成功后，标签流水线创建草稿、上传 7 个应用包与 SHA-256 文件，再公开为正式 Release（仓库权限不变）。`publish-existing.yml` 可校验标签提交和成功构建后恢复发布，避免重复构建。

发布基线验证流水线：https://github.com/wizardlouis/ServerResourceMonitor/actions/runs/40839416139，四平台构建及发布全部成功。

## 已验证范围与限制

- 配置兼容、成员唯一性、组编辑、排序边界、偏好保存、损坏保护及失败回退。
- SSH 参数、非法别名、认证错误、无效 JSON、找不到 SSH 与超时。
- GPU 名称区别、CPU 平均、缺失值、尾组。
- 合成界面检查分组排列、键盘排序、取消编辑、草稿保留、快速重开、核心粒度、总览折叠、暂停恢复及渲染进程隔离。
- 四个平台解包程序启动通过；Mac Apple Silicon 另完成真实 SSH 采集验证。
- Windows/Linux 未完成手工真实服务器连接及所有安装环境测试，CI 通过不等同于所有用户机器兼容。
