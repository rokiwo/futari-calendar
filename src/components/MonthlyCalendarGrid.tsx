import React, { useState } from 'react';
import {
  CalendarDataStore,
  FilterCategoryId,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import { CATEGORY_MAP, getJapaneseHoliday } from '../utils/presets';

interface MonthlyCalendarGridProps {
  year: number;
  month: number; // 1-12
  store: CalendarDataStore;
  activePartner: PartnerId;
  filterCategory: FilterCategoryId;
  isExpandedView: boolean;
  showShiftTimeInCell: boolean;
  selectedDate: string; // "YYYY-MM-DD"
  stampModeActive: boolean;
  onCellClick: (dateStr: string) => void;
}

interface DayCellData {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dayOfWeek: number; // 0: Sun ... 6: Sat
  holidayName: string | null;
}

// 指定年月のカレンダーグリッド用42マス（または必要週数分）を生成
function buildMonthGrid(year: number, month: number): DayCellData[] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDayOfWeek = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
  const daysInMonth = lastDay.getDate();

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;

  const cells: DayCellData[] = [];

  // 前月の埋め草
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    const dt = new Date(year, month - 2, d);
    const yStr = dt.getFullYear();
    const mStr = String(dt.getMonth() + 1).padStart(2, '0');
    const dStr = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${yStr}-${mStr}-${dStr}`;
    cells.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      dayOfWeek: dt.getDay(),
      holidayName: getJapaneseHoliday(dateStr),
    });
  }

  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dt = new Date(year, month - 1, d);
    cells.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      dayOfWeek: dt.getDay(),
      holidayName: getJapaneseHoliday(dateStr),
    });
  }

  // 翌月の埋め草（週の終わり土曜日まで）
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const dt = new Date(year, month, d);
    const yStr = dt.getFullYear();
    const mStr = String(dt.getMonth() + 1).padStart(2, '0');
    const dStr = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${yStr}-${mStr}-${dStr}`;
    cells.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      dayOfWeek: dt.getDay(),
      holidayName: getJapaneseHoliday(dateStr),
    });
  }

  return cells;
}

