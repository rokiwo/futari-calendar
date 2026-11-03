import React, { useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Trash2,
  Edit3,
  CheckCircle2,
  Heart,
  Mic,
  Settings2,
  Timer,
  Briefcase,
} from 'lucide-react';
import {
  CalendarCategoryId,
  CalendarDataStore,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import {
  DEFAULT_CATEGORIES,
  EVENT_PATTERN_CATEGORIES,
  getJapaneseHoliday,
  resolveCategoryInfo,
  SUPPORT_BADGE_PRESETS,
} from '../utils/presets';

interface DayDetailModalProps {
  dateStr: string; // "YYYY-MM-DD"
  store: CalendarDataStore;
  activePartner: PartnerId;
  onClose: () => void;
  onMoveDate: (deltaDays: number) => void;
  onSetShiftAndAdvance: (
    dateStr: string,
    partnerId: PartnerId,
    stamp: StampPreset | null
  ) => void;
  onUpdateShiftDetails: (
    dateStr: string,
    partnerId: PartnerId,
    patch: Partial<ShiftEntry>
  ) => void;
  onToggleDaySupportBadge: (dateStr: string, badge: string) => void;
  onSaveEvent: (event: ScheduleEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  onOpenVoiceModal: () => void;
  onOpenShiftStampManager: () => void;
  onOpenCategoryManager: () => void;
}

function formatShortDateTime(isoStr?: string): string {
  if (!isoStr) return '';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return '';
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${m}/${d} ${hh}:${mm}`;
}

export const DayDetailModal: React.FC<DayDetailModalProps> = ({
  dateStr,
  store,
  activePartner,
  onClose,
  onMoveDate,
  onSetShiftAndAdvance,
  onUpdateShiftDetails,
  onToggleDaySupportBadge,
  onSaveEvent,
  onDeleteEvent,
  onOpenVoiceModal,
  onOpenShiftStampManager,
  onOpenCategoryManager,
}) => {
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [patternTabId, setPatternTabId] = useState<string>(
    EVENT_PATTERN_CATEGORIES[0].id
  );

  // 新規・編集用フォームステート
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<CalendarCategoryId>('shared');
  const [isAllDay, setIsAllDay] = useState(false);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [memo, setMemo] = useState('');
  const [eventBadges, setEventBadges] = useState<string[]>([]);

  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekDay = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
  const holidayName = getJapaneseHoliday(dateStr);

  const partnerA = store.metadata.partners.partnerA;
  const partnerB = store.metadata.partners.partnerB;

  const categories =
    store.categories && store.categories.length > 0
      ? [...store.categories].sort((a, b) => a.order - b.order)
      : DEFAULT_CATEGORIES;

  const stampMap = new Map<string, StampPreset>();
  for (const s of store.stamps) {
    stampMap.set(s.id, s);
  }

  const shiftStamps = store.stamps
    .filter((s) => s.type === 'shift')
    .sort((a, b) => a.order - b.order);

  const rawShiftA = store.shifts[`${dateStr}_partnerA`];
  const rawShiftB = store.shifts[`${dateStr}_partnerB`];
  const shiftA = rawShiftA && !rawShiftA.deletedAt ? rawShiftA : undefined;
  const shiftB = rawShiftB && !rawShiftB.deletedAt ? rawShiftB : undefined;

  const stampA = shiftA ? stampMap.get(shiftA.stampId) : undefined;
  const stampB = shiftB ? stampMap.get(shiftB.stampId) : undefined;

  const isHolidayShift = (shift?: ShiftEntry) => {
    if (!shift || shift.isHolidayWork) return false;
    const p = stampMap.get(shift.stampId);
    return Boolean(p?.isHoliday || (p && /休|有休|公休/.test(p.label)));
  };
  const isBothHoliday = isHolidayShift(shiftA) && isHolidayShift(shiftB);

  const dayEvents = Object.values(store.events)
    .filter((e) => !e.deletedAt && e.date === dateStr)
    .sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
      return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
    });

  const daySupport = store.daySupports?.[dateStr];
  const activeDayBadges = daySupport?.badges || [];

  const renderAuditAndReadStatus = (createdBy: PartnerId, createdAt: string, updatedAt: string) => {
    const creator = store.metadata.partners[createdBy];
    const otherId: PartnerId = createdBy === 'partnerA' ? 'partnerB' : 'partnerA';
    const other = store.metadata.partners[otherId];

    const updatedMs = Date.parse(updatedAt || createdAt) || 0;
    const otherLastSeenMs = Date.parse(other.lastSeenAt || '') || 0;
    const isReadByOther = otherLastSeenMs >= updatedMs;

    const isEdited =
      updatedAt && createdAt && Math.abs(Date.parse(updatedAt) - Date.parse(createdAt)) > 5000;

    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-stone-500 mt-1.5 pt-1.5 border-t border-black/5">
        <span>
          {creator.avatar} {creator.name}が {formatShortDateTime(updatedAt || createdAt)} に
          {isEdited ? '更新' : '追加'}
        </span>
        <span>•</span>
        {isReadByOther ? (
          <span className="inline-flex items-center gap-0.5 font-extrabold text-[#1E6645]">
            <CheckCircle2 className="w-3 h-3 text-[#52B788]" />
            {other.avatar} {formatShortDateTime(other.lastSeenAt)} 確認済
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 font-extrabold text-[#D63864] bg-[#FFE5EC] px-1.5 py-0.2 rounded-full">
            🆕 {other.avatar}{other.name}は未確認
          </span>
        )}
      </div>
    );
  };

  const handleOpenNewForm = (defaultCatId?: CalendarCategoryId) => {
    setEditingEventId(null);
    setTitle('');
    setCategoryId(defaultCatId || categories[0]?.id || 'shared');
    setIsAllDay(false);
    setStartTime('10:00');
    setEndTime('12:00');
    setMemo('');
    setEventBadges([]);
    setShowEventForm(true);
  };

  const handleStartEditEvent = (ev: ScheduleEvent) => {
    setEditingEventId(ev.id);
    setTitle(ev.title);
    setCategoryId(ev.categoryId);
    setIsAllDay(ev.isAllDay);
    setStartTime(ev.startTime || '10:00');
    setEndTime(ev.endTime || '12:00');
    setMemo(ev.memo || '');
    setEventBadges(ev.supportBadges || []);
    setShowEventForm(true);
  };

  const handleSubmitEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const nowIso = new Date().toISOString();
    const cat = resolveCategoryInfo(categoryId, store.categories, store.metadata);
    const existing = editingEventId ? store.events[editingEventId] : undefined;

    const newEvent: ScheduleEvent = {
      id: editingEventId || `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: dateStr,
      title: title.trim(),
      categoryId,
      color: cat.accentColor,
      isAllDay,
      startTime: isAllDay ? undefined : startTime,
      endTime: isAllDay ? undefined : endTime,
      memo: memo.trim() || undefined,
      supportBadges: eventBadges.length > 0 ? eventBadges : undefined,
      createdBy: existing ? existing.createdBy : activePartner,
      createdAt: existing ? existing.createdAt : nowIso,
      updatedAt: nowIso,
    };

    onSaveEvent(newEvent);
    setShowEventForm(false);
    setEditingEventId(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[92vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* 1. モーダルヘッダー：日付切替＆ふたり休日バッジ */}
        <div className="bg-white px-4 py-3 border-b border-[#FFE5EC] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onMoveDate(-1)}
              className="p-1.5 rounded-xl bg-stone-100 hover:bg-[#FFE5EC] text-stone-600"
              title="前日へ"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="px-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-extrabold text-stone-800">
                  {m}月{d}日({weekDay})
                </h2>
                {holidayName && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 text-xs font-extrabold">
                    {holidayName}
                  </span>
                )}
                {isBothHoliday && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FFE5EC] text-[#D63864] text-xs font-extrabold flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 fill-[#FF8FAB] text-[#FF8FAB]" />
                    ふたり休日一致✨
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onMoveDate(1)}
              className="p-1.5 rounded-xl bg-stone-100 hover:bg-[#FFE5EC] text-stone-600"
              title="翌日へ"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. モーダル本文 */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4">
          {/* セクションA：ふたりのシフト並列入力欄（本業シフト ＋ 仕事終わり/休日のバイト ＋ 残業・休出時間） */}
          <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-stone-700">
                🐾 シフト並列確認・入力（メインを押すと翌日へ進みます⏩）
              </span>
              <button
                type="button"
                onClick={onOpenShiftStampManager}
                className="px-2.5 py-1 rounded-xl bg-[#FFE5EC] text-[#9E2A47] text-[11px] font-extrabold flex items-center gap-1"
              >
                <Settings2 className="w-3 h-3" />
                <span>シフト種類編集</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(['partnerA', 'partnerB'] as PartnerId[]).map((pid) => {
                const pInfo = store.metadata.partners[pid];
                const shift = pid === 'partnerA' ? shiftA : shiftB;
                const stamp = pid === 'partnerA' ? stampA : stampB;

                const hasSubWork = Boolean(shift?.subCustomLabel || shift?.subStampId);
                const overtime = shift?.overtimeHours || 0;
                const holWork = shift?.holidayWorkHours || 0;

                return (
                  <div
                    key={pid}
                    className="bg-[#FFFBF7] rounded-2xl p-3 border border-stone-200/90 space-y-2.5"
                  >
                    {/* パートナー名＆現在のメインシフト表示 */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                        <span className="text-base">{pInfo.avatar}</span>
                        <span>{pInfo.name}のシフト</span>
                      </span>

                      {shift && stamp ? (
                        <span
                          style={{ backgroundColor: stamp.color, color: stamp.textColor }}
                          className="px-2.5 py-0.5 rounded-xl font-extrabold text-xs flex items-center gap-1 shadow-2xs"
                        >
                          <span>{stamp.icon}</span>
                          <span>{shift.customLabel || stamp.label}</span>
                          {(shift.startTime || stamp.startTime) && (
                            <span className="text-[10px] opacity-80">
                              {shift.startTime || stamp.startTime}〜
                              {shift.endTime || stamp.endTime}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[11px] text-stone-400">未設定</span>
                      )}
                    </div>

                    {/* ① メインシフト選択ボタン（タップすると登録して翌日へ移動） */}
                    <div className="grid grid-cols-4 gap-1">
                      {shiftStamps.map((s) => {
                        const isCurrent = shift?.stampId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => onSetShiftAndAdvance(dateStr, pid, s)}
                            style={{ backgroundColor: s.color, color: s.textColor }}
                            className={`py-1.5 px-1 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-0.5 active:scale-90 transition-all border ${
                              isCurrent ? 'border-stone-800 ring-1 ring-stone-800' : 'border-white'
                            }`}
                          >
                            <span>{s.icon}</span>
                            <span className="truncate">{s.label}</span>
                          </button>
                        );
                      })}
                      {shift && (
                        <button
                          type="button"
                          onClick={() => onSetShiftAndAdvance(dateStr, pid, null)}
                          className="py-1.5 px-1 rounded-xl font-bold text-[10px] bg-stone-200/70 text-stone-600"
                        >
                          消去
                        </button>
                      )}
                    </div>

                    {/* ② 仕事終わりや休日の「＋バイト・掛け持ち」重ね記載欄 */}
                    <div className="pt-2 border-t border-stone-200/60 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-extrabold text-stone-600 flex items-center gap-1">
                          <Briefcase className="w-3 h-3 text-amber-600" />
                          <span>＋仕事終わり・休日のバイト</span>
                        </span>
                        {hasSubWork && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateShiftDetails(dateStr, pid, {
                                subStampId: undefined,
                                subCustomLabel: undefined,
                                subStartTime: undefined,
                                subEndTime: undefined,
                              })
                            }
                            className="text-[10px] font-bold text-rose-500 hover:underline"
                          >
                            バイト解除
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {[
                          { label: '🏪夜バイト', sub: 'バイト', start: '18:30', end: '22:00' },
                          { label: '🏪昼バイト', sub: 'バイト', start: '10:00', end: '15:00' },
                          { label: '💻副業', sub: '副業', start: '20:00', end: '23:00' },
                        ].map((preset) => {
                          const isSelectedSub =
                            shift?.subCustomLabel === preset.sub &&
                            shift?.subStartTime === preset.start;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() =>
                                onUpdateShiftDetails(dateStr, pid, {
                                  subStampId: 'shift_part',
                                  subCustomLabel: preset.sub,
                                  subStartTime: preset.start,
                                  subEndTime: preset.end,
                                })
                              }
                              className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border transition-all ${
                                isSelectedSub
                                  ? 'bg-[#FFF3D6] border-[#FFB703] text-[#996300] shadow-2xs'
                                  : 'bg-white border-stone-200 text-stone-600'
                              }`}
                            >
                              ＋{preset.label}({preset.start}-{preset.end})
                            </button>
                          );
                        })}
                      </div>

                      {hasSubWork && (
                        <div className="flex items-center gap-1 pt-0.5 text-[11px]">
                          <input
                            type="text"
                            value={shift?.subCustomLabel || 'バイト'}
                            onChange={(e) =>
                              onUpdateShiftDetails(dateStr, pid, {
                                subCustomLabel: e.target.value,
                              })
                            }
                            className="w-16 px-2 py-1 rounded-lg border border-stone-200 bg-white font-extrabold text-amber-900"
                          />
                          <input
                            type="time"
                            value={shift?.subStartTime || '18:30'}
                            onChange={(e) =>
                              onUpdateShiftDetails(dateStr, pid, {
                                subStartTime: e.target.value,
                              })
                            }
                            className="px-1.5 py-1 rounded-lg border border-stone-200 bg-white font-bold"
                          />
                          <span>〜</span>
                          <input
                            type="time"
                            value={shift?.subEndTime || '22:00'}
                            onChange={(e) =>
                              onUpdateShiftDetails(dateStr, pid, {
                                subEndTime: e.target.value,
                              })
                            }
                            className="px-1.5 py-1 rounded-lg border border-stone-200 bg-white font-bold"
                          />
                        </div>
                      )}
                    </div>

                    {/* ③ 残業時間・休日出勤時間の記載欄 */}
                    <div className="pt-2 border-t border-stone-200/60 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-extrabold text-stone-600 flex items-center gap-1">
                          <Timer className="w-3 h-3 text-rose-500" />
                          <span>残業・休日出勤時間</span>
                        </span>
                        {(overtime > 0 || holWork > 0) && (
                          <span className="px-2 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
                            {holWork > 0 ? `休日出勤 ${holWork}h` : `残業 +${overtime}h`}
                          </span>
                        )}
                      </div>

                      {/* ワンタップ残業・休出ボタン */}
                      <div className="flex flex-wrap gap-1">
                        {[0, 0.5, 1, 1.5, 2, 3].map((hrs) => (
                          <button
                            key={hrs}
                            type="button"
                            onClick={() =>
                              onUpdateShiftDetails(dateStr, pid, {
                                overtimeHours: hrs,
                                isHolidayWork: false,
                                holidayWorkHours: 0,
                              })
                            }
                            className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border ${
                              overtime === hrs && !holWork
                                ? 'bg-rose-500 border-rose-500 text-white'
                                : 'bg-white border-stone-200 text-stone-600'
                            }`}
                          >
                            {hrs === 0 ? 'なし' : `+${hrs}h`}
                          </button>
                        ))}
                        {[4, 8].map((hHrs) => (
                          <button
                            key={`hol_${hHrs}`}
                            type="button"
                            onClick={() =>
                              onUpdateShiftDetails(dateStr, pid, {
                                isHolidayWork: true,
                                holidayWorkHours: hHrs,
                                overtimeHours: 0,
                              })
                            }
                            className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border ${
                              holWork === hHrs
                                ? 'bg-amber-600 border-amber-600 text-white'
                                : 'bg-[#FFECE5] border-[#FFD0BF] text-[#9C3D1C]'
                            }`}
                          >
                            💼休出{hHrs}h
                          </button>
                        ))}
                      </div>

                      {/* 0.5h単位の微調整入力 */}
                      <div className="flex items-center gap-2 text-[11px] pt-0.5">
                        <span className="text-stone-500 font-bold">自由入力:</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={holWork > 0 ? holWork : overtime}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            if (holWork > 0 || shift?.isHolidayWork) {
                              onUpdateShiftDetails(dateStr, pid, {
                                isHolidayWork: val > 0,
                                holidayWorkHours: val,
                              });
                            } else {
                              onUpdateShiftDetails(dateStr, pid, {
                                overtimeHours: val,
                              });
                            }
                          }}
                          className="w-16 px-2 py-0.5 rounded-lg border border-stone-200 bg-white font-extrabold text-center"
                        />
                        <span className="font-bold text-stone-600">時間</span>
                      </div>
                    </div>

                    {shift &&
                      renderAuditAndReadStatus(shift.createdBy, shift.createdAt, shift.updatedAt)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* セクションB：🍳すれ違いサポートアイコン（1タップでごはん・お迎え目印） */}
          <div className="bg-white rounded-2xl p-3 border border-stone-200/90 shadow-xs">
            <div className="text-xs font-extrabold text-stone-700 mb-2">
              🍳 ごはん・お迎え目印（1タップで日付に表示）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUPPORT_BADGE_PRESETS.map((b) => {
                const isOn = activeDayBadges.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onToggleDaySupportBadge(dateStr, b.id)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-extrabold border transition-all ${
                      isOn
                        ? 'bg-[#FFF6D6] border-[#FFB703] text-[#8A5A00] shadow-2xs scale-[1.02]'
                        : 'bg-[#FFFBF7] border-stone-200 text-stone-600'
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* セクションC：この日の予定リスト（二人予定・夫予定・妻予定・追加項目） */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-stone-800">
                📅 この日の予定 ({dayEvents.length}件)
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenVoiceModal();
                  }}
                  className="px-3 py-1.5 rounded-2xl bg-[#B388EB] hover:bg-[#8C5EC7] text-white text-xs font-extrabold shadow-xs flex items-center gap-1"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>声で予定を入れる</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenNewForm()}
                  className="px-3 py-1.5 rounded-2xl bg-[#FF8FAB] hover:bg-[#E06C88] text-white text-xs font-extrabold shadow-xs flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>予定を追加</span>
                </button>
              </div>
            </div>

            {/* 項目別（二人予定・夫予定・妻予定）ワンタップ入力開始ボタン */}
            {!showEventForm && (
              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map((cat) => {
                  const resolved = resolveCategoryInfo(cat.id, store.categories, store.metadata);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleOpenNewForm(cat.id)}
                      style={{
                        backgroundColor: resolved.bgColor,
                        color: resolved.textColor,
                        borderColor: resolved.accentColor,
                      }}
                      className="px-2.5 py-1 rounded-xl border text-xs font-extrabold flex items-center gap-1 shadow-2xs active:scale-95"
                    >
                      <span>＋ {resolved.icon}</span>
                      <span>{resolved.shortLabel}を追加</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={onOpenCategoryManager}
                  className="px-2.5 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 text-[11px] font-bold"
                >
                  ＋項目の追加・削除
                </button>
              </div>
            )}

            {/* 新規・編集フォーム */}
            {showEventForm && (
              <form
                onSubmit={handleSubmitEvent}
                className="bg-white rounded-2xl p-3.5 border-2 border-[#FF8FAB] shadow-md space-y-3 animate-pop"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#9E2A47]">
                    {editingEventId ? '✏️ 予定を編集' : '✨ 新しい予定を追加'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEventForm(false)}
                    className="text-xs text-stone-400 hover:text-stone-600"
                  >
                    閉じる
                  </button>
                </div>

                {/* パターン別アイコン＆定型予定ワンタップ選択パレット */}
                <div className="bg-[#FFFBF7] rounded-2xl p-2.5 border border-[#FFE5EC] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-[#9E2A47]">
                      🎨 パターン別アイコン＆定型予定（1タップ入力）
                    </span>
                  </div>

                  {/* パターンカテゴリ切替タブ */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                    {EVENT_PATTERN_CATEGORIES.map((grp) => {
                      const active = patternTabId === grp.id;
                      return (
                        <button
                          key={grp.id}
                          type="button"
                          onClick={() => setPatternTabId(grp.id)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold whitespace-nowrap transition-all ${
                            active
                              ? 'bg-[#FF8FAB] text-white shadow-2xs'
                              : 'bg-white text-stone-600 border border-stone-200/80 hover:bg-stone-50'
                          }`}
                        >
                          {grp.tabLabel}
                        </button>
                      );
                    })}
                  </div>

                  {(() => {
                    const currentGrp =
                      EVENT_PATTERN_CATEGORIES.find((g) => g.id === patternTabId) ||
                      EVENT_PATTERN_CATEGORIES[0];
                    return (
                      <>
                        {/* ワンタップ定型予定チップ */}
                        <div className="flex flex-wrap gap-1">
                          {currentGrp.items.map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() => {
                                setTitle(item.title);
                                if (item.startTime) {
                                  setIsAllDay(false);
                                  setStartTime(item.startTime);
                                  if (item.endTime) setEndTime(item.endTime);
                                }
                                if (
                                  item.supportBadge &&
                                  !eventBadges.includes(item.supportBadge)
                                ) {
                                  setEventBadges([...eventBadges, item.supportBadge]);
                                }
                              }}
                              className="px-2 py-1 rounded-xl bg-white hover:bg-[#FFE5EC] border border-stone-200/90 text-[11px] font-extrabold text-stone-700 flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                            >
                              <span>{item.icon}</span>
                              <span>{item.label}</span>
                            </button>
                          ))}
                        </div>

                        {/* アイコン絵文字だけ先頭に付ける／差し替えるボタン群 */}
                        <div className="pt-1 border-t border-stone-200/60">
                          <div className="text-[10px] font-bold text-stone-400 mb-1">
                            👇 アイコンだけ選んでタイトルの先頭に付ける：
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {currentGrp.icons.map((ic) => (
                              <button
                                key={ic}
                                type="button"
                                onClick={() => {
                                  const cleaned = title.replace(
                                    /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+\s*/u,
                                    ''
                                  );
                                  setTitle(`${ic} ${cleaned}`);
                                }}
                                className="w-7 h-7 rounded-lg bg-white hover:bg-[#FFE5EC] border border-stone-200/80 text-sm flex items-center justify-center active:scale-90 transition-transform"
                              >
                                {ic}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div>
                  <textarea
                    rows={2}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="予定タイトルを入力（上のパターンをタップするか、キーボードの🎤でも入力可能）"
                    autoFocus
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] text-sm font-bold text-stone-800 focus:border-[#FF8FAB] focus:outline-none"
                  />
                </div>

                {/* カテゴリ選択（二人予定・夫予定・妻予定＋追加項目） */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {categories.map((c) => {
                    const cat = resolveCategoryInfo(c.id, store.categories, store.metadata);
                    const selected = categoryId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategoryId(c.id)}
                        style={
                          selected
                            ? { backgroundColor: cat.accentColor, color: '#fff' }
                            : { backgroundColor: cat.bgColor, color: cat.textColor }
                        }
                        className="px-2.5 py-1 rounded-xl text-xs font-extrabold transition-all"
                      >
                        {cat.icon} {cat.shortLabel}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={onOpenCategoryManager}
                    className="px-2 py-1 rounded-xl bg-stone-100 text-stone-600 text-[10px] font-bold"
                  >
                    ＋項目編集
                  </button>
                </div>

                {/* 時間設定 */}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 font-bold text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAllDay}
                      onChange={(e) => setIsAllDay(e.target.checked)}
                      className="rounded text-[#FF8FAB]"
                    />
                    <span>終日予定</span>
                  </label>

                  {!isAllDay && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="px-2.5 py-1 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold"
                      />
                      <span>〜</span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="px-2.5 py-1 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="メモ・場所・持ち物など（任意）"
                    className="w-full px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] text-xs text-stone-700"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowEventForm(false)}
                    className="px-3.5 py-1.5 rounded-xl bg-stone-100 text-stone-600 text-xs font-bold"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-[#FF8FAB] text-white text-xs font-extrabold shadow-xs"
                  >
                    {editingEventId ? '更新する' : '追加する'}
                  </button>
                </div>
              </form>
            )}

            {/* 予定リスト表示 */}
            {dayEvents.length === 0 ? (
              <div className="bg-white rounded-2xl p-5 text-center border border-dashed border-stone-200 text-xs text-stone-400">
                予定はまだありません🐾 上の「＋二人予定」「＋夫予定」「＋妻予定」または「🎙️声で予定を入れる」からすぐ登録できます。
              </div>
            ) : (
              <div className="space-y-2">
                {dayEvents.map((ev) => {
                  const cat = resolveCategoryInfo(ev.categoryId, store.categories, store.metadata);
                  return (
                    <div
                      key={ev.id}
                      style={{
                        backgroundColor: cat.bgColor,
                        borderLeftColor: ev.color || cat.accentColor,
                      }}
                      className="rounded-2xl p-3 border-l-4 shadow-xs transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              style={{ backgroundColor: cat.accentColor }}
                              className="px-2 py-0.5 rounded-full text-white text-[10px] font-extrabold"
                            >
                              {cat.icon} {cat.shortLabel}
                            </span>

                            <span className="text-xs font-extrabold text-stone-700 flex items-center gap-0.5">
                              <Clock className="w-3 h-3 opacity-70" />
                              {ev.isAllDay
                                ? '終日'
                                : `${ev.startTime || ''}${ev.endTime ? `〜${ev.endTime}` : ''}`}
                            </span>
                          </div>

                          <p
                            style={{ color: cat.textColor }}
                            className="text-sm font-extrabold whitespace-pre-wrap break-words leading-snug"
                          >
                            {ev.title}
                          </p>

                          {ev.memo && (
                            <p className="text-xs text-stone-600 bg-white/70 rounded-xl px-2.5 py-1 whitespace-pre-wrap">
                              📝 {ev.memo}
                            </p>
                          )}

                          {ev.supportBadges && ev.supportBadges.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {ev.supportBadges.map((b) => (
                                <span
                                  key={b}
                                  className="px-2 py-0.5 rounded-lg bg-[#FFF6D6] text-[#8A5A00] text-[10px] font-extrabold"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEditEvent(ev)}
                            className="p-1.5 rounded-xl bg-white/80 hover:bg-white text-stone-600 shadow-2xs"
                            title="予定を編集"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteEvent(ev.id)}
                            className="p-1.5 rounded-xl bg-white/80 hover:bg-rose-50 text-rose-500 shadow-2xs"
                            title="予定を削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {renderAuditAndReadStatus(ev.createdBy, ev.createdAt, ev.updatedAt)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
