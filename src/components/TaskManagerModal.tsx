import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  CheckSquare,
  Square,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  Lock,
  Pencil,
  ArrowRight,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  CalendarCategoryItem,
  CoupleMetadata,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import { getJapaneseHoliday, isEventVisibleToPartner } from '../utils/presets';

interface TaskManagerModalProps {
  events: Record<string, ScheduleEvent>;
  shifts?: Record<string, ShiftEntry>;
  stamps?: StampPreset[];
  initialSelectedDate?: string;
  activePartner: PartnerId;
  metadata: CoupleMetadata;
  categories?: CalendarCategoryItem[];
  onClose: () => void;
  onSaveEvent: (ev: ScheduleEvent) => void;
  onSaveEvents?: (evs: ScheduleEvent[]) => void;
  onDeleteEvent: (id: string) => void;
  onToggleTaskComplete: (id: string) => void;
  onSyncGoogleTasks?: () => void;
  isSyncing?: boolean;
}

type TabType = 'calendar' | 'list';
type ListFilterType = 'all' | 'pending' | 'selectedDate';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatJapaneseDateWithDow(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  const dow = WEEKDAYS[dt.getDay()] || '';
  return `${m}月${d}日(${dow})`;
}

function getNextDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export const TaskManagerModal: React.FC<TaskManagerModalProps> = ({
  events,
  shifts = {},
  stamps = [],
  initialSelectedDate,
  activePartner,
  metadata,
  onClose,
  onSaveEvent,
  onSaveEvents,
  onDeleteEvent,
  onToggleTaskComplete,
  onSyncGoogleTasks,
  isSyncing = false,
}) => {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const defaultDate = initialSelectedDate || todayStr;
  const [initY, initM] = defaultDate.split('-').map(Number);

  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [listFilter, setListFilter] = useState<ListFilterType>('all');
  const [showCompleted, setShowCompleted] = useState(true);

  // カレンダー表示用の年月＆選択日
  const [calYear, setCalYear] = useState(initY || now.getFullYear());
  const [calMonth, setCalMonth] = useState(initM || now.getMonth() + 1);
  const [selectedTaskDate, setSelectedTaskDate] = useState<string>(defaultDate);
  const [dayCardMinimized, setDayCardMinimized] = useState(true);

  // 新規タスク入力フォーム（常時サクサク連続入力対応）
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newMemo, setNewMemo] = useState('');
  const [showDetailInputs, setShowDetailInputs] = useState(false);

  // 既存タスク編集ステート
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editMemo, setEditMemo] = useState('');

  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;
  const myPartner = activePartner === 'partnerB' ? partnerB : partnerA;

  // スタンプ辞書
  const stampMap = useMemo(() => {
    return new Map(stamps.map((s) => [s.id, s]));
  }, [stamps]);

  // 指定日の自分のシフト情報を取得（事務所勤務・研内・日勤などが一目でわかる）
  const getMyShiftForDate = (dateStr: string) => {
    const key = `${dateStr}_${activePartner}`;
    const entry = shifts[key];
    if (!entry || entry.deletedAt) return null;
    const stamp = stampMap.get(entry.stampId);
    const label = entry.customLabel || stamp?.shortLabel || stamp?.label || '';
    if (!label) return null;
    return {
      entry,
      stamp,
      label,
      icon: stamp?.icon || '',
      bgColor: entry.customColor || stamp?.color || '#F3EAFF',
      textColor: stamp?.textColor || '#59318F',
      startTime: entry.startTime || stamp?.startTime || '',
      endTime: entry.endTime || stamp?.endTime || '',
    };
  };

  // 自分のタスクのみ抽出（Googleタスクと双方向自動連係・相手には見えない個人カレンダー）
  const allTasks = useMemo(() => {
    return Object.values(events)
      .filter((ev) => ev && ev.isTask && !ev.deletedAt && isEventVisibleToPartner(ev, activePartner))
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          Number(Boolean(a.isCompleted)) - Number(Boolean(b.isCompleted)) ||
          (a.startTime || '').localeCompare(b.startTime || '') ||
          (a.createdAt || '').localeCompare(b.createdAt || '')
      );
  }, [activePartner, events]);

  // フィルター適用後のタスク
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (!showCompleted && t.isCompleted) return false;
      return true;
    });
  }, [allTasks, showCompleted]);

  // 選択中の日のタスク一覧
  const selectedDateTasks = useMemo(() => {
    return filteredTasks.filter((t) => t.date === selectedTaskDate);
  }, [filteredTasks, selectedTaskDate]);

  // 過去の未完了タスク（前の事務所勤務日などで残ったタスク）
  const overdueTasks = useMemo(() => {
    return allTasks.filter((t) => !t.isCompleted && t.date < todayStr);
  }, [allTasks, todayStr]);

  // カレンダーグリッドの日付生成
  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth - 1, 1);
    const lastDay = new Date(calYear, calMonth, 0);
    const startDayOfWeek = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const cells: {
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      holidayName: string | null;
      tasks: ScheduleEvent[];
      myShift: ReturnType<typeof getMyShiftForDate>;
    }[] = [];

    const prevMonthLastDay = new Date(calYear, calMonth - 1, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const m = calMonth === 1 ? 12 : calMonth - 1;
      const y = calMonth === 1 ? calYear - 1 : calYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        holidayName: getJapaneseHoliday(dateStr),
        tasks: filteredTasks.filter((t) => t.date === dateStr),
        myShift: getMyShiftForDate(dateStr),
      });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayTasks = filteredTasks.filter((t) => t.date === dateStr);
      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        holidayName: getJapaneseHoliday(dateStr),
        tasks: dayTasks,
        myShift: getMyShiftForDate(dateStr),
      });
    }

    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const m = calMonth === 12 ? 1 : calMonth + 1;
        const y = calMonth === 12 ? calYear + 1 : calYear;
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push({
          dateStr,
          dayNum: d,
          isCurrentMonth: false,
          isToday: dateStr === todayStr,
          holidayName: getJapaneseHoliday(dateStr),
          tasks: filteredTasks.filter((t) => t.date === dateStr),
          myShift: getMyShiftForDate(dateStr),
        });
      }
    }

    return cells;
  }, [calYear, calMonth, filteredTasks, shifts, stamps, activePartner, todayStr]);

  // 新規タスク保存（連続でサクサク入力できるようフォームを開いたまま入力欄だけクリア）
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const nowIso = new Date().toISOString();
    const taskEv: ScheduleEvent = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: selectedTaskDate,
      title: newTitle.trim(),
      categoryId: activePartner,
      color: activePartner === 'partnerA' ? '#56CFE1' : '#B388EB',
      isAllDay: !newTime,
      startTime: newTime || undefined,
      memo: newMemo.trim() || undefined,
      isTask: true,
      isCompleted: false,
      notifyTarget: activePartner,
      privateFor: activePartner,
      reminderMinutes: 30,
      createdBy: activePartner,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    onSaveEvent(taskEv);
    setNewTitle('');
    setNewTime('');
    setNewMemo('');
    setDayCardMinimized(false);
  };

  // タスク編集の開始
  const startEditTask = (t: ScheduleEvent) => {
    setEditingTaskId(t.id);
    setEditTitle(t.title);
    setEditDate(t.date);
    setEditTime(t.startTime || '');
    setEditMemo(t.memo || '');
  };

  // タスク編集の保存
  const saveEditTask = (t: ScheduleEvent) => {
    if (!editTitle.trim()) return;
    const nowIso = new Date().toISOString();
    onSaveEvent({
      ...t,
      title: editTitle.trim(),
      date: editDate || t.date,
      endDate: undefined,
      isAllDay: !editTime,
      startTime: editTime || undefined,
      endTime: undefined,
      memo: editMemo.trim() || undefined,
      privateFor: activePartner,
      updatedAt: nowIso,
    });
    setEditingTaskId(null);
  };

  // タスクを別の日（翌日や選択日）へワンタップ繰越
  const moveTaskToDate = (t: ScheduleEvent, targetDate: string) => {
    const nowIso = new Date().toISOString();
    onSaveEvent({
      ...t,
      date: targetDate,
      endDate: undefined,
      privateFor: activePartner,
      updatedAt: nowIso,
    });
  };

  // 過去の未完了タスクをすべて選択中の日（過去日の場合は今日）へ一括移動
  const moveAllOverdueToSelectedDate = () => {
    const carryTargetDate = selectedTaskDate >= todayStr ? selectedTaskDate : todayStr;
    const targets = overdueTasks.filter((t) => t.date !== carryTargetDate);
    if (targets.length === 0) return;
    const nowIso = new Date().toISOString();
    const updatedList: ScheduleEvent[] = targets.map((t) => ({
      ...t,
      date: carryTargetDate,
      endDate: undefined,
      privateFor: activePartner,
      updatedAt: nowIso,
    }));
    if (onSaveEvents) {
      onSaveEvents(updatedList);
    } else {
      for (const updated of updatedList) {
        onSaveEvent(updated);
      }
    }
  };

  // 年月送り
  const handlePrevMonth = () => {
    if (calMonth === 1) {
      setCalYear((y) => y - 1);
      setCalMonth(12);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 12) {
      setCalYear((y) => y + 1);
      setCalMonth(1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  const selectedDateShift = getMyShiftForDate(selectedTaskDate);

  // 一覧タブ用の表示対象タスク
  const listViewTasks = useMemo(() => {
    return filteredTasks.filter((t) => {
      if (listFilter === 'pending') return !t.isCompleted;
      if (listFilter === 'selectedDate') return t.date === selectedTaskDate;
      return true;
    });
  }, [filteredTasks, listFilter, selectedTaskDate]);

  // 一覧タブ用に日付ごとにグループ化
  const groupedListTasks = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const t of listViewTasks) {
      const arr = map.get(t.date) || [];
      arr.push(t);
      map.set(t.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [listViewTasks]);

  const renderTaskRow = (t: ScheduleEvent, showDateBadge = false) => {
    const isEditing = editingTaskId === t.id;

    if (isEditing) {
      return (
        <div
          key={t.id}
          className="p-2.5 rounded-2xl bg-[#FFF9FB] border-2 border-[#FF8FAB] space-y-2 animate-pop"
        >
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="タスク名"
            className="w-full px-2.5 py-1.5 rounded-xl border border-stone-300 bg-white font-black text-xs text-stone-800 focus:border-[#FF8FAB] focus:outline-none"
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="px-2 py-1 rounded-lg border border-stone-200 bg-white font-bold text-[11px]"
            />
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="px-2 py-1 rounded-lg border border-stone-200 bg-white font-bold text-[11px]"
            />
            <input
              type="text"
              value={editMemo}
              onChange={(e) => setEditMemo(e.target.value)}
              placeholder="メモ（任意）"
              className="flex-1 min-w-[120px] px-2 py-1 rounded-lg border border-stone-200 bg-white font-bold text-[11px]"
            />
            <div className="flex items-center gap-1 ml-auto">
              <button
                type="button"
                onClick={() => setEditingTaskId(null)}
                className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-600 text-[11px] font-black flex items-center gap-0.5"
              >
                <X className="w-3 h-3" />
                <span>取消</span>
              </button>
              <button
                type="button"
                onClick={() => saveEditTask(t)}
                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#FF6B8B] to-[#9B5DE5] text-white text-[11px] font-black flex items-center gap-0.5 shadow-2xs"
              >
                <Check className="w-3 h-3" />
                <span>保存</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={t.id}
        className={`px-2.5 py-2 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
          t.isCompleted
            ? 'bg-stone-50/90 border-stone-200 opacity-60'
            : 'bg-white border-stone-200 hover:border-rose-300 shadow-2xs'
        }`}
      >
        <div
          onClick={() => onToggleTaskComplete(t.id)}
          className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer select-none"
        >
          <button type="button" className="mt-0.5 shrink-0">
            {t.isCompleted ? (
              <CheckSquare className="w-4 h-4 text-emerald-500" />
            ) : (
              <Square className="w-4 h-4 text-rose-400" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div
              className={`font-black text-xs sm:text-sm leading-snug break-words ${
                t.isCompleted ? 'line-through text-stone-400' : 'text-stone-800'
              }`}
            >
              {t.title}
            </div>
            {(showDateBadge || t.startTime || t.memo || t.googleTaskSynced || t.googleTaskId) && (
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] font-bold text-stone-500">
                {showDateBadge && (
                  <span className="text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded font-extrabold">
                    {formatJapaneseDateWithDow(t.date)}
                  </span>
                )}
                {t.startTime && (
                  <span className="text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded font-extrabold">
                    ⏰ {t.startTime}
                  </span>
                )}
                {(t.googleTaskSynced || t.googleTaskId) && (
                  <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded font-extrabold">
                    ✓ Googleタスク
                  </span>
                )}
                {t.memo && <span className="text-stone-500 truncate">📝 {t.memo}</span>}
              </div>
            )}
          </div>
        </div>

        {/* 操作ボタン（翌日へ繰越・編集・削除） */}
        <div className="flex items-center gap-1 shrink-0">
          {!t.isCompleted && (
            <button
              type="button"
              onClick={() => moveTaskToDate(t, getNextDateStr(t.date))}
              className="px-1.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-black flex items-center gap-0.5 whitespace-nowrap"
              title="翌日に繰り越す"
            >
              <ArrowRight className="w-3 h-3" />
              <span>翌日へ</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => startEditTask(t)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-purple-600 hover:bg-purple-50"
            title="タスクを編集・日付移動"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteEvent(t.id)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-rose-50"
            title="タスクを削除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[94vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-white px-3.5 py-2.5 border-b border-[#FFE5EC] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#FF8FAB] to-[#B388EB] flex items-center justify-center text-white shadow-xs shrink-0">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-stone-800 flex items-center gap-1.5 flex-wrap">
                <span className="truncate">{myPartner.avatar}{myPartner.name}の個人タスク</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-600 text-white font-black flex items-center gap-0.5 shrink-0">
                  <Lock className="w-2.5 h-2.5" />
                  <span>自分専用</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-extrabold shrink-0">
                  残 {allTasks.filter((t) => !t.isCompleted).length}件
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onSyncGoogleTasks && (
              <button
                type="button"
                onClick={onSyncGoogleTasks}
                disabled={isSyncing}
                className="p-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-black flex items-center justify-center shrink-0 active:scale-95 disabled:opacity-60 transition-all"
                title="Googleタスクと双方向同期"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDayCardMinimized(false);
                setTimeout(() => {
                  const inputEl = document.getElementById('quick-task-title-input');
                  if (inputEl) inputEl.focus();
                }, 0);
              }}
              className="px-3 py-1.5 rounded-2xl bg-gradient-to-r from-[#FF6B8B] to-[#9B5DE5] text-white text-xs font-black flex items-center gap-1 whitespace-nowrap shadow-sm hover:opacity-95 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.75] shrink-0" />
              <span>タスク追加</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-black flex items-center justify-center shrink-0 active:scale-95"
              title="最小化・閉じる"
            >
              <ChevronDown className="w-5 h-5 stroke-[2.75]" />
            </button>
          </div>
        </div>

        {/* タブ切り替えバー（個人カレンダー / タスク一覧 の2タブで見やすくスッキリ） */}
        <div className="bg-[#FFF0F5]/80 px-3 py-1.5 border-b border-[#FFE5EC] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-stone-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1 whitespace-nowrap transition-all ${
                activeTab === 'calendar'
                  ? 'bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
              <span>個人カレンダー</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1 whitespace-nowrap transition-all ${
                activeTab === 'list'
                  ? 'bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <ListTodo className="w-3.5 h-3.5 shrink-0" />
              <span>タスク一覧 ({allTasks.filter((t) => !t.isCompleted).length})</span>
            </button>
          </div>

          <label className="flex items-center gap-1 text-[11px] font-extrabold text-stone-600 cursor-pointer whitespace-nowrap shrink-0">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-rose-500 focus:ring-rose-400"
            />
            <span>完了済も表示</span>
          </label>
        </div>

        {/* 選択中の日のタスク追加＆一覧アコーディオン（カレンダー表示時のみ表示・起動時は閉じた状態） */}
        {activeTab === 'calendar' && (
        <div className="bg-white border-b-2 border-[#FFE5EC] px-3 py-2 space-y-2">
          <div
            onClick={() => setDayCardMinimized((prev) => !prev)}
            className="flex items-center justify-between gap-2 cursor-pointer select-none"
          >
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="text-xs sm:text-sm font-black text-stone-800">
                📅 {formatJapaneseDateWithDow(selectedTaskDate)} のタスク
              </span>
              {selectedDateShift && (
                <span
                  className="text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0"
                  style={{
                    backgroundColor: selectedDateShift.bgColor,
                    color: selectedDateShift.textColor,
                    borderColor: selectedDateShift.textColor + '33',
                  }}
                >
                  {selectedDateShift.icon} {selectedDateShift.label}
                  {selectedDateShift.startTime ? ` (${selectedDateShift.startTime}〜)` : ''}
                </span>
              )}
              <span className="text-[10px] font-extrabold text-stone-500">
                （未完了 {selectedDateTasks.filter((t) => !t.isCompleted).length} / 全 {selectedDateTasks.length}件）
              </span>
              {dayCardMinimized && overdueTasks.length > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                  📌 過去残 {overdueTasks.length}件
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {selectedTaskDate !== todayStr && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTaskDate(todayStr);
                    const [ty, tm] = todayStr.split('-').map(Number);
                    setCalYear(ty);
                    setCalMonth(tm);
                    setDayCardMinimized(false);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-[10px] font-black whitespace-nowrap"
                >
                  今日へ
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDayCardMinimized(!dayCardMinimized);
                }}
                className="p-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600"
                title={dayCardMinimized ? '詳細を開く' : '詳細を閉じる'}
              >
                <ChevronDown
                  className={`w-4 h-4 stroke-[2.5] transition-transform ${
                    !dayCardMinimized ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {!dayCardMinimized && (
            <div className="space-y-2 pt-0.5">
              {/* サクサク1行連続タスク追加フォーム */}
              <form onSubmit={handleCreateTask} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    id="quick-task-title-input"
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={`${formatJapaneseDateWithDow(selectedTaskDate)} のやること・事務所タスクを入力...`}
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl border-2 border-stone-200 bg-[#FFFBF7] font-black text-xs text-stone-800 focus:border-[#FF8FAB] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDetailInputs(!showDetailInputs)}
                    className={`px-2 py-2 rounded-xl border text-[10px] font-black whitespace-nowrap shrink-0 ${
                      showDetailInputs || newTime || newMemo
                        ? 'bg-purple-50 border-purple-300 text-purple-700'
                        : 'bg-stone-50 border-stone-200 text-stone-500'
                    }`}
                  >
                    時間/メモ
                  </button>
                  <button
                    type="submit"
                    disabled={!newTitle.trim()}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#FF6B8B] to-[#9B5DE5] text-white text-xs font-black flex items-center gap-1 whitespace-nowrap shadow-xs disabled:opacity-40 active:scale-95 transition-all shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.75]" />
                    <span>追加</span>
                  </button>
                </div>

                {showDetailInputs && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <input
                      type="date"
                      value={selectedTaskDate}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedTaskDate(e.target.value);
                          const [ny, nm] = e.target.value.split('-').map(Number);
                          if (ny && nm) {
                            setCalYear(ny);
                            setCalMonth(nm);
                          }
                        }
                      }}
                      className="px-2 py-1 rounded-lg border border-stone-200 bg-[#FFFBF7] font-bold text-[11px]"
                    />
                    <input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-stone-200 bg-[#FFFBF7] font-bold text-[11px]"
                    />
                    <input
                      type="text"
                      value={newMemo}
                      onChange={(e) => setNewMemo(e.target.value)}
                      placeholder="メモ（任意）"
                      className="flex-1 min-w-0 px-2.5 py-1 rounded-lg border border-stone-200 bg-[#FFFBF7] font-bold text-[11px]"
                    />
                  </div>
                )}
              </form>

              {/* 過去の未完了タスク繰越バナー（前の勤務日にやり残したタスクを1タップで今日/選択日に集約） */}
              {overdueTasks.length > 0 && (
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px]">
                  <span className="font-extrabold text-amber-900">
                    📌 過去の未完了タスクが {overdueTasks.length}件 残っています
                  </span>
                  <button
                    type="button"
                    onClick={moveAllOverdueToSelectedDate}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] whitespace-nowrap shadow-2xs active:scale-95"
                  >
                    {formatJapaneseDateWithDow(selectedTaskDate)}へまとめて繰越
                  </button>
                </div>
              )}

              {/* 選択日のタスク一覧 */}
              <div className="max-h-[26vh] overflow-y-auto space-y-1.5 pr-0.5">
                {selectedDateTasks.length === 0 ? (
                  <div className="text-center py-2.5 text-[11px] font-bold text-stone-400 bg-stone-50/70 rounded-xl border border-dashed border-stone-200">
                    この日のタスクはまだありません（上の入力欄からすぐ追加できます✨）
                  </div>
                ) : (
                  selectedDateTasks.map((t) => renderTaskRow(t, false))
                )}
              </div>
            </div>
          )}
        </div>
        )}

        {/* メインコンテンツエリア */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4">
          {/* 📅 タブ1: 自分のシフト付き・個人タスクカレンダー */}
          {activeTab === 'calendar' && (
            <div className="space-y-2">
              {/* 年月送りヘッダー */}
              <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-stone-200 shadow-2xs">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 rounded-lg hover:bg-stone-100 text-stone-600"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-xs sm:text-sm font-black text-stone-800 flex items-center gap-2">
                  <span>
                    {calYear}年 {calMonth}月
                  </span>
                  <span className="text-[10px] font-bold text-stone-400">
                    （日付タップでその日のタスク表示・追加）
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 rounded-lg hover:bg-stone-100 text-stone-600"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* 曜日ヘッダー */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black">
                {WEEKDAYS.map((w, idx) => (
                  <div
                    key={w}
                    className={`py-0.5 rounded-md ${
                      idx === 0
                        ? 'text-rose-500 bg-rose-50/60'
                        : idx === 6
                        ? 'text-sky-600 bg-sky-50/60'
                        : 'text-stone-600 bg-stone-100/60'
                    }`}
                  >
                    {w}
                  </div>
                ))}
              </div>

              {/* カレンダーマス目（自分のシフト＋タスクが表示される個人カレンダー） */}
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((cell) => {
                  const isSelected = cell.dateStr === selectedTaskDate;
                  const pendingCount = cell.tasks.filter((t) => !t.isCompleted).length;

                  return (
                    <div
                      key={cell.dateStr}
                      onClick={() => {
                        setSelectedTaskDate(cell.dateStr);
                        const [cy, cm] = cell.dateStr.split('-').map(Number);
                        if (cy && cm) {
                          setCalYear(cy);
                          setCalMonth(cm);
                        }
                        setDayCardMinimized(false);
                      }}
                      className={`min-h-[68px] sm:min-h-[86px] p-1 rounded-xl border flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#FFF5F8] border-[#FF6B8B] ring-2 ring-[#FF8FAB]/50 shadow-xs'
                          : !cell.isCurrentMonth
                          ? 'opacity-35 bg-stone-50/60 border-stone-200'
                          : cell.isToday
                          ? 'bg-[#FFF9FB] border-rose-300'
                          : 'bg-white border-stone-200 hover:border-rose-300'
                      }`}
                    >
                      {/* 日付＆自分のシフトバッジ */}
                      <div className="flex items-center justify-between gap-0.5 mb-0.5">
                        <span
                          className={`text-[10px] font-black leading-none shrink-0 ${
                            cell.isToday
                              ? 'w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center'
                              : cell.holidayName
                              ? 'text-rose-500'
                              : 'text-stone-700'
                          }`}
                        >
                          {cell.dayNum}
                        </span>

                        {cell.myShift ? (
                          <span
                            className="px-1 py-0.2 rounded text-[8px] font-black truncate max-w-[38px] sm:max-w-[54px] leading-tight"
                            style={{
                              backgroundColor: cell.myShift.bgColor,
                              color: cell.myShift.textColor,
                            }}
                            title={`${cell.myShift.icon}${cell.myShift.label}`}
                          >
                            {cell.myShift.label}
                          </span>
                        ) : cell.tasks.length > 0 ? (
                          <span className="text-[8px] font-extrabold text-stone-400">
                            {pendingCount > 0 ? `🔴${pendingCount}` : '済'}
                          </span>
                        ) : null}
                      </div>

                      {/* タスク一覧（マス目内プレビュー：チェック枠・タップ完了なし、セルタップで日程選択＆詳細展開） */}
                      <div className="flex-1 space-y-0.5 overflow-hidden">
                        {cell.tasks.slice(0, 3).map((t) => (
                          <div
                            key={t.id}
                            title={t.title}
                            className={`px-1 py-0.5 rounded text-[9px] font-black truncate flex items-center transition-all ${
                              t.isCompleted
                                ? 'bg-stone-100 text-stone-400 line-through'
                                : activePartner === 'partnerA'
                                ? 'bg-[#E2F9FC] text-[#126875]'
                                : 'bg-[#F3EAFF] text-[#6638A6]'
                            }`}
                          >
                            <span className="truncate">{t.title}</span>
                          </div>
                        ))}
                        {cell.tasks.length > 3 && (
                          <div className="text-[8px] font-black text-right text-purple-600 pr-0.5">
                            +{cell.tasks.length - 3}件
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 📋 タブ2: タスク一覧（勤務日ごとのグループ表示＆フィルター） */}
          {activeTab === 'list' && (
            <div className="space-y-3">
              {/* 絞り込みピル */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setListFilter('all')}
                  className={`px-3 py-1 rounded-full text-[11px] font-black transition-all ${
                    listFilter === 'all'
                      ? 'bg-stone-800 text-white'
                      : 'bg-white border border-stone-200 text-stone-600'
                  }`}
                >
                  すべて ({filteredTasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setListFilter('pending')}
                  className={`px-3 py-1 rounded-full text-[11px] font-black transition-all ${
                    listFilter === 'pending'
                      ? 'bg-rose-500 text-white'
                      : 'bg-white border border-stone-200 text-stone-600'
                  }`}
                >
                  未完了のみ ({allTasks.filter((t) => !t.isCompleted).length})
                </button>
                <button
                  type="button"
                  onClick={() => setListFilter('selectedDate')}
                  className={`px-3 py-1 rounded-full text-[11px] font-black transition-all ${
                    listFilter === 'selectedDate'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white border border-stone-200 text-stone-600'
                  }`}
                >
                  選択日 ({formatJapaneseDateWithDow(selectedTaskDate)})
                </button>
              </div>

              {groupedListTasks.length === 0 ? (
                <div className="text-center py-10 text-stone-400 space-y-2 bg-white rounded-2xl border border-stone-200/80">
                  <CheckSquare className="w-8 h-8 mx-auto text-stone-300" />
                  <p className="font-extrabold text-xs">該当するタスクはありません</p>
                </div>
              ) : (
                groupedListTasks.map(([dateStr, dayTasks]) => {
                  const shiftInfo = getMyShiftForDate(dateStr);
                  const isTodayGroup = dateStr === todayStr;

                  return (
                    <div
                      key={dateStr}
                      className="bg-white/80 rounded-2xl border border-[#FFE5EC] p-2.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 px-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTaskDate(dateStr);
                            const [ly, lm] = dateStr.split('-').map(Number);
                            if (ly && lm) {
                              setCalYear(ly);
                              setCalMonth(lm);
                            }
                            setDayCardMinimized(false);
                            setActiveTab('calendar');
                          }}
                          className="flex items-center gap-1.5 text-left"
                        >
                          <span className="font-black text-xs text-stone-800">
                            {formatJapaneseDateWithDow(dateStr)}
                          </span>
                          {isTodayGroup && (
                            <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-rose-500 text-white">
                              今日
                            </span>
                          )}
                          {shiftInfo && (
                            <span
                              className="text-[10px] font-black px-2 py-0.2 rounded-full"
                              style={{
                                backgroundColor: shiftInfo.bgColor,
                                color: shiftInfo.textColor,
                              }}
                            >
                              {shiftInfo.icon} {shiftInfo.label}
                            </span>
                          )}
                        </button>
                        <span className="text-[10px] font-extrabold text-stone-400">
                          残 {dayTasks.filter((t) => !t.isCompleted).length} / {dayTasks.length}件
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {dayTasks.map((t) => renderTaskRow(t, false))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
