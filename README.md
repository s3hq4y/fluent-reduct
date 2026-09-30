# Fluent Reduct

A lightweight real-time memory management application for Windows. It reads memory through
the native Win32/NT APIs and frees it through the same system interfaces other memory
utilities use, presented behind a modern, Fluent-inspired Electron interface.

![Platform](https://img.shields.io/badge/platform-Windows-0078d4)
![Version](https://img.shields.io/badge/version-1.0.0--alpha.2-success)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

## Features

### Memory overview

- **Real-time readouts** of physical memory, page file and system cache, each shown as a
  ring with usage on the first line and free/total on the second.
- **Task Manager-consistent figures**: the cached value is computed as standby list plus
  modified page list, not from the `SystemCache` field, which disagrees with Task Manager
  on modern Windows.
- **Status badge** that turns warning or danger above configurable thresholds.

### Cleanup

- **Nine cleanup areas** — working set, per-process working sets, system file cache,
  modified file cache, modified page list, standby priority-0 list, standby list, memory
  combining and registry cache, driven by `NtSetSystemInformation`.
- **Per-process working set trimming** — an optional area that trims processes one at a
  time rather than in a single system-wide call, so it can protect what matters:
  - the process owning the **foreground window** (evicting what you are looking at costs a
    visible stutter and those pages are faulted straight back in),
  - the **kernel and session infrastructure** (System, Registry, smss, csrss, wininit,
    winlogon, services, lsass, dwm, fontdrvhost),
  - the **audio stack** and **memory compression**, where eviction causes glitches rather
    than savings,
  - and Fluent Reduct itself.
  Processes that refuse access are reported as skipped, not failed: security software
  self-protects its working set by design.
- **Default and custom profiles** — the default profile is read-only and shows exactly
  which areas it will clean; a custom profile lets you pick areas freely.
- **Auto cleanup** — triggers above a configurable usage threshold at a configurable
  interval, both taking effect on save. Optionally also purges the standby list.
- **Honest results** — each area reports its own NTSTATUS, or its own process counts.
  Nothing is reported as freed unless it was. Cleanup that is not elevated says so instead
  of failing silently.

### Interface

- **Floating cleanup ball** — an optional always-on-top companion window:
  - **Double-click cleans without opening the main window**, reporting the freed amount on
    the ball itself.
  - **Single click** opens the main window, deferred by one double-click interval so the
    first half of a double-click does not flash it open.
  - **Drag to move**; drop it near a screen edge and it snaps there, collapsing into a thin
    usage bar that expands again on hover.
- **Cleanup log** — a persistent on-screen record of every run (time, result, freed memory,
  before/after usage).
- **Fluent title bar** — native-style minimize / maximize / close controls, including the
  maximize/restore glyph that follows the actual window state.
- **Theming** — light / dark / system theme with preset accent colors and a custom picker.
- **Localization** — Simplified Chinese, English and Japanese, with an OS-language follow
  mode. The tray menu and window are localized too.
- **Runs from the tray** — closing the window hides it; quit from the tray menu.

### Behaviour

- **Launch at login**, **start minimized** and **always on top** are all optional.
- **Single instance** — launching again focuses the existing window.

## Requirements

- Windows 10 / 11 (x64)
- Memory **cleanup** requires administrator privileges (readouts work without elevation)

## Install

Download either file from the
[Releases](https://github.com/s3hq4y/fluent-reduct/releases) page:

| File | Notes |
| --- | --- |
| `fluent-reduct-setup-<version>.exe` | Installer, per-user, no admin needed |
| `fluent-reduct-portable-<version>.exe` | Portable, run directly |

Both run unelevated. Memory **readings** work as-is; to enable memory **cleanup**, run the
app as administrator.

## Building from source

```powershell
git clone https://github.com/s3hq4y/fluent-reduct.git
cd fluent-reduct
npm install
npm run build      # typecheck, then bundle both processes
npm start          # launch the app
npm run dist       # produce the installer and portable executable in release/
```

Other scripts:

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check both processes without emitting |
| `npm run dev` | Watch both processes and launch Electron |
| `npm run verify:i18n` | Check translation keys, placeholders and markup references |
| `npm run verify:memory` | Cross-check readings against Windows performance counters |
| `npm run test:cleanup` | Run every cleanup area and print the NTSTATUS |
| `npm run clean` | Remove `dist/` and `release/` |

## Architecture

```
src/shared/      types, cleanup catalog, defaults, formatting, i18n - shared by both
src/ui/main/     main process: windows, tray, persistence, native memory API
src/ui/renderer/ main window UI
src/ui/ball/     floating ball window
scripts/         build, dev and verification tooling
```

The renderer is untrusted: `nodeIntegration` is off and `contextIsolation` is on, so it can
only reach the main process through the channel whitelist in `preload.ts`.

Persistence lives in the main process (`electron-store`) rather than the renderer, because
settings such as the language, start-minimized state and floating ball position are needed
before a renderer exists. The renderer loads state over IPC once and writes changes back.

Cleanup orchestration also lives in the main process, which is what lets the floating ball
clean without revealing the main window.

Adding a language is a single file plus one registration, see `src/shared/i18n/translate.ts`.
Adding a cleanup area is a single entry in `src/shared/cleanup.ts`.

## Tech stack

- [Electron](https://www.electronjs.org/) + TypeScript
- [koffi](https://github.com/Koromix/koffi) for calling Win32/NT APIs from the main process
- [electron-store](https://github.com/sindresorhus/electron-store) for persistence
- esbuild for bundling both processes

## Native interfaces used

| Purpose | Interface |
| --- | --- |
| Physical memory | `GlobalMemoryStatusEx` |
| Commit charge | `K32GetPerformanceInfo` |
| Cached memory | `NtQuerySystemInformation(SystemMemoryListInformation)` |
| System-wide cleanup | `NtSetSystemInformation` |
| Privileges | `RtlAdjustPrivilege`, `IsUserAnAdmin` |
| Process enumeration | `CreateToolhelp32Snapshot`, `Process32FirstW` / `Process32NextW` |
| Per-process trimming | `OpenProcess`, `EmptyWorkingSet` |
| Foreground protection | `GetForegroundWindow`, `GetWindowThreadProcessId` |

## Memory-cleaning techniques: what comes from where

The cleanup areas and the underlying system calls are the same ones the long-standing
[Mem Reduct](https://github.com/henrypp/memreduct) project by Henry++ uses, and that project
deserves the credit for pioneering them on Windows. What is different here:

**Reimplemented, not reused.** There is no code from Mem Reduct in this application. The
entire implementation is TypeScript, calling the Win32/NT interfaces directly through koffi
from the Electron main process. The original C project is not built, linked or shipped.

**Added: per-process working set trimming with protection.** Mem Reduct empties every
working set in one system-wide call. This application adds a selective alternative that
walks the process list and trims individually, which is the only way to *not* evict the
process you are actively using. See the feature list above for what it protects and why.

**Added: Task Manager-consistent cached memory.** The `SystemCache` field from
`GetPerformanceInfo` disagrees with Task Manager on modern Windows by roughly 1 GB. This
application computes the cached figure as standby list plus modified page list, which is
Task Manager's own definition, and uses `SystemCache` only as a fallback.

**Changed: cleanup ordering is fixed rather than user-ordered.** Emptying working sets and
flushing modified pages both push pages onto the standby list, so the standby list is
always purged last to reclaim those pushed pages in the same run.

**Changed: results are reported per area.** Every area returns its own status, and the
freed figure is the difference in available physical memory measured after the kernel has
settled. Areas that cannot run report why, rather than reporting a generic success.

## License

Licensed under the **GNU General Public License v3.0 or later** (GPL-3.0-or-later), the same
license as the original Mem Reduct project. See the [LICENSE](LICENSE) file for the full text.
