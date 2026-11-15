import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  CheckSquare,
  Square,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Bell,
  ListTodo,
  Sparkles,
  Lock,
} from 'lucide-react';
import {
  CalendarCategoryItem,
  CoupleMetadata,
  PartnerId,
  ScheduleEvent,
} from '../types/calendar';
import {
  buildGoogleCalendarUrl,
} from '../utils/googleCalendar';
import { getJapaneseHoliday, isEventVisibleToPartner } from '../utils/presets';

interface TaskManagerModalProps {
  events: Record<string, ScheduleEvent>;
  activePartner: PartnerId;
  metadata: CoupleMetadata;
  categories?: CalendarCategoryItem[];
  onClose: () => void;
  onSaveEvent: (ev: ScheduleEvent) => void;
  onDeleteEvent: (id: string) => void;
  onToggleTaskComplete: (id: string) => void;
}

type TabType = 'calendar' | 'list' | 'google';

export const TaskManagerModal: React.FC<TaskManagerModalProps> = ({
  events,
  activePartner,
  metadata,
  onClose,
  onSaveEvent,
  onDeleteEvent,
  onToggleTaskComplete,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [showCompleted, setShowCompleted] = useState(true);

  // カレンダー表示用の年月
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  // 新規タスクフォーム
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  );
  const [newTime, setNewTime] = useState('');
  const [newReminder] = useState<number>(30);

  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;
  const myPartner = activePartner === 'partnerB' ? partnerB : partnerA;

  // タスクのみ抽出（タスクは常に自分専用・相手には見えない個人カレンダーとして扱う）
  const allTasks = useMemo(() => {
    return Object.values(events)
      .filter((ev) => ev && ev.isTask && !ev.deletedAt && isEventVisibleToPartner(ev, activePartner))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
  }, [activePartner, events]);

  // フィルター適用後のタスク
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (!showCompleted && t.isCompleted) return false;
      return true;
    });
  }, [allTasks, showCompleted]);

  // カレンダーグリッドの日付生成
  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth - 1, 1);
    const lastDay = new Date(calYear, calMonth, 0);
    const startDayOfWeek = firstDay.getDay(); // 0: 日曜
    const totalDays = lastDay.getDate();

    const cells: {
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      holidayName: string | null;
      tasks: ScheduleEvent[];
    }[] = [];

    // 前月の日
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
        isToday: false,
        holidayName: getJapaneseHoliday(dateStr),
        tasks: [],
      });
    }

    // 当月の日
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
      });
    }

    // 翌月の日（行末埋め）
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
          isToday: false,
          holidayName: getJapaneseHoliday(dateStr),
          tasks: [],
        });
      }
    }

    return cells;
  }, [calYear, calMonth, filteredTasks, now]);

  // 新規タスク保存（常に自分専用・相手には非表示）
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const nowIso = new Date().toISOString();
    const taskEv: ScheduleEvent = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: newDate,
      title: newTitle.trim(),
      categoryId: activePartner,
      color: activePartner === 'partnerA' ? '#56CFE1' : '#B388EB',
      isAllDay: !newTime,
      startTime: newTime || undefined,
      isTask: true,
      isCompleted: false,
      notifyTarget: activePartner,
      privateFor: activePartner,
      reminderMinutes: newReminder,
      createdBy: activePartner,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    onSaveEvent(taskEv);
    setNewTitle('');
    setNewTime('');
    setIsAdding(false);
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-white px-3.5 py-2.5 border-b border-[#FFE5EC] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#FF8FAB] to-[#B388EB] flex items-center justify-center text-white shadow-xs shrink-0">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-stone-800 flex items-center gap-1.5 flex-wrap">
                <span className="truncate">{myPartner.avatar}{myPartner.name}のタスク</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-600 text-white font-black flex items-center gap-0.5 shrink-0">
                  <Lock className="w-2.5 h-2.5" />
                  <span>自分専用</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-extrabold shrink-0">
                  未完了 {allTasks.filter((t) => !t.isCompleted).length}
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsAdding(!isAdding)}
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

        {/* タブ切り替えバー（スマホ画面幅でも一切見切れないコンパクト配置） */}
        <div className="bg-[#FFF0F5]/80 px-3 py-1.5 border-b border-[#FFE5EC] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-stone-200 shadow-2xs min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black flex items-center gap-1 whitespace-nowrap transition-all ${
                activeTab === 'calendar'
                  ? 'bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <CalendarIcon className="w-3 h-3 shrink-0" />
              <span>カレンダー</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black flex items-center gap-1 whitespace-nowrap transition-all ${
                activeTab === 'list'
                  ? 'bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <ListTodo className="w-3 h-3 shrink-0" />
              <span>一覧</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('google')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black flex items-center gap-1 whitespace-nowrap transition-all ${
                activeTab === 'google'
                  ? 'bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>Gemini連携</span>
            </button>
          </div>

          <label className="flex items-center gap-1 text-[11px] font-extrabold text-stone-600 cursor-pointer whitespace-nowrap shrink-0 pr-0.5">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-rose-500 focus:ring-rose-400"
            />
            <span>完了済も表示</span>
          </label>
        </div>

        {/* 新規タスク追加フォーム（トグル展開） */}
        {isAdding && (
          <form
            onSubmit={handleCreateTask}
            className="bg-white p-3 border-b border-[#FFE5EC] space-y-2 animate-pop"
          >
            <div className="font-extrabold text-xs text-rose-700 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-purple-600" />
                <span>{myPartner.avatar}{myPartner.name}専用のタスクを追加（相手には見えません）</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-stone-400 hover:text-stone-600 text-[11px]"
              >
                閉じる
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="タスク名（例: 書類提出 / 牛乳を買う）"
                className="flex-1 px-3 py-1.5 rounded-xl border-2 border-stone-200 bg-[#FFFBF7] font-black text-xs text-stone-800 focus:border-[#FF8FAB] focus:outline-none"
                autoFocus
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="px-2 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold text-xs"
                />
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="px-2 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold text-xs"
                />
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white text-xs font-black whitespace-nowrap shadow-xs disabled:opacity-40"
                >
                  保存
                </button>
              </div>
            </div>
          </form>
        )}

        {/* コンテンツエリア */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4">
          {/* 📅 タブ1: タスク専用カレンダー */}
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
                <div className="text-xs sm:text-sm font-black text-stone-800">
                  {calYear}年 {calMonth}月
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
                {['日', '月', '火', '水', '木', '金', '土'].map((w, idx) => (
                  <div
                    key={w}
                    className={`py-0.5 rounded-md ${
                      idx === 0 ? 'text-rose-500 bg-rose-50/60' : idx === 6 ? 'text-sky-600 bg-sky-50/60' : 'text-stone-600 bg-stone-100/60'
                    }`}
                  >
                    {w}
                  </div>
                ))}
              </div>

              {/* カレンダーマス目（タスク専用・スッキリ高さ） */}
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((cell) => {
                  return (
                    <div
                      key={cell.dateStr}
                      onClick={() => {
                        setNewDate(cell.dateStr);
                        setIsAdding(true);
                      }}
                      className={`min-h-[62px] sm:min-h-[82px] p-1 rounded-xl border flex flex-col justify-between transition-all cursor-pointer ${
                        !cell.isCurrentMonth
                          ? 'opacity-35 bg-stone-50/60 border-stone-200'
                          : cell.isToday
                          ? 'bg-[#FFF9FB] border-rose-300 ring-1 ring-rose-200'
                          : 'bg-white border-stone-200 hover:border-rose-300'
                      }`}
                    >
                      {/* 日付ヘッダー */}
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className={`text-[10px] font-black leading-none ${
                            cell.isToday
                              ? 'w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center'
                              : cell.holidayName
                              ? 'text-rose-500'
                              : 'text-stone-700'
                          }`}
                        >
                          {cell.dayNum}
                        </span>
                        {cell.tasks.length > 0 && (
                          <span className="text-[9px] font-extrabold text-stone-400">
                            {cell.tasks.filter((t) => !t.isCompleted).length > 0
                              ? `🔴${cell.tasks.filter((t) => !t.isCompleted).length}`
                              : '✅'}
                          </span>
                        )}
                      </div>

                      {/* タスク一覧 */}
                      <div className="flex-1 space-y-0.5 overflow-hidden">
                        {cell.tasks.map((t) => (
                          <div
                            key={t.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleTaskComplete(t.id);
                            }}
                            title={`${t.title}（タップで完了切替）`}
                            className={`px-1 py-0.5 rounded text-[9px] font-black truncate flex items-center gap-0.5 transition-all ${
                              t.isCompleted
                                ? 'bg-stone-100 text-stone-400 line-through'
                                : activePartner === 'partnerA'
                                ? 'bg-[#E2F9FC] text-[#126875]'
                                : 'bg-[#F3EAFF] text-[#6638A6]'
                            }`}
                          >
                            <span className="shrink-0">{t.isCompleted ? '✅' : '⬜'}</span>
                            <span className="truncate">{t.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 📋 タブ2: タスク一覧リスト */}
          {activeTab === 'list' && (
            <div className="space-y-2">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-10 text-stone-400 space-y-2">
                  <CheckSquare className="w-8 h-8 mx-auto text-stone-300" />
                  <p className="font-extrabold text-xs">登録されているマイタスクはありません</p>
                  <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className="px-3 py-1.5 rounded-xl bg-[#FF8FAB] text-white text-xs font-black shadow-xs"
                  >
                    ＋ タスクを追加
                  </button>
                </div>
              ) : (
                filteredTasks.map((t) => {
                  const gCalUrl = buildGoogleCalendarUrl(t, metadata);

                  return (
                    <div
                      key={t.id}
                      className={`p-2.5 rounded-2xl border transition-all ${
                        t.isCompleted
                          ? 'bg-stone-50 border-stone-200 opacity-60'
                          : 'bg-white border-stone-200/90 hover:border-rose-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div
                          onClick={() => onToggleTaskComplete(t.id)}
                          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer select-none"
                        >
                          <button
                            type="button"
                            className="text-rose-500 shrink-0"
                          >
                            {t.isCompleted ? (
                              <CheckSquare className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Square className="w-4 h-4 text-stone-400" />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div
                              className={`font-black text-xs sm:text-sm text-stone-800 break-words ${
                                t.isCompleted ? 'line-through text-stone-400' : ''
                              }`}
                            >
                              {t.title}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] font-extrabold text-stone-400">
                              <span className="text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded">
                                {t.date}{t.startTime ? ` ${t.startTime}` : ''}
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700">
                                🔒 {myPartner.name}専用
                              </span>
                              {t.syncedFromGoogle && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700">
                                  ✨ Gemini/Google取込
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* アクションボタン */}
                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={gCalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-[10px] font-black flex items-center gap-0.5"
                            title="Googleカレンダーを開く"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>

                          <button
                            type="button"
                            onClick={() => onDeleteEvent(t.id)}
                            className="p-1.5 rounded-xl text-stone-400 hover:text-rose-500 hover:bg-rose-50"
                            title="タスクを削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 🤖 タブ3: Gemini＆Googleカレンダー連携ガイド */}
          {activeTab === 'google' && (
            <div className="space-y-3">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-3 space-y-2">
                <div className="font-black text-xs sm:text-sm text-purple-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>スマホの Gemini から自分専用タスクを追加する方法</span>
                </div>
                <p className="text-xs text-stone-700 leading-relaxed">
                  スマホのGeminiに話しかけるとき、先頭に <b>「タスク」</b> や <b>「やること」</b> を付けてGoogleカレンダーへ登録すると、自動的に <b>{myPartner.avatar}{myPartner.name}専用のマイタスク（🔒相手には非表示）</b> としてここに取り込まれます！
                </p>
                <div className="bg-white rounded-xl p-2.5 border border-purple-100 text-xs space-y-1 font-bold text-stone-700">
                  <div className="text-[10px] text-purple-600 font-black">🎙️ Geminiへの話しかけ例：</div>
                  <div>・「明日の15時に <b>タスク 履歴書を送る</b> ってGoogleカレンダーに入れて」</div>
                  <div>・「11月20日に <b>やること 市役所へ行く</b> をGoogleカレンダーに追加して」</div>
                  <div>・「明日の10時に <b>TODO クリーニング出す</b> をカレンダーに入れて」</div>
                </div>
              </div>

              <div className="bg-[#FFF9FB] rounded-2xl p-3 border border-pink-200 text-xs text-stone-600 space-y-1">
                <div className="font-black text-[#9E2A47] flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-[#FF8FAB]" />
                  <span>🔒 タスクは完全に個人専用（相手には見えません）</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  ペアカレ上で追加したタスクも、Geminiから取り込んだタスクも、すべて <b>{myPartner.avatar}{myPartner.name}だけの個人カレンダー</b> として扱われ、パートナーの画面やカレンダーには一切表示されません。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
