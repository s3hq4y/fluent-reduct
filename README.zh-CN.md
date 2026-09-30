# Fluent Reduct（流畅内存清理）

一款轻量级的 Windows 实时内存管理工具。通过原生 Win32/NT 接口读取内存，并调用与其他内存
工具相同的系统接口释放内存，界面采用现代的 Fluent 风格 Electron 实现。

![平台](https://img.shields.io/badge/platform-Windows-0078d4)
![版本](https://img.shields.io/badge/version-1.0.0--alpha.2-success)
![许可证](https://img.shields.io/badge/license-GPL--3.0-blue)

[English](README.md) | 简体中文

## 功能特性

### 内存概览

- **实时读数** —— 物理内存、页面文件、系统缓存均以圆环显示：第一行为使用率，第二行为「可用/总计」。
- **与任务管理器口径一致** —— 「已缓存」按「待机列表 + 修改页列表」计算，而非采用
  `SystemCache` 字段（该字段在现代 Windows 上与任务管理器不符）。
- **状态徽章** —— 超过可配置阈值时转为警告 / 危险。

### 内存清理

- **九个清理区域** —— 工作集、逐进程工作集、系统文件缓存、修改文件缓存、修改页面列表、
  待机优先级0列表、待机列表、合并内存、注册表缓存，均基于 `NtSetSystemInformation`。
- **逐进程工作集裁剪** —— 可选区域，逐个进程裁剪而非一次全局调用，因此能保护关键进程：
  - 拥有**前台窗口**的进程（裁掉眼前正在用的页面只会造成可见卡顿，且随即被换回内存）；
  - **内核与会话基础设施**（System、Registry、smss、csrss、wininit、winlogon、services、
    lsass、dwm、fontdrvhost）；
  - **音频栈**与**内存压缩**（换出它们只会造成故障，而非收益）；
  - 以及 Fluent Reduct 自身。
  拒绝访问的进程计为「跳过」而非「失败」：安全软件保护自身工作集属于设计使然。
- **默认 / 自定义方案** —— 默认方案只读展示将清理哪些区域；自定义方案可自由勾选。
- **自动清理** —— 使用率超过可配置阈值且达到可配置间隔时触发，保存即生效；可选一并清理待机列表。
- **结果如实上报** —— 每个区域返回自己的 NTSTATUS，或自己的进程计数；未释放就不会报告为已释放；
  未提权时明确说明，而非静默失败。

### 界面

- **清理悬浮球** —— 可选的置顶伴随窗口：
  - **双击清理，不打开主窗口**，释放量直接显示在球上；
  - **单击**打开主窗口，延迟一个双击间隔判定，避免双击的第一下把窗口闪出来；
  - **拖拽移动**，靠近屏幕边缘松手即吸附，收成占用率细条，悬停展开。
- **清理日志** —— 在界面上持久化记录每次清理（时间、结果、释放内存、清理前后使用率）。
- **Fluent 标题栏** —— 贴近 Windows 原生的最小化 / 最大化 / 关闭控件，中间按钮随窗口最大化状态切换字形。
- **主题** —— 亮色 / 暗色 / 跟随系统，提供预设主题色与自定义取色。
- **多语言** —— 简体中文、English、日本語，支持跟随系统语言；托盘菜单与窗口同样本地化。
- **驻留托盘** —— 关闭窗口只是隐藏，从托盘菜单退出。

### 行为

- **开机自启动**、**启动时最小化**、**始终置顶**均为可选。
- **单实例** —— 重复启动会聚焦已有窗口。

## 运行要求

- Windows 10 / 11（x64）
- **清理内存**需要管理员权限（仅查看读数不需要）

## 安装

从 [Releases](https://github.com/s3hq4y/fluent-reduct/releases) 页面下载任一文件：

| 文件 | 说明 |
| --- | --- |
| `fluent-reduct-setup-<版本>.exe` | 安装版，per-user，无需管理员 |
| `fluent-reduct-portable-<版本>.exe` | 便携版，直接运行 |

两者均以普通权限启动，**读数**开箱可用；如需**清理内存**，请以管理员身份运行。

## 从源码构建

```powershell
git clone https://github.com/s3hq4y/fluent-reduct.git
cd fluent-reduct
npm install
npm run build      # 类型检查，然后打包两个进程
npm start          # 启动应用
npm run dist       # 在 release/ 生成安装版与便携版
```

其他脚本：

| 脚本 | 用途 |
| --- | --- |
| `npm run typecheck` | 对两个进程做类型检查，不产出文件 |
| `npm run dev` | 监听两个进程并启动 Electron |
| `npm run verify:i18n` | 校验语言键、占位符与标记引用 |
| `npm run verify:memory` | 与 Windows 性能计数器交叉比对读数 |
| `npm run test:cleanup` | 逐个执行清理区域并打印 NTSTATUS |
| `npm run clean` | 删除 `dist/` 与 `release/` |

## 项目结构

```
src/shared/     类型、清理区域目录、默认值、格式化、i18n —— 两个进程共用
src/ui/main/    主进程：窗口、托盘、持久化、原生内存接口
src/ui/renderer/主窗口界面
src/ui/ball/    悬浮球窗口
scripts/        构建、开发与校验工具
```

渲染进程不被信任：`nodeIntegration` 关闭、`contextIsolation` 打开，只能通过
`preload.ts` 中白名单化的通道访问主进程。

持久化放在主进程（`electron-store`）而非渲染进程，因为语言、启动时最小化、悬浮球位置
等设置必须在渲染进程创建之前就已确定。渲染进程通过 IPC 一次性载入，改动再写回。

清理编排同样位于主进程——这正是悬浮球能够在不打开主窗口的情况下完成清理的原因。

新增一门语言只需加一个文件并注册一次，见 `src/shared/i18n/translate.ts`；
新增一个清理区域只需在 `src/shared/cleanup.ts` 中加一条。

## 技术栈

- [Electron](https://www.electronjs.org/) + TypeScript
- [koffi](https://github.com/Koromix/koffi)：在主进程中调用 Win32/NT 接口
- [electron-store](https://github.com/sindresorhus/electron-store)：持久化设置
- esbuild：打包两个进程

## 使用的原生接口

| 用途 | 接口 |
| --- | --- |
| 物理内存 | `GlobalMemoryStatusEx` |
| 提交量 | `K32GetPerformanceInfo` |
| 已缓存 | `NtQuerySystemInformation(SystemMemoryListInformation)` |
| 全局清理 | `NtSetSystemInformation` |
| 权限 | `RtlAdjustPrivilege`、`IsUserAnAdmin` |
| 进程枚举 | `CreateToolhelp32Snapshot`、`Process32FirstW` / `Process32NextW` |
| 逐进程裁剪 | `OpenProcess`、`EmptyWorkingSet` |
| 前台保护 | `GetForegroundWindow`、`GetWindowThreadProcessId` |

## 内存清理技术：来源与改动

清理区域与底层系统调用，与长期维护的 [Mem Reduct](https://github.com/henrypp/memreduct)
（作者 Henry++）所使用的是同一批，该项目在 Windows 上开创这些用法的功劳应当归于它。
与本项目不同的地方在于：

**重新实现，而非复用代码。** 本应用不含任何来自 Mem Reduct 的代码，全部实现为
TypeScript，在 Electron 主进程中通过 koffi 直接调用 Win32/NT 接口。原 C 项目不参与构建、
链接或分发。

**新增：带保护的逐进程工作集裁剪。** Mem Reduct 以一次全局调用清空所有工作集；本应用
新增了一个可选的精细版本，遍历进程逐个裁剪——这是唯一能「不裁掉你正在使用的进程」的做法。
保护范围见上方功能列表。

**新增：与任务管理器口径一致的已缓存内存。** `GetPerformanceInfo` 的 `SystemCache` 字段
在现代 Windows 上与任务管理器相差约 1 GB。本应用按「待机列表 + 修改页列表」计算缓存值，
即任务管理器自身的定义，仅在失败时回退到 `SystemCache`。

**改动：清理顺序固定，不交由用户排序。** 清空工作集与刷新修改页都会把页面推进待机列表，
因此待机列表始终最后清理，以便在同一次运行中回收这些被推入的页面。

**改动：结果按区域分别上报。** 每个区域返回自己的状态；释放量取内核完成回收后
可用物理内存的差值。无法执行的区域会说明原因，而不是笼统地报成功。

## 许可证

基于 **GNU 通用公共许可证 v3.0 或更高版本**（GPL-3.0-or-later）授权，与原版 Mem Reduct 相同。
完整协议文本见 [LICENSE](LICENSE) 文件。
