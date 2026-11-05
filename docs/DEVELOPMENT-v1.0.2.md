# 跨平台 v1.0.2 开发记录

2026-11-05，基于 v1.0.1（18da2a0），将本机原生 v0.6.1–v0.6.4 的新增功能迁移至 Electron 客户端。系统和安装包种类沿用 v1.0.1；原生应用独立版本号保持 v0.6.4。

## 实现

- `desktop/model.cjs`：新增全局 `coreIDRadix`、`serverPanelTheme`、`groupOrientation` 和每服务器 `gpuGrouping`；归一化旧配置，验证 IPC 设置参数，移除服务器时清理对应偏好。
- `desktop/ui-utils.js`：十六进制核心范围、连续 GPU 编号压缩、GPU 聚合、用户进程汇总。显存使用加权总量占比，缺失数据不伪造完整合计。
- `desktop/renderer.js`、`index.html`、`style.css`：设置窗口、简略面板、GPU 菜单、用户汇总表、横组布局及方向提示。排序标牌始终横排。窄卡片下简略 GPU 指标改为逐行排列，避免文字重叠。
- `desktop/main.cjs`：打包启动检查从应用版本读取预期版本，移除硬编码 v1.0.1。
- `test/display.test.cjs`、`test/smoke.cjs`：旧配置升级、持久化与非法参数、聚合口径、缺失数据、设置操作、横组排序和边界检查。
- 发布流水线沿用四平台构建与验证，Release 标题使用标签，采用 v1.0.2 发布说明。应用包不包含个人服务器、SSH 配置或凭据。

## 配置兼容

配置 schema 仍为 version 1，新增字段可缺省。旧服务器、分组、核心粒度、总览折叠保持不变，新功能默认为详细、十进制、竖组、单卡。原生版 UserDefaults 与跨平台版配置继续独立。

## 验证入口

```sh
pnpm test
pnpm smoke
pnpm exec electron-builder --mac --arm64 --publish never
```

GitHub Actions 在四个平台各自执行测试、界面检查、构建及打包启动验证。只有全部成功后才发布正式 Release；实际结果以 v1.0.2 标签对应的 Actions 记录为准。历史 v1.0.1 文档保留，发布内容见 `RELEASE_NOTES_1.0.2.md`。
