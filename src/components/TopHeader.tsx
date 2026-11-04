import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Settings,
  RefreshCw,
  Maximize2,
  Minimize2,
  Clock,
  Lock,
  Heart,
  Plus,
  Timer,
  Camera,
} from 'lucide-react';
import {
  CalendarCategoryItem,
  CoupleMetadata,
  FilterCategoryId,
  PartnerId,
  ShiftEntry,
} from '../types/calendar';
import {
  formatMinutesToJa,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
} from '../utils/presets';

export interface PartnerOvertimeSummary {
  overtimeMinutes: number;        // 通常残業（分単位：例 35）
  holidayWorkMinutes: number;     // 休日出勤（分単位：例 240）
  totalExtraMinutes: number;      // 合計時間（分単位：例 275）
  overtimeHours: number;          // 従来の時間小数（後方互換用）
  holidayWorkHours: number;       // 従来の時間小数
  totalExtraHours: number;        // 従来の時間小数
  overtimeFormatted: string;      // 「35分」「1時間30分」
  holidayWorkFormatted: string;   // 「4時間」
  totalExtraFormatted: string;    // 「4時間35分」
  partTimeCount: number;
  entries: ShiftEntry[];
}

export interface MonthlyOvertimeSummary {
  partnerA: PartnerOvertimeSummary;
  partnerB: PartnerOvertimeSummary;
}

interface TopHeaderProps {
  year: number;
  month: number; // 1-12
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onSelectYearMonth: (y: number, m: number) => void;
  activePartner: PartnerId;
  onToggleActivePartner: (p: PartnerId) => void;
  metadata: CoupleMetadata;
  categories: CalendarCategoryItem[];
  onOpenCategoryManager: () => void;
  onMarkSeenNow: () => void;
  matchedHolidays: string[]; // "YYYY-MM-DD" の配列
  overtimeSummary: MonthlyOvertimeSummary;
  onSelectDate: (dateStr: string) => void;
  filterCategory: FilterCategoryId;
  onChangeFilter: (cat: FilterCategoryId) => void;
  isExpandedView: boolean;
  onToggleExpandedView: () => void;
  showShiftTimeInCell: boolean;
  onToggleShowShiftTime: () => void;
  unreadCountForPartner: number;
  isSyncing: boolean;
  syncEnabled: boolean;
  onTriggerSync: () => void;
  onOpenSettings: () => void;
  onLockScreen: () => void;
  onOpenWidgetHome?: () => void;
  onOpenShiftExport?: () => void;
}

