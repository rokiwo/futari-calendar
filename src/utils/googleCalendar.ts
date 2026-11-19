import {
  CalendarCategoryId,
  CalendarDataStore,
  CoupleMetadata,
  GoogleCalendarSyncConfig,
  NotifyTarget,
  PartnerId,
  ScheduleEvent,
} from '../types/calendar';
import {
  DEFAULT_CATEGORIES,
  formatMinutesShort,
  getEffectivePrivateFor,
  getLocalTodayStr,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
  resolveCategoryInfo,
} from './presets';

export const REMINDER_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: '開始時刻（定刻）' },
  { value: 10, label: '10分前' },
  { value: 30, label: '30分前' },
  { value: 60, label: '1時間前' },
  { value: 180, label: '3時間前' },
  { value: 1440, label: '前日（24時間前）' },
];

/**
 * 予定・タスクが指定パートナー（夫 または 妻）の端末に通知すべき対象かどうかを厳密判定
 * - 妻の予定/タスクなら妻の端末（partnerB）のみ true
 * - 夫の予定/タスクなら夫の端末（partnerA）のみ true
 */
export function shouldNotifyPartner(
  ev: ScheduleEvent,
  devicePartnerId: PartnerId
): boolean {
  if (ev.deletedAt || ev.isCompleted) return false;
  const priv = getEffectivePrivateFor(ev);
  if (priv) return priv === devicePartnerId;

  const target: NotifyTarget =
    ev.notifyTarget ||
    (ev.categoryId === 'partnerA'
      ? 'partnerA'
      : ev.categoryId === 'partnerB'
      ? 'partnerB'
      : ev.isTask
      ? ev.createdBy
      : 'both');

  if (target === 'both') return true;
  return target === devicePartnerId;
}

/**
 * 予定・タスクの通知対象ラベルを返す
 */
export function getNotifyTargetLabel(
  ev: ScheduleEvent,
  metadata: CoupleMetadata
): { target: NotifyTarget; label: string; badgeColor: string } {
  const pA = metadata.partners.partnerA;
  const pB = metadata.partners.partnerB;
  const priv = getEffectivePrivateFor(ev);

  const target: NotifyTarget =
    priv ||
    ev.notifyTarget ||
    (ev.categoryId === 'partnerA'
      ? 'partnerA'
      : ev.categoryId === 'partnerB'
      ? 'partnerB'
      : ev.isTask
      ? ev.createdBy
      : 'both');

  if (target === 'partnerA') {
    return {
      target: 'partnerA',
      label: `🔔 ${pA.avatar}${pA.name}の端末のみ通知`,
      badgeColor: 'bg-[#E2F9FC] text-[#126875] border-[#A9E9F2]',
    };
  }
  if (target === 'partnerB') {
    return {
      target: 'partnerB',
      label: `🔔 ${pB.avatar}${pB.name}の端末のみ通知`,
      badgeColor: 'bg-[#F3EAFF] text-[#6638A6] border-[#DEC9FC]',
    };
  }
  return {
    target: 'both',
    label: '🔔 2人の端末に通知',
    badgeColor: 'bg-[#FFE5EC] text-[#9E2A47] border-[#FFC2D1]',
  };
}

function computeTimedEndParts(
  dateStr: string,
  startTime: string,
  endTime?: string,
  explicitEndDate?: string,
  defaultDurationMin = 60
): { endDateStr: string; eh: number; em: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [shRaw, smRaw] = startTime.split(':').map(Number);
  const sh = Number.isFinite(shRaw) ? shRaw : 9;
  const sm = Number.isFinite(smRaw) ? smRaw : 0;
  if (!endTime) {
    const rolled = new Date(y, m - 1, d, sh, sm + defaultDurationMin);
    return {
      endDateStr: explicitEndDate || getLocalTodayStr(rolled),
      eh: rolled.getHours(),
      em: rolled.getMinutes(),
    };
  }
  const parts = endTime.split(':').map(Number);
  const eh = Number.isFinite(parts[0]) ? parts[0] : sh;
  const em = Number.isFinite(parts[1]) ? parts[1] : 0;
  let endDateStr = explicitEndDate || dateStr;
  if (!explicitEndDate && eh * 60 + em <= sh * 60 + sm) {
    endDateStr = getLocalTodayStr(new Date(y, m - 1, d + 1));
  }
  return {
    endDateStr,
    eh: Math.min(23, Math.max(0, eh)),
    em: Math.min(59, Math.max(0, em)),
  };
}

/**
 * Googleカレンダーの予定・タスク追加URLを生成
 * ※操作中の本人のスマホで開くことで、本人のGoogleカレンダーのみに登録され、本人の端末だけにGoogleカレンダーから通知が届きます。
 */
export function buildGoogleCalendarUrl(
  ev: ScheduleEvent,
  metadata: CoupleMetadata
): string {
  const [y, m, d] = ev.date.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');

  let datesParam = '';
  if (ev.isAllDay || !ev.startTime) {
    // 終日または時間未指定タスクの場合は当日09:00〜09:30（通知が確実に鳴るよう時間枠を設定）
    if (ev.isTask) {
      const startStr = `${y}${pad(m)}${pad(d)}T090000`;
      const endStr = `${y}${pad(m)}${pad(d)}T093000`;
      datesParam = `${startStr}/${endStr}`;
    } else {
      const baseEndDate = ev.endDate && ev.endDate >= ev.date ? ev.endDate : ev.date;
      const [ey, em, ed] = baseEndDate.split('-').map(Number);
      const nextDt = new Date(ey, em - 1, ed + 1);
      const startStr = `${y}${pad(m)}${pad(d)}`;
      const endStr = `${nextDt.getFullYear()}${pad(nextDt.getMonth() + 1)}${pad(
        nextDt.getDate()
      )}`;
      datesParam = `${startStr}/${endStr}`;
    }
  } else {
    const [sh, sm] = ev.startTime.split(':').map(Number);
    const startStr = `${y}${pad(m)}${pad(d)}T${pad(sh)}${pad(sm || 0)}00`;
    const endInfo = computeTimedEndParts(ev.date, ev.startTime, ev.endTime, ev.endDate, 60);
    const [ey, emon, ed] = endInfo.endDateStr.split('-').map(Number);
    const endStr = `${ey}${pad(emon)}${pad(ed)}T${pad(endInfo.eh)}${pad(endInfo.em)}00`;
    datesParam = `${startStr}/${endStr}`;
  }

  const prefix = ev.isTask ? '✅【タスク】' : '';
  const text = `${prefix}${ev.title}`;

  const notifyInfo = getNotifyTargetLabel(ev, metadata);
  const remMin = ev.reminderMinutes ?? 30;
  const remLabel =
    REMINDER_PRESETS.find((r) => r.value === remMin)?.label || `${remMin}分前`;

  const detailsLines = [
    ev.memo ? `メモ: ${ev.memo}` : '',
    `通知対象: ${notifyInfo.label}`,
    `推奨通知タイミング: ${remLabel}`,
    '--- ペアカレ (PairCal) より登録 ---',
  ].filter(Boolean);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text,
    dates: datesParam,
    details: detailsLines.join('\n'),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * 指定したパートナー（夫のみ または 妻のみ）の対象タスク・予定・シフトを抽出し、
 * カレンダーの通知アラーム（VALARM）付き .ics ファイルを生成する
 * ※予定・シフトが0件の状態で押された場合も「開けないエラー」にならないよう、確認用のサンプル通知予定を1件含めます。
 */
export function generatePartnerNotificationIcs(
  store: CalendarDataStore,
  targetPartner: PartnerId
): string {
  const partner = store.metadata.partners[targetPartner];
  const stampMap = new Map(store.stamps.map((s) => [s.id, s]));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FutariCal//GoogleCalendarPartnerSync//JP',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:ペアカレ (${partner.avatar}${partner.name}専用通知)`,
    'X-WR-TIMEZONE:Asia/Tokyo',
  ];

  const pad = (n: number) => String(n).padStart(2, '0');
  const nowStamp =
    new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let itemCount = 0;

  // 1. 対象パートナーのシフト（残業・休出・バイト含む）を出力
  const partnerShifts = Object.values(store.shifts).filter(
    (s) => !s.deletedAt && s.partnerId === targetPartner
  );

  for (const s of partnerShifts) {
    const stamp = stampMap.get(s.stampId);
    const label = s.customLabel || stamp?.label || (s.isHolidayWork ? '休日出勤' : 'シフト');
    const icon = stamp?.icon || '📅';
    const [y, m, d] = s.date.split('-').map(Number);
    const dateCompact = `${y}${pad(m)}${pad(d)}`;

    const extraParts: string[] = [];
    const otMin = getShiftOvertimeMinutes(s);
    const holMin = getShiftHolidayWorkMinutes(s);
    if (otMin > 0) extraParts.push(`残業+${formatMinutesShort(otMin)}`);
    if (holMin > 0) extraParts.push(`休出${formatMinutesShort(holMin)}`);
    if (s.subCustomLabel) extraParts.push(`+${s.subCustomLabel}`);
    const extraSuffix = extraParts.length > 0 ? ` (${extraParts.join('/')})` : '';

    const summary = `${partner.avatar}${icon}${label}${extraSuffix}`.replace(/\r?\n/g, ' ');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:futarical-shift-${s.id}@futarical.local`);
    lines.push(`DTSTAMP:${nowStamp}`);

    const startT = s.startTime || stamp?.startTime;
    const endT = s.endTime || stamp?.endTime;
    if (startT && endT) {
      const [sh, sm] = startT.split(':').map(Number);
      const endInfo = computeTimedEndParts(s.date, startT, endT, undefined, 480);
      const [ey, emon, ed] = endInfo.endDateStr.split('-').map(Number);
      const endCompact = `${ey}${pad(emon)}${pad(ed)}`;
      lines.push(`DTSTART:${dateCompact}T${pad(sh)}${pad(sm || 0)}00`);
      lines.push(`DTEND:${endCompact}T${pad(endInfo.eh)}${pad(endInfo.em)}00`);
    } else {
      const nextDt = new Date(y, m - 1, d + 1);
      const nextCompact = `${nextDt.getFullYear()}${pad(nextDt.getMonth() + 1)}${pad(
        nextDt.getDate()
      )}`;
      lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
      lines.push(`DTEND;VALUE=DATE:${nextCompact}`);
    }

    lines.push(`SUMMARY:${summary}`);
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${summary}`);
    lines.push('TRIGGER:-PT60M');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
    itemCount++;
  }

  // 2. 対象パートナーに通知すべき予定＆タスクを出力
  const events = Object.values(store.events).filter((ev) =>
    shouldNotifyPartner(ev, targetPartner)
  );

  for (const ev of events) {
    const [y, m, d] = ev.date.split('-').map(Number);
    const dateCompact = `${y}${pad(m)}${pad(d)}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:futarical-ev-${ev.id}-${targetPartner}@futarical.local`);
    lines.push(`DTSTAMP:${nowStamp}`);

    if (ev.isAllDay && !ev.isTask) {
      const baseEnd = ev.endDate && ev.endDate >= ev.date ? ev.endDate : ev.date;
      const [ey, emon, ed] = baseEnd.split('-').map(Number);
      const nextDt = new Date(ey, emon - 1, ed + 1);
      const nextCompact = `${nextDt.getFullYear()}${pad(
        nextDt.getMonth() + 1
      )}${pad(nextDt.getDate())}`;
      lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
      lines.push(`DTEND;VALUE=DATE:${nextCompact}`);
    } else {
      const startT = ev.startTime || '09:00';
      const [sh, sm] = startT.split(':').map(Number);
      const endInfo = computeTimedEndParts(ev.date, startT, ev.endTime, ev.endDate, 30);
      const [ey, emon, ed] = endInfo.endDateStr.split('-').map(Number);
      const endCompact = `${ey}${pad(emon)}${pad(ed)}`;
      lines.push(`DTSTART:${dateCompact}T${pad(sh)}${pad(sm || 0)}00`);
      lines.push(`DTEND:${endCompact}T${pad(endInfo.eh)}${pad(endInfo.em)}00`);
    }

    const summary = `${ev.isTask ? '✅【タスク】' : ''}${ev.title}`.replace(
      /\r?\n/g,
      ' '
    );
    lines.push(`SUMMARY:${summary}`);
    if (ev.memo) {
      lines.push(`DESCRIPTION:${ev.memo.replace(/\r?\n/g, '\\n')}`);
    }

    const remMin = ev.reminderMinutes ?? 30;
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${summary}`);
    if (remMin <= 0) {
      lines.push('TRIGGER:PT0M');
    } else {
      lines.push(`TRIGGER:-PT${remMin}M`);
    }
    lines.push('END:VALARM');

    lines.push('END:VEVENT');
    itemCount++;
  }

  // 3. まだ予定もシフトも0件の状態で押された場合、空の.icsでスマホがエラーにならないよう案内イベントを1件入れる
  if (itemCount === 0) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const dateCompact = `${y}${pad(m)}${pad(d)}`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:futarical-welcome-${targetPartner}@futarical.local`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART:${dateCompact}T090000`);
    lines.push(`DTEND:${dateCompact}T093000`);
    lines.push(`SUMMARY:🔔 ペアカレ通知連携テスト（${partner.avatar}${partner.name}専用）`);
    lines.push('DESCRIPTION:ペアカレで予定やシフトを登録してから再度読み込むと、まとめてカレンダーに取り込まれます。');
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:ペアカレ通知テスト');
    lines.push('TRIGGER:-PT10M');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * スマホ（iPhone / Android）およびPCで .ics カレンダーを確実に開く・共有・保存するヘルパー
 */
export async function openOrShareIcsOnDevice(
  icsText: string,
  filename: string
): Promise<'shared' | 'opened' | 'downloaded'> {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  // iPhone / iPad Safari の場合は data:text/calendar スキームでOS標準の「カレンダーに追加」画面が直接開く
  if (isIOS) {
    const dataUri = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsText)}`;
    const a = document.createElement('a');
    a.href = dataUri;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return 'opened';
  }

  // Android 等で Web Share API (ファイル共有) が使える場合は「Googleカレンダー」等を直接選べるシートを出す
  try {
    const file = new File([icsText], filename, { type: 'text/calendar;charset=utf-8' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'ペアカレ カレンダー連携',
        files: [file],
      });
      return 'shared';
    }
  } catch {
    // キャンセルまたは非対応時は通常ダウンロードへフォールバック
  }

  // PC / 標準ブラウザ向けダウンロード
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return 'downloaded';
}

