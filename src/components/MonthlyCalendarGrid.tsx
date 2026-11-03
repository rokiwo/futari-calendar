import React, { useRef, useState } from 'react';
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
  onSwipePrevMonth?: () => void;
  onSwipeNextMonth?: () => void;
}

interface DayCellData {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dayOfWeek: number; // 0: Sun ... 6: Sat
  holidayName: string | null;
}

function buildMonthGrid(year: number, month: number): DayCellData[] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDayOfWeek = firstDay.getDay();
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

  // 翌月の埋め草
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
  onSwipePrevMonth,
  onSwipeNextMonth,
}) => {
  const [poppedShiftId, setPoppedShiftId] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

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

  const isHolidayShift = (shift?: ShiftEntry): boolean => {
    if (!shift || shift.deletedAt) return false;
    const preset = stampMap.get(shift.stampId);
    if (!preset) return false;
    if (preset.isHoliday) return true;
    return /休|有休|公休|夏休|冬休/.test(preset.label);
  };

  const isUnreadByPartner = (updatedAt: string, createdBy: PartnerId): boolean => {
    if (createdBy !== activePartner) return false;
    const updatedMs = Date.parse(updatedAt) || 0;
    return updatedMs > otherLastSeenMs;
  };

  const myLastSeenMs = Date.parse(store.metadata.partners[activePartner].lastSeenAt || '') || 0;
  const isNewFromPartner = (updatedAt: string, createdBy: PartnerId): boolean => {
    if (createdBy === activePartner) return false;
    const updatedMs = Date.parse(updatedAt) || 0;
    return updatedMs > myLastSeenMs;
  };

  const weekDays = [
    { label: '日', color: 'text-rose-500 bg-rose-50/70' },
    { label: '月', color: 'text-stone-600 bg-white/80' },
    { label: '火', color: 'text-stone-600 bg-white/80' },
    { label: '水', color: 'text-stone-600 bg-white/80' },
    { label: '木', color: 'text-stone-600 bg-white/80' },
    { label: '金', color: 'text-stone-600 bg-white/80' },
    { label: '土', color: 'text-sky-600 bg-sky-50/70' },
  ];

  return (
    <div
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null || touchStartY.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx > 0) {
            onSwipePrevMonth?.();
          } else {
            onSwipeNextMonth?.();
          }
        }
        touchStartX.current = null;
        touchStartY.current = null;
      }}
      className="max-w-5xl mx-auto px-1 sm:px-4 pt-1.5 pb-28"
    >
      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5 mb-1">
        {weekDays.map((w) => (
          <div
            key={w.label}
            className={`text-center py-1 rounded-xl text-[11px] font-extrabold border border-stone-200/50 ${w.color}`}
          >
            {w.label}
          </div>
        ))}
      </div>

      {/* 月間カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5">
        {cells.map((cell) => {
          const shiftA = store.shifts[`${cell.dateStr}_partnerA`];
          const shiftB = store.shifts[`${cell.dateStr}_partnerB`];
          const activeShiftA = shiftA && !shiftA.deletedAt ? shiftA : undefined;
          const activeShiftB = shiftB && !shiftB.deletedAt ? shiftB : undefined;

          const stampA = activeShiftA ? stampMap.get(activeShiftA.stampId) : undefined;
          const stampB = activeShiftB ? stampMap.get(activeShiftB.stampId) : undefined;

          const isBothHoliday = isHolidayShift(activeShiftA) && isHolidayShift(activeShiftB);
          const dayEvents = eventsByDate.get(cell.dateStr) || [];
          const daySupport = store.daySupports?.[cell.dateStr];
          const supportBadges = [
            ...(daySupport?.badges || []),
            ...dayEvents.flatMap((e) => e.supportBadges || []),
          ];
          const uniqueSupports = Array.from(new Set(supportBadges));

          const isSelected = selectedDate === cell.dateStr;

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
              className={`group relative flex flex-col rounded-xl sm:rounded-2xl border transition-all cursor-pointer select-none ${
                isExpandedView ? 'min-h-[112px] sm:min-h-[140px]' : 'h-[108px] sm:h-[130px]'
              } ${
                !cell.isCurrentMonth ? 'opacity-40 bg-stone-50/70' : 'bg-white'
              } ${
                isBothHoliday && cell.isCurrentMonth
                  ? 'bg-gradient-to-b from-[#FFF0F5] via-white to-[#FFF9FB] border-[#FFB3C6] shadow-xs'
                  : 'border-stone-200/80 active:scale-[0.98]'
              } ${
                isSelected
                  ? stampModeActive
                    ? 'ring-2 sm:ring-3 ring-[#FF8FAB] border-[#FF8FAB] shadow-md scale-[1.01] z-10'
                    : 'ring-2 ring-[#B388EB] border-[#B388EB] z-10'
                  : ''
              } p-0.5 sm:p-1.5`}
            >
              {/* 1. 日付ヘッダー行 */}
              <div className="flex items-center justify-between gap-0.5 mb-0.5 px-0.5">
                <div className="flex items-center gap-0.5 min-w-0">
                  <span
                    className={`inline-flex items-center justify-center text-[11px] sm:text-sm font-extrabold leading-none ${
                      cell.isToday
                        ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#FF8FAB] text-white shadow-2xs'
                        : dateTextColor
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                  {cell.holidayName && (
                    <span
                      className="text-[8px] sm:text-[10px] font-bold text-rose-500 truncate max-w-[34px] sm:max-w-[70px]"
                      title={cell.holidayName}
                    >
                      {cell.holidayName}
                    </span>
                  )}
                </div>

                {isBothHoliday && (
                  <span
                    className="inline-flex items-center px-1 rounded-full bg-[#FFE5EC] text-[#D63864] text-[8px] sm:text-[10px] font-black"
                    title="✨2人ともお休みの日！"
                  >
                    💕
                  </span>
                )}
              </div>

              {/* 2. シフト2人並列バー（セル上部固定） */}
              <div className="grid grid-cols-2 gap-0.5 mb-0.5 shrink-0">
                {/* パートナーA */}
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
                  className={`relative rounded-md sm:rounded-lg px-0.5 py-0.5 text-[9px] sm:text-[11px] font-extrabold flex flex-col items-center justify-center leading-tight border ${
                    stampA
                      ? 'border-black/5'
                      : 'bg-stone-50/90 text-stone-300 border-dashed border-stone-200/80'
                  }`}
                >
                  <div className="flex items-center gap-0.5 truncate max-w-full">
                    {stampA ? (
                      <span className="truncate">
                        {activeShiftA?.customLabel || stampA.shortLabel}
                      </span>
                    ) : (
                      <span className="text-[8px] font-normal opacity-60">{partnerA.avatar}</span>
                    )}
                  </div>
                  {showShiftTimeInCell &&
                    stampA &&
                    (activeShiftA?.startTime || stampA.startTime) && (
                      <span className="text-[7px] sm:text-[8px] font-bold opacity-85 tracking-tighter truncate max-w-full">
                        {activeShiftA?.startTime || stampA.startTime}
                      </span>
                    )}
                  {activeShiftA &&
                    (isUnreadByPartner(activeShiftA.updatedAt, activeShiftA.createdBy) ||
                      isNewFromPartner(activeShiftA.updatedAt, activeShiftA.createdBy)) && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#FF8FAB] ring-1 ring-white" />
                    )}
                  {poppedShiftId === activeShiftA?.id &&
                    (activeShiftA?.startTime || stampA?.startTime) && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap bg-stone-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-md">
                        {activeShiftA?.startTime || stampA?.startTime}-
                        {activeShiftA?.endTime || stampA?.endTime}
                      </div>
                    )}
                </div>

                {/* パートナーB */}
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
                  className={`relative rounded-md sm:rounded-lg px-0.5 py-0.5 text-[9px] sm:text-[11px] font-extrabold flex flex-col items-center justify-center leading-tight border ${
                    stampB
                      ? 'border-black/5'
                      : 'bg-stone-50/90 text-stone-300 border-dashed border-stone-200/80'
                  }`}
                >
                  <div className="flex items-center gap-0.5 truncate max-w-full">
                    {stampB ? (
                      <span className="truncate">
                        {activeShiftB?.customLabel || stampB.shortLabel}
                      </span>
                    ) : (
                      <span className="text-[8px] font-normal opacity-60">{partnerB.avatar}</span>
                    )}
                  </div>
                  {showShiftTimeInCell &&
                    stampB &&
                    (activeShiftB?.startTime || stampB.startTime) && (
                      <span className="text-[7px] sm:text-[8px] font-bold opacity-85 tracking-tighter truncate max-w-full">
                        {activeShiftB?.startTime || stampB.startTime}
                      </span>
                    )}
                  {activeShiftB &&
                    (isUnreadByPartner(activeShiftB.updatedAt, activeShiftB.createdBy) ||
                      isNewFromPartner(activeShiftB.updatedAt, activeShiftB.createdBy)) && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#B388EB] ring-1 ring-white" />
                    )}
                  {poppedShiftId === activeShiftB?.id &&
                    (activeShiftB?.startTime || stampB?.startTime) && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap bg-stone-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-md">
                        {activeShiftB?.startTime || stampB?.startTime}-
                        {activeShiftB?.endTime || stampB?.endTime}
                      </div>
                    )}
                </div>
              </div>

              {/* 3. すれ違いサポートアイコン */}
              {uniqueSupports.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mb-0.5 shrink-0">
                  {uniqueSupports.map((badge) => (
                    <span
                      key={badge}
                      className="px-1 py-0.1 rounded bg-[#FFF6D6] border border-[#FFE28A] text-[#8A5A00] text-[8px] sm:text-[9px] font-extrabold leading-tight truncate max-w-full"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              )}

              {/* 4. 予定リストエリア */}
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
                      className={`relative rounded pl-1 pr-0.5 py-0.5 border-l-2 sm:border-l-3 text-[9px] sm:text-[11px] font-bold leading-tight ${
                        isExpandedView ? 'whitespace-pre-wrap break-words' : 'truncate'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-0.5">
                        <div className={isExpandedView ? 'break-words' : 'truncate'}>
                          {!ev.isAllDay && ev.startTime && (
                            <span className="text-[8px] font-extrabold opacity-80 mr-0.5">
                              {ev.startTime}
                            </span>
                          )}
                          <span>{ev.title}</span>
                        </div>

                        {(unreadForOther || unreadForMe) && (
                          <span
                            className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-white ${
                              unreadForMe ? 'bg-rose-500 animate-ping' : 'bg-[#FF8FAB]'
                            }`}
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