export function formatLastSeen(isoStr?: string): string {
  if (!isoStr) return '未確認';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return '未確認';

  const now = new Date();
  const diffMin = Math.floor((now.getTime() - dt.getTime()) / 60000);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');

  if (diffMin < 1) return `たった今 (${hh}:${min})`;
  if (diffMin < 60) return `${diffMin}分前 (${hh}:${min})`;

  const isSameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();

  if (isSameDay) {
    return `今日 ${hh}:${min}`;
  }
  return `${mm}/${dd} ${hh}:${min}`;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
  onSelectYearMonth,
  activePartner,
  onToggleActivePartner,
  metadata,
  categories,
  onOpenCategoryManager,
  onMarkSeenNow,
  matchedHolidays,
  overtimeSummary,
  onSelectDate,
  filterCategory,
  onChangeFilter,
  isExpandedView,
  onToggleExpandedView,
  showShiftTimeInCell,
  onToggleShowShiftTime,
  unreadCountForPartner,
  isSyncing,
  syncEnabled,
  onTriggerSync,
  onOpenSettings,
  onLockScreen,
  onOpenWidgetHome,
  onOpenShiftExport,
}) => {
  const [showHolidayPopup, setShowHolidayPopup] = useState(false);
  const [showOvertimePopup, setShowOvertimePopup] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;
  const otherPartnerId: PartnerId = activePartner === 'partnerA' ? 'partnerB' : 'partnerA';
  const otherPartner = metadata.partners[otherPartnerId];
  const currentPartner = metadata.partners[activePartner];

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  return (
    <header className="sticky top-0 z-30 bg-[#FFFBF7]/95 backdrop-blur-md border-b border-[#FFE5EC] shadow-xs">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 pt-1.5 pb-1.5 space-y-1.5">
        {/* 上段：ウィジェットへ戻る ＋ 年月セレクター ＋ ふたり休日一致 ＋ 残業時間集計 ＋ 既読・操作切替 */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          {/* 左側：ウィジェット切替＆年月切替＆お休み一致＆残業バッジ */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
            {onOpenWidgetHome && (
              <button
                type="button"
                onClick={onOpenWidgetHome}
                className="px-2.5 py-1 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white text-[11px] font-extrabold shadow-2xs active:scale-95"
                title="日々の予定とシフトが縦に並ぶタイムライン（ホーム）画面へ"
              >
                📜 タイムライン
              </button>
            )}

            <div className="flex items-center bg-white rounded-2xl border border-stone-200/80 shadow-2xs px-0.5 py-0.5">
              <button
                type="button"
                onClick={onPrevMonth}
                className="p-1 rounded-xl hover:bg-[#FFE5EC]/60 text-stone-600"
                title="前の月"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                type="button"
                onClick={() => setShowMonthPicker(!showMonthPicker)}
                className="px-1.5 sm:px-2.5 py-0.5 rounded-xl hover:bg-[#FFF0F5] flex items-baseline gap-0.5"
              >
                <span className="text-[11px] font-bold text-stone-500">{year}年</span>
                <span className="text-base sm:text-xl font-extrabold text-stone-800">
                  {month}月
                </span>
              </button>
              <button
                type="button"
                onClick={onNextMonth}
                className="p-1 rounded-xl hover:bg-[#FFE5EC]/60 text-stone-600"
                title="次の月"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={onToday}
              className="px-2 py-1 rounded-xl bg-white border border-stone-200 text-stone-600 text-[11px] font-bold shadow-2xs"
            >
              今日
            </button>

            {/* ✨今月のお休み一致バッジ */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowHolidayPopup(!showHolidayPopup);
                  setShowOvertimePopup(false);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-2xl bg-[#FFE5EC] border border-[#FFC2D1] text-[#9E2A47] text-[11px] font-extrabold shadow-2xs active:scale-95 transition-all"
              >
                <Sparkles className="w-3 h-3 text-[#FF8FAB] shrink-0" />
                <span>休一致</span>
                <span className="px-1.5 rounded-full bg-white text-[#D63864] font-black text-[11px]">
                  {matchedHolidays.length}日
                </span>
              </button>

              {showHolidayPopup && (
                <div className="absolute left-0 mt-1.5 w-64 bg-white rounded-3xl shadow-xl border-2 border-[#FFE5EC] p-3 z-50 animate-pop">
                  <div className="flex items-center justify-between mb-2 pb-1 border-b border-stone-100">
                    <span className="text-xs font-extrabold text-[#9E2A47] flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5 fill-[#FF8FAB] text-[#FF8FAB]" />
                      {month}月のふたり休日一致 ({matchedHolidays.length}日)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowHolidayPopup(false)}
                      className="text-stone-400 hover:text-stone-600 text-xs font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>
                  {matchedHolidays.length === 0 ? (
                    <p className="text-xs text-stone-500 py-2 text-center">
                      まだ今月の2人共通のお休み日がありません🐾
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                      {matchedHolidays.map((dateStr) => {
                        const dayNum = Number(dateStr.split('-')[2]);
                        const dt = new Date(
                          Number(dateStr.split('-')[0]),
                          Number(dateStr.split('-')[1]) - 1,
                          dayNum
                        );
                        const w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => {
                              onSelectDate(dateStr);
                              setShowHolidayPopup(false);
                            }}
                            className="px-2.5 py-1 rounded-xl bg-[#FFE5EC]/70 hover:bg-[#FF8FAB] text-[#9E2A47] hover:text-white text-xs font-extrabold"
                          >
                            💕 {month}/{dayNum}({w})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ⏱️ 今月の残業・休日出勤時間バッジ（タップで詳細内訳ポップアップ） */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowOvertimePopup(!showOvertimePopup);
                  setShowHolidayPopup(false);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-2xl bg-[#FFF6D6] border border-[#FFE28A] text-[#8A5A00] text-[11px] font-extrabold shadow-2xs active:scale-95 transition-all"
                title="今月の残業時間・休日出勤時間・バイト回数を確認"
              >
                <Timer className="w-3.5 h-3.5 text-[#D49600] shrink-0" />
                <span>
                  残業 {partnerA.avatar}
                  {overtimeSummary.partnerA.totalExtraMinutes}分 / {partnerB.avatar}
                  {overtimeSummary.partnerB.totalExtraMinutes}分
                </span>
              </button>

              {showOvertimePopup && (
                <div className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-72 sm:w-84 bg-white rounded-3xl shadow-xl border-2 border-[#FFE28A] p-3.5 z-50 animate-pop text-xs space-y-2.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-stone-100">
                    <span className="font-extrabold text-[#8A5A00] flex items-center gap-1">
                      <Timer className="w-4 h-4 text-[#FFB703]" />
                      {month}月の残業・休日出勤・バイト集計
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowOvertimePopup(false)}
                      className="text-stone-400 hover:text-stone-600 font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 夫・妻それぞれの残業・休出・バイト集計カード */}
                  {(['partnerA', 'partnerB'] as PartnerId[]).map((pid) => {
                    const p = metadata.partners[pid];
                    const sum = overtimeSummary[pid];
                    return (
                      <div
                        key={pid}
                        className="p-2.5 rounded-2xl bg-[#FFFBF7] border border-stone-200/80 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-stone-800">
                            {p.avatar} {p.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFF6D6] text-[#8A5A00] font-black text-xs">
                            合計 {sum.totalExtraMinutes}分
                            {sum.totalExtraMinutes >= 60 && ` (${sum.totalExtraFormatted})`}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] text-stone-600 font-bold">
                          <span>
                            ⏱️ 通常残業: {sum.overtimeMinutes}分
                            {sum.overtimeMinutes >= 60 && ` (${sum.overtimeFormatted})`}
                          </span>
                          <span>
                            💼 休日出勤: {sum.holidayWorkMinutes}分
                            {sum.holidayWorkMinutes >= 60 && ` (${sum.holidayWorkFormatted})`}
                          </span>
                          <span>🏪 バイト: {sum.partTimeCount}回</span>
                        </div>

                        {sum.entries.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {sum.entries.map((en) => {
                              const dayN = Number(en.date.split('-')[2]);
                              const otMin = getShiftOvertimeMinutes(en);
                              const hwMin = getShiftHolidayWorkMinutes(en);
                              return (
                                <button
                                  key={en.id}
                                  type="button"
                                  onClick={() => {
                                    onSelectDate(en.date);
                                    setShowOvertimePopup(false);
                                  }}
                                  className="px-1.5 py-0.5 rounded-lg bg-white border border-stone-200 text-[10px] font-bold text-stone-700 hover:border-[#FF8FAB]"
                                >
                                  {dayN}日(
                                  {hwMin > 0
                                    ? `休出${hwMin}分`
                                    : otMin > 0
                                    ? `+${otMin}分`
                                    : 'バイト'}
                                  )
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 右側：既読確認 ＆ パートナー切替 ＆ 設定 */}
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-2xl border border-stone-200/90 shadow-2xs text-[10px] sm:text-[11px]">
              <span className="font-bold text-stone-600 flex items-center gap-0.5">
                <span>{otherPartner.avatar}</span>
                <span className="font-extrabold text-stone-800">
                  {formatLastSeen(otherPartner.lastSeenAt)}
                </span>
              </span>
              {unreadCountForPartner > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#FFE5EC] text-[#D63864] font-extrabold text-[9px]">
                  未見{unreadCountForPartner}
                </span>
              )}
              <button
                type="button"
                onClick={onMarkSeenNow}
                className="px-1.5 py-0.5 rounded-lg bg-[#E6F7EF] hover:bg-[#52B788] text-[#1E6645] hover:text-white font-extrabold text-[10px] flex items-center gap-0.5"
                title={`${currentPartner.avatar}${currentPartner.name}の既読時刻を更新`}
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>既読</span>
              </button>
            </div>

            {/* 操作中パートナー切替（🐻夫 ⇔ 🐰妻） */}
            <div className="flex items-center bg-stone-100 p-0.5 rounded-2xl border border-stone-200">
              <button
                type="button"
                onClick={() => onToggleActivePartner('partnerA')}
                className={`px-2 py-0.5 rounded-xl text-[11px] font-extrabold transition-all flex items-center gap-0.5 ${
                  activePartner === 'partnerA'
                    ? 'bg-[#56CFE1] text-white shadow-2xs'
                    : 'text-stone-500'
                }`}
              >
                <span>{partnerA.avatar}</span>
                <span>{partnerA.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleActivePartner('partnerB')}
                className={`px-2 py-0.5 rounded-xl text-[11px] font-extrabold transition-all flex items-center gap-0.5 ${
                  activePartner === 'partnerB'
                    ? 'bg-[#B388EB] text-white shadow-2xs'
                    : 'text-stone-500'
                }`}
              >
                <span>{partnerB.avatar}</span>
                <span>{partnerB.name}</span>
              </button>
            </div>

            {/* 📸 ナスカレ風シフト写真保存モーダル */}
            {onOpenShiftExport && (
              <button
                type="button"
                onClick={onOpenShiftExport}
                className="px-2 py-1 rounded-xl bg-[#E2F9FC] hover:bg-[#56CFE1] text-[#126875] hover:text-white border border-[#A9E9F2] text-[10px] sm:text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all shadow-2xs"
                title="夫のみ・妻のみ・両方のシフト表を枠いっぱいの文字で写真(PNG)保存します"
              >
                <Camera className="w-3.5 h-3.5 text-[#0284C7]" />
                <span className="hidden sm:inline">写真保存</span>
                <span className="sm:hidden">写真</span>
              </button>
            )}

            {syncEnabled && (
              <button
                type="button"
                onClick={onTriggerSync}
                disabled={isSyncing}
                className="p-1.5 rounded-xl bg-white border border-stone-200 text-stone-600"
                title="今すぐクラウド同期"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#FF8FAB]' : ''}`} />
              </button>
            )}

            {/* 🔄 キャッシュ破棄＆最新版再読込ボタン */}
            <button
              type="button"
              onClick={async () => {
                try {
                  if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    for (const r of regs) await r.unregister();
                  }
                  if ('caches' in window) {
                    const keys = await caches.keys();
                    for (const k of keys) await caches.delete(k);
                  }
                } catch {
                  // ignore
                }
                window.location.reload();
              }}
              className="px-2 py-1 rounded-xl bg-[#FFF0F5] hover:bg-[#FFE5EC] border border-[#FFC2D1] text-[#9E2A47] text-[10px] font-black flex items-center gap-1 active:scale-95"
              title="タップすると古いキャッシュを完全破棄して最新版に更新します"
            >
              <RefreshCw className="w-3 h-3 text-[#FF8FAB]" />
              <span>v2.2更新</span>
            </button>

            <button
              type="button"
              onClick={onLockScreen}
              className="p-1.5 rounded-xl bg-white border border-stone-200 text-stone-500"
              title="画面ロック"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="p-1.5 rounded-xl bg-white border border-stone-200 text-stone-700"
              title="設定・クラウド同期・iCal連携"
            >
              <Settings className="w-3.5 h-3.5 text-[#FF8FAB]" />
            </button>
          </div>
        </div>

        {/* 年月ジャンプピッカー */}
        {showMonthPicker && (
          <div className="bg-white rounded-3xl p-3 border-2 border-[#FFE5EC] shadow-lg flex flex-wrap items-center justify-between gap-2 animate-pop">
            <div className="flex items-center gap-1.5">
              {[year - 1, year, year + 1].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => onSelectYearMonth(y, month)}
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold ${
                    y === year ? 'bg-[#FF8FAB] text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {y}年
                </button>
              ))}
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 flex-1">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onSelectYearMonth(year, m);
                    setShowMonthPicker(false);
                  }}
                  className={`py-1 rounded-xl text-xs font-bold ${
                    m === month ? 'bg-[#B388EB] text-white font-extrabold' : 'bg-[#FFFBF7] text-stone-700'
                  }`}
                >
                  {m}月
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 下段：カレンダー予定項目フィルタ（デフォルト：すべて | 💕二人予定 | 🐻夫予定 | 🐰妻予定 ＋ 項目追加・削除ボタン）＋ 全件/コンパクト（3件まで）切替 */}
        <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onChangeFilter('all')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold transition-all flex items-center gap-1 ${
                filterCategory === 'all'
                  ? 'bg-stone-800 text-white shadow-2xs'
                  : 'bg-white text-stone-600 border border-stone-200/80'
              }`}
            >
              <span>🌈</span>
              <span>すべて</span>
            </button>

            {sortedCategories.map((cat) => {
              const isActive = filterCategory === cat.id;
              const displayLabel =
                cat.id === 'partnerA'
                  ? `${partnerA.name}予定`
                  : cat.id === 'partnerB'
                  ? `${partnerB.name}予定`
                  : cat.shortLabel;
              const displayIcon =
                cat.id === 'partnerA'
                  ? partnerA.avatar
                  : cat.id === 'partnerB'
                  ? partnerB.avatar
                  : cat.icon;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onChangeFilter(cat.id)}
                  style={
                    isActive
                      ? { backgroundColor: cat.accentColor, color: '#ffffff' }
                      : undefined
                  }
                  className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold transition-all flex items-center gap-1 ${
                    isActive
                      ? 'shadow-2xs scale-[1.02]'
                      : 'bg-white text-stone-600 border border-stone-200/80'
                  }`}
                >
                  <span>{displayIcon}</span>
                  <span>{displayLabel}</span>
                </button>
              );
            })}

            {/* カレンダー項目の追加・削除ボタン */}
            <button
              type="button"
              onClick={onOpenCategoryManager}
              className="px-2 py-1 rounded-full bg-[#FFF0F5] hover:bg-[#FFE5EC] border border-[#FFC2D1] text-[#9E2A47] text-[10px] font-extrabold flex items-center gap-0.5 shrink-0"
              title="カレンダーの予定項目を追加・削除する"
            >
              <Plus className="w-3 h-3" />
              <span>項目編集</span>
            </button>
          </div>

          {/* 右端：シフト時間表示トグル ＋ 全件展開 / コンパクト(3件まで)切替 */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleShowShiftTime}
              className={`px-2 py-1 rounded-full text-[10px] font-bold border flex items-center gap-0.5 ${
                showShiftTimeInCell
                  ? 'bg-[#E2F9FC] border-[#56CFE1] text-[#136370]'
                  : 'bg-white border-stone-200 text-stone-500'
              }`}
              title="シフト枠に開始時間を表示"
            >
              <Clock className="w-3 h-3" />
              <span className="hidden sm:inline">時間</span>
            </button>

            <button
              type="button"
              onClick={onToggleExpandedView}
              className={`px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-extrabold border flex items-center gap-1 ${
                isExpandedView
                  ? 'bg-[#FFE5EC] border-[#FF8FAB] text-[#9E2A47]'
                  : 'bg-white border-stone-200 text-stone-700'
              }`}
              title="コンパクト時は1日3件まで表示し、全件展開時はすべて表示します"
            >
              {isExpandedView ? (
                <>
                  <Maximize2 className="w-3 h-3" />
                  <span>全件表示</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3 h-3" />
                  <span>コンパクト(3件)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
