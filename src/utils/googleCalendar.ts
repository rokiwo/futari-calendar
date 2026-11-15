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

  const target: NotifyTarget =
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
      const nextDt = new Date(y, m - 1, d + 1);
      const startStr = `${y}${pad(m)}${pad(d)}`;
      const endStr = `${nextDt.getFullYear()}${pad(nextDt.getMonth() + 1)}${pad(
        nextDt.getDate()
      )}`;
      datesParam = `${startStr}/${endStr}`;
    }
  } else {
    const [sh, sm] = ev.startTime.split(':').map(Number);
    const startStr = `${y}${pad(m)}${pad(d)}T${pad(sh)}${pad(sm || 0)}00`;

    let eh = sh + 1;
    let em = sm || 0;
    if (ev.endTime) {
      const parts = ev.endTime.split(':').map(Number);
      eh = parts[0];
      em = parts[1] || 0;
    }
    if (eh >= 24) eh = 23;
    const endStr = `${y}${pad(m)}${pad(d)}T${pad(eh)}${pad(em)}00`;
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
    if (startT && endT && startT < endT) {
      const [sh, sm] = startT.split(':').map(Number);
      const [eh, em] = endT.split(':').map(Number);
      lines.push(`DTSTART:${dateCompact}T${pad(sh)}${pad(sm || 0)}00`);
      lines.push(`DTEND:${dateCompact}T${pad(eh)}${pad(em || 0)}00`);
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
      const nextDt = new Date(y, m - 1, d + 1);
      const nextCompact = `${nextDt.getFullYear()}${pad(
        nextDt.getMonth() + 1
      )}${pad(nextDt.getDate())}`;
      lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
      lines.push(`DTEND;VALUE=DATE:${nextCompact}`);
    } else {
      const startT = ev.startTime || '09:00';
      const endT = ev.endTime || '09:30';
      const [sh, sm] = startT.split(':').map(Number);
      const [eh, em] = endT.split(':').map(Number);
      lines.push(`DTSTART:${dateCompact}T${pad(sh)}${pad(sm || 0)}00`);
      lines.push(`DTEND:${dateCompact}T${pad(eh)}${pad(em || 0)}00`);
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

export function loadGoogleCalendarSyncConfig(
  storeConfig?: GoogleCalendarSyncConfig
): GoogleCalendarSyncConfig {
  if (storeConfig && (storeConfig.partnerAGasUrl || storeConfig.partnerBGasUrl)) {
    return {
      enabled: storeConfig.enabled ?? true,
      autoSync: storeConfig.autoSync ?? true,
      partnerAGasUrl: storeConfig.partnerAGasUrl || DEFAULT_PARTNER_A_GAS_URL,
      partnerACalendarId: storeConfig.partnerACalendarId || 'primary',
      partnerBGasUrl: storeConfig.partnerBGasUrl || '',
      partnerBCalendarId: storeConfig.partnerBCalendarId || 'primary',
      sharedCalendarId: storeConfig.sharedCalendarId || '',
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
      const hadCustomUrl = Boolean(parsed.partnerAGasUrl || parsed.partnerBGasUrl);
      const partnerAGasUrl = parsed.partnerAGasUrl || DEFAULT_PARTNER_A_GAS_URL;
      return {
        enabled: hadCustomUrl ? (parsed.enabled ?? true) : true,
        autoSync: parsed.autoSync ?? true,
        partnerAGasUrl,
        partnerACalendarId: parsed.partnerACalendarId || 'primary',
        partnerBGasUrl: parsed.partnerBGasUrl || '',
        partnerBCalendarId: parsed.partnerBCalendarId || 'primary',
        sharedCalendarId: parsed.sharedCalendarId || '',
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
    partnerBCalendarId: 'primary',
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
 * Googleカレンダーとペアカレの完全双方向同期（＆Geminiからの予定自動取り込み）を実現するスクリプト
 */
export function getGoogleAppsScriptTemplateCode(): string {
  return `/**
 * 🐻💕🐰 ペアカレ (PairCal) ⇄ Googleカレンダー 双方向自動同期ブリッジ (GAS)
 * スマホの Gemini（「@Googleカレンダー 明日の19時から焼肉を追加して」等）で入れた予定も
 * 自動的にペアカレへ双方向同期されます！
 *
 * 【使い方（1分で完了・APIキー不要）】
 * 1. https://script.google.com/ を開いて「新しいプロジェクト」を作成
 * 2. このコードをすべて貼り付けて保存（Ctrl+S / ⌘+S）
 * 3. 右上の「デプロイ」＞「新しいデプロイ」をクリック
 * 4. 種類の選択（歯車アイコン）で「ウェブアプリ」を選択
 * 5. 次のユーザーとして実行：「自分」 ／ アクセスできるユーザー：「全員」にして「デプロイ」
 * 6. 発行された「ウェブアプリURL (https://script.google.com/macros/s/.../exec)」をペアカレに貼り付けるだけ！
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    app: 'PairCal-GoogleCalendar-Bridge',
    message: 'ペアカレ Googleカレンダー双方向同期ブリッジが正常に稼働しています✨'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var body = JSON.parse(raw);
    var action = body.action || 'sync';

    if (action === 'ping') {
      var calId = body.calendarId || 'primary';
      var cal = calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
      if (!cal) {
        return jsonResponse({ ok: false, error: '指定されたカレンダーIDが見つかりません: ' + calId });
      }
      return jsonResponse({
        ok: true,
        calendarName: cal.getName(),
        timeZone: cal.getTimeZone()
      });
    }

    if (action === 'sync') {
      var result = syncCalendarEvents(body);
      return jsonResponse(result);
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function syncCalendarEvents(payload) {
  var calId = payload.calendarId || 'primary';
  var cal = calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
  if (!cal) {
    return { ok: false, error: 'カレンダーが見つかりません (' + calId + ')。カレンダーの共有設定またはIDを確認してください。' };
  }

  var pastDays = Number(payload.pastDays || 30);
  var futureDays = Number(payload.futureDays || 120);
  var now = new Date();
  var startRange = new Date(now.getTime() - pastDays * 24 * 60 * 60 * 1000);
  var endRange = new Date(now.getTime() + futureDays * 24 * 60 * 60 * 1000);

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

  // 2. ペアカレ側の変更（新規追加・更新・削除）をGoogleカレンダーへ反映
  var upserts = payload.upserts || [];
  var pushedMapping = {}; // { [paircalEventId]: googleEventId }

  for (var j = 0; j < upserts.length; j++) {
    var item = upserts[j];
    if (!item || !item.id || !item.date) continue;

    var targetEv = null;
    if (item.googleEventId && byGoogleId[item.googleEventId]) {
      targetEv = byGoogleId[item.googleEventId];
    } else if (byPairCalId[item.id]) {
      targetEv = byPairCalId[item.id];
    } else if (item.googleEventId) {
      try {
        targetEv = cal.getEventById(item.googleEventId);
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

    var titleText = (item.isTask ? '✅ ' : '') + (item.title || '予定');
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
      if (targetEv) {
        var curTitle = targetEv.getTitle();
        var curAllDay = targetEv.isAllDayEvent();
        var curStart = targetEv.getAllDayStartDate ? targetEv.getAllDayStartDate() : targetEv.getStartTime();
        var sameDay = curAllDay && curStart.getFullYear() === y && curStart.getMonth() === m && curStart.getDate() === d;
        if (curTitle !== titleText) targetEv.setTitle(titleText);
        if (!sameDay) targetEv.setAllDayDate(allDayDate);
        if ((targetEv.getDescription() || '') !== fullDesc) targetEv.setDescription(fullDesc);
      } else {
        targetEv = cal.createAllDayEvent(titleText, allDayDate, { description: fullDesc });
        try { targetEv.setTag('paircal_id', item.id); } catch (ignore) {}
        applyReminderIfNeeded(targetEv, item.reminderMinutes);
      }
    } else {
      var sp = item.startTime.split(':');
      var sh = Number(sp[0] || 9);
      var sm = Number(sp[1] || 0);
      var startDt = new Date(y, m, d, sh, sm, 0);

      var eh = sh + 1;
      var em = sm;
      if (item.endTime) {
        var ep = item.endTime.split(':');
        eh = Number(ep[0]);
        em = Number(ep[1] || 0);
      }
      var endDt = new Date(y, m, d, eh, em, 0);
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
        applyReminderIfNeeded(targetEv, item.reminderMinutes);
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
    var gEventId = ev.getId();
    var paircalId = '';
    try {
      paircalId = ev.getTag('paircal_id') || '';
    } catch (ignore) {}
    var rawDesc = ev.getDescription() || '';
    if (!paircalId) {
      var match = rawDesc.match(/\\[PAIRCAL_ID:([^\\]]+)\\]/);
      if (match && match[1]) paircalId = match[1];
    }

    var cleanMemo = rawDesc.replace(/\\n?\\[PAIRCAL_ID:[^\\]]+\\]/g, '').trim();
    var isAllDay = ev.isAllDayEvent();
    var startDateObj = isAllDay ? ev.getAllDayStartDate() : ev.getStartTime();
    var endDateObj = isAllDay ? ev.getAllDayEndDate() : ev.getEndTime();

    var dateStr = Utilities.formatDate(startDateObj, tz, 'yyyy-MM-dd');
    var startTimeStr = isAllDay ? '' : Utilities.formatDate(startDateObj, tz, 'HH:mm');
    var endTimeStr = isAllDay ? '' : Utilities.formatDate(endDateObj, tz, 'HH:mm');

    var lastUpdatedObj = ev.getLastUpdated ? ev.getLastUpdated() : new Date();
    var updatedIso = lastUpdatedObj ? lastUpdatedObj.toISOString() : new Date().toISOString();

    remoteList.push({
      googleEventId: gEventId,
      paircalId: paircalId || null,
      title: ev.getTitle() || '(無題の予定)',
      date: dateStr,
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

function applyReminderIfNeeded(ev, reminderMinutes) {
  try {
    if (reminderMinutes !== undefined && reminderMinutes !== null) {
      ev.removeAllReminders();
      var min = Number(reminderMinutes);
      if (min >= 0 && min <= 40320) {
        ev.addPopupReminder(min);
      }
    }
  } catch (ignore) {}
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}

interface GasRemoteEventItem {
  googleEventId: string;
  paircalId?: string | null;
  title: string;
  date: string;
  isAllDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  memo?: string | null;
  updatedAt: string;
}

interface GasSyncResponse {
  ok: boolean;
  error?: string;
  calendarName?: string;
  pushedMapping?: Record<string, string>;
  idMap?: Record<string, string>;
  remoteEvents?: GasRemoteEventItem[];
  events?: GasRemoteEventItem[];
  syncedAt?: string;
}

/**
 * GAS エンドポイントへ疎通テスト（Ping）を送信
 */
export async function testGoogleCalendarGasConnection(
  gasUrl: string,
  calendarId = 'primary'
): Promise<{ ok: boolean; calendarName?: string; error?: string }> {
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
    return { ok: true, calendarName: data.calendarName || 'Googleカレンダー' };
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
  // プライベート予定およびタスク（常に個人専用）は本人のカレンダーのみに同期し、相手や共有カレンダーには出さない
  const priv = getEffectivePrivateFor(ev);
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
  const urlB = config.partnerBGasUrl?.trim() || '';
  if (!urlA && !urlB) {
    throw new Error('Googleカレンダー同期用のGAS WebアプリURLが設定されていません。');
  }

  const pastDays = config.syncRangePastDays ?? 30;
  const futureDays = config.syncRangeFutureDays ?? 120;
  const now = new Date();
  const minDateObj = new Date(now.getTime() - pastDays * 86400000);
  const maxDateObj = new Date(now.getTime() + futureDays * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const minDateStr = `${minDateObj.getFullYear()}-${pad(minDateObj.getMonth() + 1)}-${pad(minDateObj.getDate())}`;
  const maxDateStr = `${maxDateObj.getFullYear()}-${pad(maxDateObj.getMonth() + 1)}-${pad(maxDateObj.getDate())}`;

  const hasSharedCal = Boolean(config.sharedCalendarId?.trim() && (urlA || urlB));

  // 同期ターゲット一覧を構築（ゆうと用 / さや用 / 共有カレンダー用）
  const targets: {
    key: 'partnerA' | 'partnerB' | 'shared';
    gasUrl: string;
    calendarId: string;
    defaultCategory: CalendarCategoryId;
    defaultCreator: PartnerId;
  }[] = [];

  if (urlA) {
    targets.push({
      key: 'partnerA',
      gasUrl: urlA,
      calendarId: config.partnerACalendarId?.trim() || 'primary',
      defaultCategory: 'partnerA',
      defaultCreator: 'partnerA',
    });
  }

  if (urlB) {
    // もしゆうとと全く同じURL＆同じカレンダーID('primary')の場合は重複実行を避ける
    const calA = config.partnerACalendarId?.trim() || 'primary';
    const calB = config.partnerBCalendarId?.trim() || 'primary';
    if (!(urlA === urlB && calA === calB)) {
      targets.push({
        key: 'partnerB',
        gasUrl: urlB,
        calendarId: calB,
        defaultCategory: 'partnerB',
        defaultCreator: 'partnerB',
      });
    }
  } else if (urlA && config.partnerBCalendarId?.trim() && config.partnerBCalendarId.trim() !== 'primary') {
    // 1つのGAS URLでさやの共有カレンダーIDも指定されている場合
    targets.push({
      key: 'partnerB',
      gasUrl: urlA,
      calendarId: config.partnerBCalendarId.trim(),
      defaultCategory: 'partnerB',
      defaultCreator: 'partnerB',
    });
  }

  if (hasSharedCal && config.sharedCalendarId?.trim()) {
    targets.push({
      key: 'shared',
      gasUrl: urlA || urlB,
      calendarId: config.sharedCalendarId.trim(),
      defaultCategory: 'shared',
      defaultCreator: activePartner,
    });
  }

  const nextEvents: Record<string, ScheduleEvent> = { ...store.events };
  let totalImported = 0;
  let totalUpdated = 0;
  let totalPushed = 0;
  const categories = store.categories && store.categories.length > 0 ? store.categories : DEFAULT_CATEGORIES;

  const lastSyncedMs = config.lastGoogleSyncedAt ? Date.parse(config.lastGoogleSyncedAt) || 0 : 0;

  for (const target of targets) {
    // 1a. Googleカレンダーから削除すべき予定（ローカルで削除済み かつ GoogleEventId を持つもの）
    const deletions = Object.values(nextEvents)
      .filter((ev) => {
        if (!ev || !ev.date || !ev.deletedAt) return false;
        const existingGId = ev.googleEventIds?.[target.key] || (target.key === 'partnerA' ? ev.googleEventId : undefined);
        return Boolean(existingGId);
      })
      .map((ev) => ({
        id: ev.id,
        paircalId: ev.id,
        googleEventId: ev.googleEventIds?.[target.key] || (target.key === 'partnerA' ? ev.googleEventId : undefined),
        date: ev.date,
        deletedAt: ev.deletedAt,
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
        return evUpdatedMs > lastSyncedMs - 5000;
      })
      .map((ev) => ({
        id: ev.id,
        googleEventId: ev.googleEventIds?.[target.key] || (target.key === 'partnerA' ? ev.googleEventId : undefined),
        date: ev.date,
        title: (ev.isTask ? '✅ ' : '') + ev.title,
        isAllDay: ev.isAllDay,
        startTime: ev.startTime,
        endTime: ev.endTime,
        memo: ev.memo,
        categoryId: ev.categoryId,
        supportBadges: ev.supportBadges,
        isTask: ev.isTask,
        reminderMinutes: ev.reminderMinutes,
        deletedAt: null,
      }));

    // 未紐付けのローカル予定がある場合、先にGoogleカレンダー側の最新予定を取得して
    // Google側で既に移動・更新された予定を古いローカルデータで上書きしないようにする
    let data: GasSyncResponse | null = null;
    const hasUnlinkedUpserts = upserts.some((u) => !u.googleEventId);
    if (hasUnlinkedUpserts) {
      const preRes = await fetch(target.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sync',
          calendarId: target.calendarId,
          pastDays,
          futureDays,
          upserts: [],
          deletions: [],
        }),
      });
      if (!preRes.ok) {
        throw new Error(`Googleカレンダー通信エラー (${preRes.status})`);
      }
      const preData = (await preRes.json()) as GasSyncResponse;
      if (!preData.ok) {
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

      if (upserts.length === 0 && deletions.length === 0) {
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
          upserts,
          deletions,
        }),
      });

      if (!res.ok) {
        throw new Error(`Googleカレンダー通信エラー (${res.status})`);
      }

      data = (await res.json()) as GasSyncResponse;
      if (!data.ok) {
        throw new Error(data.error || 'Googleカレンダー同期中にエラーが発生しました');
      }
    }

    // 2. Googleカレンダー側で採番された googleEventId をペアカレ側のイベントに記録
    const mapping = data.pushedMapping || data.idMap || {};
    const seenGoogleIdsInRemote = new Set<string>();

    for (const delItem of deletions) {
      const localDel = nextEvents[delItem.id];
      if (localDel && localDel.deletedAt) {
        const nextGIds = { ...(localDel.googleEventIds || {}) };
        delete nextGIds[target.key];
        nextEvents[delItem.id] = {
          ...localDel,
          googleEventId: target.key === 'partnerA' ? undefined : localDel.googleEventId,
          googleEventIds: nextGIds,
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
      const isTaskDetected =
        /^(✅|⬜|☑️|【?タスク】?|\[タスク\]|タスク[:：\s・]|TODO[:：\s・]|ToDo[:：\s・]|やること[:：\s・])/i.test(rawTrimmed) ||
        /([（(【\[](タスク|TODO|ToDo|やること)[）)】\]])\s*$/i.test(rawTrimmed);
      const cleanTitle =
        rawTrimmed
          .replace(/^(✅|⬜|☑️)\s*/, '')
          .replace(/^(【?タスク】?|\[タスク\]|タスク|TODO|ToDo|やること)[:：\s・]*/i, '')
          .replace(/\s*([（(【\[](タスク|TODO|ToDo|やること)[）)】\]])\s*$/i, '')
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
          matchedLocal.isAllDay !== rem.isAllDay ||
          (matchedLocal.startTime || '') !== (rem.startTime || '') ||
          (matchedLocal.endTime || '') !== (rem.endTime || '') ||
          (matchedLocal.memo || '') !== (rem.memo || '');

        if (hasDiff && remTimeMs > locTimeMs + 2000) {
          nextEvents[matchedLocal.id] = {
            ...matchedLocal,
            title: cleanTitle,
            date: rem.date,
            isAllDay: rem.isAllDay,
            startTime: rem.isAllDay ? undefined : rem.startTime || undefined,
            endTime: rem.isAllDay ? undefined : rem.endTime || undefined,
            memo: rem.memo || matchedLocal.memo,
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
        const safeHash = rem.googleEventId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
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

    // 4. Googleカレンダー側で削除された予定を検知してペアカレ側も論理削除する（双方向削除同期）
    for (const [evId, localEv] of Object.entries(nextEvents)) {
      if (!localEv || localEv.deletedAt) continue;
      if (localEv.date < minDateStr || localEv.date > maxDateStr) continue;
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
  }

  const nowIso = new Date().toISOString();
  const updatedGcalConfig: GoogleCalendarSyncConfig = {
    ...config,
    lastGoogleSyncedAt: nowIso,
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

  const statusMessage =
    parts.length > 0
      ? `📅 Googleカレンダー双方向同期完了（${parts.join('・')}）✨`
      : '📅 Googleカレンダーと双方向同期しました（最新の状態です✨）';

  return {
    nextStore,
    importedCount: totalImported,
    updatedCount: totalUpdated,
    pushedCount: totalPushed,
    statusMessage,
  };
}