// ============================================================================
// 🔄 Googleカレンダー 双方向自動同期エンジン（Google Apps Script Webアプリ連携）
// APIキー不要・OAuth審査不要・GeminiからのGoogleカレンダー予定も自動でペアカレに反映！
// ============================================================================

const LS_GCAL_SYNC_CONFIG_KEY = 'futarical_gcal_sync_config_v1';
export const DEFAULT_PARTNER_A_GAS_URL =
  'https://script.google.com/macros/s/AKfycbwx2LGNbsmqB1vJrCfvWXTj8CC4DAkioE4w9G19ccib7Xz9ss6QaSlCIt5gjJXX1Ohl/exec';
export const DEFAULT_PARTNER_B_CALENDAR_ID = 'kobayansaya1229@gmail.com';

function normalizePartnerBFields(rawGasUrl?: string, rawCalId?: string): {
  partnerBGasUrl: string;
  partnerBCalendarId: string;
} {
  const trimmedGas = (rawGasUrl || '').trim();
  const trimmedCal = (rawCalId || '').trim();

  // もし GAS URL 欄にメールアドレス（@を含み https:// で始まらない文字列）が入力されていたら自動的にカレンダーID欄へ振り替える
  if (trimmedGas && !trimmedGas.startsWith('http') && trimmedGas.includes('@')) {
    return {
      partnerBGasUrl: '',
      partnerBCalendarId: trimmedGas,
    };
  }

  return {
    partnerBGasUrl: trimmedGas.startsWith('http') ? trimmedGas : '',
    partnerBCalendarId:
      trimmedCal && trimmedCal !== 'primary'
        ? trimmedCal
        : trimmedGas.startsWith('http')
        ? trimmedCal || 'primary'
        : DEFAULT_PARTNER_B_CALENDAR_ID,
  };
}

export function loadGoogleCalendarSyncConfig(
  storeConfig?: GoogleCalendarSyncConfig
): GoogleCalendarSyncConfig {
  if (
    storeConfig &&
    (storeConfig.updatedAt !== undefined ||
      storeConfig.partnerAGasUrl ||
      storeConfig.partnerBGasUrl ||
      storeConfig.partnerBCalendarId)
  ) {
    const normB = normalizePartnerBFields(storeConfig.partnerBGasUrl, storeConfig.partnerBCalendarId);
    return {
      enabled: storeConfig.enabled ?? true,
      autoSync: storeConfig.autoSync ?? true,
      partnerAGasUrl:
        storeConfig.partnerAGasUrl !== undefined
          ? storeConfig.partnerAGasUrl || (storeConfig.updatedAt ? '' : DEFAULT_PARTNER_A_GAS_URL)
          : DEFAULT_PARTNER_A_GAS_URL,
      partnerACalendarId: storeConfig.partnerACalendarId ?? 'primary',
      partnerBGasUrl: normB.partnerBGasUrl,
      partnerBCalendarId: normB.partnerBCalendarId,
      sharedCalendarId: storeConfig.sharedCalendarId ?? '',
      syncRangePastDays: storeConfig.syncRangePastDays ?? 30,
      syncRangeFutureDays: storeConfig.syncRangeFutureDays ?? 120,
      lastGoogleSyncedAt: storeConfig.lastGoogleSyncedAt,
      updatedAt: storeConfig.updatedAt,
    };
  }
  try {
    const raw = localStorage.getItem(LS_GCAL_SYNC_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GoogleCalendarSyncConfig;
      const partnerAGasUrl =
        parsed.partnerAGasUrl !== undefined
          ? parsed.partnerAGasUrl || (parsed.updatedAt ? '' : DEFAULT_PARTNER_A_GAS_URL)
          : DEFAULT_PARTNER_A_GAS_URL;
      const normB = normalizePartnerBFields(parsed.partnerBGasUrl, parsed.partnerBCalendarId);
      return {
        enabled: parsed.enabled ?? true,
        autoSync: parsed.autoSync ?? true,
        partnerAGasUrl,
        partnerACalendarId: parsed.partnerACalendarId ?? 'primary',
        partnerBGasUrl: normB.partnerBGasUrl,
        partnerBCalendarId: normB.partnerBCalendarId,
        sharedCalendarId: parsed.sharedCalendarId ?? '',
        syncRangePastDays: parsed.syncRangePastDays ?? 30,
        syncRangeFutureDays: parsed.syncRangeFutureDays ?? 120,
        lastGoogleSyncedAt: parsed.lastGoogleSyncedAt,
        updatedAt: parsed.updatedAt,
      };
    }
  } catch {
    // ignore
  }
  return {
    enabled: true,
    autoSync: true,
    partnerAGasUrl: DEFAULT_PARTNER_A_GAS_URL,
    partnerACalendarId: 'primary',
    partnerBGasUrl: '',
    partnerBCalendarId: DEFAULT_PARTNER_B_CALENDAR_ID,
    sharedCalendarId: '',
    syncRangePastDays: 30,
    syncRangeFutureDays: 120,
  };
}

