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
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import { getPartnerShiftStamps, SUPPORT_BADGE_PRESETS } from '../utils/presets';

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
  onUpdateShiftDetailsOnSelectedDate: (
    targetPartner: PartnerId,
    patch: Partial<ShiftEntry>
  ) => void;
  currentShiftOnSelectedDate?: ShiftEntry;
  onToggleSupportBadgeOnSelectedDate: (badge: string) => void;
  activeSupportBadgesOnSelectedDate: string[];
  onOpenDayDetail: () => void;
  onOpenShiftStampManager: (partnerId?: PartnerId) => void;
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
  onUpdateShiftDetailsOnSelectedDate,
  currentShiftOnSelectedDate,
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

  const currentShiftPartner: PartnerId =
    activeTab === 'partnerB_shift' ? 'partnerB' : 'partnerA';

  const shiftStamps = getPartnerShiftStamps(stamps, currentShiftPartner);

  const formatSelectedDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
    return `${m}/${d}(${w})`;
  };

  if (!isOpen) {
    return (
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#FFE5EC] shadow-[0_-4px_20px_rgba(255,143,171,0.15)] pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto px-2 py-1.5 grid grid-cols-5 gap-1">
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
            <button
              type="button"
              onClick={() => onOpenShiftStampManager(currentShiftPartner)}
              className="px-2.5 py-1.5 rounded-2xl bg-[#FFE5EC] hover:bg-[#FF8FAB] text-[#9E2A47] hover:text-white text-xs font-extrabold transition-colors flex items-center gap-1 shadow-2xs"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>勤務リストの追加・編集</span>
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

        {/* 3. シフトボタンパレット（1回押すごとに自動で翌日に移動！）＋ バイト＆残業クイック追記バー */}
        {(activeTab === 'partnerA_shift' || activeTab === 'partnerB_shift') && (
          <div className="space-y-1.5">
            {shiftStamps.length === 0 ? (
              <div className="py-3 px-4 rounded-2xl bg-[#FFFBF7] border border-dashed border-stone-300 flex items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-stone-600">
                  {currentShiftPartner === 'partnerA'
                    ? `${partnerA.avatar} ${partnerA.name}`
                    : `${partnerB.avatar} ${partnerB.name}`}
                  の勤務リストは空です
                </div>
                <button
                  type="button"
                  onClick={() => onOpenShiftStampManager(currentShiftPartner)}
                  className="px-3 py-1.5 rounded-xl bg-[#B388EB] text-white text-xs font-extrabold shadow-xs shrink-0"
                >
                  ＋ 勤務リストを追加
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto p-0.5">
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
                      className={`py-2 px-1.5 rounded-2xl font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 shadow-xs active:scale-90 transition-all border-2 ${
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
                          {stamp.isHoliday ? '💕終日(休)' : '終日'}
                        </span>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    onSelectStamp('__ERASER__');
                    onClearShiftAndAdvance(currentShiftPartner);
                  }}
                  className={`py-2 px-1.5 rounded-2xl font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 bg-stone-100 text-stone-600 hover:bg-rose-50 hover:text-rose-600 border-2 ${
                    selectedStampId === '__ERASER__' ? 'border-rose-500' : 'border-stone-200'
                  }`}
                >
                  <Eraser className="w-4 h-4" />
                  <span>消して次へ</span>
                </button>
              </div>
            )}

            {/* 選択日の「＋仕事終わり・休日のバイト」＆「⏱️残業・休日出勤」ワンタップ重ね記載バー */}
            <div className="pt-1.5 border-t border-stone-100 flex items-center gap-1 overflow-x-auto no-scrollbar text-[10px]">
              <span className="font-bold text-stone-400 shrink-0">
                {formatSelectedDate(selectedDate)}に重ね書き:
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateShiftDetailsOnSelectedDate(currentShiftPartner, {
                    subStampId: currentShiftOnSelectedDate?.subCustomLabel ? undefined : 'shift_part',
                    subCustomLabel: currentShiftOnSelectedDate?.subCustomLabel ? undefined : 'バイト',
                    subStartTime: '18:30',
                    subEndTime: '22:00',
                  })
                }
                className={`px-2 py-1 rounded-lg font-extrabold border shrink-0 ${
                  currentShiftOnSelectedDate?.subCustomLabel
                    ? 'bg-[#FFF3D6] border-[#FFB703] text-[#996300]'
                    : 'bg-[#FFFBF7] border-stone-200 text-stone-600'
                }`}
              >
                ＋🏪バイト重ね書き
              </button>

              {[1, 2, 3].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() =>
                    onUpdateShiftDetailsOnSelectedDate(currentShiftPartner, {
                      overtimeHours:
                        currentShiftOnSelectedDate?.overtimeHours === h ? 0 : h,
                    })
                  }
                  className={`px-2 py-1 rounded-lg font-extrabold border shrink-0 ${
                    currentShiftOnSelectedDate?.overtimeHours === h
                      ? 'bg-rose-500 border-rose-500 text-white'
                      : 'bg-[#FFFBF7] border-stone-200 text-stone-600'
                  }`}
                >
                  ⏱️残業+{h}h
                </button>
              ))}

              <button
                type="button"
                onClick={() =>
                  onUpdateShiftDetailsOnSelectedDate(currentShiftPartner, {
                    isHolidayWork: !currentShiftOnSelectedDate?.isHolidayWork,
                    holidayWorkHours: currentShiftOnSelectedDate?.holidayWorkHours ? 0 : 4,
                  })
                }
                className={`px-2 py-1 rounded-lg font-extrabold border shrink-0 ${
                  currentShiftOnSelectedDate?.holidayWorkHours
                    ? 'bg-amber-600 border-amber-600 text-white'
                    : 'bg-[#FFECE5] border-[#FFD0BF] text-[#9C3D1C]'
                }`}
              >
                💼休出4h
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
