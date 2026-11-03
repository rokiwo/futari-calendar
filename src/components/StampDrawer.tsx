import React from 'react';
import {
  Stamp,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Settings2,
  X,
  Check,
  Mic,
  Camera,
  CalendarPlus,
  Smartphone,
} from 'lucide-react';
import {
  CoupleMetadata,
  PartnerId,
  StampPreset,
} from '../types/calendar';
import { SUPPORT_BADGE_PRESETS } from '../utils/presets';

export type StampDrawerTab = 'partnerA_shift' | 'partnerB_shift' | 'support_badge';

interface StampDrawerProps {
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
  activeTab: StampDrawerTab;
  onChangeTab: (tab: StampDrawerTab) => void;
  stamps: StampPreset[];
  selectedStampId: string | null;
  onSelectStamp: (stampId: string | null) => void;
  selectedDate: string;
  onMoveDate: (deltaDays: number) => void;
  onApplyShiftAndAdvance: (stamp: StampPreset, targetPartner: PartnerId) => void;
  onClearShiftAndAdvance: (targetPartner: PartnerId) => void;
  onToggleSupportBadgeOnSelectedDate: (badge: string) => void;
  activeSupportBadgesOnSelectedDate: string[];
  onOpenDayDetail: () => void;
  onOpenShiftStampManager: () => void;
  onOpenVoiceModal: () => void;
  onOpenImageOcrModal: () => void;
  onOpenWidgetModal: () => void;
  metadata: CoupleMetadata;
}

