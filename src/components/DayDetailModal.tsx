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
  Sparkles,
  Heart,
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
  CATEGORY_MAP,
  getJapaneseHoliday,
  SUPPORT_BADGE_PRESETS,
} from '../utils/presets';

interface DayDetailModalProps {
  dateStr: string; // "YYYY-MM-DD"
  store: CalendarDataStore;
  activePartner: PartnerId;
  onClose: () => void;
  onMoveDate: (deltaDays: number) => void;
  onSetShift: (
    dateStr: string,
    partnerId: PartnerId,
    stamp: StampPreset | null,
    customStartTime?: string,
    customEndTime?: string,
    memo?: string
  ) => void;
  onToggleDaySupportBadge: (dateStr: string, badge: string) => void;
  onQuickAddEventFromStamp: (dateStr: string, stamp: StampPreset) => void;
  onSaveEvent: (event: ScheduleEvent) => void;
  onDeleteEvent: (eventId: string) => void;
}

// 日時を「11/03 18:20」形式にフォーマット
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
  onSetShift,
  onToggleDaySupportBadge,
  onQuickAddEventFromStamp,
  onSaveEvent,
  onDeleteEvent,
}) => {
  const [editingShiftPartner, setEditingShiftPartner] = useState<PartnerId | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

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

  const stampMap = new Map<string, StampPreset>();
  for (const s of store.stamps) {
    stampMap.set(s.id, s);
  }

  const shiftStamps = store.stamps.filter((s) => s.type === 'shift');
  const eventStamps = store.stamps.filter((s) => s.type === 'event');

  const rawShiftA = store.shifts[`${dateStr}_partnerA`];
  const rawShiftB = store.shifts[`${dateStr}_partnerB`];
  const shiftA = rawShiftA && !rawShiftA.deletedAt ? rawShiftA : undefined;
  const shiftB = rawShiftB && !rawShiftB.deletedAt ? rawShiftB : undefined;

  const stampA = shiftA ? stampMap.get(shiftA.stampId) : undefined;
  const stampB = shiftB ? stampMap.get(shiftB.stampId) : undefined;

  const isHolidayShift = (shift?: ShiftEntry) => {
    if (!shift) return false;
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

  // 作成者・相手の既読確認ステータス文字列を生成
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

  // 新規作成フォームを開く
  const handleOpenNewForm = () => {
    setEditingEventId(null);
    setTitle('');
    setCategoryId('shared');
    setIsAllDay(false);
    setStartTime('10:00');
    setEndTime('12:00');
    setMemo('');
    setEventBadges([]);
    setShowEventForm(true);
  };

  // 既存予定の編集フォームを開く
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
    const cat = CATEGORY_MAP[categoryId] || CATEGORY_MAP.shared;
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
        className="w-full max-w-xl max-h-[90vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* 1. モーダルヘッダー：日付切替＆ふたり休日バッジ */}
        <div className="bg-white px-4 py-3 border-b border-[#FFE5EC] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onMoveDate(-1)}
              className="p-1.5 rounded-xl bg-stone-100 hover:bg-[#FFE5EC] text-stone-600 transition-colors"
              title="前日へ"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="px-2">
              <div className="flex items-center gap-2">
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
              className="p-1.5 rounded-xl bg-stone-100 hover:bg-[#FFE5EC] text-stone-600 transition-colors"
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

        {/* 2. モーダル本文（スクロール領域） */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* セクションA：ふたりのシフト並列カード（タップで即変更＆既読ログ表示） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(['partnerA', 'partnerB'] as PartnerId[]).map((pid) => {
              const pInfo = store.metadata.partners[pid];
              const shift = pid === 'partnerA' ? shiftA : shiftB;
              const stamp = pid === 'partnerA' ? stampA : stampB;
              const isEditingThis = editingShiftPartner === pid;

              return (
                <div
                  key={pid}
                  className="bg-white rounded-2xl p-3 border border-stone-200/90 shadow-xs"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-extrabold text-stone-700 flex items-center gap-1">
                      <span className="text-base">{pInfo.avatar}</span>
                      <span>{pInfo.name}のシフト</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingShiftPartner(isEditingThis ? null : pid)
                      }
                      className="px-2.5 py-1 rounded-xl bg-[#FFFBF7] hover:bg-[#FFE5EC] border border-stone-200 text-[11px] font-extrabold text-stone-700 transition-colors"
                    >
                      {isEditingThis ? '閉じる' : 'スタンプ変更'}
                    </button>
                  </div>

                  {shift && stamp ? (
                    <div>
                      <div
                        style={{ backgroundColor: stamp.color, color: stamp.textColor }}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-extrabold text-sm"
                      >
                        <span>{stamp.icon}</span>
                        <span>{shift.customLabel || stamp.label}</span>
                        {(shift.startTime || stamp.startTime) && (
                          <span className="text-xs opacity-85 flex items-center gap-0.5 ml-1">
                            <Clock className="w-3 h-3" />
                            {shift.startTime || stamp.startTime}〜
                            {shift.endTime || stamp.endTime}
                          </span>
                        )}
                      </div>
                      {renderAuditAndReadStatus(shift.createdBy, shift.createdAt, shift.updatedAt)}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 py-1">シフト未登録（タップして登録）</p>
                  )}

                  {/* その場でシフトスタンプ変更パレット */}
                  {isEditingThis && (
                    <div className="mt-2.5 pt-2.5 border-t border-stone-100 space-y-2">
                      <div className="grid grid-cols-3 gap-1">
                        {shiftStamps.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              onSetShift(dateStr, pid, s, s.startTime, s.endTime);
                              setEditingShiftPartner(null);
                            }}
                            style={{ backgroundColor: s.color, color: s.textColor }}
                            className="py-1.5 px-2 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1 shadow-2xs hover:brightness-95"
                          >
                            <span>{s.icon}</span>
                            <span>{s.label}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            onSetShift(dateStr, pid, null);
                            setEditingShiftPartner(null);
                          }}
                          className="py-1.5 px-2 rounded-xl font-bold text-xs bg-stone-100 text-stone-600 hover:bg-rose-50 hover:text-rose-600"
                        >
                          消去
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* セクションB：🍳すれ違いサポートアイコン（1タップでごはん・お迎え目印） */}
          <div className="bg-white rounded-2xl p-3 border border-stone-200/90 shadow-xs">
            <div className="text-xs font-extrabold text-stone-700 mb-2 flex items-center justify-between">
              <span>🍳 すれ違いサポート目印（1タップで日付に表示）</span>
              <span className="text-[10px] text-stone-400 font-normal">
                夜勤・飲み会・お迎えの連絡に
              </span>
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
                        : 'bg-[#FFFBF7] border-stone-200 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* セクションC：⚡よく使う予定チップ（文字入力なしでワンタップ追加） */}
          <div className="bg-white rounded-2xl p-3 border border-stone-200/90 shadow-xs">
            <div className="text-xs font-extrabold text-stone-700 mb-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#FF8FAB]" />
              <span>ワンタップ予定追加（タップするだけで即追加！）</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {eventStamps.map((stamp) => (
                <button
                  key={stamp.id}
                  type="button"
                  onClick={() => onQuickAddEventFromStamp(dateStr, stamp)}
                  className="px-2.5 py-1.5 rounded-xl bg-[#FFFBF7] hover:bg-[#FFE5EC] border border-[#FFE5EC] text-stone-700 hover:text-[#9E2A47] text-xs font-extrabold transition-all active:scale-95 flex items-center gap-1 shadow-2xs"
                >
                  <span>＋ {stamp.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* セクションD：この日の予定リスト（件数無制限・複数行表示・作成者＆既読日時明記） */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-stone-800">
                📅 この日の予定一覧 ({dayEvents.length}件)
              </h3>
              <button
                type="button"
                onClick={handleOpenNewForm}
                className="px-3 py-1.5 rounded-2xl bg-[#FF8FAB] hover:bg-[#E06C88] text-white text-xs font-extrabold shadow-xs flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>自由入力で予定を追加</span>
              </button>
            </div>

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

                <div>
                  <textarea
                    rows={2}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="予定タイトル（複数行もそのまま表示されます✨）"
                    autoFocus
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] text-sm font-bold text-stone-800 focus:border-[#FF8FAB] focus:outline-none"
                  />
                </div>

                {/* カテゴリ選択 */}
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(CATEGORY_MAP) as CalendarCategoryId[]).map((cid) => {
                    const cat = CATEGORY_MAP[cid];
                    const selected = categoryId === cid;
                    const customLabel =
                      cid === 'partnerA'
                        ? `${partnerA.avatar} ${partnerA.name}`
                        : cid === 'partnerB'
                        ? `${partnerB.avatar} ${partnerB.name}`
                        : `${cat.icon} ${cat.shortLabel}`;
                    return (
                      <button
                        key={cid}
                        type="button"
                        onClick={() => setCategoryId(cid)}
                        style={
                          selected
                            ? { backgroundColor: cat.accentColor, color: '#fff' }
                            : { backgroundColor: cat.bgColor, color: cat.textColor }
                        }
                        className="px-2.5 py-1 rounded-xl text-xs font-extrabold transition-all"
                      >
                        {customLabel}
                      </button>
                    );
                  })}
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

                {/* メモ欄 */}
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
              <div className="bg-white rounded-2xl p-6 text-center border border-dashed border-stone-200 text-xs text-stone-400">
                この日の予定はまだありません🐾 上の「ワンタップ予定追加」または「予定を追加」から登録できます。
              </div>
            ) : (
              <div className="space-y-2">
                {dayEvents.map((ev) => {
                  const cat = CATEGORY_MAP[ev.categoryId] || CATEGORY_MAP.shared;
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
                              {ev.categoryId === 'partnerA'
                                ? `${partnerA.avatar}${partnerA.name}`
                                : ev.categoryId === 'partnerB'
                                ? `${partnerB.avatar}${partnerB.name}`
                                : `${cat.icon}${cat.shortLabel}`}
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

                        {/* 編集・削除ボタン */}
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

                      {/* いつ誰が入れたか ＆ 相手がいつ確認したかログ */}
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
