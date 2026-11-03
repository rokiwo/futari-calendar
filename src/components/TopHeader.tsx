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
} from 'lucide-react';
import {
  CoupleMetadata,
  FilterCategoryId,
  PartnerId,
} from '../types/calendar';
import { CATEGORY_MAP } from '../utils/presets';

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
  onMarkSeenNow: () => void;
  matchedHolidays: string[]; // "YYYY-MM-DD" の配列
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
}

// 相対時間＆日時フォーマット（「5分前」「今日 19:40」「11/03 18:30」など）
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
  onMarkSeenNow,
  matchedHolidays,
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
}) => {
  const [showHolidayPopup, setShowHolidayPopup] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;
  const otherPartnerId: PartnerId = activePartner === 'partnerA' ? 'partnerB' : 'partnerA';
  const otherPartner = metadata.partners[otherPartnerId];
  const currentPartner = metadata.partners[activePartner];

  const filterOptions: { id: FilterCategoryId; label: string; icon: string; activeBg: string; activeText: string }[] = [
    { id: 'all', label: 'すべて', icon: '🌈', activeBg: 'bg-stone-800', activeText: 'text-white' },
    { id: 'shared', label: 'ふたり', icon: '💕', activeBg: 'bg-[#FF8FAB]', activeText: 'text-white' },
    { id: 'partnerA', label: partnerA.name, icon: partnerA.avatar, activeBg: 'bg-[#56CFE1]', activeText: 'text-white' },
    { id: 'partnerB', label: partnerB.name, icon: partnerB.avatar, activeBg: 'bg-[#B388EB]', activeText: 'text-white' },
    { id: 'anniversary', label: '記念日', icon: '🎉', activeBg: 'bg-[#FFB703]', activeText: 'text-stone-900' },
    { id: 'chore', label: '家事', icon: '🏠', activeBg: 'bg-[#52B788]', activeText: 'text-white' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#FFFBF7]/95 backdrop-blur-md border-b border-[#FFE5EC] shadow-sm">
      <div className="max-w-6xl mx-auto px-2.5 sm:px-4 pt-2 pb-2 space-y-2">
        {/* 上段：年月セレクター ＋ ふたり休日一致バッジ ＋ 操作中パートナー＆相手の最終確認ステータス */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* 左側：年月切替＆お休み一致バッジ */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center bg-white rounded-2xl border border-stone-200/80 shadow-sm px-1 py-0.5">
              <button
                type="button"
                onClick={onPrevMonth}
                className="p-1.5 rounded-xl hover:bg-[#FFE5EC]/60 text-stone-600 transition-colors"
                title="前の月"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                type="button"
                onClick={() => setShowMonthPicker(!showMonthPicker)}
                className="px-2 sm:px-3 py-1 rounded-xl hover:bg-[#FFF0F5] transition-colors flex items-baseline gap-1"
                title="年月を選択"
              >
                <span className="text-xs sm:text-sm font-bold text-stone-500">{year}年</span>
                <span className="text-lg sm:text-2xl font-extrabold text-stone-800 tracking-tight">
                  {month}月
                </span>
              </button>
              <button
                type="button"
                onClick={onNextMonth}
                className="p-1.5 rounded-xl hover:bg-[#FFE5EC]/60 text-stone-600 transition-colors"
                title="次の月"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={onToday}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-stone-200 text-stone-600 hover:bg-stone-100 text-xs font-bold shadow-sm transition-colors"
            >
              今日
            </button>

            {/* ✨今月のお休み一致バッジ */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHolidayPopup(!showHolidayPopup)}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-gradient-to-r from-[#FFE5EC] to-[#F3EAFF] border border-[#FFC2D1] text-[#9E2A47] text-xs font-extrabold shadow-sm hover:scale-[1.02] active:scale-95 transition-all"
                title="2人ともお休みの日を確認"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#FF8FAB] shrink-0" />
                <span className="hidden xs:inline">お休み一致</span>
                <span className="inline xs:hidden">一致</span>
                <span className="px-1.5 py-0.2 rounded-full bg-white text-[#D63864] font-black text-xs shadow-inner">
                  {matchedHolidays.length}日
                </span>
              </button>

              {/* お休み一致日リストポップアップ */}
              {showHolidayPopup && (
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-3xl shadow-xl border-2 border-[#FFE5EC] p-3.5 z-50 animate-pop">
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-stone-100">
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
                      まだ今月の2人共通のお休みスタンプがありません🐾
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
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
                            className="px-2.5 py-1.5 rounded-xl bg-[#FFE5EC]/70 hover:bg-[#FF8FAB] text-[#9E2A47] hover:text-white text-xs font-extrabold transition-colors flex items-center gap-1"
                          >
                            <span>💕 {month}/{dayNum}({w})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右側：操作中ユーザー切替 ＋ 相手の最終確認（既読ステータス） ＋ 同期・設定ボタン */}
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* 相手の最終確認バッジ */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-2xl border border-stone-200/90 shadow-sm text-[11px]">
              <span className="font-bold text-stone-600 flex items-center gap-1">
                <span>{otherPartner.avatar}</span>
                <span className="hidden md:inline">{otherPartner.name}の</span>最終確認:
                <span className="font-extrabold text-stone-800">
                  {formatLastSeen(otherPartner.lastSeenAt)}
                </span>
              </span>
              {unreadCountForPartner > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded-full bg-[#FFE5EC] text-[#D63864] font-extrabold text-[10px]"
                  title={`${otherPartner.name}さんがまだ見ていない変更が ${unreadCountForPartner} 件あります`}
                >
                  🆕未見{unreadCountForPartner}
                </span>
              )}
              <button
                type="button"
                onClick={onMarkSeenNow}
                className="ml-0.5 px-2 py-0.5 rounded-xl bg-[#E6F7EF] hover:bg-[#52B788] text-[#1E6645] hover:text-white font-extrabold text-[10px] transition-colors flex items-center gap-0.5"
                title={`${currentPartner.avatar}${currentPartner.name}の最終確認時刻を「たった今」に更新します`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>既読更新</span>
              </button>
            </div>

            {/* 自分がどちらか（🐻夫 / 🐰妻）切替ピル */}
            <div
              className="flex items-center bg-stone-100 p-0.5 rounded-2xl border border-stone-200"
              title="操作する人を切り替え（誰が予定を入れたか＆既読記録に使われます）"
            >
              <button
                type="button"
                onClick={() => onToggleActivePartner('partnerA')}
                className={`px-2 py-1 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 ${
                  activePartner === 'partnerA'
                    ? 'bg-[#56CFE1] text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <span>{partnerA.avatar}</span>
                <span className="hidden sm:inline">{partnerA.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleActivePartner('partnerB')}
                className={`px-2 py-1 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 ${
                  activePartner === 'partnerB'
                    ? 'bg-[#B388EB] text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <span>{partnerB.avatar}</span>
                <span className="hidden sm:inline">{partnerB.name}</span>
              </button>
            </div>

            {/* クラウド同期ボタン */}
            {syncEnabled && (
              <button
                type="button"
                onClick={onTriggerSync}
                disabled={isSyncing}
                className="p-2 rounded-2xl bg-white border border-stone-200 text-stone-600 hover:bg-[#E2F9FC] hover:text-[#136370] shadow-sm transition-colors"
                title="GitHubクラウドと今すぐ暗号化マージ同期"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[#FF8FAB]' : ''}`} />
              </button>
            )}

            {/* ロックボタン */}
            <button
              type="button"
              onClick={onLockScreen}
              className="p-2 rounded-2xl bg-white border border-stone-200 text-stone-500 hover:bg-[#FFE5EC] hover:text-[#9E2A47] shadow-sm transition-colors"
              title="合言葉で画面をロック"
            >
              <Lock className="w-4 h-4" />
            </button>

            {/* 設定＆同期モーダルボタン */}
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 shadow-sm text-xs font-bold transition-colors"
              title="クラウド同期・iCal連携・プロフィール設定"
            >
              <Settings className="w-4 h-4 text-[#FF8FAB]" />
              <span className="hidden sm:inline">設定・同期</span>
            </button>
          </div>
        </div>

        {/* 年月ジャンプピッカー（展開時） */}
        {showMonthPicker && (
          <div className="bg-white rounded-3xl p-3 border-2 border-[#FFE5EC] shadow-lg flex flex-wrap items-center justify-between gap-2 animate-pop">
            <div className="flex items-center gap-1.5">
              {[year - 1, year, year + 1].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => onSelectYearMonth(y, month)}
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold ${
                    y === year ? 'bg-[#FF8FAB] text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
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
                  className={`py-1 rounded-xl text-xs font-bold transition-colors ${
                    m === month
                      ? 'bg-[#B388EB] text-white font-extrabold'
                      : 'bg-[#FFFBF7] hover:bg-[#FFE5EC] text-stone-700'
                  }`}
                >
                  {m}月
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 下段：カレンダー別フィルタピル ＋ 全件展開/コンパクト切替 ＋ 時間表示切替 */}
        <div className="flex items-center justify-between gap-2 pt-0.5 overflow-x-auto no-scrollbar">
          {/* カテゴリフィルタピル */}
          <div className="flex items-center gap-1 shrink-0">
            {filterOptions.map((opt) => {
              const isActive = filterCategory === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeFilter(opt.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-extrabold transition-all flex items-center gap-1 shadow-sm ${
                    isActive
                      ? `${opt.activeBg} ${opt.activeText} scale-[1.03]`
                      : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200/70'
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* 表示モード切替スイッチ（全件展開 / コンパクト ＋ シフト時間表示） */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleShowShiftTime}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1 ${
                showShiftTimeInCell
                  ? 'bg-[#E2F9FC] border-[#56CFE1] text-[#136370]'
                  : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
              title="セル内にシフトの開始・終了時間を常時表示するか切り替え"
            >
              <Clock className="w-3 h-3" />
              <span className="hidden md:inline">シフト時間</span>
            </button>

            <button
              type="button"
              onClick={onToggleExpandedView}
              className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border transition-all flex items-center gap-1 ${
                isExpandedView
                  ? 'bg-[#FFE5EC] border-[#FF8FAB] text-[#9E2A47]'
                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
              }`}
              title="1日の予定が何件あっても複数行で全文表示する「全件展開モード」と「コンパクトモード」を切り替えます"
            >
              {isExpandedView ? (
                <>
                  <Maximize2 className="w-3 h-3" />
                  <span>全件展開中</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3 h-3" />
                  <span>コンパクト</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
