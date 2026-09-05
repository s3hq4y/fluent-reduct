# Fluent Reduct

> A Fluent-style fork of [Mem Reduct](https://github.com/henrypp/memreduct) by Henry++.

Fluent Reduct is a lightweight real-time memory management application for Windows.
It reads memory through the native Win32/NT APIs and frees memory by calling the same
system interfaces as the original Mem Reduct, presented behind a modern, Fluent-inspired
Electron interface.

![Platform](https://img.shields.io/badge/platform-Windows-0078d4)
![Version](https://img.shields.io/badge/version-Alpha--1.0.0-success)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Real-time memory overview** — physical memory, page file and system cache, each shown
  as a ring with usage on the first line and free/total on the second.
- **One-click memory cleanup** — working set, system file cache, standby lists, modified
  lists, registry cache and memory combining, powered by `NtSetSystemInformation`.
- **Default and custom cleanup profiles** — the default profile shows exactly which areas it
  will clean (read-only); a custom profile lets you pick areas freely.
- **Auto cleanup** — trigger automatically above a configurable usage threshold, at a
  configurable interval (both take effect on save).
- **Cleanup log** — a persistent on-screen log of every cleanup (time, result, freed memory,
  before/after usage).
- **Fluent title bar** — native-style minimize / maximize / close controls, including the
  maximize ⇄ restore glyph that follows the actual window state.
- **Theming** — light / dark / system theme with a choice of accent colors.

## Requirements

- Windows 10 / 11 (x64)
- Memory **cleanup** requires administrator privileges (readouts work without elevation)

## Install

Download `fluent-reduct-portable-<version>.exe` from the
[Releases](https://github.com/s3hq4y/fluent-reduct/releases) page and run it. No installation
is required. Right-click and choose **Run as administrator** to enable memory cleanup.

## Building from source

```powershell
git clone https://github.com/s3hq4y/fluent-reduct.git
cd fluent-reduct
npm install
npm run build      # compile main + renderer TypeScript
npm start          # launch the app
npm run dist       # produce the portable executable in release/
```

## Tech stack

- [Electron](https://www.electronjs.org/) + TypeScript
- [koffi](https://github.com/Koromix/koffi) for calling Win32/NT APIs from the main process
- esbuild for bundling the renderer

## License

MIT, inherited from the original Mem Reduct project. All credit for the memory-cleaning
techniques goes to Henry++ and the Mem Reduct contributors.