export function saveGoogleCalendarSyncConfig(config: GoogleCalendarSyncConfig): void {
  try {
    localStorage.setItem(LS_GCAL_SYNC_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

/**
 * Google Apps Script (GAS) にコピペして「ウェブアプリとしてデプロイ」するだけで
 * Googleカレンダー＆Googleタスク(ToDoリスト)とペアカレの完全双方向同期を実現するスクリプト
 */
export function getGoogleAppsScriptTemplateCode(): string {
  return `/**
 * 🐻💕🐰 ペアカレ (PairCal) ⇄ Googleカレンダー ＆ Googleタスク 双方向自動同期ブリッジ (GAS)
 * スマホの Gemini や Googleカレンダー／Google ToDoリストで追加・完了した内容も
 * 自動的にペアカレへ双方向同期されます！
 *
 * 【使い方（1分で完了・APIキー不要）】
 * 1. https://script.google.com/ を開いて「新しいプロジェクト」を作成
 * 2. このコードをすべて貼り付けて保存（Ctrl+S / ⌘+S）
 * 3. ★重要★ 左メニューの「サービス ＋」から「Tasks API」を追加（Googleタスク自動連携に必要）
 * 4. 上の関数選択で「setupAndCheckAuth」を選び「▶ 実行」→ カレンダーと Google ToDoリスト 両方の権限を承認
 * 5. 右上の「デプロイ」＞「新しいデプロイ」（更新時は「デプロイを管理」＞✏️＞新バージョン）
 * 6. 種類の選択（⚙️）で「ウェブアプリ」を選択
 *    - 次のユーザーとして実行：「自分」
 *    - アクセスできるユーザー：「全員」
 * 7. 発行された「ウェブアプリURL (https://script.google.com/macros/s/.../exec)」をペアカレに貼り付けるだけ！
 */

/**
 * 初回セットアップ・動作確認用（GASエディタ上部の「▶ 実行」はこの関数を選択して実行してください）
 */
function setupAndCheckAuth() {
  var cal = CalendarApp.getDefaultCalendar();
  var calName = cal ? cal.getName() : '(未取得)';
  Logger.log('Googleカレンダー接続OK: ' + calName);

  if (!isTasksApiAvailable_()) {
    Logger.log('⚠️ Tasks API サービスが未追加です。左メニューの「サービス ＋」から Tasks API を追加してください。');
    return {
      ok: false,
      calendarName: calName,
      tasksSupported: false,
      error: 'Tasks API サービスが未追加です'
    };
  }

  // GoogleカレンダーとGoogleタスクの両方のOAuth権限を確認（未承認なら承認ダイアログを表示）
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks'
  ]);

  var listsRes = Tasks.Tasklists.list({ maxResults: 10 });
  var listsCount = (listsRes && listsRes.items) ? listsRes.items.length : 0;
  Logger.log('Googleタスク接続OK! リスト数=' + listsCount);

  return {
    ok: true,
    calendarName: calName,
    tasksSupported: true,
    taskListsCount: listsCount
  };
}

function doGet(e) {
  var _unused = e || {};
  var tasksStatus = checkTasksApiStatus_();
  return jsonResponse_({
    ok: true,
    app: 'PairCal-GoogleCalendar-Tasks-Bridge',
    tasksSupported: tasksStatus.tasksSupported,
    tasksError: tasksStatus.tasksError,
    message: 'ペアカレ Googleカレンダー＆Googleタスク双方向同期ブリッジが正常に稼働しています✨'
  });
}

function isTasksApiAvailable_() {
  try {
    return typeof Tasks !== 'undefined' && Tasks && Boolean(Tasks.Tasks) && Boolean(Tasks.Tasklists);
  } catch (ignore) {
    return false;
  }
}

function checkTasksApiStatus_() {
  if (!isTasksApiAvailable_()) {
    return {
      tasksSupported: false,
      tasksError: 'GASエディタの「サービス ＋」から Tasks API を追加するとGoogleタスク連携が有効になります。'
    };
  }
  try {
    Tasks.Tasklists.list({ maxResults: 1 });
    return {
      tasksSupported: true,
      tasksError: null
    };
  } catch (err) {
    return {
      tasksSupported: false,
      tasksError: String(err && err.message ? err.message : err)
    };
  }
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var body = JSON.parse(raw);
    if (!body || typeof body !== 'object') body = {};
    var action = body.action || 'sync';

    if (action === 'ping') {
      var calId = body.calendarId || 'primary';
      var cal = calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
      if (!cal) {
        return jsonResponse_({ ok: false, error: '指定されたカレンダーIDが見つかりません: ' + calId });
      }
      var pingTasksStatus = checkTasksApiStatus_();
      return jsonResponse_({
        ok: true,
        calendarName: cal.getName(),
        timeZone: cal.getTimeZone(),
        tasksSupported: pingTasksStatus.tasksSupported,
        tasksError: pingTasksStatus.tasksError
      });
    }

    if (action === 'sync') {
      var result = syncCalendarEvents_(body);
      if (result && result.ok && body.syncTasks) {
        var taskRes = syncGoogleTasks_(body);
        result.tasksSupported = taskRes.tasksSupported;
        result.pushedTaskMapping = taskRes.pushedTaskMapping;
        result.remoteTasks = taskRes.remoteTasks;
        result.tasksError = taskRes.tasksError || null;
      }
      return jsonResponse_(result);
    }

    return jsonResponse_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function syncCalendarEvents_(payload) {
  payload = payload && typeof payload === 'object' ? payload : {};
  var calId = payload.calendarId || 'primary';
  var cal = calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
  if (!cal) {
    return { ok: false, error: 'カレンダーが見つかりません (' + calId + ')。カレンダーの共有設定またはIDを確認してください。' };
  }

  var pastDays = Number(payload.pastDays || 30);
  var futureDays = Number(payload.futureDays || 120);
  var now = new Date();
  var startRange = new Date(now.getFullYear(), now.getMonth(), now.getDate() - pastDays - 1, 0, 0, 0);
  var endRange = new Date(now.getFullYear(), now.getMonth(), now.getDate() + futureDays + 1, 23, 59, 59);

  // 1. 期間内のGoogleカレンダー予定を一括取得してインデックス化
  var existingEvents = cal.getEvents(startRange, endRange);
  var byPairCalId = {};
  var byGoogleId = {};

  for (var i = 0; i < existingEvents.length; i++) {
    var gev = existingEvents[i];
    var gid = gev.getId();
    byGoogleId[gid] = gev;
    var pId = '';
    try {
      pId = gev.getTag('paircal_id') || '';
    } catch (ignore) {}
    if (!pId) {
      var desc = gev.getDescription() || '';
      var m = desc.match(/\\[PAIRCAL_ID:([^\\]]+)\\]/);
      if (m && m[1]) pId = m[1];
    }
    if (pId) {
      byPairCalId[pId] = gev;
    }
  }

  // 2a. ペアカレ側で削除（またはプライベート化）された予定（deletions配列）をGoogleカレンダーから削除
  var deletions = Array.isArray(payload.deletions) ? payload.deletions : [];
  for (var di = 0; di < deletions.length; di++) {
    var delItem = deletions[di];
    if (!delItem) continue;
    var delPairId = delItem.paircalId || delItem.id || '';
    var delGidRaw = delItem.googleEventId ? String(delItem.googleEventId).replace(/__\\d{4}-\\d{2}-\\d{2}$/, '') : '';
    var delEv = null;
    if (delItem.googleEventId && byGoogleId[delItem.googleEventId]) {
      delEv = byGoogleId[delItem.googleEventId];
    } else if (delGidRaw && byGoogleId[delGidRaw]) {
      delEv = byGoogleId[delGidRaw];
    } else if (delPairId && byPairCalId[delPairId]) {
      delEv = byPairCalId[delPairId];
    } else if (delGidRaw) {
      try {
        delEv = cal.getEventById(delGidRaw);
      } catch (ignore) {}
    }
    if (delEv) {
      try {
        var delGid = delEv.getId();
        delEv.deleteEvent();
        delete byGoogleId[delGid];
      } catch (ignore) {}
    }
    if (delPairId && byPairCalId[delPairId]) {
      delete byPairCalId[delPairId];
    }
  }

  // 2b. ペアカレ側の変更（新規追加・更新・削除フラグ付き）をGoogleカレンダーへ反映
  var upserts = Array.isArray(payload.upserts) ? payload.upserts : [];
  var pushedMapping = {}; // { [paircalEventId]: googleEventId }

  for (var j = 0; j < upserts.length; j++) {
    var item = upserts[j];
    if (!item || !item.id || !item.date) continue;

    var upGidRaw = item.googleEventId ? String(item.googleEventId).replace(/__\\d{4}-\\d{2}-\\d{2}$/, '') : '';
    var targetEv = null;
    if (item.googleEventId && byGoogleId[item.googleEventId]) {
      targetEv = byGoogleId[item.googleEventId];
    } else if (upGidRaw && byGoogleId[upGidRaw]) {
      targetEv = byGoogleId[upGidRaw];
    } else if (byPairCalId[item.id]) {
      targetEv = byPairCalId[item.id];
    } else if (upGidRaw) {
      try {
        targetEv = cal.getEventById(upGidRaw);
      } catch (ignore) {}
    }

    // 削除された予定の場合
    if (item.deletedAt) {
      if (targetEv) {
        try {
          targetEv.deleteEvent();
        } catch (ignore) {}
      }
      continue;
    }

    // Googleカレンダー側の更新日時がペアカレ側より新しい場合は上書きしない
    var itemUpdatedMs = item.updatedAt ? (Date.parse(item.updatedAt) || 0) : 0;
    if (targetEv && itemUpdatedMs > 0 && targetEv.getLastUpdated) {
      try {
        var remLastUpd = targetEv.getLastUpdated();
        if (remLastUpd && remLastUpd.getTime() > itemUpdatedMs + 2000) {
          pushedMapping[item.id] = targetEv.getId();
          continue;
        }
      } catch (ignore) {}
    }

    var rawTitle = String(item.title || '予定');
    var titleText = (item.isTask && rawTitle.indexOf('✅') !== 0 ? '✅ ' : '') + rawTitle;
    var descLines = [];
    if (item.memo) descLines.push(item.memo);
    if (item.supportBadges && item.supportBadges.length > 0) {
      descLines.push('サポート: ' + item.supportBadges.join(' / '));
    }
    descLines.push('[PAIRCAL_ID:' + item.id + ']');
    var fullDesc = descLines.join('\\n');

    var dateParts = item.date.split('-');
    var y = Number(dateParts[0]);
    var m = Number(dateParts[1]) - 1;
    var d = Number(dateParts[2]);

    if (item.isAllDay || !item.startTime) {
      var allDayDate = new Date(y, m, d);
      var hasMultiEnd = item.endDate && item.endDate > item.date;
      var allDayEndExclusive = null;
      if (hasMultiEnd) {
        var endP = item.endDate.split('-');
        allDayEndExclusive = new Date(Number(endP[0]), Number(endP[1]) - 1, Number(endP[2]) + 1);
      }
      if (targetEv) {
        var curTitle = targetEv.getTitle();
        var curAllDay = targetEv.isAllDayEvent();
        var curStart = targetEv.getAllDayStartDate ? targetEv.getAllDayStartDate() : targetEv.getStartTime();
        var sameStart = curAllDay && curStart.getFullYear() === y && curStart.getMonth() === m && curStart.getDate() === d;
        var curEnd = targetEv.getAllDayEndDate ? targetEv.getAllDayEndDate() : null;
        var wantEnd = allDayEndExclusive || new Date(y, m, d + 1);
        var sameEnd = curAllDay && curEnd && curEnd.getFullYear() === wantEnd.getFullYear() && curEnd.getMonth() === wantEnd.getMonth() && curEnd.getDate() === wantEnd.getDate();
        if (curTitle !== titleText) targetEv.setTitle(titleText);
        if (!sameStart || !sameEnd) {
          if (allDayEndExclusive && targetEv.setAllDayDates) {
            targetEv.setAllDayDates(allDayDate, allDayEndExclusive);
          } else {
            targetEv.setAllDayDate(allDayDate);
          }
        }
        if ((targetEv.getDescription() || '') !== fullDesc) targetEv.setDescription(fullDesc);
      } else {
        if (allDayEndExclusive) {
          targetEv = cal.createAllDayEvent(titleText, allDayDate, allDayEndExclusive, { description: fullDesc });
        } else {
          targetEv = cal.createAllDayEvent(titleText, allDayDate, { description: fullDesc });
        }
        try { targetEv.setTag('paircal_id', item.id); } catch (ignore) {}
        applyReminderIfNeeded_(targetEv, item.reminderMinutes);
      }
    } else {
      var sp = item.startTime.split(':');
      var sh = Number(sp[0] || 9);
      var sm = Number(sp[1] || 0);
      var startDt = new Date(y, m, d, sh, sm, 0);

      var endDt;
      if (item.endTime) {
        var ep = item.endTime.split(':');
        var eh = Number(ep[0]);
        var em = Number(ep[1] || 0);
        var ey = y, emon = m, ed = d;
        if (item.endDate && item.endDate >= item.date) {
          var edParts = item.endDate.split('-');
          ey = Number(edParts[0]);
          emon = Number(edParts[1]) - 1;
          ed = Number(edParts[2]);
        }
        endDt = new Date(ey, emon, ed, eh, em, 0);
        if (!item.endDate && endDt <= startDt) {
          endDt = new Date(y, m, d + 1, eh, em, 0);
        }
      } else {
        endDt = new Date(startDt.getTime() + 60 * 60 * 1000);
      }
      if (endDt <= startDt) {
        endDt = new Date(startDt.getTime() + 30 * 60 * 1000);
      }

      if (targetEv) {
        if (targetEv.getTitle() !== titleText) targetEv.setTitle(titleText);
        if (targetEv.isAllDayEvent() || Math.abs(targetEv.getStartTime().getTime() - startDt.getTime()) > 1000 || Math.abs(targetEv.getEndTime().getTime() - endDt.getTime()) > 1000) {
          targetEv.setTime(startDt, endDt);
        }
        if ((targetEv.getDescription() || '') !== fullDesc) targetEv.setDescription(fullDesc);
      } else {
        targetEv = cal.createEvent(titleText, startDt, endDt, { description: fullDesc });
        try { targetEv.setTag('paircal_id', item.id); } catch (ignore) {}
        applyReminderIfNeeded_(targetEv, item.reminderMinutes);
      }
    }

    if (targetEv) {
      pushedMapping[item.id] = targetEv.getId();
    }
  }

  // 3. Googleカレンダー側の最新予定一覧を再取得してペアカレへ返す（Gemini等で追加された予定も含む！）
  var refreshedEvents = cal.getEvents(startRange, endRange);
  var remoteList = [];
  var tz = cal.getTimeZone() || Session.getScriptTimeZone() || 'Asia/Tokyo';

  for (var k = 0; k < refreshedEvents.length; k++) {
    var ev = refreshedEvents[k];
    var rawGEventId = ev.getId();
    var paircalId = '';
    try {
      paircalId = ev.getTag('paircal_id') || '';
    } catch (ignore) {}
    var rawDesc = ev.getDescription() || '';
    if (!paircalId) {
      var match = rawDesc.match(/\\[PAIRCAL_ID:([^\\]]+)\\]/);
      if (match && match[1]) paircalId = match[1];
    }

    var cleanMemo = rawDesc
      .replace(/\\n?\\[PAIRCAL_ID:[^\\]]+\\]/g, '')
      .replace(/(?:^|\\n)サポート: [^\\n]*/g, '')
      .trim();
    var isAllDay = ev.isAllDayEvent();
    var startDateObj = isAllDay ? ev.getAllDayStartDate() : ev.getStartTime();
    var endDateObj = isAllDay ? ev.getAllDayEndDate() : ev.getEndTime();

    var dateStr = Utilities.formatDate(startDateObj, tz, 'yyyy-MM-dd');
    var endDateStr = null;
    if (isAllDay && endDateObj) {
      var inclEnd = Utilities.formatDate(new Date(endDateObj.getTime() - 12 * 60 * 60 * 1000), tz, 'yyyy-MM-dd');
      if (inclEnd > dateStr) endDateStr = inclEnd;
    } else if (!isAllDay && endDateObj) {
      var timedEndDate = Utilities.formatDate(endDateObj, tz, 'yyyy-MM-dd');
      if (timedEndDate > dateStr) endDateStr = timedEndDate;
    }
    var startTimeStr = isAllDay ? '' : Utilities.formatDate(startDateObj, tz, 'HH:mm');
    var endTimeStr = isAllDay ? '' : Utilities.formatDate(endDateObj, tz, 'HH:mm');
    var isRec = false;
    try { isRec = Boolean(ev.isRecurringEvent && ev.isRecurringEvent()); } catch (ignore) {}
    var gEventId = isRec ? (rawGEventId + '__' + dateStr) : rawGEventId;

    var lastUpdatedObj = ev.getLastUpdated ? ev.getLastUpdated() : new Date();
    var updatedIso = lastUpdatedObj ? lastUpdatedObj.toISOString() : new Date().toISOString();

    remoteList.push({
      googleEventId: gEventId,
      paircalId: paircalId || null,
      title: ev.getTitle() || '(無題の予定)',
      date: dateStr,
      endDate: endDateStr,
      isAllDay: isAllDay,
      startTime: startTimeStr || null,
      endTime: endTimeStr || null,
      memo: cleanMemo || null,
      updatedAt: updatedIso
    });
  }

  return {
    ok: true,
    calendarName: cal.getName(),
    pushedMapping: pushedMapping,
    idMap: pushedMapping,
    remoteEvents: remoteList,
    events: remoteList,
    syncedAt: new Date().toISOString()
  };
}

function applyReminderIfNeeded_(ev, reminderMinutes) {
  try {
    if (!ev) return;
    if (reminderMinutes !== undefined && reminderMinutes !== null) {
      ev.removeAllReminders();
      var min = Number(reminderMinutes);
      if (min >= 0 && min <= 40320) {
        ev.addPopupReminder(min);
      }
    }
  } catch (ignore) {}
}

function fetchAllGoogleTasksMap_(taskLists) {
  var items = [];
  var byGoogleTaskId = {};
  var byPairCalId = {};
  var lists = Array.isArray(taskLists) ? taskLists : [];

  for (var li = 0; li < lists.length; li++) {
    var listId = lists[li] && lists[li].id ? lists[li].id : '';
    if (!listId) continue;
    var pageToken = null;
    do {
      var opts = {
        showCompleted: true,
        showHidden: true,
        maxResults: 100
      };
      if (pageToken) {
        opts.pageToken = pageToken;
      }
      var res = Tasks.Tasks.list(listId, opts);
      var listItems = (res && res.items) ? res.items : [];
      for (var ti = 0; ti < listItems.length; ti++) {
        var t = listItems[ti];
        if (!t || !t.id || t.deleted) continue;
        var entry = { task: t, listId: listId };
        items.push(entry);
        byGoogleTaskId[t.id] = entry;
        var notes = t.notes || '';
        var m = notes.match(/\\[PAIRCAL_ID:([^\\]]+)\\]/);
        if (m && m[1]) {
          byPairCalId[m[1]] = entry;
        }
      }
      pageToken = res && res.nextPageToken ? res.nextPageToken : null;
    } while (pageToken);
  }

  return {
    items: items,
    byGoogleTaskId: byGoogleTaskId,
    byPairCalId: byPairCalId
  };
}

function syncGoogleTasks_(payload) {
  payload = payload && typeof payload === 'object' ? payload : {};
  if (!isTasksApiAvailable_()) {
    return {
      tasksSupported: false,
      pushedTaskMapping: {},
      remoteTasks: [],
      tasksError: 'GASエディタの「サービス ＋」から Tasks API を追加するとGoogleタスク連携が有効になります。'
    };
  }

  try {
    var listsRes = Tasks.Tasklists.list({ maxResults: 100 });
    var taskLists = (listsRes && listsRes.items) ? listsRes.items.slice() : [];
    var defaultListId = '@default';
    try {
      var defList = Tasks.Tasklists.get('@default');
      if (defList && defList.id) {
        defaultListId = defList.id;
      }
    } catch (ignore) {
      if (taskLists.length > 0 && taskLists[0].id) {
        defaultListId = taskLists[0].id;
      }
    }
    var hasDefaultInLists = false;
    for (var dl = 0; dl < taskLists.length; dl++) {
      if (taskLists[dl].id === defaultListId) {
        hasDefaultInLists = true;
        break;
      }
    }
    if (!hasDefaultInLists && defaultListId) {
      taskLists.unshift({ id: defaultListId });
    }

    var state = fetchAllGoogleTasksMap_(taskLists);

    // 1. ペアカレで削除されたタスクを Google Tasks から削除
    var taskDeletions = Array.isArray(payload.taskDeletions) ? payload.taskDeletions : [];
    for (var di = 0; di < taskDeletions.length; di++) {
      var delItem = taskDeletions[di];
      if (!delItem) continue;
      var foundDel = (delItem.googleTaskId && state.byGoogleTaskId[delItem.googleTaskId]) ||
        (delItem.id && state.byPairCalId[delItem.id]) ||
        null;
      var delListId = foundDel ? foundDel.listId : (delItem.googleTaskListId || defaultListId);
      var delTaskId = foundDel ? foundDel.task.id : delItem.googleTaskId;
      if (delListId && delTaskId) {
        try {
          Tasks.Tasks.remove(delListId, delTaskId);
        } catch (ignore) {}
      }
    }

    // 2. ペアカレのタスク（追加・編集・完了/未完了）を Google Tasks へ反映
    var taskUpserts = Array.isArray(payload.taskUpserts) ? payload.taskUpserts : [];
    var pushedTaskMapping = {};

    for (var ui = 0; ui < taskUpserts.length; ui++) {
      var item = taskUpserts[ui];
      if (!item || !item.id) continue;

      var target = (item.googleTaskId && state.byGoogleTaskId[item.googleTaskId]) ||
        state.byPairCalId[item.id] ||
        null;

      if (!target && item.googleTaskId) {
        try {
          var fallbackListId = item.googleTaskListId || defaultListId;
          var fetched = Tasks.Tasks.get(fallbackListId, item.googleTaskId);
          if (fetched && fetched.id && !fetched.deleted) {
            target = { task: fetched, listId: fallbackListId };
          }
        } catch (ignore) {}
      }

      var titleText = (item.title || 'タスク').trim();
      var descLines = [];
      if (item.memo) descLines.push(String(item.memo).trim());
      descLines.push('[PAIRCAL_ID:' + item.id + ']');
      var fullNotes = descLines.join('\\n').trim();
      var wantDueDate = item.date ? String(item.date).slice(0, 10) : '';
      var dueIso = wantDueDate ? (wantDueDate + 'T00:00:00.000Z') : null;
      var wantCompleted = Boolean(item.isCompleted);

      if (target) {
        var remUpdatedMs = target.task.updated ? (Date.parse(target.task.updated) || 0) : 0;
        var itemUpdatedMs = item.updatedAt ? (Date.parse(item.updatedAt) || 0) : Date.now();
        if (remUpdatedMs > itemUpdatedMs + 2000) {
          pushedTaskMapping[item.id] = {
            googleTaskId: target.task.id,
            googleTaskListId: target.listId
          };
          continue;
        }

        var curStatus = target.task.status === 'completed';
        var curTitle = (target.task.title || '').trim();
        var curNotes = (target.task.notes || '').trim();
        var curDueDate = target.task.due ? String(target.task.due).slice(0, 10) : '';
        var hasDiff = curTitle !== titleText ||
          curStatus !== wantCompleted ||
          curNotes !== fullNotes ||
          (wantDueDate && curDueDate !== wantDueDate);

        if (hasDiff) {
          // 読み取り専用プロパティ(etag/selfLink/links/updated/position/hidden等)を除いた最小リソースで更新
          var resObj = {
            id: target.task.id,
            title: titleText,
            notes: fullNotes,
            status: wantCompleted ? 'completed' : 'needsAction'
          };
          if (dueIso) {
            resObj.due = dueIso;
          } else if (target.task.due) {
            resObj.due = target.task.due;
          }
          if (wantCompleted) {
            resObj.completed = target.task.completed || item.updatedAt || new Date().toISOString();
          }
          var updatedTask = Tasks.Tasks.update(resObj, target.listId, target.task.id);
          pushedTaskMapping[item.id] = {
            googleTaskId: (updatedTask && updatedTask.id) ? updatedTask.id : target.task.id,
            googleTaskListId: target.listId
          };
        } else {
          pushedTaskMapping[item.id] = {
            googleTaskId: target.task.id,
            googleTaskListId: target.listId
          };
        }
      } else {
        var newTaskRes = {
          title: titleText,
          notes: fullNotes,
          status: wantCompleted ? 'completed' : 'needsAction'
        };
        if (dueIso) {
          newTaskRes.due = dueIso;
        }
        if (wantCompleted) {
          newTaskRes.completed = item.updatedAt || new Date().toISOString();
        }
        var createdTask = Tasks.Tasks.insert(newTaskRes, defaultListId);
        if (createdTask && createdTask.id) {
          pushedTaskMapping[item.id] = {
            googleTaskId: createdTask.id,
            googleTaskListId: defaultListId
          };
        }
      }
    }

    // 3. Google Tasks 側の最新タスクリストを再取得してペアカレへ返す
    var refreshed = fetchAllGoogleTasksMap_(taskLists);
    var remoteTasks = [];

    for (var ri = 0; ri < refreshed.items.length; ri++) {
      var entry = refreshed.items[ri];
      var gt = entry.task;
      var rawNotes = gt.notes || '';
      var pMatch = rawNotes.match(/\\[PAIRCAL_ID:([^\\]]+)\\]/);
      var pId = (pMatch && pMatch[1]) ? pMatch[1] : null;
      var cleanMemo = rawNotes.replace(/\\n?\\[PAIRCAL_ID:[^\\]]+\\]/g, '').trim();
      var dueStr = gt.due ? String(gt.due).slice(0, 10) : null;
      var completedFlag = gt.status === 'completed';

      remoteTasks.push({
        googleTaskId: gt.id,
        googleTaskListId: entry.listId,
        paircalId: pId,
        title: (gt.title || '').trim() || '(無題のタスク)',
        date: dueStr,
        memo: cleanMemo || null,
        isCompleted: completedFlag,
        completedAt: gt.completed || null,
        updatedAt: gt.updated || gt.completed || new Date().toISOString()
      });
    }

    return {
      tasksSupported: true,
      pushedTaskMapping: pushedTaskMapping,
      remoteTasks: remoteTasks,
      tasksError: null
    };
  } catch (err) {
    return {
      tasksSupported: false,
      pushedTaskMapping: {},
      remoteTasks: [],
      tasksError: String(err && err.message ? err.message : err)
    };
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj || {}))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}

interface GasRemoteEventItem {
  googleEventId: string;
  paircalId?: string | null;
  title: string;
  date: string;
  endDate?: string | null;
  isAllDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  memo?: string | null;
  updatedAt: string;
}

function stableGoogleIdKey(rawId: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < rawId.length; i++) {
    const ch = rawId.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ ch, 0x85ebca6b);
  }
  const hex = `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
  const tail = rawId.replace(/[^a-zA-Z0-9]/g, '').slice(-12);
  return `${hex}_${tail}`;
}

interface GasRemoteTaskItem {
  googleTaskId: string;
  googleTaskListId?: string | null;
  paircalId?: string | null;
  title: string;
  date?: string | null;
  memo?: string | null;
  isCompleted: boolean;
  completedAt?: string | null;
  updatedAt: string;
}

interface GasPushedTaskMappingEntry {
  googleTaskId: string;
  googleTaskListId?: string;
}

interface GasSyncResponse {
  ok: boolean;
  error?: string;
  calendarName?: string;
  pushedMapping?: Record<string, string>;
  idMap?: Record<string, string>;
  remoteEvents?: GasRemoteEventItem[];
  events?: GasRemoteEventItem[];
  tasksSupported?: boolean;
  pushedTaskMapping?: Record<string, GasPushedTaskMappingEntry>;
  remoteTasks?: GasRemoteTaskItem[];
  tasksError?: string | null;
  syncedAt?: string;
}

/**
 * GAS エンドポイントへ疎通テスト（Ping）を送信
 */
export async function testGoogleCalendarGasConnection(
  gasUrl: string,
  calendarId = 'primary'
): Promise<{
  ok: boolean;
  calendarName?: string;
  tasksSupported?: boolean;
  tasksError?: string | null;
  error?: string;
}> {
  const cleanUrl = gasUrl.trim();
  if (!cleanUrl) {
    return { ok: false, error: 'GAS ウェブアプリURLを入力してください' };
  }
  try {
    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'ping',
        calendarId: calendarId.trim() || 'primary',
      }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error: `アクセス権限エラー (${res.status})：GASの「デプロイを管理」＞✏️編集 で「アクセスできるユーザー」を「全員」に変更してデプロイしてください`,
        };
      }
      return { ok: false, error: `HTTPエラー (${res.status})` };
    }
    const text = await res.text();
    if (text.trim().startsWith('<!DOCTYPE') || text.includes('accounts.google.com')) {
      return {
        ok: false,
        error:
          'Googleログイン画面が返されました：GASの「デプロイを管理」＞✏️編集 で「アクセスできるユーザー」を「全員」に変更してデプロイしてください',
      };
    }
    const data = JSON.parse(text) as GasSyncResponse;
    if (!data.ok) {
      return { ok: false, error: data.error || 'カレンダーの接続に失敗しました' };
    }
    return {
      ok: true,
      calendarName: data.calendarName || 'Googleカレンダー',
      tasksSupported: data.tasksSupported,
      tasksError: data.tasksError || null,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `通信エラー: ${err.message}（GASのデプロイ設定で「アクセスできるユーザー：全員」になっているか確認してください）`
          : '通信エラーが発生しました',
    };
  }
}