export const StampDrawer: React.FC<StampDrawerProps> = ({
  isOpen,
  onToggleOpen,
  activeTab,
  onChangeTab,
  stamps,
  selectedStampId,
  onSelectStamp,
  selectedDate,
  onMoveDate,
  onApplyShiftAndAdvance,
  onClearShiftAndAdvance,
  onToggleSupportBadgeOnSelectedDate,
  activeSupportBadgesOnSelectedDate,
  onOpenDayDetail,
  onOpenShiftStampManager,
  onOpenVoiceModal,
  onOpenImageOcrModal,
  onOpenWidgetModal,
  metadata,
}) => {
  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;

  const shiftStamps = stamps
    .filter((s) => s.type === 'shift')
    .sort((a, b) => a.order - b.order);

  const formatSelectedDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
    return `${m}/${d}(${w})`;
  };

  // ドロワーが閉じている時の「スマホライクな下部アクションドック」
  if (!isOpen) {
    return (
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#FFE5EC] shadow-[0_-4px_20px_rgba(255,143,171,0.15)] pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto px-2 py-1.5 grid grid-cols-5 gap-1">
          {/* 1. シフト連続入力 */}
          <button
            type="button"
            onClick={() => onToggleOpen(true)}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl bg-[#FFE5EC]/70 text-[#9E2A47] active:scale-95 transition-all"
          >
            <Stamp className="w-5 h-5 text-[#FF8FAB]" />
            <span className="text-[10px] font-extrabold mt-0.5 leading-tight">
              シフト入力
            </span>
          </button>

          {/* 2. 音声で予定入力（中央左・目立つボタン） */}
          <button
            type="button"
            onClick={onOpenVoiceModal}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl bg-[#F3EAFF]/80 text-[#59318F] active:scale-95 transition-all"
          >
            <Mic className="w-5 h-5 text-[#B388EB]" />
            <span className="text-[10px] font-extrabold mt-0.5 leading-tight">
              声で予定
            </span>
          </button>

          {/* 3. 選択日の予定追加・詳細（センターメインボタン） */}
          <button
            type="button"
            onClick={onOpenDayDetail}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl bg-gradient-to-tr from-[#FF8FAB] to-[#B388EB] text-white shadow-md active:scale-95 transition-all"
          >
            <CalendarPlus className="w-5 h-5" />
            <span className="text-[10px] font-extrabold mt-0.5 leading-tight truncate max-w-full">
              {formatSelectedDate(selectedDate)}詳細
            </span>
          </button>

          {/* 4. シフト表AI画像読取＆ナスカレ連携 */}
          <button
            type="button"
            onClick={onOpenImageOcrModal}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl bg-[#E2F9FC]/80 text-[#136370] active:scale-95 transition-all"
          >
            <Camera className="w-5 h-5 text-[#56CFE1]" />
            <span className="text-[10px] font-extrabold mt-0.5 leading-tight">
              AIシフト読取
            </span>
          </button>

          {/* 5. スマホウィジェット表示 */}
          <button
            type="button"
            onClick={onOpenWidgetModal}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl bg-[#FFF6D6]/80 text-[#8A5A00] active:scale-95 transition-all"
          >
            <Smartphone className="w-5 h-5 text-[#FFB703]" />
            <span className="text-[10px] font-extrabold mt-0.5 leading-tight">
              ウィジェット
            </span>
          </button>
        </div>
      </nav>
    );
  }

  const currentShiftPartner: PartnerId =
    activeTab === 'partnerB_shift' ? 'partnerB' : 'partnerA';

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white/98 backdrop-blur-md rounded-t-3xl shadow-2xl border-t-2 border-[#FF8FAB] pb-[env(safe-area-inset-bottom)] animate-pop">
      <div className="max-w-xl mx-auto px-3 pt-2.5 pb-3 space-y-2">
        {/* 1. ドロワー上部：選択日表示（1つ入れたら自動で次へ移動）＆ シフト種類編集ボタン */}
        <div className="flex items-center justify-between gap-1.5 border-b border-stone-100 pb-2">
          <div className="flex items-center gap-1 bg-[#FFF0F5] px-2 py-1 rounded-2xl border border-[#FFC2D1]">
            <button
              type="button"
              onClick={() => onMoveDate(-1)}
              className="p-1 rounded-xl bg-white hover:bg-[#FFE5EC] text-stone-700 shadow-2xs"
              title="1日戻る"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onOpenDayDetail}
              className="px-2 text-xs sm:text-sm font-extrabold text-[#9E2A47]"
            >
              🎯 {formatSelectedDate(selectedDate)} に入力中⏩
            </button>
            <button
              type="button"
              onClick={() => onMoveDate(1)}
              className="p-1 rounded-xl bg-white hover:bg-[#FFE5EC] text-stone-700 shadow-2xs"
              title="1日進む"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* シフト種類の追加・かんたん編集ボタン */}
            <button
              type="button"
              onClick={onOpenShiftStampManager}
              className="px-2.5 py-1.5 rounded-2xl bg-[#FFE5EC] hover:bg-[#FF8FAB] text-[#9E2A47] hover:text-white text-xs font-extrabold transition-colors flex items-center gap-1 shadow-2xs"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>シフト種類の追加・編集</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleOpen(false)}
              className="p-1.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. 対象切替タブ：[🐻夫のシフト] [🐰妻のシフト] [🍳ごはん・お迎え目印] */}
        <div className="grid grid-cols-3 gap-1 bg-[#FFFBF7] p-1 rounded-2xl border border-stone-200/70">
          <button
            type="button"
            onClick={() => onChangeTab('partnerA_shift')}
            className={`py-1.5 px-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'partnerA_shift'
                ? 'bg-[#56CFE1] text-white shadow-sm'
                : 'text-stone-600 hover:bg-white'
            }`}
          >
            <span>{partnerA.avatar}</span>
            <span className="truncate">{partnerA.name}のシフト</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('partnerB_shift')}
            className={`py-1.5 px-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'partnerB_shift'
                ? 'bg-[#B388EB] text-white shadow-sm'
                : 'text-stone-600 hover:bg-white'
            }`}
          >
            <span>{partnerB.avatar}</span>
            <span className="truncate">{partnerB.name}のシフト</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('support_badge')}
            className={`py-1.5 px-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'support_badge'
                ? 'bg-[#FFB703] text-stone-900 shadow-sm'
                : 'text-stone-600 hover:bg-white'
            }`}
          >
            <span>🍳</span>
            <span className="truncate">ごはん・家事</span>
          </button>
        </div>

        {/* 3. シフトボタンパレット（1回押すごとに自動で翌日に移動！） */}
        {(activeTab === 'partnerA_shift' || activeTab === 'partnerB_shift') && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-stone-500 px-1 flex items-center justify-between">
              <span>
                👇 ボタンを押すと <strong>{formatSelectedDate(selectedDate)}</strong> に入り、<strong>自動で次の日へ進みます</strong>
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-44 overflow-y-auto p-0.5">
              {shiftStamps.map((stamp) => {
                const isSelected = selectedStampId === stamp.id;
                return (
                  <button
                    key={stamp.id}
                    type="button"
                    onClick={() => {
                      onSelectStamp(stamp.id);
                      onApplyShiftAndAdvance(stamp, currentShiftPartner);
                    }}
                    style={{
                      backgroundColor: stamp.color,
                      color: stamp.textColor,
                    }}
                    className={`py-2.5 px-1.5 rounded-2xl font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 shadow-xs active:scale-90 transition-all border-2 ${
                      isSelected
                        ? 'border-stone-800 ring-2 ring-stone-800/15'
                        : 'border-white hover:brightness-95'
                    }`}
                  >
                    <div className="flex items-center gap-0.5">
                      {stamp.icon && <span className="text-sm">{stamp.icon}</span>}
                      <span className="truncate">{stamp.label}</span>
                    </div>
                    {stamp.startTime ? (
                      <span className="text-[9px] opacity-80 font-bold">
                        {stamp.startTime}-{stamp.endTime}
                      </span>
                    ) : (
                      <span className="text-[9px] opacity-65">
                        {stamp.isHoliday ? '💕休日' : '終日'}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* シフト消去＆次へボタン */}
              <button
                type="button"
                onClick={() => {
                  onSelectStamp('__ERASER__');
                  onClearShiftAndAdvance(currentShiftPartner);
                }}
                className={`py-2.5 px-1.5 rounded-2xl font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 bg-stone-100 text-stone-600 hover:bg-rose-50 hover:text-rose-600 border-2 ${
                  selectedStampId === '__ERASER__' ? 'border-rose-500' : 'border-stone-200'
                }`}
              >
                <Eraser className="w-4 h-4" />
                <span>消して次へ</span>
              </button>
            </div>
          </div>
        )}

        {/* ごはん・家事すれ違い目印パレット */}
        {activeTab === 'support_badge' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-40 overflow-y-auto p-0.5">
            {SUPPORT_BADGE_PRESETS.map((item) => {
              const isActive = activeSupportBadgesOnSelectedDate.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggleSupportBadgeOnSelectedDate(item.id)}
                  className={`py-2 px-2.5 rounded-2xl text-left transition-all border-2 flex flex-col justify-center ${
                    isActive
                      ? 'bg-[#FFF6D6] border-[#FFB703] text-[#8A5A00] shadow-xs'
                      : 'bg-[#FFFBF7] border-stone-200 text-stone-700'
                  }`}
                >
                  <div className="text-xs font-extrabold flex items-center justify-between">
                    <span>{item.label}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-[#D49600]" />}
                  </div>
                  <span className="text-[10px] text-stone-400 truncate">{item.desc}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
