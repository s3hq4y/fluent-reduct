/**
 * Fluent Reduct - Simplified Chinese strings (source language).
 *
 * This file is the single source of truth for translation keys: `TranslationKey`
 * is derived from it, so every other locale is validated against these keys at
 * compile time. Keys use a `group.name` namespace; `{placeholder}` tokens are
 * substituted by `translate()`.
 */

export const zhCN = {
  'app.name': 'Fluent Reduct',
  'app.title': '{name} {version}',

  // Window controls
  'window.minimize': '最小化',
  'window.maximize': '最大化',
  'window.restore': '还原',
  'window.close': '关闭',

  // Tray
  'tray.show': '显示主窗口',
  'tray.clean': '立即清理内存',
  'tray.settings': '设置',
  'tray.quit': '退出',

  // Sections
  'section.memoryStatus': '系统内存状态',
  'section.cleanup': '内存清理',
  'section.logs': '清理日志',

  // Memory cards
  'card.physical': '物理内存',
  'card.pagefile': '页面文件',
  'card.cache': '系统缓存',

  // Status badge / bar
  'status.normal': '正常',
  'status.warning': '警告',
  'status.danger': '危险',
  'status.ready': '就绪',
  'status.cleaning': '正在清理内存...',
  'status.memory': '内存: {percent}%',
  'status.memoryDegraded': '内存: {percent}% (降级读数)',

  // Cleanup profiles
  'mode.default': '默认',
  'mode.custom': '自定义',

  // Cleanup areas
  'areaGroup.basic': '基础清理',
  'areaGroup.advanced': '高级清理',
  'areaGroup.extended': '扩展清理',
  'badge.freeze': '⚠️ 可能冻结',
  'badge.win81': 'Win8.1+',
  'badge.win10': 'Win10+',
  'area.workingset': '工作集 (Working Set)',
  'area.systemfilecache': '系统文件缓存 (System File Cache)',
  'area.standbypriority0': '待机优先级0列表 (Standby Priority-0)',
  'area.modifiedlist': '修改页面列表 (Modified Page List)',
  'area.standbylist': '待机列表 (Standby List)',
  'area.modifiedfilecache': '修改文件缓存 (Modified File Cache)',
  'area.registrycache': '注册表缓存 (Registry Cache)',
  'area.combinememory': '合并内存列表 (Combine Memory)',

  // Buttons
  'btn.clean': '立即清理内存',
  'btn.settings': '设置',
  'btn.clearLogs': '清空日志',
  'btn.save': '保存',
  'btn.cancel': '取消',
  'btn.ok': '确定',
  'btn.reset': '重置所有设置',

  // Cleanup log
  'logs.empty': '暂无清理记录',
  'log.status.success': '清理完成',
  'log.status.partial': '部分完成',
  'log.status.failed': '清理失败',
  'log.auto': '自动',
  'log.line': '{status}{auto} · {areas} · {seconds}',
  'log.detail.areas': '{count} 项',
  'log.detail.seconds': '{seconds} 秒',
  'log.detail.failCount': '{count} 项失败',
  'log.percent': '{before}% → {after}%',

  // Progress dialog
  'progress.title': '正在清理内存...',
  'progress.preparing': '准备清理...',
  'progress.done': '清理完成',
  'progress.item': '正在清理 {label}... ({index}/{total})',

  // Settings dialog
  'settings.title': '设置',
  'tab.appearance': '外观',
  'tab.memory': '内存',
  'tab.general': '常规',
  'tab.advanced': '高级',
  'settings.group.theme': '主题',
  'settings.group.accent': '主题色',
  'settings.group.autoClean': '自动清理',
  'settings.group.options': '选项',
  'settings.group.startup': '启动',
  'settings.group.language': '语言',
  'settings.group.advanced': '高级选项',
  'settings.group.data': '数据',
  'theme.light': '亮色',
  'theme.dark': '暗色',
  'theme.system': '跟随系统',
  'accent.default': '默认蓝',
  'accent.indigo': '靛蓝',
  'accent.deepBlue': '深蓝',
  'accent.teal': '青色',
  'accent.green': '绿色',
  'accent.orange': '橙色',
  'accent.red': '红色',
  'accent.pink': '粉色',
  'accent.purple': '紫色',
  'accent.grey': '灰色',
  'settings.customColor': '自定义颜色:',
  'settings.autoClean.enable': '启用自动清理',
  'settings.autoClean.threshold': '内存使用率阈值:',
  'settings.autoClean.interval': '清理间隔:',
  'settings.unit.percent': '%',
  'settings.unit.minutes': '分钟',
  'settings.confirmClean': '清理前确认',
  'settings.showResult': '显示清理结果',
  'settings.logResults': '记录清理日志',
  'settings.alwaysOnTop': '始终置顶',
  'settings.launchAtLogin': '开机自启动',
  'settings.startMinimized': '启动时最小化',

  // Toasts
  'toast.hint': '提示',
  'toast.settingsSaved.title': '设置已保存',
  'toast.settingsSaved.message': '您的设置已成功保存',
  'toast.cleanDone.title': '清理完成',
  'toast.cleanDone.message': '已释放 {freed} 物理内存，用时 {seconds} 秒',
  'toast.cleanFailed.title': '清理失败',
  'toast.cleanFailed.noAdmin': '需要以管理员身份运行才能清理内存',
  'toast.cleanPartial.title': '部分区域清理失败',
  'toast.cleanPartial.message': '已释放 {freed}；失败 {count} 项：{details}',
  'toast.selectArea': '请至少选择一个清理区域',
  'toast.dataIncomplete.title': '内存数据不完整',
  'toast.dataIncomplete.message': '无法调用 Windows 原生接口，部分数值不可用',
  'toast.nativeUnavailable.title': '原生接口不可用',
  'toast.nativeUnavailable.message': '无法加载内存 API，读数与清理功能受限',
  'toast.notElevated.title': '未以管理员身份运行',
  'toast.notElevated.message': '内存读数正常，但清理操作需要管理员权限',

  // Confirmation prompts
  'confirm.clean': '确定要清理内存吗？',
  'confirm.clearLogs': '确定清空所有清理日志吗？',
  'confirm.reset': '确定要重置所有设置吗？此操作不可撤销。',

  // Cleanup area results (main process)
  'areaResult.cleaned': '{label}：已清理',
  'areaResult.unknown': '未知的清理区域',
  'areaResult.nativeUnavailable': '原生接口不可用',

  // NTSTATUS descriptions
  'ntstatus.success': '成功',
  'ntstatus.notImplemented': '系统不支持该操作 (STATUS_NOT_IMPLEMENTED)',
  'ntstatus.invalidInfoClass': '无效的信息类 (STATUS_INVALID_INFO_CLASS)',
  'ntstatus.accessDenied': '访问被拒绝 (STATUS_ACCESS_DENIED)，需要管理员权限',
  'ntstatus.privilegeNotHeld': '缺少所需特权 (STATUS_PRIVILEGE_NOT_HELD)，需要管理员权限',
  'ntstatus.notSupported': '系统不支持该操作 (STATUS_NOT_SUPPORTED)',
  'ntstatus.invalidParameter': '参数无效 (STATUS_INVALID_PARAMETER)',
  'ntstatus.unknown': 'NTSTATUS 0x{code}',

  // Errors
  'error.noBridge': '未连接到主进程，无法读取真实内存数据',
  'error.unsupportedPlatform': '不支持的平台: {platform}（本模块仅支持 Windows）',
  'error.globalMemoryStatusEx': 'GlobalMemoryStatusEx 调用失败',
  'error.nativeUnavailable': '原生接口不可用',
} as const;

/** Every valid translation key, derived from the source locale. */
export type TranslationKey = keyof typeof zhCN;

export default zhCN;
