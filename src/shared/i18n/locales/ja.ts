/**
 * Fluent Reduct - Japanese strings.
 *
 * Typed as `Translations`, so a missing or misspelled key is a compile error.
 */

import type { Translations } from '../translate';

export const ja: Translations = {
  'app.name': 'Fluent Reduct',
  'app.title': '{name} {version}',

  // Window controls
  'window.minimize': '最小化',
  'window.maximize': '最大化',
  'window.restore': '元に戻す',
  'window.close': '閉じる',

  // Tray
  'tray.show': 'メインウィンドウを表示',
  'tray.clean': '今すぐメモリを整理',
  'tray.settings': '設定',
  'tray.quit': '終了',

  // Sections
  'section.memoryStatus': 'システムメモリの状態',
  'section.cleanup': 'メモリの整理',
  'section.logs': '整理ログ',

  // Memory cards
  'card.physical': '物理メモリ',
  'card.pagefile': 'ページファイル',
  'card.cache': 'システムキャッシュ',

  // Status badge / bar
  'status.normal': '正常',
  'status.warning': '警告',
  'status.danger': '危険',
  'status.ready': '待機中',
  'status.cleaning': 'メモリを整理しています...',
  'status.memory': 'メモリ: {percent}%',
  'status.memoryDegraded': 'メモリ: {percent}% (簡易値)',

  // Cleanup profiles
  'mode.default': '既定',
  'mode.custom': 'カスタム',

  // Cleanup areas
  'areaGroup.basic': '基本の整理',
  'areaGroup.advanced': '詳細な整理',
  'areaGroup.extended': '拡張の整理',
  'badge.freeze': '⚠️ フリーズの可能性',
  'badge.win81': 'Win8.1+',
  'badge.win10': 'Win10+',
  'area.workingset': 'ワーキングセット',
  'area.systemfilecache': 'システムファイルキャッシュ',
  'area.standbypriority0': 'スタンバイ優先度0リスト',
  'area.modifiedlist': '変更済みページリスト',
  'area.standbylist': 'スタンバイリスト',
  'area.modifiedfilecache': '変更済みファイルキャッシュ',
  'area.registrycache': 'レジストリキャッシュ',
  'area.combinememory': 'メモリの結合',

  // Buttons
  'btn.clean': '今すぐメモリを整理',
  'btn.settings': '設定',
  'btn.clearLogs': 'ログを消去',
  'btn.save': '保存',
  'btn.cancel': 'キャンセル',
  'btn.ok': 'OK',
  'btn.reset': 'すべての設定をリセット',

  // Cleanup log
  'logs.empty': '整理履歴はまだありません',
  'log.status.success': '整理完了',
  'log.status.partial': '一部完了',
  'log.status.failed': '整理失敗',
  'log.auto': '自動',
  'log.line': '{status}{auto} · {areas} · {seconds}',
  'log.detail.areas': '{count} 項目',
  'log.detail.seconds': '{seconds} 秒',
  'log.detail.failCount': '{count} 件失敗',
  'log.percent': '{before}% → {after}%',

  // Progress dialog
  'progress.title': 'メモリを整理しています...',
  'progress.preparing': '準備中...',
  'progress.done': '整理完了',
  'progress.item': '{label} を整理中... ({index}/{total})',

  // Settings dialog
  'settings.title': '設定',
  'tab.appearance': '外観',
  'tab.memory': 'メモリ',
  'tab.general': '一般',
  'tab.advanced': '詳細',
  'settings.group.theme': 'テーマ',
  'settings.group.accent': 'アクセントカラー',
  'settings.group.autoClean': '自動整理',
  'settings.group.options': 'オプション',
  'settings.group.startup': '起動',
  'settings.group.language': '言語',
  'settings.group.advanced': '詳細オプション',
  'settings.group.data': 'データ',
  'settings.group.ball': 'フローティングボール',
  'settings.floatingBall': 'クリーンアップボールを表示',

  // Floating ball
  'ball.menu.clean': '今すぐメモリを整理',
  'ball.menu.showWindow': 'メインウィンドウを表示',
  'ball.menu.hide': 'ボールを隠す',
  'theme.light': 'ライト',
  'theme.dark': 'ダーク',
  'theme.system': 'システムに従う',
  'accent.default': '既定の青',
  'accent.indigo': 'インディゴ',
  'accent.deepBlue': '濃い青',
  'accent.teal': 'ティール',
  'accent.green': '緑',
  'accent.orange': 'オレンジ',
  'accent.red': '赤',
  'accent.pink': 'ピンク',
  'accent.purple': '紫',
  'accent.grey': 'グレー',
  'settings.customColor': 'カスタムカラー:',
  'settings.autoClean.enable': '自動整理を有効にする',
  'settings.autoClean.threshold': 'メモリ使用率のしきい値:',
  'settings.autoClean.interval': '整理の間隔:',
  'settings.unit.percent': '%',
  'settings.unit.minutes': '分',
  'settings.confirmClean': '整理前に確認する',
  'settings.showResult': '整理結果を表示する',
  'settings.logResults': '整理ログを記録する',
  'settings.alwaysOnTop': '常に最前面',
  'settings.launchAtLogin': 'ログイン時に起動',
  'settings.startMinimized': '最小化して起動',

  // Toasts
  'toast.hint': 'お知らせ',
  'toast.settingsSaved.title': '設定を保存しました',
  'toast.settingsSaved.message': '設定が正常に保存されました',
  'toast.cleanDone.title': '整理完了',
  'toast.cleanDone.message': '物理メモリを {freed} 解放しました（{seconds} 秒）',
  'toast.cleanFailed.title': '整理失敗',
  'toast.cleanFailed.noAdmin': 'メモリを整理するには管理者として実行してください',
  'toast.cleanPartial.title': '一部の領域で失敗しました',
  'toast.cleanPartial.message': '{freed} を解放；{count} 件失敗: {details}',
  'toast.selectArea': '少なくとも1つの整理領域を選択してください',
  'toast.dataIncomplete.title': 'メモリデータが不完全です',
  'toast.dataIncomplete.message': 'Windows ネイティブ API を利用できないため、一部の値が欠落しています',
  'toast.nativeUnavailable.title': 'ネイティブ API を利用できません',
  'toast.nativeUnavailable.message': 'メモリ API を読み込めませんでした。読み取りと整理が制限されます',
  'toast.notElevated.title': '管理者として実行されていません',
  'toast.notElevated.message': '読み取りは可能ですが、整理には管理者権限が必要です',

  // Confirmation prompts
  'confirm.clean': 'メモリを整理しますか？',
  'confirm.clearLogs': '整理ログをすべて消去しますか？',
  'confirm.reset': 'すべての設定をリセットしますか？元に戻せません。',

  // Cleanup area results (main process)
  'areaResult.cleaned': '{label}: 整理しました',
  'areaResult.unknown': '不明な整理領域',
  'areaResult.nativeUnavailable': 'ネイティブ API を利用できません',

  // NTSTATUS descriptions
  'ntstatus.success': '成功',
  'ntstatus.notImplemented': '未実装 (STATUS_NOT_IMPLEMENTED)',
  'ntstatus.invalidInfoClass': '無効な情報クラス (STATUS_INVALID_INFO_CLASS)',
  'ntstatus.accessDenied': 'アクセス拒否 (STATUS_ACCESS_DENIED)。管理者権限が必要です',
  'ntstatus.privilegeNotHeld': '必要な特権がありません (STATUS_PRIVILEGE_NOT_HELD)。管理者権限が必要です',
  'ntstatus.notSupported': 'サポートされていません (STATUS_NOT_SUPPORTED)',
  'ntstatus.invalidParameter': '無効なパラメーター (STATUS_INVALID_PARAMETER)',
  'ntstatus.unknown': 'NTSTATUS 0x{code}',

  // Errors
  'error.noBridge': 'メインプロセスに接続されていないため、実際のメモリデータを読み取れません',
  'error.unsupportedPlatform': 'サポートされていないプラットフォーム: {platform}（Windows のみ）',
  'error.globalMemoryStatusEx': 'GlobalMemoryStatusEx が失敗しました',
  'error.nativeUnavailable': 'ネイティブ API を利用できません',
};

export default ja;