export const MonthlyCalendarGrid: React.FC<MonthlyCalendarGridProps> = ({
  year,
  month,
  store,
  activePartner,
  filterCategory,
  isExpandedView,
  showShiftTimeInCell,
  selectedDate,
  stampModeActive,
  onCellClick,
}) => {
  // シフト時間をタップでポップ表示するための状態
  const [poppedShiftId, setPoppedShiftId] = useState<string | null>(null);

  const cells = buildMonthGrid(year, month);

  const stampMap = new Map<string, StampPreset>();
  for (const s of store.stamps) {
    stampMap.set(s.id, s);
  }

  const partnerA = store.metadata.partners.partnerA;
  const partnerB = store.metadata.partners.partnerB;
  const otherPartnerId: PartnerId = activePartner === 'partnerA' ? 'partnerB' : 'partnerA';
  const otherLastSeenMs = Date.parse(store.metadata.partners[otherPartnerId].lastSeenAt || '') || 0;

  // 日付ごとの予定マップを構築（件数制限なし・時刻順ソート）
  const eventsByDate = new Map<string, ScheduleEvent[]>();
  for (const ev of Object.values(store.events)) {
    if (ev.deletedAt) continue;
    if (filterCategory !== 'all' && ev.categoryId !== filterCategory) continue;

    const list = eventsByDate.get(ev.date) || [];
    list.push(ev);
    eventsByDate.set(ev.date, list);
  }

  for (const [, list] of eventsByDate) {
    list.sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
      return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
    });
  }

  // スタンプが「休日（休・有休・公休）」かどうか判定
  const isHolidayShift = (shift?: ShiftEntry): boolean => {
    if (!shift || shift.deletedAt) return false;
    const preset = stampMap.get(shift.stampId);
    if (!preset) return false;
    if (preset.isHoliday) return true;
    return /休|有休|公休|夏休|冬休/.test(preset.label);
  };

  // 相手がまだ確認していない（未読）かどうか判定
  const isUnreadByPartner = (updatedAt: string, createdBy: PartnerId): boolean => {
    if (createdBy !== activePartner) return false;
    const updatedMs = Date.parse(updatedAt) || 0;
    return updatedMs > otherLastSeenMs;
  };

  // 自分がまだ確認していない相手からの新着変更か判定
  const myLastSeenMs = Date.parse(store.metadata.partners[activePartner].lastSeenAt || '') || 0;
  const isNewFromPartner = (updatedAt: string, createdBy: PartnerId): boolean => {
    if (createdBy === activePartner) return false;
    const updatedMs = Date.parse(updatedAt) || 0;
    return updatedMs > myLastSeenMs;
  };

  const weekDays = [
    { label: '日', color: 'text-rose-500 bg-rose-50/60' },
    { label: '月', color: 'text-stone-600 bg-white/60' },
    { label: '火', color: 'text-stone-600 bg-white/60' },
    { label: '水', color: 'text-stone-600 bg-white/60' },
    { label: '木', color: 'text-stone-600 bg-white/60' },
    { label: '金', color: 'text-stone-600 bg-white/60' },
    { label: '土', color: 'text-sky-600 bg-sky-50/60' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-1.5 sm:px-4 pt-2 pb-28">
      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
        {weekDays.map((w) => (
          <div
            key={w.label}
            className={`text-center py-1.5 rounded-xl text-xs font-extrabold border border-stone-200/50 shadow-2xs ${w.color}`}
          >
            {w.label}
          </div>
        ))}
      </div>

      {/* 月間カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((cell) => {
          const shiftA = store.shifts[`${cell.dateStr}_partnerA`];
          const shiftB = store.shifts[`${cell.dateStr}_partnerB`];
          const activeShiftA = shiftA && !shiftA.deletedAt ? shiftA : undefined;
          const activeShiftB = shiftB && !shiftB.deletedAt ? shiftB : undefined;

          const stampA = activeShiftA ? stampMap.get(activeShiftA.stampId) : undefined;
          const stampB = activeShiftB ? stampMap.get(activeShiftB.stampId) : undefined;

          // ✨ふたり休日一致判定
          const isBothHoliday = isHolidayShift(activeShiftA) && isHolidayShift(activeShiftB);
          const dayEvents = eventsByDate.get(cell.dateStr) || [];
          const daySupport = store.daySupports?.[cell.dateStr];
          const supportBadges = [
            ...(daySupport?.badges || []),
            ...dayEvents.flatMap((e) => e.supportBadges || []),
          ];
          const uniqueSupports = Array.from(new Set(supportBadges));

          const isSelected = selectedDate === cell.dateStr;

          // 日付文字色
          let dateTextColor = 'text-stone-700';
          if (cell.dayOfWeek === 0 || cell.holidayName) {
            dateTextColor = 'text-rose-500';
          } else if (cell.dayOfWeek === 6) {
            dateTextColor = 'text-sky-600';
          }

          return (
            <div
              key={cell.dateStr}
              onClick={() => onCellClick(cell.dateStr)}
              className={`group relative flex flex-col rounded-2xl border transition-all cursor-pointer select-none ${
                isExpandedView ? 'min-h-[116px] sm:min-h-[142px]' : 'h-[112px] sm:h-[132px]'
              } ${
                !cell.isCurrentMonth ? 'opacity-45 bg-stone-50/70' : 'bg-white'
              } ${
                isBothHoliday && cell.isCurrentMonth
                  ? 'bg-gradient-to-b from-[#FFF0F5] via-white to-[#FFF9FB] border-[#FFB3C6] shadow-sm'
                  : 'border-stone-200/80 hover:border-[#FF8FAB]'
              } ${
                isSelected
                  ? stampModeActive
                    ? 'ring-3 ring-[#FF8FAB] border-[#FF8FAB] shadow-md scale-[1.01] z-10'
                    : 'ring-2 ring-[#B388EB] border-[#B388EB] z-10'
                  : ''
              } p-1 sm:p-1.5`}
            >
              {/* 1. 日付ヘッダー行（日付数字 ＋ 祝日名 ＋ ✨ふたり休日ハート） */}
              <div className="flex items-center justify-between gap-0.5 mb-1">
                <div className="flex items-center gap-1 min-w-0">
                  <span
                    className={`inline-flex items-center justify-center text-xs sm:text-sm font-extrabold leading-none ${
                      cell.isToday
                        ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#FF8FAB] text-white shadow-xs'
                        : dateTextColor
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                  {cell.holidayName && (
                    <span
                      className="text-[9px] sm:text-[10px] font-bold text-rose-500 truncate max-w-[44px] sm:max-w-[72px]"
                      title={cell.holidayName}
                    >
                      {cell.holidayName}
                    </span>
                  )}
                </div>

                {/* ふたり休日一致キラキラマーク */}
                {isBothHoliday && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-full bg-[#FFE5EC] text-[#D63864] text-[9px] sm:text-[10px] font-black shadow-2xs animate-pulse"
                    title="✨2人ともお休みの日！"
                  >
                    💕<span className="hidden md:inline">一致</span>
                  </span>
                )}
              </div>

              {/* 2. シフト2人並列バー（セル上部固定：左にパートナーA、右にパートナーB） */}
              <div className="grid grid-cols-2 gap-0.5 sm:gap-1 mb-1 shrink-0">
                {/* パートナーA シフト枠 */}
                <div
                  onClick={(e) => {
                    if (activeShiftA && (activeShiftA.startTime || stampA?.startTime)) {
                      e.stopPropagation();
                      setPoppedShiftId(poppedShiftId === activeShiftA.id ? null : activeShiftA.id);
                    }
                  }}
                  style={
                    stampA
                      ? { backgroundColor: stampA.color, color: stampA.textColor }
                      : undefined
                  }
                  className={`relative rounded-lg px-1 py-0.5 text-[10px] sm:text-[11px] font-extrabold flex flex-col items-center justify-center leading-tight border ${
                    stampA
                      ? 'border-black/5 shadow-2xs'
                      : 'bg-stone-50/90 text-stone-300 border-dashed border-stone-200'
                  }`}
                  title={
                    activeShiftA && stampA
                      ? `${partnerA.avatar}${partnerA.name}: ${stampA.label} ${
                          activeShiftA.startTime || stampA.startTime
                            ? `(${activeShiftA.startTime || stampA.startTime}〜${
                                activeShiftA.endTime || stampA.endTime || ''
                              })`
                            : ''
                        }`
                      : `${partnerA.avatar}${partnerA.name}: シフト未設定`
                  }
                >
                  <div className="flex items-center gap-0.5 truncate max-w-full">
                    <span className="text-[9px] opacity-85">{partnerA.avatar}</span>
                    {stampA ? (
                      <span className="truncate">
                        {activeShiftA?.customLabel || stampA.shortLabel}
                      </span>
                    ) : (
                      <span className="text-[9px] font-normal">-</span>
                    )}
                  </div>
                  {/* 時間常時表示モード時 */}
                  {showShiftTimeInCell &&
                    stampA &&
                    (activeShiftA?.startTime || stampA.startTime) && (
                      <span className="text-[8px] font-bold opacity-85 tracking-tighter truncate max-w-full">
                        {activeShiftA?.startTime || stampA.startTime}
                      </span>
                    )}
                  {/* 未確認ドット */}
                  {activeShiftA &&
                    (isUnreadByPartner(activeShiftA.updatedAt, activeShiftA.createdBy) ||
                      isNewFromPartner(activeShiftA.updatedAt, activeShiftA.createdBy)) && (
                      <span
                        className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FF8FAB] ring-1 ring-white"
                        title="未確認のシフト変更"
                      />
                    )}
                  {/* タップ時の時間ポップオーバー */}
                  {poppedShiftId === activeShiftA?.id &&
                    (activeShiftA?.startTime || stampA?.startTime) && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap bg-stone-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-md">
                        {activeShiftA?.startTime || stampA?.startTime}〜
                        {activeShiftA?.endTime || stampA?.endTime}
                      </div>
                    )}
                </div>

                {/* パートナーB シフト枠 */}
                <div
                  onClick={(e) => {
                    if (activeShiftB && (activeShiftB.startTime || stampB?.startTime)) {
                      e.stopPropagation();
                      setPoppedShiftId(poppedShiftId === activeShiftB.id ? null : activeShiftB.id);
                    }
                  }}
                  style={
                    stampB
                      ? { backgroundColor: stampB.color, color: stampB.textColor }
                      : undefined
                  }
                  className={`relative rounded-lg px-1 py-0.5 text-[10px] sm:text-[11px] font-extrabold flex flex-col items-center justify-center leading-tight border ${
                    stampB
                      ? 'border-black/5 shadow-2xs'
                      : 'bg-stone-50/90 text-stone-300 border-dashed border-stone-200'
                  }`}
                  title={
                    activeShiftB && stampB
                      ? `${partnerB.avatar}${partnerB.name}: ${stampB.label} ${
                          activeShiftB.startTime || stampB.startTime
                            ? `(${activeShiftB.startTime || stampB.startTime}〜${
                                activeShiftB.endTime || stampB.endTime || ''
                              })`
                            : ''
                        }`
                      : `${partnerB.avatar}${partnerB.name}: シフト未設定`
                  }
                >
                  <div className="flex items-center gap-0.5 truncate max-w-full">
                    <span className="text-[9px] opacity-85">{partnerB.avatar}</span>
                    {stampB ? (
                      <span className="truncate">
                        {activeShiftB?.customLabel || stampB.shortLabel}
                      </span>
                    ) : (
                      <span className="text-[9px] font-normal">-</span>
                    )}
                  </div>
                  {/* 時間常時表示モード時 */}
                  {showShiftTimeInCell &&
                    stampB &&
                    (activeShiftB?.startTime || stampB.startTime) && (
                      <span className="text-[8px] font-bold opacity-85 tracking-tighter truncate max-w-full">
                        {activeShiftB?.startTime || stampB.startTime}
                      </span>
                    )}
                  {/* 未確認ドット */}
                  {activeShiftB &&
                    (isUnreadByPartner(activeShiftB.updatedAt, activeShiftB.createdBy) ||
                      isNewFromPartner(activeShiftB.updatedAt, activeShiftB.createdBy)) && (
                      <span
                        className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#B388EB] ring-1 ring-white"
                        title="未確認のシフト変更"
                      />
                    )}
                  {/* タップ時の時間ポップオーバー */}
                  {poppedShiftId === activeShiftB?.id &&
                    (activeShiftB?.startTime || stampB?.startTime) && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap bg-stone-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-md">
                        {activeShiftB?.startTime || stampB?.startTime}〜
                        {activeShiftB?.endTime || stampB?.endTime}
                      </div>
                    )}
                </div>
              </div>

              {/* 3. すれ違いサポートアイコン（🍳夕飯不要・🍱お弁当・🚗お迎え など） */}
              {uniqueSupports.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mb-1 shrink-0">
                  {uniqueSupports.map((badge) => (
                    <span
                      key={badge}
                      className="px-1 py-0.2 rounded-md bg-[#FFF6D6] border border-[#FFE28A] text-[#8A5A00] text-[9px] font-extrabold leading-tight truncate max-w-full"
                      title={`すれ違いサポート目印: ${badge}`}
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              )}

              {/* 4. 予定リストエリア（セル下部・件数3件制限なし！全件展開 or コンパクトスクロール） */}
              <div
                className={`flex-1 flex flex-col gap-0.5 ${
                  isExpandedView ? '' : 'overflow-y-auto no-scrollbar'
                }`}
              >
                {dayEvents.map((ev) => {
                  const cat = CATEGORY_MAP[ev.categoryId] || CATEGORY_MAP.shared;
                  const unreadForOther = isUnreadByPartner(ev.updatedAt, ev.createdBy);
                  const unreadForMe = isNewFromPartner(ev.updatedAt, ev.createdBy);

                  return (
                    <div
                      key={ev.id}
                      style={{
                        backgroundColor: cat.bgColor,
                        color: cat.textColor,
                        borderLeftColor: ev.color || cat.accentColor,
                      }}
                      className={`relative rounded-md pl-1.5 pr-1 py-0.5 border-l-3 text-[10px] sm:text-[11px] font-bold leading-snug shadow-2xs ${
                        isExpandedView ? 'whitespace-pre-wrap break-words' : 'truncate'
                      }`}
                      title={`${ev.startTime ? `${ev.startTime} ` : ''}${ev.title}`}
                    >
                      <div className="flex items-start justify-between gap-0.5">
                        <div className={isExpandedView ? 'break-words' : 'truncate'}>
                          {!ev.isAllDay && ev.startTime && (
                            <span className="text-[9px] font-extrabold opacity-80 mr-0.5">
                              {ev.startTime}
                            </span>
                          )}
                          <span>{ev.title}</span>
                        </div>

                        {/* 相手が見ていない or 自分がまだ見ていない新着予定ドット */}
                        {(unreadForOther || unreadForMe) && (
                          <span
                            className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ring-1 ring-white ${
                              unreadForMe ? 'bg-rose-500 animate-ping' : 'bg-[#FF8FAB]'
                            }`}
                            title={
                              unreadForMe
                                ? 'パートナーが追加・更新した新着予定'
                                : 'パートナーがまだ見ていない予定'
                            }
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
