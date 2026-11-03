// Googleカレンダー連携 ＆ パートナー端末別（夫の端末のみ／妻の端末のみ）通知ユーティリティ
import {
  CalendarDataStore,
  CoupleMetadata,
  NotifyTarget,
  PartnerId,
  ScheduleEvent,
} from '../types/calendar';

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
    '--- ふたりカレ (FutariCal) より登録 ---',
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
 * 指定したパートナー（夫のみ または 妻のみ）の対象タスク＆予定だけを抽出し、
 * Googleカレンダーの通知アラーム（VALARM）付き .ics ファイルを生成する
 */
export function generatePartnerNotificationIcs(
  store: CalendarDataStore,
  targetPartner: PartnerId
): string {
  const partner = store.metadata.partners[targetPartner];
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FutariCal//GoogleCalendarPartnerSync//JP',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:ふたりカレ (${partner.avatar}${partner.name}専用通知)`,
    'X-WR-TIMEZONE:Asia/Tokyo',
  ];

  const pad = (n: number) => String(n).padStart(2, '0');
  const nowStamp =
    new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const events = Object.values(store.events).filter((ev) =>
    shouldNotifyPartner(ev, targetPartner)
  );

  for (const ev of events) {
    const [y, m, d] = ev.date.split('-').map(Number);
    const dateCompact = `${y}${pad(m)}${pad(d)}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:futarical-${ev.id}-${targetPartner}@futarical.local`);
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
      lines.push(`DTSTART;TZID=Asia/Tokyo:${dateCompact}T${pad(sh)}${pad(sm || 0)}00`);
      lines.push(`DTEND;TZID=Asia/Tokyo:${dateCompact}T${pad(eh)}${pad(em || 0)}00`);
    }

    const summary = `${ev.isTask ? '✅【タスク】' : ''}${ev.title}`.replace(
      /\r?\n/g,
      ' '
    );
    lines.push(`SUMMARY:${summary}`);
    if (ev.memo) {
      lines.push(`DESCRIPTION:${ev.memo.replace(/\r?\n/g, '\\n')}`);
    }

    // Googleカレンダーで確実にプッシュ通知を鳴らす VALARM ブロック
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
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
