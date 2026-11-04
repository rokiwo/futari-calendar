import React, { useEffect, useState } from 'react';
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
  Bell,
  CheckSquare,
  Square,
  ExternalLink,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  CalendarCategoryId,
  CalendarDataStore,
  NotifyTarget,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import {
  calculateMinutesBetween,
  DEFAULT_CATEGORIES,
  EVENT_PATTERN_CATEGORIES,
  formatMinutesShort,
  formatMinutesToJa,
  getJapaneseHoliday,
  getPartnerShiftStamps,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
  resolveCategoryInfo,
  SUPPORT_BADGE_PRESETS,
} from '../utils/presets';
import {
  buildGoogleCalendarUrl,
  getNotifyTargetLabel,
  REMINDER_PRESETS,
  shouldNotifyPartner,
} from '../utils/googleCalendar';

interface DayDetailModalProps {
  dateStr: string; // "YYYY-MM-DD"
  store: CalendarDataStore;
  activePartner: PartnerId;
  initialOpenEventForm?: boolean;
  onClose: () => void;
  onMoveDate: (deltaDays: number) => void;
  onSetShiftAndAdvance: (
    dateStr: string,
    partnerId: PartnerId,
    stamp: StampPreset | null,
    advanceDate?: boolean
  ) => void;
  onUpdateShiftDetails: (
    dateStr: string,
    partnerId: PartnerId,
    patch: Partial<ShiftEntry>
  ) => void;
  onToggleDaySupportBadge: (dateStr: string, badge: string) => void;
  onSaveEvent: (event: ScheduleEvent) => void;
  onToggleTaskComplete: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onOpenVoiceModal: () => void;
  onOpenShiftStampManager: (partnerId?: PartnerId) => void;
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
  initialOpenEventForm = false,
  onClose,
  onMoveDate,
  onSetShiftAndAdvance,
  onUpdateShiftDetails,
  onToggleDaySupportBadge,
  onSaveEvent,
  onToggleTaskComplete,
  onDeleteEvent,
  onOpenVoiceModal,
  onOpenShiftStampManager,
  onOpenCategoryManager,
}) => {
  const [showEventForm, setShowEventForm] = useState(initialOpenEventForm);
  const [formTabMode, setFormTabMode] = useState<'event' | 'task' | 'overtime'>('event');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [patternTabId, setPatternTabId] = useState<string>(
    EVENT_PATTERN_CATEGORIES[0].id
  );

  // 詳細モーダル内でシフトボタンを押した時に翌日へ自動移動するか（デフォはfalse＝同じ日に残業も続けて入れられるようにする）
  const [advanceOnShiftTap, setAdvanceOnShiftTap] = useState<boolean>(false);

  // 新規・編集用フォームステート
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<CalendarCategoryId>(
    activePartner === 'partnerB' ? 'partnerB' : 'shared'
  );
  const [isTask, setIsTask] = useState(false);
  const [notifyTarget, setNotifyTarget] = useState<NotifyTarget>(activePartner);
  const [reminderMinutes, setReminderMinutes] = useState<number>(30);
  const [autoOpenGoogleCal, setAutoOpenGoogleCal] = useState<boolean>(false);

  const [isAllDay, setIsAllDay] = useState(false);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [memo, setMemo] = useState('');
  const [eventBadges, setEventBadges] = useState<string[]>([]);

  // フォーム内の「⏱️残業・休出登録」タブ用ステート（分単位＆開始・終了時刻連動）
  const [otPartner, setOtPartner] = useState<PartnerId>(activePartner);
  const [otType, setOtType] = useState<'overtime' | 'holidayWork'>('overtime');
  const [otStartTime, setOtStartTime] = useState<string>('17:00');
  const [otEndTime, setOtEndTime] = useState<string>('17:35');
  const [otMinutes, setOtMinutes] = useState<number>(35);
  const [otDirectMinutesStr, setOtDirectMinutesStr] = useState<string>('35');

  // シフト欄の自由入力用ステート（分単位）
  const [customOtInputA, setCustomOtInputA] = useState<string>('');
  const [customOtInputB, setCustomOtInputB] = useState<string>('');

  // シフトカード内のインライン開始・終了時刻自動計算ステート
  const [showCardCalcA, setShowCardCalcA] = useState<boolean>(false);
  const [showCardCalcB, setShowCardCalcB] = useState<boolean>(false);
  const [cardStartA, setCardStartA] = useState<string>('11:00');
  const [cardEndA, setCardEndA] = useState<string>('11:35');
  const [cardStartB, setCardStartB] = useState<string>('11:00');
  const [cardEndB, setCardEndB] = useState<string>('11:35');

  useEffect(() => {
    if (initialOpenEventForm) {
      setShowEventForm(true);
    }
  }, [initialOpenEventForm]);

  const [y, m, d] = (dateStr || '').split('-').map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1, d || 1);
  const weekDay = ['日', '月', '火', '水', '木', '金', '土'][Number.isNaN(dt.getDay()) ? 0 : dt.getDay()];
  const holidayName = dateStr ? getJapaneseHoliday(dateStr) : null;

  const partnerA = store.metadata?.partners?.partnerA || { name: '夫', avatar: '🐻' };
  const partnerB = store.metadata?.partners?.partnerB || { name: 'さや', avatar: '🐰' };
  const currentPartnerInfo =
    activePartner === 'partnerB' ? partnerB : partnerA;

  const categories =
    store.categories && store.categories.length > 0
      ? [...store.categories].sort((a, b) => a.order - b.order)
      : DEFAULT_CATEGORIES;

  const stampMap = new Map<string, StampPreset>();
  for (const s of store.stamps || []) {
    stampMap.set(s.id, s);
  }

  const rawShiftA = store.shifts?.[`${dateStr}_partnerA`];
  const rawShiftB = store.shifts?.[`${dateStr}_partnerB`];
  const shiftA = rawShiftA && !rawShiftA.deletedAt ? rawShiftA : undefined;
  const shiftB = rawShiftB && !rawShiftB.deletedAt ? rawShiftB : undefined;

  useEffect(() => {
    const minA = getShiftHolidayWorkMinutes(shiftA) || getShiftOvertimeMinutes(shiftA);
    const minB = getShiftHolidayWorkMinutes(shiftB) || getShiftOvertimeMinutes(shiftB);
    setCustomOtInputA(minA > 0 ? String(minA) : '');
    setCustomOtInputB(minB > 0 ? String(minB) : '');

    const shiftEndA = shiftA?.endTime || '17:00';
    setCardStartA(shiftA?.overtimeStartTime || shiftEndA);
    setCardEndA(shiftA?.overtimeEndTime || '17:35');

    const shiftEndB = shiftB?.endTime || '17:00';
    setCardStartB(shiftB?.overtimeStartTime || shiftEndB);
    setCardEndB(shiftB?.overtimeEndTime || '17:35');
  }, [dateStr, shiftA, shiftB]);

  const stampA = shiftA ? stampMap.get(shiftA.stampId) : undefined;
  const stampB = shiftB ? stampMap.get(shiftB.stampId) : undefined;

  const isHolidayShift = (shift?: ShiftEntry) => {
    if (!shift || shift.isHolidayWork) return false;
    const p = stampMap.get(shift.stampId);
    return Boolean(p?.isHoliday || (p && /休|有休|公休/.test(p.label)));
  };
  const isBothHoliday = isHolidayShift(shiftA) && isHolidayShift(shiftB);

  const dayEvents = Object.values(store.events || {})
    .filter((e): e is ScheduleEvent => Boolean(e && !e.deletedAt && e.date === dateStr))
    .sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
      return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
    });

  const daySupport = store.daySupports?.[dateStr];
  const activeDayBadges = daySupport?.badges || [];

  // カテゴリ選択に応じて通知対象端末を自動連動（妻予定なら妻の端末のみ、夫予定なら夫の端末のみ）
  const handleSelectCategory = (catId: CalendarCategoryId) => {
    setCategoryId(catId);
    if (catId === 'partnerA') {
      setNotifyTarget('partnerA');
    } else if (catId === 'partnerB') {
      setNotifyTarget('partnerB');
    } else if (!isTask) {
      setNotifyTarget('both');
    }
  };

  const renderAuditAndReadStatus = (createdBy?: PartnerId, createdAt?: string, updatedAt?: string) => {
    try {
      const effectiveCreatorId = createdBy === 'partnerB' ? 'partnerB' : 'partnerA';
      const creator =
        store.metadata?.partners?.[effectiveCreatorId] ||
        (effectiveCreatorId === 'partnerB' ? partnerB : partnerA);
      const otherId: PartnerId = effectiveCreatorId === 'partnerA' ? 'partnerB' : 'partnerA';
      const other =
        store.metadata?.partners?.[otherId] ||
        (otherId === 'partnerB' ? partnerB : partnerA);

      const updatedMs = Date.parse(updatedAt || createdAt || '') || 0;
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
    } catch {
      return null;
    }
  };

  // 開始・終了時刻の変更（経過分数を自動計算）
  const handleTimeChange = (start: string, end: string) => {
    setOtStartTime(start);
    setOtEndTime(end);
    if (start && end) {
      const diff = calculateMinutesBetween(start, end);
      setOtMinutes(diff);
      setOtDirectMinutesStr(String(diff));
    }
  };

  // 分数の変更（プリセットボタンや微調整・直接入力から連動）
  const handleMinutesChange = (nextMin: number) => {
    const validMin = Math.max(0, Math.round(nextMin));
    setOtMinutes(validMin);
    setOtDirectMinutesStr(String(validMin));

    // 開始時刻が設定されていれば、終了時刻も自動連動
    if (otStartTime && otStartTime.includes(':')) {
      const [sh, sm] = otStartTime.split(':').map(Number);
      if (!Number.isNaN(sh) && !Number.isNaN(sm)) {
        const endTot = (sh * 60 + sm + validMin) % (24 * 60);
        const eh = String(Math.floor(endTot / 60)).padStart(2, '0');
        const em = String(endTot % 60).padStart(2, '0');
        setOtEndTime(`${eh}:${em}`);
      }
    }
  };

  const handleOpenNewForm = (
    defaultCatId?: CalendarCategoryId,
    mode: 'event' | 'task' | 'overtime' = 'event'
  ) => {
    setEditingEventId(null);
    setTitle('');
    setFormTabMode(mode);
    const defaultTaskMode = mode === 'task';
    const nextCat = defaultCatId || (defaultTaskMode ? activePartner : categories[0]?.id || 'shared');
    setCategoryId(nextCat);
    setIsTask(defaultTaskMode);
    if (nextCat === 'partnerA') {
      setNotifyTarget('partnerA');
    } else if (nextCat === 'partnerB') {
      setNotifyTarget('partnerB');
    } else {
      setNotifyTarget(defaultTaskMode ? activePartner : 'both');
    }
    setOtPartner(activePartner);
    setReminderMinutes(30);
    setAutoOpenGoogleCal(defaultTaskMode);
    setIsAllDay(false);
    setStartTime('10:00');
    setEndTime('11:00');
    setMemo('');
    setEventBadges([]);

    // 残業モード初期化（分単位＆シフト定時連動）
    if (mode === 'overtime') {
      const targetShift = activePartner === 'partnerB' ? shiftB : shiftA;
      const existingOtMin = getShiftOvertimeMinutes(targetShift);
      const existingHwMin = getShiftHolidayWorkMinutes(targetShift);
      const isHw = Boolean(existingHwMin > 0 || targetShift?.isHolidayWork);
      const initMin = isHw ? (existingHwMin || 240) : (existingOtMin || 35);

      const initStart =
        targetShift?.overtimeStartTime ||
        targetShift?.holidayWorkStartTime ||
        targetShift?.endTime ||
        '17:00';
      setOtStartTime(initStart);

      // 初期終了時刻を算出
      const [sh, sm] = initStart.split(':').map(Number);
      if (!Number.isNaN(sh) && !Number.isNaN(sm)) {
        const endTot = (sh * 60 + sm + initMin) % (24 * 60);
        const eh = String(Math.floor(endTot / 60)).padStart(2, '0');
        const em = String(endTot % 60).padStart(2, '0');
        setOtEndTime(targetShift?.overtimeEndTime || targetShift?.holidayWorkEndTime || `${eh}:${em}`);
      } else {
        setOtEndTime('17:35');
      }

      setOtMinutes(initMin);
      setOtDirectMinutesStr(String(initMin));
      setOtType(isHw ? 'holidayWork' : 'overtime');
    }

    setShowEventForm(true);
  };

  const handleStartEditEvent = (ev: ScheduleEvent) => {
    setEditingEventId(ev.id);
    setTitle(ev.title);
    setCategoryId(ev.categoryId);
    const taskFlag = Boolean(ev.isTask);
    setIsTask(taskFlag);
    setFormTabMode(taskFlag ? 'task' : 'event');
    setNotifyTarget(
      ev.notifyTarget ||
        (ev.categoryId === 'partnerA'
          ? 'partnerA'
          : ev.categoryId === 'partnerB'
          ? 'partnerB'
          : 'both')
    );
    setReminderMinutes(ev.reminderMinutes ?? 30);
    setAutoOpenGoogleCal(false);
    setIsAllDay(ev.isAllDay);
    setStartTime(ev.startTime || '10:00');
    setEndTime(ev.endTime || '11:00');
    setMemo(ev.memo || '');
    setEventBadges(ev.supportBadges || []);
    setShowEventForm(true);
  };

  // 「⏱️ 残業・休出登録」タブから直接残業時間を保存する処理（分単位保存）
  const handleSaveOvertimeFromForm = (e: React.FormEvent) => {
    e.preventDefault();
    const finalMinutes = Math.max(0, Math.round(otMinutes || 0));
    const hoursDecimal = Math.round((finalMinutes / 60) * 10) / 10;

    if (otType === 'holidayWork') {
      onUpdateShiftDetails(dateStr, otPartner, {
        isHolidayWork: finalMinutes > 0,
        holidayWorkMinutes: finalMinutes,
        holidayWorkHours: hoursDecimal,
        holidayWorkStartTime: otStartTime || undefined,
        holidayWorkEndTime: otEndTime || undefined,
        overtimeMinutes: 0,
        overtimeHours: 0,
      });
    } else {
      onUpdateShiftDetails(dateStr, otPartner, {
        overtimeMinutes: finalMinutes,
        overtimeHours: hoursDecimal,
        overtimeStartTime: otStartTime || undefined,
        overtimeEndTime: otEndTime || undefined,
        isHolidayWork: false,
        holidayWorkMinutes: 0,
        holidayWorkHours: 0,
      });
    }
    setShowEventForm(false);
  };

  const handleSubmitEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (formTabMode === 'overtime') {
      handleSaveOvertimeFromForm(e);
      return;
    }
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
      isTask,
      isCompleted: existing ? existing.isCompleted : false,
      notifyTarget,
      reminderMinutes,
      googleCalSynced: existing?.googleCalSynced || autoOpenGoogleCal,
      createdBy: existing ? existing.createdBy : activePartner,
      createdAt: existing ? existing.createdAt : nowIso,
      updatedAt: nowIso,
    };

    onSaveEvent(newEvent);

    // もし予定タイトルに「残業2時間」「残業 1.5h」「休出8h」などが含まれていたら、シフトの残業時間にも自動反映！
    const otMatch = title.match(/残業\s*([0-9]+(?:\.[0-9]+)?)\s*(?:時間|h|H)?/);
    const hwMatch = title.match(/(?:休日出勤|休出)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:時間|h|H)?/);
    const targetPid: PartnerId =
      categoryId === 'partnerA'
        ? 'partnerA'
        : categoryId === 'partnerB'
        ? 'partnerB'
        : activePartner;

    if (hwMatch) {
      const hrs = Number(hwMatch[1]);
      if (hrs > 0) {
        onUpdateShiftDetails(dateStr, targetPid, {
          isHolidayWork: true,
          holidayWorkHours: hrs,
          overtimeHours: 0,
        });
      }
    } else if (otMatch) {
      const hrs = Number(otMatch[1]);
      if (hrs > 0) {
        onUpdateShiftDetails(dateStr, targetPid, {
          overtimeHours: hrs,
        });
      }
    }

    // もし「保存時にGoogleカレンダー通知をセット」がONで、かつ自分の端末が通知対象の場合のみGoogleカレンダーを起動！
    if (autoOpenGoogleCal && shouldNotifyPartner(newEvent, activePartner)) {
      const gcalUrl = buildGoogleCalendarUrl(newEvent, store.metadata);
      window.open(gcalUrl, '_blank', 'noopener,noreferrer');
    }

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
          {/* セクションA（最上部）：この日のすべての予定＆タスク一覧 ＋ 新規追加フォーム（TimeTree風） */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <h3 className="text-sm font-extrabold text-stone-800">
                📅 この日の予定・タスク ({dayEvents.length}件)
              </h3>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenVoiceModal();
                  }}
                  className="px-2 py-1.5 rounded-2xl bg-[#B388EB] hover:bg-[#8C5EC7] text-white text-[11px] font-extrabold shadow-xs flex items-center gap-1"
                >
                  <Mic className="w-3 h-3" />
                  <span>声で追加</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenNewForm(activePartner, 'overtime')}
                  className="px-2.5 py-1.5 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-extrabold shadow-xs flex items-center gap-1"
                >
                  <Timer className="w-3 h-3" />
                  <span>＋残業登録</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenNewForm(activePartner, 'task')}
                  className="px-2.5 py-1.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-extrabold shadow-xs flex items-center gap-1"
                >
                  <CheckSquare className="w-3 h-3" />
                  <span>＋タスク</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenNewForm(undefined, 'event')}
                  className="px-2.5 py-1.5 rounded-2xl bg-[#FF8FAB] hover:bg-[#E06C88] text-white text-[11px] font-extrabold shadow-xs flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>＋予定</span>
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
                      onClick={() => handleOpenNewForm(cat.id, 'event')}
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

            {/* 新規・編集フォーム（予定 ／ Googleカレンダー連携タスク ／ 残業・休出登録） */}
            {showEventForm && (
              <form
                onSubmit={handleSubmitEvent}
                className="bg-white rounded-2xl p-3.5 border-2 border-[#FF8FAB] shadow-md space-y-3 animate-pop"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#9E2A47]">
                    {editingEventId
                      ? '✏️ 予定・タスクを編集'
                      : formTabMode === 'overtime'
                      ? '⏱️ 残業時間・休日出勤時間を登録'
                      : isTask
                      ? '✅ 新しいタスク（Googleカレンダー端末別通知）を追加'
                      : '✨ 新しい予定を追加'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEventForm(false)}
                    className="text-xs text-stone-400 hover:text-stone-600 font-bold"
                  >
                    閉じる
                  </button>
                </div>

                {/* 📅予定 ⇔ ✅タスク(ToDo) ⇔ ⏱️残業・休出 3タブ切替 */}
                <div className="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setFormTabMode('event');
                      setIsTask(false);
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all ${
                      formTabMode === 'event'
                        ? 'bg-white text-[#9E2A47] shadow-xs'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    <span>📅 通常の予定</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTabMode('task');
                      setIsTask(true);
                      if (categoryId === 'partnerA') {
                        setNotifyTarget('partnerA');
                      } else if (categoryId === 'partnerB') {
                        setNotifyTarget('partnerB');
                      } else {
                        setNotifyTarget(activePartner);
                      }
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all ${
                      formTabMode === 'task'
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    <CheckSquare className="w-3 h-3" />
                    <span>✅ タスク(通知)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTabMode('overtime');
                      setOtPartner(activePartner);
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all ${
                      formTabMode === 'overtime'
                        ? 'bg-rose-500 text-white shadow-xs'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    <Timer className="w-3 h-3" />
                    <span>⏱️ 残業・休出</span>
                  </button>
                </div>

                {/* ⏱️ 残業・休日出勤 専用登録パネル（分単位＆開始・終了時刻から自動計算） */}
                {formTabMode === 'overtime' ? (
                  <div className="bg-rose-50/70 rounded-2xl p-3.5 border border-rose-200 space-y-3">
                    {/* 1. 誰の残業か */}
                    <div className="space-y-1">
                      <span className="text-xs font-extrabold text-stone-700">
                        1. どちらの残業・休日出勤ですか？
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {(['partnerA', 'partnerB'] as PartnerId[]).map((pid) => {
                          const p = store.metadata.partners[pid];
                          const active = otPartner === pid;
                          return (
                            <button
                              key={pid}
                              type="button"
                              onClick={() => {
                                setOtPartner(pid);
                                const currentShift = pid === 'partnerB' ? shiftB : shiftA;
                                if (currentShift?.endTime) {
                                  handleTimeChange(currentShift.endTime, otEndTime || currentShift.endTime);
                                }
                              }}
                              className={`py-2 px-3 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 transition-all ${
                                active
                                  ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                                  : 'bg-white text-stone-700 border-stone-200'
                              }`}
                            >
                              <span className="text-base">{p.avatar}</span>
                              <span>{p.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. 種類（通常残業 or 休日出勤） */}
                    <div className="space-y-1">
                      <span className="text-xs font-extrabold text-stone-700">
                        2. 種類を選択
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setOtType('overtime')}
                          className={`py-2 rounded-xl text-xs font-extrabold border ${
                            otType === 'overtime'
                              ? 'bg-rose-500 text-white border-rose-500'
                              : 'bg-white text-stone-600 border-stone-200'
                          }`}
                        >
                          ⏱️ 通常残業
                        </button>
                        <button
                          type="button"
                          onClick={() => setOtType('holidayWork')}
                          className={`py-2 rounded-xl text-xs font-extrabold border ${
                            otType === 'holidayWork'
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white text-stone-600 border-stone-200'
                          }`}
                        >
                          💼 休日出勤
                        </button>
                      </div>
                    </div>

                    {/* 3. ⚡ 開始・終了時刻から自動計算（例: 11:00 〜 11:35 -> 35分） */}
                    <div className="bg-white rounded-xl p-3 border border-rose-200 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-stone-700 flex items-center gap-1">
                          <span>⚡</span>
                          <span>開始・終了時刻から自動計算</span>
                        </span>
                        {/* 該当パートナーの定時退勤時刻があればワンタップ設定ボタン */}
                        {(() => {
                          const currentShift = otPartner === 'partnerB' ? shiftB : shiftA;
                          const shiftEnd = currentShift?.endTime;
                          if (!shiftEnd) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                handleTimeChange(shiftEnd, otEndTime || shiftEnd);
                              }}
                              className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200"
                              title={`この日のシフト定時(${shiftEnd})を開始時刻にセット`}
                            >
                              💡 定時({shiftEnd})から開始
                            </button>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] font-extrabold text-stone-500 block mb-0.5">
                            開始時刻
                          </label>
                          <input
                            type="time"
                            value={otStartTime}
                            onChange={(e) => handleTimeChange(e.target.value, otEndTime)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-stone-300 font-black text-sm text-stone-800 bg-stone-50 text-center"
                          />
                        </div>
                        <span className="text-stone-400 font-extrabold pt-4">〜</span>
                        <div className="flex-1">
                          <label className="text-[10px] font-extrabold text-stone-500 block mb-0.5">
                            終了時刻
                          </label>
                          <input
                            type="time"
                            value={otEndTime}
                            onChange={(e) => handleTimeChange(otStartTime, e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-stone-300 font-black text-sm text-stone-800 bg-stone-50 text-center"
                          />
                        </div>
                      </div>

                      {/* 自動計算結果ハイライトバッジ */}
                      <div className="flex items-center justify-between pt-1 border-t border-rose-100">
                        <span className="text-[11px] font-bold text-stone-600">
                          {otStartTime && otEndTime ? `${otStartTime} 〜 ${otEndTime} の計算結果:` : '計算結果:'}
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-black text-xs shadow-xs animate-pop">
                          ⏱️ {otMinutes}分 {otMinutes >= 60 ? `(${formatMinutesToJa(otMinutes)})` : ''}
                        </span>
                      </div>
                    </div>

                    {/* 4. ワンタップ選択・微調整 */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-extrabold text-stone-700">
                        4. ワンタップ選択・微調整
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: '0分(解除)', min: 0 },
                          { label: '+15分', min: 15 },
                          { label: '+30分', min: 30 },
                          { label: '+35分', min: 35 },
                          { label: '+45分', min: 45 },
                          { label: '+1時間', min: 60 },
                          { label: '+1時間15分', min: 75 },
                          { label: '+1.5時間', min: 90 },
                          { label: '+2時間', min: 120 },
                          { label: '+3時間', min: 180 },
                        ].map((btn) => (
                          <button
                            key={btn.min}
                            type="button"
                            onClick={() => handleMinutesChange(btn.min)}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                              otMinutes === btn.min
                                ? 'bg-stone-800 text-white border-stone-800 shadow-xs scale-105'
                                : 'bg-white text-stone-700 border-stone-200 hover:border-rose-300'
                            }`}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>

                      {/* 細かい微調整 (+5分 / -5分 / +10分 / -10分) */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-bold text-stone-500">微調整:</span>
                        {[-10, -5, +5, +10].map((delta) => (
                          <button
                            key={delta}
                            type="button"
                            onClick={() => handleMinutesChange(Math.max(0, otMinutes + delta))}
                            className="px-2 py-1 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 text-xs font-black active:scale-95 shadow-2xs"
                          >
                            {delta > 0 ? `+${delta}分` : `${delta}分`}
                          </button>
                        ))}
                      </div>

                      {/* 分単位の直接入力 */}
                      <div className="flex items-center gap-2 pt-1.5">
                        <span className="text-xs font-bold text-stone-600">直接分数入力:</span>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="1440"
                          value={otDirectMinutesStr}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setOtDirectMinutesStr(raw);
                            const val = Math.max(0, parseInt(raw, 10) || 0);
                            handleMinutesChange(val);
                          }}
                          placeholder="例: 35"
                          className="w-20 px-2.5 py-1.5 rounded-xl border border-rose-300 bg-white font-black text-sm text-center text-rose-700"
                        />
                        <span className="text-xs font-extrabold text-stone-700">分</span>
                        <span className="text-xs text-stone-500 font-bold">
                          ＝ {formatMinutesToJa(otMinutes)}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-rose-200/80">
                      <button
                        type="button"
                        onClick={() => setShowEventForm(false)}
                        className="px-3.5 py-2 rounded-xl bg-white text-stone-600 text-xs font-bold border border-stone-200"
                      >
                        キャンセル
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-extrabold shadow-sm active:scale-95 transition-all"
                      >
                        ⏱️ {m}/{d} の{otType === 'holidayWork' ? '休日出勤' : '残業'}（{formatMinutesToJa(otMinutes)}）を保存する
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
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
                        placeholder={
                          isTask
                            ? 'タスク・やることを入力（例：市役所へ行く、振込、牛乳を買うなど）'
                            : '予定タイトルを入力（上のパターンをタップするか、キーボードの🎤でも入力可能）'
                        }
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
                            onClick={() => handleSelectCategory(c.id)}
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
                        <span>終日</span>
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

                    {/* 🔔 Googleカレンダー連携 ＆ 端末別通知設定（妻なら妻の端末のみ、夫なら夫の端末のみに通知） */}
                    <div className="bg-[#F6F9FF] rounded-2xl p-3 border border-sky-200/90 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-sky-900 flex items-center gap-1">
                          <Bell className="w-3.5 h-3.5 text-sky-600" />
                          <span>Googleカレンダー通知対象（端末別通知）</span>
                        </span>
                        <span className="text-[10px] font-bold text-sky-700">
                          ※選んだ人のスマホにだけ通知されます
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setNotifyTarget('partnerA')}
                          className={`py-1.5 px-2 rounded-xl text-[11px] font-extrabold border transition-all ${
                            notifyTarget === 'partnerA'
                              ? 'bg-[#126875] text-white border-[#126875] shadow-2xs'
                              : 'bg-white text-stone-600 border-stone-200'
                          }`}
                        >
                          {partnerA.avatar} {partnerA.name}の端末のみ
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotifyTarget('partnerB')}
                          className={`py-1.5 px-2 rounded-xl text-[11px] font-extrabold border transition-all ${
                            notifyTarget === 'partnerB'
                              ? 'bg-[#6638A6] text-white border-[#6638A6] shadow-2xs'
                              : 'bg-white text-stone-600 border-stone-200'
                          }`}
                        >
                          {partnerB.avatar} {partnerB.name}の端末のみ
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotifyTarget('both')}
                          className={`py-1.5 px-2 rounded-xl text-[11px] font-extrabold border transition-all ${
                            notifyTarget === 'both'
                              ? 'bg-[#D63864] text-white border-[#D63864] shadow-2xs'
                              : 'bg-white text-stone-600 border-stone-200'
                          }`}
                        >
                          💕 2人の端末とも
                        </button>
                      </div>

                      {/* 通知タイミング */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-bold text-stone-600">通知時間:</span>
                        {REMINDER_PRESETS.map((rm) => (
                          <button
                            key={rm.value}
                            type="button"
                            onClick={() => setReminderMinutes(rm.value)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${
                              reminderMinutes === rm.value
                                ? 'bg-sky-600 text-white border-sky-600'
                                : 'bg-white text-stone-600 border-stone-200'
                            }`}
                          >
                            {rm.label}
                          </button>
                        ))}
                      </div>

                      {/* 現在の操作端末（activePartner）が通知対象に含まれている場合のみ、保存時Googleカレンダー起動チェックを表示 */}
                      {notifyTarget === 'both' || notifyTarget === activePartner ? (
                        <label className="flex items-center gap-1.5 pt-1 text-[11px] font-extrabold text-sky-900 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoOpenGoogleCal}
                            onChange={(e) => setAutoOpenGoogleCal(e.target.checked)}
                            className="rounded text-sky-600"
                          />
                          <span>
                            📲 保存と同時にこの端末（{currentPartnerInfo.avatar}
                            {currentPartnerInfo.name}）のGoogleカレンダーを開いて通知セットする
                          </span>
                        </label>
                      ) : (
                        <div className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                          💡 この予定・タスクは「
                          {notifyTarget === 'partnerA'
                            ? `${partnerA.avatar}${partnerA.name}`
                            : `${partnerB.avatar}${partnerB.name}`}
                          の端末のみ通知」に設定されています。あなたの端末には通知されず、相手の画面にGoogleカレンダー通知ボタンが表示されます。
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
                        {editingEventId ? '更新する' : isTask ? 'タスクを追加する' : '予定を追加する'}
                      </button>
                    </div>
                  </>
                )}
              </form>
            )}

            {/* 予定＆タスク一覧表示 */}
            {dayEvents.length === 0 ? (
              <div className="bg-white rounded-2xl p-4 text-center border border-dashed border-stone-200 text-xs text-stone-400">
                この日の予定・タスクはまだありません🐾 上の「＋予定」「＋タスク」「＋残業登録」からすぐ登録できます。
              </div>
            ) : (
              <div className="space-y-2">
                {dayEvents.map((ev) => {
                  const cat = resolveCategoryInfo(ev.categoryId, store.categories, store.metadata);
                  const isMyNotificationTarget = shouldNotifyPartner(ev, activePartner);
                  const notifyInfo = getNotifyTargetLabel(ev, store.metadata);

                  return (
                    <div
                      key={ev.id}
                      style={{
                        backgroundColor: cat.bgColor,
                        borderLeftColor: ev.color || cat.accentColor,
                      }}
                      className={`rounded-2xl p-3 border-l-4 shadow-xs transition-all ${
                        ev.isTask && ev.isCompleted ? 'opacity-70' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {ev.isTask && (
                              <button
                                type="button"
                                onClick={() => onToggleTaskComplete(ev.id)}
                                className={`px-2 py-0.5 rounded-full text-[11px] font-black flex items-center gap-1 transition-all ${
                                  ev.isCompleted
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-white text-emerald-700 border border-emerald-400 shadow-2xs'
                                }`}
                              >
                                {ev.isCompleted ? (
                                  <>
                                    <CheckSquare className="w-3 h-3" />
                                    <span>完了済</span>
                                  </>
                                ) : (
                                  <>
                                    <Square className="w-3 h-3" />
                                    <span>タスク未完了（タップで完了）</span>
                                  </>
                                )}
                              </button>
                            )}

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

                            <span className="px-2 py-0.5 rounded-full bg-white/80 text-stone-700 text-[10px] font-extrabold flex items-center gap-0.5">
                              <Bell className="w-2.5 h-2.5 text-sky-600" />
                              <span>{notifyInfo.label}</span>
                            </span>
                          </div>

                          <p
                            style={{ color: cat.textColor }}
                            className={`text-sm font-extrabold whitespace-pre-wrap break-words leading-snug ${
                              ev.isTask && ev.isCompleted ? 'line-through' : ''
                            }`}
                          >
                            {ev.title}
                          </p>

                          {ev.memo && (
                            <p className="text-xs text-stone-600 bg-white/70 rounded-xl px-2.5 py-1 whitespace-pre-wrap">
                              📝 {ev.memo}
                            </p>
                          )}

                          {/* Googleカレンダー通知登録ボタン：現在の操作端末（妻 or 夫）が通知対象の時だけ表示！ */}
                          {isMyNotificationTarget && (
                            <div className="pt-1">
                              <a
                                href={buildGoogleCalendarUrl(ev, store.metadata)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-extrabold shadow-2xs transition-all"
                              >
                                <Bell className="w-3 h-3 text-sky-600" />
                                <span>
                                  🔔 {currentPartnerInfo.avatar}{currentPartnerInfo.name}のGoogleカレンダーに通知登録
                                </span>
                                <ExternalLink className="w-3 h-3 opacity-70" />
                              </a>
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

          {/* セクションB：ふたりのシフト並列入力欄（本業シフト ＋ 仕事終わり/休日のバイト ＋ 残業・休出時間） */}
          <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-stone-700">
                  🐾 {m}/{d} のシフト＆残業・バイト入力
                </span>
                <label className="flex items-center gap-1 text-[10px] font-bold text-stone-500 cursor-pointer bg-stone-100 px-2 py-0.5 rounded-lg">
                  <input
                    type="checkbox"
                    checked={advanceOnShiftTap}
                    onChange={(e) => setAdvanceOnShiftTap(e.target.checked)}
                    className="rounded text-[#FF8FAB]"
                  />
                  <span>シフト押下で翌日へ進む⏩</span>
                </label>
              </div>
              <button
                type="button"
                onClick={() => onOpenShiftStampManager(activePartner)}
                className="px-2.5 py-1 rounded-xl bg-[#FFE5EC] text-[#9E2A47] text-[11px] font-extrabold flex items-center gap-1"
              >
                <Settings2 className="w-3 h-3" />
                <span>勤務リスト編集</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(['partnerA', 'partnerB'] as PartnerId[]).map((pid) => {
                const pInfo =
                  store.metadata?.partners?.[pid] || (pid === 'partnerB' ? partnerB : partnerA);
                const shift = pid === 'partnerA' ? shiftA : shiftB;
                const stamp = pid === 'partnerA' ? stampA : stampB;
                const partnerStamps = getPartnerShiftStamps(store.stamps || [], pid);

                const hasSubWork = Boolean(shift?.subCustomLabel || shift?.subStampId);
                const otMin = getShiftOvertimeMinutes(shift);
                const hwMin = getShiftHolidayWorkMinutes(shift);
                const customInputVal = pid === 'partnerA' ? customOtInputA : customOtInputB;
                const setCustomInputVal =
                  pid === 'partnerA' ? setCustomOtInputA : setCustomOtInputB;

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
                        <span className="text-[11px] text-stone-400">シフト未設定</span>
                      )}
                    </div>

                    {/* ① メインシフト選択ボタン（パートナー別の勤務リストを表示） */}
                    {partnerStamps.length === 0 ? (
                      <div className="p-2.5 rounded-xl bg-white border border-dashed border-stone-300 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-stone-500">
                          {pInfo.avatar} {pInfo.name}の勤務リストは空です
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenShiftStampManager(pid)}
                          className="px-2.5 py-1 rounded-lg bg-[#B388EB] text-white text-[10px] font-extrabold shrink-0"
                        >
                          ＋ リストを追加
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
                        {partnerStamps.map((s) => {
                          const isCurrent = shift?.stampId === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() =>
                                onSetShiftAndAdvance(dateStr, pid, s, advanceOnShiftTap)
                              }
                              style={{ backgroundColor: s.color, color: s.textColor }}
                              className={`py-1.5 px-1 rounded-xl font-extrabold text-[11px] flex flex-col items-center justify-center active:scale-90 transition-all border ${
                                isCurrent
                                  ? 'border-stone-800 ring-1 ring-stone-800'
                                  : 'border-white'
                              }`}
                            >
                              <div className="flex items-center gap-0.5">
                                <span>{s.icon}</span>
                                <span className="truncate">{s.label}</span>
                              </div>
                              <span className="text-[8.5px] opacity-75 font-bold leading-tight">
                                {s.startTime ? `${s.startTime}-${s.endTime}` : '終日'}
                              </span>
                            </button>
                          );
                        })}
                        {shift && (
                          <button
                            type="button"
                            onClick={() =>
                              onSetShiftAndAdvance(dateStr, pid, null, advanceOnShiftTap)
                            }
                            className="py-1.5 px-1 rounded-xl font-bold text-[10px] bg-stone-200/70 text-stone-600 flex items-center justify-center"
                          >
                            消去
                          </button>
                        )}
                      </div>
                    )}

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

                    {/* ③ 残業時間・休日出勤時間の記載欄（分単位） */}
                    <div className="pt-2 border-t border-stone-200/60 space-y-1.5">
                      {(() => {
                        const isPidA = pid === 'partnerA';
                        const showCardCalc = isPidA ? showCardCalcA : showCardCalcB;
                        const setShowCardCalc = isPidA ? setShowCardCalcA : setShowCardCalcB;
                        const cardStart = isPidA ? cardStartA : cardStartB;
                        const setCardStart = isPidA ? setCardStartA : setCardStartB;
                        const cardEnd = isPidA ? cardEndA : cardEndB;
                        const setCardEnd = isPidA ? setCardEndA : setCardEndB;
                        const cardDiffMin = calculateMinutesBetween(cardStart, cardEnd);
                        const shiftEnd = shift?.endTime;

                        return (
                          <>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-extrabold text-stone-600 flex items-center gap-1">
                                <Timer className="w-3 h-3 text-rose-500" />
                                <span>残業・休日出勤時間</span>
                              </span>
                              {otMin > 0 || hwMin > 0 ? (
                                <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black shadow-2xs">
                                  {hwMin > 0
                                    ? `💼 休日出勤 ${hwMin}分 (${formatMinutesToJa(hwMin)}) 反映中`
                                    : `⏱️ 残業 +${otMin}分 (${formatMinutesToJa(otMin)}) 反映中`}
                                </span>
                              ) : (
                                <span className="text-[10px] text-stone-400 font-bold">0分</span>
                              )}
                            </div>

                            {/* ⚡ 開始〜終了時刻から自動計算トグルボタン */}
                            <div className="flex items-center justify-between gap-1 pt-0.5">
                              <button
                                type="button"
                                onClick={() => setShowCardCalc(!showCardCalc)}
                                className={`px-2 py-1 rounded-lg font-extrabold text-[10px] border flex items-center gap-1 transition-all ${
                                  showCardCalc
                                    ? 'bg-rose-500 text-white border-rose-500 shadow-2xs'
                                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                }`}
                              >
                                <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                                <span>⚡ 時刻から自動計算（例: 11:00〜11:35 → 35分）</span>
                                {showCardCalc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            </div>

                            {/* ⚡ インライン展開：開始・終了時刻から自動計算パネル */}
                            {showCardCalc && (
                              <div className="bg-gradient-to-r from-rose-50 via-amber-50/50 to-rose-50 p-2.5 rounded-xl border border-rose-200 shadow-2xs space-y-2 animate-pop text-[10px]">
                                <div className="flex items-center justify-between">
                                  <span className="font-black text-rose-900 flex items-center gap-1">
                                    <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                                    <span>残業の開始〜終了時刻を入力</span>
                                  </span>
                                  {shiftEnd && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCardStart(shiftEnd);
                                        setCardEnd(shift?.overtimeEndTime || shiftEnd);
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-white border border-rose-200 text-rose-700 font-bold text-[9px] hover:bg-rose-100"
                                    >
                                      💡 定時({shiftEnd})から開始
                                    </button>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-stone-200">
                                    <span className="text-stone-400 font-bold text-[9px]">開始</span>
                                    <input
                                      type="time"
                                      value={cardStart}
                                      onChange={(e) => setCardStart(e.target.value)}
                                      className="font-black text-xs text-stone-800 bg-transparent outline-none"
                                    />
                                  </div>
                                  <span className="text-stone-400 font-black">〜</span>
                                  <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-stone-200">
                                    <span className="text-stone-400 font-bold text-[9px]">終了</span>
                                    <input
                                      type="time"
                                      value={cardEnd}
                                      onChange={(e) => setCardEnd(e.target.value)}
                                      className="font-black text-xs text-stone-800 bg-transparent outline-none"
                                    />
                                  </div>

                                  <span className="px-2 py-1 rounded-lg bg-rose-500 text-white font-black text-xs shadow-2xs">
                                    ⚡ 自動計算: {cardDiffMin}分
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCustomInputVal(String(cardDiffMin));
                                      onUpdateShiftDetails(dateStr, pid, {
                                        overtimeMinutes: cardDiffMin,
                                        overtimeHours: Math.round((cardDiffMin / 60) * 10) / 10,
                                        overtimeStartTime: cardStart,
                                        overtimeEndTime: cardEnd,
                                        isHolidayWork: false,
                                        holidayWorkMinutes: 0,
                                        holidayWorkHours: 0,
                                      });
                                      setShowCardCalc(false);
                                    }}
                                    className="px-3 py-1 rounded-lg bg-gradient-to-r from-rose-500 to-amber-500 text-white font-black text-xs shadow-xs active:scale-95 transition-all ml-auto"
                                  >
                                    ⏱️ この内容で反映
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* ワンタップ残業・休出ボタン（分単位：0分解除、15分、30分、35分、45分、60分、90分、120分） */}
                            <div className="flex flex-wrap gap-1">
                              {[
                                { label: '0分解除', min: 0 },
                                { label: '+15分', min: 15 },
                                { label: '+30分', min: 30 },
                                { label: '+35分', min: 35 },
                                { label: '+45分', min: 45 },
                                { label: '+60分(1h)', min: 60 },
                                { label: '+90分(1.5h)', min: 90 },
                                { label: '+120分(2h)', min: 120 },
                              ].map((b) => (
                                <button
                                  key={b.min}
                                  type="button"
                                  onClick={() => {
                                    setCustomInputVal(b.min > 0 ? String(b.min) : '');
                                    onUpdateShiftDetails(dateStr, pid, {
                                      overtimeMinutes: b.min,
                                      overtimeHours: Math.round((b.min / 60) * 10) / 10,
                                      isHolidayWork: false,
                                      holidayWorkMinutes: 0,
                                      holidayWorkHours: 0,
                                    });
                                  }}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border transition-all ${
                                    otMin === b.min && hwMin === 0 && b.min > 0
                                      ? 'bg-rose-500 border-rose-500 text-white shadow-2xs scale-105'
                                      : 'bg-white border-stone-200 text-stone-600'
                                  }`}
                                >
                                  {b.min === 0 ? '✕ 0分' : b.label}
                                </button>
                              ))}
                              {[
                                { label: '💼休出4h(240分)', min: 240 },
                                { label: '💼休出8h(480分)', min: 480 },
                              ].map((hBtn) => (
                                <button
                                  key={hBtn.label}
                                  type="button"
                                  onClick={() => {
                                    setCustomInputVal(String(hBtn.min));
                                    onUpdateShiftDetails(dateStr, pid, {
                                      isHolidayWork: true,
                                      holidayWorkMinutes: hBtn.min,
                                      holidayWorkHours: Math.round((hBtn.min / 60) * 10) / 10,
                                      overtimeMinutes: 0,
                                      overtimeHours: 0,
                                    });
                                  }}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border transition-all ${
                                    hwMin === hBtn.min
                                      ? 'bg-amber-600 border-amber-600 text-white shadow-2xs scale-105'
                                      : 'bg-[#FFECE5] border-[#FFD0BF] text-[#9C3D1C]'
                                  }`}
                                >
                                  {hBtn.label}
                                </button>
                              ))}
                            </div>

                            {/* 分単位の自由入力＋「反映」ボタン */}
                            <div className="flex items-center gap-1.5 text-[11px] pt-0.5">
                              <span className="text-stone-500 font-bold shrink-0">直接分数入力:</span>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                max="1440"
                                placeholder="例: 35"
                                value={customInputVal}
                                onChange={(e) => setCustomInputVal(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const val = Math.max(0, parseInt(customInputVal, 10) || 0);
                                    onUpdateShiftDetails(dateStr, pid, {
                                      overtimeMinutes: val,
                                      overtimeHours: Math.round((val / 60) * 10) / 10,
                                      isHolidayWork: false,
                                      holidayWorkMinutes: 0,
                                      holidayWorkHours: 0,
                                    });
                                  }
                                }}
                                className="w-16 px-2 py-1 rounded-lg border border-stone-300 bg-white font-extrabold text-center text-rose-600"
                              />
                              <span className="font-bold text-stone-600">分</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const val = Math.max(0, parseInt(customInputVal, 10) || 0);
                                  onUpdateShiftDetails(dateStr, pid, {
                                    overtimeMinutes: val,
                                    overtimeHours: Math.round((val / 60) * 10) / 10,
                                    isHolidayWork: false,
                                    holidayWorkMinutes: 0,
                                    holidayWorkHours: 0,
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-[10px] shadow-2xs active:scale-95 ml-auto"
                              >
                                ⏱️ 反映
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {shift &&
                      renderAuditAndReadStatus(shift.createdBy, shift.createdAt, shift.updatedAt)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* セクションC：🍳すれ違いサポートアイコン（1タップでごはん・お迎え目印） */}
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
        </div>
      </div>
    </div>
  );
};
