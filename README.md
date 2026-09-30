# Fluent Reduct

> A Fluent-style fork of [Mem Reduct](https://github.com/henrypp/memreduct) by Henry++.

Fluent Reduct is a lightweight real-time memory management application for Windows.
It reads memory through the native Win32/NT APIs and frees memory by calling the same
system interfaces as the original Mem Reduct, presented behind a modern, Fluent-inspired
Electron interface.

![Platform](https://img.shields.io/badge/platform-Windows-0078d4)
![Version](https://img.shields.io/badge/version-1.0.0--alpha.1-success)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

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
- **Localization** — Simplified Chinese, English and Japanese, with an OS-language
  follow mode; the tray menu and window are localized by the main process.
- **Runs from the tray** — closing the window hides it; quit from the tray menu.

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
npm run build      # typecheck, then bundle main + renderer
npm start          # launch the app
npm run dist       # produce the portable executable in release/
```

Other scripts:

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check both processes without emitting |
| `npm run dev` | Watch both processes and launch Electron |
| `npm run verify:i18n` | Check translation keys and placeholders across locales |
| `npm run verify:memory` | Cross-check readings against Windows performance counters |
| `npm run test:cleanup` | Run every cleanup area and print the NTSTATUS |
| `npm run clean` | Remove `dist/` and `release/` |

## Architecture

```
src/shared/     types, cleanup catalog, defaults, i18n - imported by both processes
src/ui/main/    Electron main process: window/tray, persistence, native memory API
src/ui/renderer/Electron renderer: UI, polling, cleanup log
scripts/        build, dev and verification tooling
```

The renderer is untrusted: `nodeIntegration` is off and `contextIsolation` is on, so it can
only reach the main process through the channel whitelist in `preload.ts`. Every setting is
persisted by the main process (`electron-store`), because settings such as the language and
start-minimized state are needed before the renderer exists.

Adding a language is a single file plus one registration; see
`src/shared/i18n/translate.ts`. Adding a cleanup area is a single entry in
`src/shared/cleanup.ts`.

## Tech stack

- [Electron](https://www.electronjs.org/) + TypeScript
- [koffi](https://github.com/Koromix/koffi) for calling Win32/NT APIs from the main process
- [electron-store](https://github.com/sindresorhus/electron-store) for persistence
- esbuild for bundling both processes

## License

Licensed under the **GNU General Public License v3.0 or later** (GPL-3.0-or-later), the same
license as the original Mem Reduct project. See the [LICENSE](LICENSE) file for the full text.
All credit for the memory-cleaning techniques goes to Henry++ and the Mem Reduct contributors.