/**
 * 指定したカレンダーターゲット（partnerA / partnerB / shared）が同期対象とすべきペアカレ予定か判定
 */
function shouldSyncEventToTarget(
  ev: ScheduleEvent,
  targetKey: 'partnerA' | 'partnerB' | 'shared',
  hasSharedCalendar: boolean
): boolean {
  const priv = getEffectivePrivateFor(ev);

  // タスクの場合：
  // Google Tasks (ToDoリスト) 側へ同期するためGoogleカレンダーには重複書き出ししない。
  // ただし従来のGoogleカレンダー由来レガシータスク（googleTaskId未紐付けかつgoogleEventIdあり）のみ維持する。
  if (ev.isTask) {
    if (
      ev.syncedFromGoogle &&
      !ev.googleTaskId &&
      Boolean(ev.googleEventId || ev.googleEventIds?.[targetKey])
    ) {
      return priv === targetKey;
    }
    return false;
  }

  // プライベート予定は本人のカレンダーのみに同期し、相手や共有カレンダーには出さない
  if (priv) {
    return priv === targetKey;
  }

  if (targetKey === 'shared') {
    return ev.categoryId === 'shared' || ev.notifyTarget === 'both';
  }

  if (targetKey === 'partnerA') {
    if (ev.categoryId === 'partnerA' || ev.notifyTarget === 'partnerA') return true;
    if (!hasSharedCalendar && (ev.categoryId === 'shared' || ev.notifyTarget === 'both')) {
      return true;
    }
    return false;
  }

  if (targetKey === 'partnerB') {
    if (ev.categoryId === 'partnerB' || ev.notifyTarget === 'partnerB') return true;
    if (!hasSharedCalendar && (ev.categoryId === 'shared' || ev.notifyTarget === 'both')) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * ペアカレ ⇄ Googleカレンダー 双方向自動同期を実行
 * - ペアカレで追加・編集・削除した予定を Google カレンダーへ即座に反映
 * - Google カレンダー（またはスマホの Gemini アプリ等から Google カレンダー）で追加・変更された予定をペアカレへ自動取り込み
 */
export async function syncWithGoogleCalendar(
  store: CalendarDataStore,
  config: GoogleCalendarSyncConfig,
  activePartner: PartnerId
): Promise<{
  nextStore: CalendarDataStore;
  importedCount: number;
  updatedCount: number;
  pushedCount: number;
  tasksSupported?: boolean;
  statusMessage: string;
}> {
  if (!config.enabled) {
    return {
      nextStore: store,
      importedCount: 0,
      updatedCount: 0,
      pushedCount: 0,
      statusMessage: 'Googleカレンダー同期は無効です',
    };
  }

  const urlA = config.partnerAGasUrl?.trim() || '';
  const normB = normalizePartnerBFields(config.partnerBGasUrl, config.partnerBCalendarId);
  const urlB = normB.partnerBGasUrl;
  const calBId = normB.partnerBCalendarId;
  if (!urlA && !urlB) {
    throw new Error('Googleカレンダー同期用のGAS WebアプリURLが設定されていません。');
  }

  const pastDays = config.syncRangePastDays ?? 30;
  const futureDays = config.syncRangeFutureDays ?? 120;
  const now = new Date();
  const syncStartedIso = now.toISOString();
  const minDateObj = new Date(now.getTime() - pastDays * 86400000);
  const maxDateObj = new Date(now.getTime() + futureDays * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const minDateStr = `${minDateObj.getFullYear()}-${pad(minDateObj.getMonth() + 1)}-${pad(minDateObj.getDate())}`;
  const maxDateStr = `${maxDateObj.getFullYear()}-${pad(maxDateObj.getMonth() + 1)}-${pad(maxDateObj.getDate())}`;

  const hasSharedCal = Boolean(config.sharedCalendarId?.trim() && (urlA || urlB));

  // 同期ターゲット一覧を構築（ゆうと用 / さや用 / 共有カレンダー用）
  // Google Tasks はGAS所有者アカウントに紐づくため、専用GAS URLを持つターゲットでのみ同期し混在を防ぐ
  const targets: {
    key: 'partnerA' | 'partnerB' | 'shared';
    gasUrl: string;
    calendarId: string;
    defaultCategory: CalendarCategoryId;
    defaultCreator: PartnerId;
    syncTasks: boolean;
  }[] = [];

  if (urlA) {
    targets.push({
      key: 'partnerA',
      gasUrl: urlA,
      calendarId: config.partnerACalendarId?.trim() || 'primary',
      defaultCategory: 'partnerA',
      defaultCreator: 'partnerA',
      syncTasks: true,
    });
  }

  if (urlB) {
    // もしゆうとと全く同じURL＆同じカレンダーID('primary')の場合は重複実行を避ける
    const calA = config.partnerACalendarId?.trim() || 'primary';
    const calB = calBId || 'primary';
    if (!(urlA === urlB && calA === calB)) {
      targets.push({
        key: 'partnerB',
        gasUrl: urlB,
        calendarId: calB,
        defaultCategory: 'partnerB',
        defaultCreator: 'partnerB',
        syncTasks: urlB !== urlA,
      });
    }
  } else if (urlA && calBId && calBId !== 'primary') {
    // 1つのGAS URLでさやの共有カレンダーIDも指定されている場合
    targets.push({
      key: 'partnerB',
      gasUrl: urlA,
      calendarId: calBId,
      defaultCategory: 'partnerB',
      defaultCreator: 'partnerB',
      syncTasks: false,
    });
  }

  if (hasSharedCal && config.sharedCalendarId?.trim()) {
    targets.push({
      key: 'shared',
      gasUrl: urlA || urlB,
      calendarId: config.sharedCalendarId.trim(),
      defaultCategory: 'shared',
      defaultCreator: activePartner,
      syncTasks: false,
    });
  }

  const nextEvents: Record<string, ScheduleEvent> = { ...store.events };
  let totalImported = 0;
  let totalUpdated = 0;
  let totalPushed = 0;
  let anyTasksSupported = false;
  const categories = store.categories && store.categories.length > 0 ? store.categories : DEFAULT_CATEGORIES;

  const lastSyncedMs = config.lastGoogleSyncedAt ? Date.parse(config.lastGoogleSyncedAt) || 0 : 0;
  let allTargetsSucceeded = true;

  for (const target of targets) {
    // 1a. Googleカレンダーから削除すべき予定（削除済み または プライベート変更・別カテゴリ化等で対象外になった既存紐付け予定）
    const deletions = Object.values(nextEvents)
      .filter((ev) => {
        if (!ev || !ev.date) return false;
        const existingGId = ev.googleEventIds?.[target.key] || (target.key === 'partnerA' ? ev.googleEventId : undefined);
        if (!existingGId) return false;
        if (ev.deletedAt) return true;
        return !shouldSyncEventToTarget(ev, target.key, hasSharedCal);
      })
      .map((ev) => ({
        id: ev.id,
        paircalId: ev.id,
        googleEventId: ev.googleEventIds?.[target.key] || (target.key === 'partnerA' ? ev.googleEventId : undefined),
        date: ev.date,
        deletedAt: ev.deletedAt || null,
      }));

    // 1b. このターゲットに送信（追加・更新）すべきペアカレ予定を抽出
    let upserts = Object.values(nextEvents)
      .filter((ev) => {
        if (!ev || !ev.date || ev.deletedAt) return false;
        const inRange = ev.date >= minDateStr && ev.date <= maxDateStr;
        if (!inRange || !shouldSyncEventToTarget(ev, target.key, hasSharedCal)) return false;
        const existingGId = ev.googleEventIds?.[target.key] || (target.key === 'partnerA' ? ev.googleEventId : undefined);
        if (!existingGId || !ev.googleCalSynced) return true;
        const evUpdatedMs = Date.parse(ev.updatedAt || '') || 0;
        return evUpdatedMs > lastSyncedMs;
      })
      .map((ev) => ({
        id: ev.id,
        googleEventId: ev.googleEventIds?.[target.key] || (target.key === 'partnerA' ? ev.googleEventId : undefined),
        date: ev.date,
        endDate: ev.endDate,
        title: (ev.isTask ? '✅ ' : '') + ev.title,
        isAllDay: ev.isAllDay,
        startTime: ev.startTime,
        endTime: ev.endTime,
        memo: ev.memo,
        categoryId: ev.categoryId,
        supportBadges: ev.supportBadges,
        isTask: ev.isTask,
        reminderMinutes: ev.reminderMinutes,
        updatedAt: ev.updatedAt,
        deletedAt: null,
      }));

    // 1c. このターゲットの Google Tasks (ToDoリスト) へ送信すべきタスク（削除／追加・更新・完了）を抽出
    const taskDeletions = target.syncTasks
      ? Object.values(nextEvents)
          .filter((ev) => {
            if (!ev || !ev.isTask || !ev.deletedAt || !ev.googleTaskId) return false;
            return getEffectivePrivateFor(ev) === target.defaultCreator;
          })
          .map((ev) => ({
            id: ev.id,
            googleTaskId: ev.googleTaskId,
            googleTaskListId: ev.googleTaskListId,
          }))
      : [];

    let taskUpserts = target.syncTasks
      ? Object.values(nextEvents)
          .filter((ev) => {
            if (!ev || !ev.isTask || ev.deletedAt) return false;
            if (getEffectivePrivateFor(ev) !== target.defaultCreator) return false;
            if (!ev.googleTaskId || !ev.googleTaskSynced) return true;
            const evUpdatedMs = Date.parse(ev.updatedAt || '') || 0;
            return evUpdatedMs > lastSyncedMs;
          })
          .map((ev) => ({
            id: ev.id,
            googleTaskId: ev.googleTaskId,
            googleTaskListId: ev.googleTaskListId,
            date: ev.date,
            title: ev.title,
            memo: ev.memo,
            isCompleted: Boolean(ev.isCompleted),
            updatedAt: ev.updatedAt,
          }))
      : [];

    // 未紐付けのローカル予定またはローカルタスクがある場合、先にGoogle側の最新を取得して
    // Google側で既に移動・完了・更新されたデータを古いローカルデータで上書きしないようにする
    let data: GasSyncResponse | null = null;
    const hasUnlinkedUpserts = upserts.some((u) => !u.googleEventId);
    const hasUnlinkedTaskUpserts = taskUpserts.some((tu) => !tu.googleTaskId);
    if (hasUnlinkedUpserts || hasUnlinkedTaskUpserts) {
      const preRes = await fetch(target.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sync',
          calendarId: target.calendarId,
          pastDays,
          futureDays,
          syncTasks: target.syncTasks,
          upserts: [],
          deletions: [],
          taskUpserts: [],
          taskDeletions: [],
        }),
      });
      if (!preRes.ok) {
        if (target.key !== 'partnerA') {
          allTargetsSucceeded = false;
          continue;
        }
        throw new Error(`Googleカレンダー通信エラー (${preRes.status})`);
      }
      const preData = (await preRes.json()) as GasSyncResponse;
      if (!preData.ok) {
        if (target.key !== 'partnerA') {
          allTargetsSucceeded = false;
          continue;
        }
        throw new Error(preData.error || 'Googleカレンダー同期中にエラーが発生しました');
      }
      const preRemote = preData.remoteEvents || preData.events || [];
      const remoteByPairCalId = new Map<string, GasRemoteEventItem>();
      for (const r of preRemote) {
        if (r.paircalId) remoteByPairCalId.set(r.paircalId, r);
      }

      upserts = upserts.filter((u) => {
        if (u.googleEventId) return true;
        const matchedRem = remoteByPairCalId.get(u.id);
        if (!matchedRem) return true;
        const localEv = nextEvents[u.id];
        const remTimeMs = Date.parse(matchedRem.updatedAt || '') || 0;
        const locTimeMs = Date.parse(localEv?.updatedAt || '') || 0;
        // Google側が新しい場合はプッシュをスキップし、後続の取込処理でペアカレ側を更新する
        if (remTimeMs > locTimeMs + 2000) {
          return false;
        }
        // ローカルが新しい場合はGoogleEventIdを紐付けて上書き更新する
        u.googleEventId = matchedRem.googleEventId;
        return true;
      });

      const preRemoteTasks = preData.remoteTasks || [];
      const remoteTaskByPairCalId = new Map<string, GasRemoteTaskItem>();
      for (const rt of preRemoteTasks) {
        if (rt.paircalId) remoteTaskByPairCalId.set(rt.paircalId, rt);
      }

      taskUpserts = taskUpserts.filter((tu) => {
        if (tu.googleTaskId) return true;
        const matchedRemTask = remoteTaskByPairCalId.get(tu.id);
        if (!matchedRemTask) return true;
        const localEv = nextEvents[tu.id];
        const remTimeMs = Date.parse(matchedRemTask.updatedAt || '') || 0;
        const locTimeMs = Date.parse(localEv?.updatedAt || '') || 0;
        if (remTimeMs > locTimeMs + 2000) {
          return false;
        }
        tu.googleTaskId = matchedRemTask.googleTaskId;
        tu.googleTaskListId = matchedRemTask.googleTaskListId || undefined;
        return true;
      });

      if (
        upserts.length === 0 &&
        deletions.length === 0 &&
        taskUpserts.length === 0 &&
        taskDeletions.length === 0
      ) {
        data = preData;
      }
    }

    if (!data) {
      const res = await fetch(target.gasUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          action: 'sync',
          calendarId: target.calendarId,
          pastDays,
          futureDays,
          syncTasks: target.syncTasks,
          upserts,
          deletions,
          taskUpserts,
          taskDeletions,
        }),
      });

      if (!res.ok) {
        if (target.key !== 'partnerA') {
          allTargetsSucceeded = false;
          continue;
        }
        throw new Error(`Googleカレンダー通信エラー (${res.status})`);
      }

      data = (await res.json()) as GasSyncResponse;
      if (!data.ok) {
        if (target.key !== 'partnerA') {
          allTargetsSucceeded = false;
          continue;
        }
        throw new Error(data.error || 'Googleカレンダー同期中にエラーが発生しました');
      }
    }

    // 2. Googleカレンダー側で採番された googleEventId をペアカレ側のイベントに記録
    const mapping = data.pushedMapping || data.idMap || {};
    const seenGoogleIdsInRemote = new Set<string>();
    const idBumpIso = new Date().toISOString();

    for (const delItem of deletions) {
      const localDel = nextEvents[delItem.id];
      if (localDel) {
        const nextGIds = { ...(localDel.googleEventIds || {}) };
        delete nextGIds[target.key];
        nextEvents[delItem.id] = {
          ...localDel,
          googleEventId: target.key === 'partnerA' ? undefined : localDel.googleEventId,
          googleEventIds: nextGIds,
          updatedAt: idBumpIso,
        };
      }
    }

    for (const [paircalId, gEventId] of Object.entries(mapping)) {
      const localEv = nextEvents[paircalId];
      if (localEv && !localEv.deletedAt) {
        const prevGId = localEv.googleEventIds?.[target.key];
        if (prevGId !== gEventId || !localEv.googleCalSynced) {
          nextEvents[paircalId] = {
            ...localEv,
            googleCalSynced: true,
            googleEventId: target.key === 'partnerA' ? gEventId : localEv.googleEventId,
            googleEventIds: {
              ...(localEv.googleEventIds || {}),
              [target.key]: gEventId,
            },
            ...(prevGId && prevGId !== gEventId ? { updatedAt: idBumpIso } : {}),
          };
          totalPushed++;
        }
      }
    }

    // 3. Googleカレンダー側にある予定（Geminiから登録された予定やGoogleカレンダー直接入力分を含む）をペアカレへ取り込み・更新
    const remoteEvents = data.remoteEvents || data.events || [];
    for (const rem of remoteEvents) {
      if (!rem.googleEventId || !rem.date) continue;
      seenGoogleIdsInRemote.add(rem.googleEventId);

      // すでにペアカレが作成したシフト出力用イベント（futarical-shift-...等）および旧nscale勤務シフトはスキップ
      if (rem.title && /^([🐻🐰🐱🐶🦊🐼🐨🦁🐥🐧🧑👩🤵👰].*?:|🔔 ペアカレ通知連携テスト)/.test(rem.title)) {
        continue;
      }
      if (rem.memo && rem.memo.trim() === '*nscale*') {
        continue;
      }

      // 対応するローカルイベントを検索
      let matchedLocal: ScheduleEvent | undefined;
      if (rem.paircalId && nextEvents[rem.paircalId]) {
        matchedLocal = nextEvents[rem.paircalId];
      } else {
        matchedLocal = Object.values(nextEvents).find(
          (e) =>
            e.googleEventIds?.[target.key] === rem.googleEventId ||
            e.googleEventId === rem.googleEventId
        );
      }

      const rawTrimmed = (rem.title || '').trim();
      const rawMemo = (rem.memo || '').trim();
      const isTaskDetected =
        /^(✅|⬜|☑️|【?タスク】?|\[タスク\]|タスク|TODO|ToDo|やること)/i.test(rawTrimmed) ||
        /(【?タスク】?|\[タスク\]|タスク|TODO|ToDo|やること)\s*$/i.test(rawTrimmed) ||
        /([（(【\[](タスク|TODO|ToDo|やること)[）)】\]])/i.test(rawTrimmed) ||
        /(#タスク|【タスク】|\[タスク\])/i.test(rawMemo);
      const cleanTitle =
        rawTrimmed
          .replace(/^(✅|⬜|☑️)\s*/, '')
          .replace(/^(【?タスク】?|\[タスク\]|タスク|TODO|ToDo|やること)[:：\s・]*/i, '')
          .replace(/\s*([（(【\[](タスク|TODO|ToDo|やること)[）)】\]])\s*$/i, '')
          .replace(/\s+(タスク|TODO|ToDo|やること)\s*$/i, '')
          .trim() || rawTrimmed || '(無題の予定)';

      if (matchedLocal) {
        // もしローカルで削除済みの場合は復活させない
        if (matchedLocal.deletedAt) continue;

        const remTimeMs = Date.parse(rem.updatedAt || '') || 0;
        const locTimeMs = Date.parse(matchedLocal.updatedAt || '') || 0;

        // Googleカレンダー側でタイトル・日付・時間が変更されていた場合、Google側が新しければペアカレ側を更新
        const hasDiff =
          matchedLocal.title !== cleanTitle ||
          matchedLocal.date !== rem.date ||
          (matchedLocal.endDate || '') !== (rem.endDate || '') ||
          matchedLocal.isAllDay !== rem.isAllDay ||
          (matchedLocal.startTime || '') !== (rem.startTime || '') ||
          (matchedLocal.endTime || '') !== (rem.endTime || '') ||
          (matchedLocal.memo || '') !== (rem.memo || '');

        if (hasDiff && remTimeMs > locTimeMs + 2000) {
          nextEvents[matchedLocal.id] = {
            ...matchedLocal,
            title: cleanTitle,
            date: rem.date,
            endDate: rem.endDate || undefined,
            isAllDay: rem.isAllDay,
            startTime: rem.isAllDay ? undefined : rem.startTime || undefined,
            endTime: rem.isAllDay ? undefined : rem.endTime || undefined,
            memo: rem.memo || undefined,
            googleCalSynced: true,
            googleEventIds: {
              ...(matchedLocal.googleEventIds || {}),
              [target.key]: rem.googleEventId,
            },
            updatedAt: rem.updatedAt || new Date().toISOString(),
          };
          totalUpdated++;
        } else if (!matchedLocal.googleEventIds?.[target.key]) {
          nextEvents[matchedLocal.id] = {
            ...matchedLocal,
            googleCalSynced: true,
            googleEventIds: {
              ...(matchedLocal.googleEventIds || {}),
              [target.key]: rem.googleEventId,
            },
          };
        }
      } else {
        // 新規にGoogleカレンダー（またはスマホのGemini等）から作成された予定をペアカレに自動インポート！
        // タスクの場合は常に個人のカレンダー（相手には非表示）として取り込む
        let inferredCat: CalendarCategoryId = target.defaultCategory;
        if (isTaskDetected) {
          inferredCat = target.defaultCreator;
        } else if (/二人|ふたり|デート|旅行|記念日|外食|結婚/.test(cleanTitle)) {
          inferredCat = 'shared';
        } else if (store.metadata.partners.partnerA.name && cleanTitle.includes(store.metadata.partners.partnerA.name)) {
          inferredCat = 'partnerA';
        } else if (store.metadata.partners.partnerB.name && cleanTitle.includes(store.metadata.partners.partnerB.name)) {
          inferredCat = 'partnerB';
        }

        const catInfo = resolveCategoryInfo(inferredCat, categories, store.metadata);
        const safeHash = stableGoogleIdKey(rem.googleEventId);
        const newId = `gcal_${target.key}_${safeHash}`;

        // 万一同じIDで削除済みだった場合はスキップ
        if (nextEvents[newId]?.deletedAt) continue;

        const nowIso = new Date().toISOString();
        const notifyTarget: NotifyTarget = isTaskDetected
          ? target.defaultCreator
          : inferredCat === 'partnerA'
          ? 'partnerA'
          : inferredCat === 'partnerB'
          ? 'partnerB'
          : 'both';

        nextEvents[newId] = {
          id: newId,
          date: rem.date,
          ...(rem.endDate ? { endDate: rem.endDate } : {}),
          title: cleanTitle,
          categoryId: inferredCat,
          color: catInfo.accentColor,
          isAllDay: rem.isAllDay,
          startTime: rem.isAllDay ? undefined : rem.startTime || undefined,
          endTime: rem.isAllDay ? undefined : rem.endTime || undefined,
          memo: rem.memo || undefined,
          isTask: isTaskDetected,
          isCompleted: false,
          notifyTarget,
          privateFor: isTaskDetected ? target.defaultCreator : undefined,
          googleCalSynced: true,
          syncedFromGoogle: true,
          googleEventId: target.key === 'partnerA' ? rem.googleEventId : undefined,
          googleEventIds: {
            [target.key]: rem.googleEventId,
          },
          createdBy: target.defaultCreator,
          createdAt: rem.updatedAt || nowIso,
          updatedAt: rem.updatedAt || nowIso,
        };
        totalImported++;
      }
    }

    // 4. Googleカレンダー側で削除された予定を検知してペアカレ側も論理削除する（双方向削除同期：境界日除外）
    for (const [evId, localEv] of Object.entries(nextEvents)) {
      if (!localEv || localEv.deletedAt) continue;
      if (localEv.date <= minDateStr || localEv.date >= maxDateStr) continue;
      if (!shouldSyncEventToTarget(localEv, target.key, hasSharedCal)) continue;
      const syncedGId = localEv.googleEventIds?.[target.key];
      if (syncedGId && !seenGoogleIdsInRemote.has(syncedGId) && !mapping[evId]) {
        const nowIso = new Date().toISOString();
        nextEvents[evId] = {
          ...localEv,
          deletedAt: nowIso,
          updatedAt: nowIso,
        };
        totalUpdated++;
      }
    }

    // 5. Google Tasks (Google ToDoリスト) との双方向同期（Tasks API有効時）
    if (target.syncTasks && data.tasksSupported) {
      anyTasksSupported = true;
      const pushedTaskMap = data.pushedTaskMapping || {};
      const pushedTaskIdsNow = new Set(taskUpserts.map((tu) => tu.id));
      const seenGoogleTaskIds = new Set<string>();

      for (const delTask of taskDeletions) {
        const localDel = nextEvents[delTask.id];
        if (localDel && localDel.deletedAt) {
          nextEvents[delTask.id] = {
            ...localDel,
            googleTaskId: undefined,
            googleTaskListId: undefined,
            googleTaskSynced: false,
            updatedAt: idBumpIso,
          };
        }
      }

      for (const [paircalId, taskRef] of Object.entries(pushedTaskMap)) {
        const localTask = nextEvents[paircalId];
        if (localTask && !localTask.deletedAt && taskRef?.googleTaskId) {
          if (
            localTask.googleTaskId !== taskRef.googleTaskId ||
            localTask.googleTaskListId !== taskRef.googleTaskListId ||
            !localTask.googleTaskSynced
          ) {
            const hadDifferentId =
              Boolean(localTask.googleTaskId) && localTask.googleTaskId !== taskRef.googleTaskId;
            nextEvents[paircalId] = {
              ...localTask,
              googleTaskSynced: true,
              googleTaskId: taskRef.googleTaskId,
              googleTaskListId: taskRef.googleTaskListId || localTask.googleTaskListId,
              ...(hadDifferentId ? { updatedAt: idBumpIso } : {}),
            };
            totalPushed++;
          }
        }
      }

      const remoteTasks = data.remoteTasks || [];
      for (const remTask of remoteTasks) {
        if (!remTask.googleTaskId) continue;
        seenGoogleTaskIds.add(remTask.googleTaskId);

        let matchedLocal: ScheduleEvent | undefined;
        if (remTask.paircalId && nextEvents[remTask.paircalId]) {
          matchedLocal = nextEvents[remTask.paircalId];
        } else {
          matchedLocal = Object.values(nextEvents).find(
            (e) =>
              e.googleTaskId === remTask.googleTaskId &&
              getEffectivePrivateFor(e) === target.defaultCreator
          );
        }

        const cleanTaskTitle = (remTask.title || '').trim() || '(無題のタスク)';
        const nextTaskCompleted = Boolean(remTask.isCompleted);

        if (matchedLocal) {
          if (matchedLocal.deletedAt) continue;

          const remTimeMs = Date.parse(remTask.updatedAt || '') || 0;
          const locTimeMs = Date.parse(matchedLocal.updatedAt || '') || 0;
          const nextTaskDate = remTask.date || matchedLocal.date;

          const hasTaskDiff =
            matchedLocal.title !== cleanTaskTitle ||
            Boolean(matchedLocal.isCompleted) !== nextTaskCompleted ||
            matchedLocal.date !== nextTaskDate ||
            (matchedLocal.memo || '') !== (remTask.memo || '');

          const wasPushedNow = pushedTaskIdsNow.has(matchedLocal.id);
          const hasNoUnpushedLocalEdit =
            Boolean(matchedLocal.googleTaskSynced) &&
            !wasPushedNow &&
            (lastSyncedMs === 0 || locTimeMs <= lastSyncedMs);

          if (hasTaskDiff && (remTimeMs > locTimeMs + 2000 || hasNoUnpushedLocalEdit)) {
            nextEvents[matchedLocal.id] = {
              ...matchedLocal,
              title: cleanTaskTitle,
              date: nextTaskDate,
              isCompleted: nextTaskCompleted,
              memo: remTask.memo || undefined,
              googleTaskSynced: true,
              googleTaskId: remTask.googleTaskId,
              googleTaskListId: remTask.googleTaskListId || matchedLocal.googleTaskListId,
              updatedAt: remTask.updatedAt || new Date().toISOString(),
            };
            totalUpdated++;
          } else if (
            matchedLocal.googleTaskId !== remTask.googleTaskId ||
            !matchedLocal.googleTaskSynced
          ) {
            nextEvents[matchedLocal.id] = {
              ...matchedLocal,
              googleTaskSynced: true,
              googleTaskId: remTask.googleTaskId,
              googleTaskListId: remTask.googleTaskListId || matchedLocal.googleTaskListId,
            };
          }
        } else {
          const safeHash = stableGoogleIdKey(remTask.googleTaskId);
          const newId = `gtask_${target.key}_${safeHash}`;
          if (nextEvents[newId]?.deletedAt) continue;

          const catInfo = resolveCategoryInfo(target.defaultCreator, categories, store.metadata);
          const nowIso = new Date().toISOString();

          nextEvents[newId] = {
            id: newId,
            date: remTask.date || getLocalTodayStr(),
            title: cleanTaskTitle,
            categoryId: target.defaultCreator,
            color: catInfo.accentColor,
            isAllDay: true,
            memo: remTask.memo || undefined,
            isTask: true,
            isCompleted: nextTaskCompleted,
            notifyTarget: target.defaultCreator,
            privateFor: target.defaultCreator,
            googleTaskSynced: true,
            syncedFromGoogle: true,
            googleTaskId: remTask.googleTaskId,
            googleTaskListId: remTask.googleTaskListId || undefined,
            createdBy: target.defaultCreator,
            createdAt: remTask.updatedAt || nowIso,
            updatedAt: remTask.updatedAt || nowIso,
          };
          totalImported++;
        }
      }

      // Google Tasks 側で完全削除されたタスクをペアカレ側でも論理削除する（エラー時はスキップ）
      if (!data.tasksError) {
        for (const [evId, localEv] of Object.entries(nextEvents)) {
          if (!localEv || localEv.deletedAt || !localEv.isTask) continue;
          if (getEffectivePrivateFor(localEv) !== target.defaultCreator) continue;
          if (
            localEv.googleTaskSynced &&
            localEv.googleTaskId &&
            !seenGoogleTaskIds.has(localEv.googleTaskId) &&
            !pushedTaskMap[evId]
          ) {
            const nowIso = new Date().toISOString();
            nextEvents[evId] = {
              ...localEv,
              deletedAt: nowIso,
              updatedAt: nowIso,
            };
            totalUpdated++;
          }
        }
      }
    }
  }

  const nowIso = new Date().toISOString();
  const updatedGcalConfig: GoogleCalendarSyncConfig = {
    ...config,
    lastGoogleSyncedAt: allTargetsSucceeded ? syncStartedIso : config.lastGoogleSyncedAt,
    updatedAt: nowIso,
  };
  saveGoogleCalendarSyncConfig(updatedGcalConfig);

  const nextStore: CalendarDataStore = {
    ...store,
    metadata: {
      ...store.metadata,
      googleCalendarSyncConfig: updatedGcalConfig,
      updatedAt: nowIso,
    },
    events: nextEvents,
    updatedAt: nowIso,
  };

  const parts: string[] = [];
  if (totalImported > 0) parts.push(`Googleから+${totalImported}件取込`);
  if (totalPushed > 0) parts.push(`Googleへ${totalPushed}件反映`);
  if (totalUpdated > 0) parts.push(`${totalUpdated}件更新`);

  const syncLabel = anyTasksSupported ? 'Googleカレンダー＆Googleタスク' : 'Googleカレンダー';
  const statusMessage =
    parts.length > 0
      ? `📅 ${syncLabel}同期完了（${parts.join('・')}）✨`
      : `📅 ${syncLabel}と双方向同期しました（最新の状態です✨）`;

  return {
    nextStore,
    importedCount: totalImported,
    updatedCount: totalUpdated,
    pushedCount: totalPushed,
    tasksSupported: anyTasksSupported,
    statusMessage,
  };
}


