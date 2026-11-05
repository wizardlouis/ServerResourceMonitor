# 跨平台 v1.0.3 开发记录

2026-11-05，基于 v1.0.2，为 macOS arm64/x64、Windows x64 和 Linux x64 同步原生 v0.6.5 的账号密码连接能力。

## 实现与边界

- `connections.cjs`：地址、端口、账号验证；IPv6；保存元数据时仅保留白名单字段。
- `password-collector.cjs`：ssh2 1.17.0 内置密码传输，仅尝试 password 认证；远端命令固定为 `python3 -`，采集脚本标准输入下发。连接总超时 18 秒、输出上限 4 MiB、取消销毁连接。首次成功连接保存 SHA-256 主机密钥指纹；后续在发送密码之前核对，变化即拒绝。
- `vault.cjs`：Electron safeStorage 系统保护的密码密文存入独立 credentials.json（新建权限 0600）；连接配置只保存随机凭据引用。Linux 仅允许已识别的系统安全后端，不允许 basic_text。未保存的密码仅保留到退出。配置损坏保留原文件、禁止覆盖。当前固定 Electron 45，使用仍受支持的同步 safeStorage API 以明确检查 Linux backend；将来升级 Electron 46 前需迁移该 API 并重新验证后端安全性。
- `main.cjs`：连接测试后再持久化，失败清理新增凭据，更新成功后清理旧凭据。主进程独占凭据；状态快照不向界面返回密码、密文或凭据引用。认证/主机密钥/凭据错误暂停自动重试。删除连接清理凭据。
- `model.cjs`：新增可缺省 passwordConnections；旧版设置兼容，连接记录在移除服务器时清理。新直接连接内部使用随机 ID，界面展示账号、地址和端口。
- 原 SSH 别名路径仍使用系统 OpenSSH，未改变 SSH config 或公钥行为。直接密码路径不使用 OpenSSH config、跳板机或键盘交互认证。

## 构建和测试

ssh2 使用库自带 JavaScript 路径，禁用可选 native addon 安装/重建以保持四平台一致。pnpm-workspace.yaml 明确只允许 Electron 下载运行时的安装脚本；依赖版本由 lockfile 固定。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm smoke
pnpm exec electron-builder --mac --arm64 --publish never
```

15 项 Node 测试含临时本地 SSH 服务的实际认证/采集、指纹拒绝、超时、取消；凭据文件加密单元测试使用测试适配器；Electron 界面测试在系统安全存储可用时还执行真实加密/重读/删除检查，不可用时明确记录 session-only。本机 macOS 实际安全存储检查通过。界面烟雾测试经 IPC 实际连接临时 SSH 服务，不把协议成功伪装成静态数据回放。打包启动检查加载 ssh2，检查依赖被正确打包。

本机 Apple Silicon 完成真实 Linux 服务器连续两次密码采集，日志只记录成功与 CPU/GPU 数量，不记录密码。四平台实际结果以 v1.0.3 标签对应的 GitHub Actions 为准。尚未声称在所有操作系统版本和桌面密码库上完成真实用户环境人工验收。
