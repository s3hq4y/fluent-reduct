/**
 * Fluent Reduct - English strings.
 *
 * Typed as `Translations`, so a missing or misspelled key is a compile error.
 */

import type { Translations } from '../translate';

export const en: Translations = {
  'app.name': 'Fluent Reduct',
  'app.title': '{name} {version}',

  // Window controls
  'window.minimize': 'Minimize',
  'window.maximize': 'Maximize',
  'window.restore': 'Restore',
  'window.close': 'Close',

  // Tray
  'tray.show': 'Show window',
  'tray.clean': 'Clean memory now',
  'tray.settings': 'Settings',
  'tray.quit': 'Quit',

  // Sections
  'section.memoryStatus': 'System memory status',
  'section.cleanup': 'Memory cleanup',
  'section.logs': 'Cleanup log',

  // Memory cards
  'card.physical': 'Physical Memory',
  'card.pagefile': 'Page File',
  'card.cache': 'System Cache',

  // Status badge / bar
  'status.normal': 'Normal',
  'status.warning': 'Warning',
  'status.danger': 'Critical',
  'status.ready': 'Ready',
  'status.cleaning': 'Cleaning memory...',
  'status.memory': 'Memory: {percent}%',
  'status.memoryDegraded': 'Memory: {percent}% (degraded)',

  // Cleanup profiles
  'mode.default': 'Default',
  'mode.custom': 'Custom',

  // Cleanup areas
  'areaGroup.basic': 'Basic cleanup',
  'areaGroup.advanced': 'Advanced cleanup',
  'areaGroup.extended': 'Extended cleanup',
  'badge.freeze': '⚠️ May freeze',
  'badge.win81': 'Win8.1+',
  'badge.win10': 'Win10+',
  'area.workingset': 'Working Set',
  'area.systemfilecache': 'System File Cache',
  'area.standbypriority0': 'Standby Priority-0',
  'area.modifiedlist': 'Modified Page List',
  'area.standbylist': 'Standby List',
  'area.modifiedfilecache': 'Modified File Cache',
  'area.registrycache': 'Registry Cache',
  'area.combinememory': 'Combine Memory',

  // Buttons
  'btn.clean': 'Clean memory now',
  'btn.settings': 'Settings',
  'btn.clearLogs': 'Clear log',
  'btn.save': 'Save',
  'btn.cancel': 'Cancel',
  'btn.ok': 'OK',
  'btn.reset': 'Reset all settings',

  // Cleanup log
  'logs.empty': 'No cleanup history yet',
  'log.status.success': 'Cleanup complete',
  'log.status.partial': 'Partially complete',
  'log.status.failed': 'Cleanup failed',
  'log.auto': 'Auto',
  'log.line': '{status}{auto} · {areas} · {seconds}',
  'log.detail.areas': '{count} areas',
  'log.detail.seconds': '{seconds} s',
  'log.detail.failCount': '{count} failed',
  'log.percent': '{before}% → {after}%',

  // Progress dialog
  'progress.title': 'Cleaning memory...',
  'progress.preparing': 'Preparing...',
  'progress.done': 'Cleanup complete',
  'progress.item': 'Cleaning {label}... ({index}/{total})',

  // Settings dialog
  'settings.title': 'Settings',
  'tab.appearance': 'Appearance',
  'tab.memory': 'Memory',
  'tab.general': 'General',
  'tab.advanced': 'Advanced',
  'settings.group.theme': 'Theme',
  'settings.group.accent': 'Accent color',
  'settings.group.autoClean': 'Auto cleanup',
  'settings.group.options': 'Options',
  'settings.group.startup': 'Startup',
  'settings.group.language': 'Language',
  'settings.group.advanced': 'Advanced options',
  'settings.group.data': 'Data',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'accent.default': 'Default blue',
  'accent.indigo': 'Indigo',
  'accent.deepBlue': 'Deep blue',
  'accent.teal': 'Teal',
  'accent.green': 'Green',
  'accent.orange': 'Orange',
  'accent.red': 'Red',
  'accent.pink': 'Pink',
  'accent.purple': 'Purple',
  'accent.grey': 'Grey',
  'settings.customColor': 'Custom color:',
  'settings.autoClean.enable': 'Enable auto cleanup',
  'settings.autoClean.threshold': 'Usage threshold:',
  'settings.autoClean.interval': 'Cleanup interval:',
  'settings.unit.percent': '%',
  'settings.unit.minutes': 'min',
  'settings.confirmClean': 'Confirm before cleanup',
  'settings.showResult': 'Show cleanup result',
  'settings.logResults': 'Record cleanup log',
  'settings.alwaysOnTop': 'Always on top',
  'settings.launchAtLogin': 'Launch at login',
  'settings.startMinimized': 'Start minimized',

  // Toasts
  'toast.hint': 'Notice',
  'toast.settingsSaved.title': 'Settings saved',
  'toast.settingsSaved.message': 'Your settings have been saved',
  'toast.cleanDone.title': 'Cleanup complete',
  'toast.cleanDone.message': 'Freed {freed} of physical memory in {seconds} s',
  'toast.cleanFailed.title': 'Cleanup failed',
  'toast.cleanFailed.noAdmin': 'Run as administrator to clean memory',
  'toast.cleanPartial.title': 'Some areas failed',
  'toast.cleanPartial.message': 'Freed {freed}; {count} failed: {details}',
  'toast.selectArea': 'Select at least one cleanup area',
  'toast.dataIncomplete.title': 'Incomplete memory data',
  'toast.dataIncomplete.message': 'Windows native interfaces are unavailable; some values are missing',
  'toast.nativeUnavailable.title': 'Native interface unavailable',
  'toast.nativeUnavailable.message': 'The memory API could not be loaded; readings and cleanup are limited',
  'toast.notElevated.title': 'Not running as administrator',
  'toast.notElevated.message': 'Readings work, but cleanup requires administrator privileges',

  // Confirmation prompts
  'confirm.clean': 'Clean memory now?',
  'confirm.clearLogs': 'Clear the entire cleanup log?',
  'confirm.reset': 'Reset all settings? This cannot be undone.',

  // Cleanup area results (main process)
  'areaResult.cleaned': '{label}: cleaned',
  'areaResult.unknown': 'Unknown cleanup area',
  'areaResult.nativeUnavailable': 'Native interface unavailable',

  // NTSTATUS descriptions
  'ntstatus.success': 'Success',
  'ntstatus.notImplemented': 'Not implemented (STATUS_NOT_IMPLEMENTED)',
  'ntstatus.invalidInfoClass': 'Invalid information class (STATUS_INVALID_INFO_CLASS)',
  'ntstatus.accessDenied': 'Access denied (STATUS_ACCESS_DENIED); administrator rights required',
  'ntstatus.privilegeNotHeld': 'Required privilege not held (STATUS_PRIVILEGE_NOT_HELD); administrator rights required',
  'ntstatus.notSupported': 'Not supported (STATUS_NOT_SUPPORTED)',
  'ntstatus.invalidParameter': 'Invalid parameter (STATUS_INVALID_PARAMETER)',
  'ntstatus.unknown': 'NTSTATUS 0x{code}',

  // Errors
  'error.noBridge': 'Not connected to the main process; real memory data is unavailable',
  'error.unsupportedPlatform': 'Unsupported platform: {platform} (Windows only)',
  'error.globalMemoryStatusEx': 'GlobalMemoryStatusEx failed',
  'error.nativeUnavailable': 'Native interface unavailable',
};

export default en;
