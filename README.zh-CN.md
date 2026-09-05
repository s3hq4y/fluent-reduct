# Fluent Reduct（流畅内存清理）

> 本项目是 Henry++ 开发的 [Mem Reduct](https://github.com/henrypp/memreduct) 的一个分支（fork）。

Fluent Reduct 是一款轻量级的 Windows 实时内存管理工具。它通过原生 Win32/NT 接口读取内存
数据，并调用与原版 Mem Reduct 相同的系统接口释放内存，界面则采用现代的 Fluent 风格 Electron 实现。

![平台](https://img.shields.io/badge/platform-Windows-0078d4)
![版本](https://img.shields.io/badge/version-Alpha--1.0.0-success)
![许可证](https://img.shields.io/badge/license-MIT-green)

[English](README.md) | 简体中文

## 功能特性

- **实时内存概览** —— 物理内存、页面文件、系统缓存均以圆环显示：第一行为使用率，第二行为「可用/总计」。
- **一键清理内存** —— 工作集、系统文件缓存、待机列表、修改页面列表、注册表缓存、合并内存，均基于 `NtSetSystemInformation`。
- **默认 / 自定义两种清理方案** —— 默认方案只读地展示它将清理哪些元素；自定义方案可自由勾选。
- **自动清理** —— 当使用率超过可配置阈值、并达到可配置间隔时自动触发（保存即生效）。
- **清理日志** —— 在界面上持久化记录每次清理（时间、结果、释放内存、清理前后使用率）。
- **Fluent 标题栏** —— 贴近 Windows 原生的最小化 / 最大化 / 关闭控件，中间按钮会随窗口最大化状态在「最大化 ⇄ 还原」字形间切换。
- **主题** —— 亮色 / 暗色 / 跟随系统，并提供多种主题色。

## 运行要求

- Windows 10 / 11（x64）
- **清理内存**需要管理员权限（仅查看内存读数不需要）

## 安装

从 [Releases](https://github.com/s3hq4y/fluent-reduct/releases) 页面下载
`fluent-reduct-portable-<版本>.exe` 即可直接运行，无需安装。如需清理内存，请右键选择
**以管理员身份运行**。

## 从源码构建

```powershell
git clone https://github.com/s3hq4y/fluent-reduct.git
cd fluent-reduct
npm install
npm run build      # 编译主进程 + 渲染进程 TypeScript
npm start          # 启动应用
npm run dist       # 在 release/ 目录生成便携版可执行文件
```

## 技术栈

- [Electron](https://www.electronjs.org/) + TypeScript
- [koffi](https://github.com/Koromix/koffi)：在主进程中调用 Win32/NT 接口
- esbuild：打包渲染进程

## 许可证

MIT，继承自原版 Mem Reduct。内存清理相关技术的全部功劳归于 Henry++ 及 Mem Reduct 贡献者。
