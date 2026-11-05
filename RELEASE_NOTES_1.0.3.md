# v1.0.3 跨平台桌面版

新增“账号密码连接”：无需预先配置 SSH 别名或公钥，即可填写地址、端口、用户名和密码监控 Linux 服务器。

## 新增与改进

- 在“添加服务器”后新增“账号密码连接”按钮，支持 IPv4、IPv6 和主机名；端口可选，默认 22。
- 连接前验证密码认证和实际采集，成功后才保存连接。服务器卡片提供“连接设置”，可修改地址、账号和密码。
- 可选择“记住密码”：macOS 使用钥匙串保护的加密密钥，Windows 使用 DPAPI，Linux 使用可用的 Secret Service / KWallet。连接配置不含明文密码，密码密文另存于本机；密码不会写入命令参数或日志。
- 不勾选记住密码时仅保留本次运行会话；Linux 缺少安全密码库时强制采用此模式，退出后需重新输入。不会降级为明文密码落盘。
- 首次成功连接记录服务器主机密钥指纹。后续密钥变化会拒绝连接，并暂停自动重试；应核对服务器身份后删除旧连接并重新添加。
- 密码认证失败、凭据不可读取时暂停该连接的自动重试，避免反复提交错误密码。网络暂时中断仍按原周期重试。
- 移除连接时同步清理已保存的密码。已有 SSH 别名方式、分组、显示偏好及 v1.0.2 功能继续保留。

## 下载

| 系统 | 架构 | 安装包 |
|---|---|---|
| macOS 13+ | Apple Silicon / arm64 | `ServerResourceMonitor-1.0.3-mac-arm64.dmg` / `.zip` |
| macOS 13+ | Intel / x64 | `ServerResourceMonitor-1.0.3-mac-x64.dmg` / `.zip` |
| Windows 10 / 11 | x64 | `ServerResourceMonitor-1.0.3-win-x64.exe` |
| Ubuntu 24.04 / 兼容的现代 Linux | x64 | `ServerResourceMonitor-1.0.3-linux-amd64.deb` / `ServerResourceMonitor-1.0.3-linux-x86_64.AppImage` |

另附 `SHA256SUMS.txt`。Windows ARM、Linux ARM、32 位及移动平台不在本次发布范围。

## 使用与兼容

密码连接内置 SSH 客户端，不依赖系统 OpenSSH，也不读取用户的 SSH config；跳板机、ProxyCommand 等高级连接继续使用原有别名方式。密码连接要求服务器启用普通 SSH password 认证，不支持验证码、多因素或 keyboard-interactive 登录。

远端需要 Linux、Python 3；NVIDIA GPU 指标需要 nvidia-smi。客户端不需要额外安装 Node.js 或 Python。原有服务器、分组与显示设置在升级后保留；原生 SwiftUI 版的钥匙串密码不会自动导入跨平台版。

macOS 使用临时签名，未做 Apple 公证；Windows 未商业签名。macOS 更新后系统可能要求重新授权钥匙串，安全存储不可用时可取消“记住密码”继续使用会话模式。Linux AppImage 可能需要 FUSE 和兼容的用户命名空间策略，Ubuntu 24.04 优先使用 deb。

## 验证范围

四个平台流水线执行数据/配置测试、真实本地 SSH 协议测试、界面交互、安装包构建及解包应用启动检查。密码协议测试使用各 runner 上隔离的临时 SSH 服务，验证正确/错误密码、自定义端口、重复采集、主机密钥变化、超时及取消；界面测试覆盖失败不添加、成功添加、修改入口和移除。凭据文件测试使用测试加密适配器检查密文持久化、会话模式、删除与文件损坏保护；界面测试还会在系统安全存储可用时进行实际加密保存、重新读取和删除检查，不可用时明确记录仅会话模式。以上不等于所有桌面钥匙串后端的人工验收。

macOS Apple Silicon 另完成真实 Linux 服务器密码登录与连续采集验证。Windows/Linux 尚未在用户真实服务器及所有桌面密码库上进行人工验收；自动化检查通过不代表所有系统环境均已覆盖。
