import React, { useState } from 'react';
import {
  Stamp,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Plus,
  Settings2,
  X,
  Trash2,
  Check,
  FastForward,
} from 'lucide-react';
import {
  CalendarCategoryId,
  CoupleMetadata,
  PartnerId,
  StampPreset,
} from '../types/calendar';
import { PASTEL_COLOR_PALETTE, SUPPORT_BADGE_PRESETS } from '../utils/presets';

export type StampDrawerTab = 'partnerA_shift' | 'partnerB_shift' | 'event_stamp' | 'support_badge';

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
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
  onApplyStampToSelectedDate: (stamp: StampPreset, targetPartner?: PartnerId) => void;
  onClearShiftOnSelectedDate: (targetPartner: PartnerId) => void;
  onToggleSupportBadgeOnSelectedDate: (badge: string) => void;
  activeSupportBadgesOnSelectedDate: string[];
  onOpenDayDetail: () => void;
  onSaveStampPreset: (stamp: StampPreset) => void;
  onDeleteStampPreset: (stampId: string) => void;
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
  autoAdvance,
  onToggleAutoAdvance,
  onApplyStampToSelectedDate,
  onClearShiftOnSelectedDate,
  onToggleSupportBadgeOnSelectedDate,
  activeSupportBadgesOnSelectedDate,
  onOpenDayDetail,
  onSaveStampPreset,
  onDeleteStampPreset,
  metadata,
}) => {
  const [editingStamp, setEditingStamp] = useState<StampPreset | null>(null);
  const [isManageMode, setIsManageMode] = useState(false);

  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;

  const shiftStamps = stamps.filter((s) => s.type === 'shift');
  const eventStamps = stamps.filter((s) => s.type === 'event');

  // 選択中の日付表示フォーマット
  const formatSelectedDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
    return `${m}/${d}(${w})`;
  };

  // 新規スタンプ作成初期値
  const handleStartNewStamp = () => {
    const isShift = activeTab === 'partnerA_shift' || activeTab === 'partnerB_shift';
    const defaultColor = PASTEL_COLOR_PALETTE[0];
    setEditingStamp({
      id: `custom_${Date.now()}`,
      label: isShift ? '早出' : '新しい予定',
      shortLabel: isShift ? '早出' : '✨予定',
      type: isShift ? 'shift' : 'event',
      color: isShift ? defaultColor.bg : defaultColor.hex,
      textColor: defaultColor.text,
      startTime: isShift ? '08:00' : '10:00',
      endTime: isShift ? '17:00' : '12:00',
      icon: isShift ? '☀️' : '✨',
      isHoliday: false,
      categoryId: 'shared',
      order: stamps.length + 10,
    });
  };

  // ドロワーが閉じている時の下部フローティングバー
  if (!isOpen) {
    return (
      <div className="fixed bottom-3 inset-x-0 z-30 px-3 pointer-events-none">
        <div className="max-w-lg mx-auto bg-white/95 backdrop-blur-md rounded-3xl shadow-xl border-2 border-[#FFE5EC] p-2 flex items-center justify-between gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => onToggleOpen(true)}
            className="flex-1 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white font-extrabold text-xs sm:text-sm shadow-md hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Stamp className="w-4 h-4" />
            <span>ポチポチ連続スタンプ入力</span>
          </button>

          <button
            type="button"
            onClick={onOpenDayDetail}
            className="py-2.5 px-4 rounded-2xl bg-[#FFFBF7] hover:bg-[#FFE5EC]/50 border border-stone-200 text-stone-700 font-extrabold text-xs sm:text-sm transition-colors flex items-center gap-1.5"
          >
            <CalendarPlus className="w-4 h-4 text-[#FF8FAB]" />
            <span>{formatSelectedDate(selectedDate)} の予定追加・詳細</span>
          </button>
        </div>
      </div>
    );
  }

  const currentShiftPartner: PartnerId =
    activeTab === 'partnerB_shift' ? 'partnerB' : 'partnerA';

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/98 backdrop-blur-md rounded-t-3xl shadow-2xl border-t-2 border-[#FF8FAB] animate-pop">
        <div className="max-w-4xl mx-auto px-3 pt-2.5 pb-4 space-y-2.5">
          {/* 1. ドロワーヘッダー：選択日ナビゲーション ＆ 自動翌日移動トグル ＆ 閉じる */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
            {/* 選択日カーソル移動 */}
            <div className="flex items-center gap-1 bg-[#FFFBF7] px-2 py-1 rounded-2xl border border-[#FFE5EC]">
              <button
                type="button"
                onClick={() => onMoveDate(-1)}
                className="p-1 rounded-xl hover:bg-[#FFE5EC] text-stone-600"
                title="前日へ移動"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onOpenDayDetail}
                className="px-2 text-xs sm:text-sm font-extrabold text-[#9E2A47] hover:underline"
                title="タップで選択日の詳細モーダルを開く"
              >
                🎯 {formatSelectedDate(selectedDate)}
              </button>
              <button
                type="button"
                onClick={() => onMoveDate(1)}
                className="p-1 rounded-xl hover:bg-[#FFE5EC] text-stone-600"
                title="翌日へ移動"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* 自動で翌日へ進むトグル ＋ スタンプ編集 ＋ 閉じる */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleAutoAdvance}
                className={`px-2.5 py-1 rounded-2xl text-xs font-extrabold border transition-all flex items-center gap-1 ${
                  autoAdvance
                    ? 'bg-[#FFE5EC] border-[#FF8FAB] text-[#9E2A47] shadow-2xs'
                    : 'bg-stone-100 border-stone-200 text-stone-500'
                }`}
                title="ONにするとスタンプを1回押すたびに自動で翌日にカーソルが進みます"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>翌日へ自動移動: {autoAdvance ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsManageMode(!isManageMode)}
                className={`px-2.5 py-1 rounded-2xl text-xs font-bold border transition-colors flex items-center gap-1 ${
                  isManageMode
                    ? 'bg-stone-800 text-white border-stone-800'
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isManageMode ? '編集終了' : 'スタンプ編集'}</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleOpen(false)}
                className="p-1.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600"
                title="スタンプドロワーを閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. 対象切替タブ：[🐻夫のシフト] [🐰妻のシフト] [💕定型予定スタンプ] [🍳すれ違いサポート] */}
          <div className="grid grid-cols-4 gap-1 bg-[#FFFBF7] p-1 rounded-2xl border border-stone-200/70">
            <button
              type="button"
              onClick={() => onChangeTab('partnerA_shift')}
              className={`py-1.5 px-1 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'partnerA_shift'
                  ? 'bg-[#56CFE1] text-white shadow-sm'
                  : 'text-stone-600 hover:bg-white'
              }`}
            >
              <span>{partnerA.avatar}</span>
              <span className="truncate">{partnerA.name}シフト</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('partnerB_shift')}
              className={`py-1.5 px-1 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'partnerB_shift'
                  ? 'bg-[#B388EB] text-white shadow-sm'
                  : 'text-stone-600 hover:bg-white'
              }`}
            >
              <span>{partnerB.avatar}</span>
              <span className="truncate">{partnerB.name}シフト</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('event_stamp')}
              className={`py-1.5 px-1 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'event_stamp'
                  ? 'bg-[#FF8FAB] text-white shadow-sm'
                  : 'text-stone-600 hover:bg-white'
              }`}
            >
              <span>💕</span>
              <span className="truncate">予定スタンプ</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('support_badge')}
              className={`py-1.5 px-1 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'support_badge'
                  ? 'bg-[#FFB703] text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:bg-white'
              }`}
            >
              <span>🍳</span>
              <span className="truncate">ごはん・家事</span>
            </button>
          </div>

          {/* 3. スタンプパレット本体 */}
          {(activeTab === 'partnerA_shift' || activeTab === 'partnerB_shift') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-stone-500 px-1">
                <span>
                  {isManageMode
                    ? '💡 編集したいスタンプをタップしてください'
                    : `💡 スタンプをタップすると ${formatSelectedDate(selectedDate)} の「${
                        currentShiftPartner === 'partnerA'
                          ? `${partnerA.avatar}${partnerA.name}`
                          : `${partnerB.avatar}${partnerB.name}`
                      }」に即登録されます（カレンダーの日付を直接タップしてもOK！）`}
                </span>
              </div>

              <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5 max-h-40 overflow-y-auto p-0.5">
                {shiftStamps.map((stamp) => {
                  const isSelected = selectedStampId === stamp.id;
                  return (
                    <button
                      key={stamp.id}
                      type="button"
                      onClick={() => {
                        if (isManageMode) {
                          setEditingStamp({ ...stamp });
                          return;
                        }
                        onSelectStamp(stamp.id);
                        onApplyStampToSelectedDate(stamp, currentShiftPartner);
                      }}
                      style={{
                        backgroundColor: stamp.color,
                        color: stamp.textColor,
                      }}
                      className={`relative py-2 px-1.5 rounded-2xl font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 shadow-xs active:scale-90 transition-all border-2 ${
                        isSelected
                          ? 'border-stone-800 ring-2 ring-stone-800/20'
                          : 'border-white hover:brightness-95'
                      }`}
                    >
                      <div className="flex items-center gap-0.5">
                        {stamp.icon && <span className="text-sm">{stamp.icon}</span>}
                        <span>{stamp.label}</span>
                      </div>
                      {stamp.startTime && (
                        <span className="text-[9px] opacity-80 font-bold">
                          {stamp.startTime}-{stamp.endTime}
                        </span>
                      )}
                      {isManageMode && (
                        <span className="absolute -top-1 -right-1 bg-stone-800 text-white text-[9px] px-1 rounded-full">
                          編集
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* シフト消去（消しゴム）ボタン */}
                {!isManageMode && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectStamp('__ERASER__');
                      onClearShiftOnSelectedDate(currentShiftPartner);
                    }}
                    className={`py-2 px-1.5 rounded-2xl font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 bg-stone-100 text-stone-600 hover:bg-rose-50 hover:text-rose-600 border-2 ${
                      selectedStampId === '__ERASER__' ? 'border-rose-500' : 'border-stone-200'
                    }`}
                  >
                    <Eraser className="w-4 h-4" />
                    <span>シフト消去</span>
                  </button>
                )}

                {/* 新規スタンプ追加ボタン */}
                <button
                  type="button"
                  onClick={handleStartNewStamp}
                  className="py-2 px-1.5 rounded-2xl font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 bg-[#FFFBF7] text-stone-500 hover:text-[#FF8FAB] border-2 border-dashed border-stone-300 hover:border-[#FF8FAB]"
                >
                  <Plus className="w-4 h-4" />
                  <span>追加</span>
                </button>
              </div>
            </div>
          )}

          {/* 定型予定スタンプパレット */}
          {activeTab === 'event_stamp' && (
            <div className="space-y-2">
              <div className="text-[11px] text-stone-500 px-1">
                {isManageMode
                  ? '💡 編集したい予定スタンプをタップしてください'
                  : `💡 タップすると ${formatSelectedDate(selectedDate)} にワンタップで定型予定を追加します`}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 max-h-40 overflow-y-auto p-0.5">
                {eventStamps.map((stamp) => {
                  const isSelected = selectedStampId === stamp.id;
                  return (
                    <button
                      key={stamp.id}
                      type="button"
                      onClick={() => {
                        if (isManageMode) {
                          setEditingStamp({ ...stamp });
                          return;
                        }
                        onSelectStamp(stamp.id);
                        onApplyStampToSelectedDate(stamp);
                      }}
                      className={`relative py-2 px-2.5 rounded-2xl font-extrabold text-xs flex flex-col items-start justify-center bg-[#FFFBF7] hover:bg-[#FFE5EC]/40 border-2 active:scale-95 transition-all ${
                        isSelected ? 'border-[#FF8FAB] bg-[#FFE5EC]/30' : 'border-stone-200/90'
                      }`}
                    >
                      <div className="flex items-center gap-1 truncate max-w-full text-stone-800">
                        <span>{stamp.label}</span>
                      </div>
                      {stamp.startTime && (
                        <span className="text-[10px] text-stone-400 font-bold">
                          ⏰ {stamp.startTime}〜{stamp.endTime}
                        </span>
                      )}
                      {isManageMode && (
                        <span className="absolute -top-1 -right-1 bg-stone-800 text-white text-[9px] px-1 rounded-full">
                          編集
                        </span>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={handleStartNewStamp}
                  className="py-2 px-2.5 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-1 bg-[#FFFBF7] text-stone-500 hover:text-[#FF8FAB] border-2 border-dashed border-stone-300 hover:border-[#FF8FAB]"
                >
                  <Plus className="w-4 h-4" />
                  <span>定型予定を追加</span>
                </button>
              </div>
            </div>
          )}

          {/* すれ違いサポートアイコン（ごはん・家事目印）パレット */}
          {activeTab === 'support_badge' && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-stone-500 px-1">
                💡 {formatSelectedDate(selectedDate)} に添える「すれ違いサポート目印」を1タップでON/OFFできます
              </div>
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
                          ? 'bg-[#FFF6D6] border-[#FFB703] text-[#8A5A00] shadow-xs scale-[1.01]'
                          : 'bg-[#FFFBF7] border-stone-200 text-stone-700 hover:bg-stone-50'
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
            </div>
          )}
        </div>
      </div>

      {/* スタンプ新規作成・編集モーダル */}
      {editingStamp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border-2 border-[#FFE5EC] p-5 space-y-4 animate-pop">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
              <h3 className="text-base font-extrabold text-stone-800">
                🎨 スタンプの作成・時間編集
              </h3>
              <button
                type="button"
                onClick={() => setEditingStamp(null)}
                className="p-1 rounded-xl text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-stone-600 mb-1">絵文字アイコン</label>
                  <input
                    type="text"
                    value={editingStamp.icon || ''}
                    onChange={(e) =>
                      setEditingStamp({ ...editingStamp, icon: e.target.value })
                    }
                    placeholder="☀️"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold text-center text-base"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-bold text-stone-600 mb-1">スタンプ名</label>
                  <input
                    type="text"
                    value={editingStamp.label}
                    onChange={(e) =>
                      setEditingStamp({
                        ...editingStamp,
                        label: e.target.value,
                        shortLabel: e.target.value.slice(0, 4),
                      })
                    }
                    placeholder="例: 日勤 / 遅番 / 通院"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-600 mb-1">開始時間（任意）</label>
                  <input
                    type="time"
                    value={editingStamp.startTime || ''}
                    onChange={(e) =>
                      setEditingStamp({ ...editingStamp, startTime: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-600 mb-1">終了時間（任意）</label>
                  <input
                    type="time"
                    value={editingStamp.endTime || ''}
                    onChange={(e) =>
                      setEditingStamp({ ...editingStamp, endTime: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold"
                  />
                </div>
              </div>

              {/* パステルカラー選択 */}
              <div>
                <label className="block font-bold text-stone-600 mb-1.5">スタンプカラー</label>
                <div className="flex flex-wrap gap-2">
                  {PASTEL_COLOR_PALETTE.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() =>
                        setEditingStamp({
                          ...editingStamp,
                          color: editingStamp.type === 'shift' ? p.bg : p.hex,
                          textColor: p.text,
                        })
                      }
                      style={{ backgroundColor: p.bg, color: p.text, borderColor: p.hex }}
                      className="px-2.5 py-1 rounded-xl border-2 font-extrabold text-xs"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* シフトの場合は「お休み判定フラグ」切替 */}
              {editingStamp.type === 'shift' ? (
                <label className="flex items-center gap-2 p-2.5 rounded-2xl bg-[#FFF0F5] text-[#9E2A47] font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingStamp.isHoliday)}
                    onChange={(e) =>
                      setEditingStamp({ ...editingStamp, isHoliday: e.target.checked })
                    }
                    className="rounded text-[#FF8FAB]"
                  />
                  <span>💕 「ふたり休日一致」の対象（休み・有休・公休など）にする</span>
                </label>
              ) : (
                <div>
                  <label className="block font-bold text-stone-600 mb-1">予定カテゴリ</label>
                  <select
                    value={editingStamp.categoryId || 'shared'}
                    onChange={(e) =>
                      setEditingStamp({
                        ...editingStamp,
                        categoryId: e.target.value as CalendarCategoryId,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold"
                  >
                    <option value="shared">💕 ふたりの共有予定</option>
                    <option value="partnerA">{partnerA.avatar} {partnerA.name}の予定</option>
                    <option value="partnerB">{partnerB.avatar} {partnerB.name}の予定</option>
                    <option value="anniversary">🎉 記念日・特別日</option>
                    <option value="chore">🏠 家事・暮らし</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  onDeleteStampPreset(editingStamp.id);
                  setEditingStamp(null);
                }}
                className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                削除
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStamp(null)}
                  className="px-4 py-2 rounded-xl bg-stone-100 text-stone-600 font-bold text-xs"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSaveStampPreset(editingStamp);
                    setEditingStamp(null);
                  }}
                  className="px-5 py-2 rounded-xl bg-[#FF8FAB] text-white font-extrabold text-xs shadow-sm"
                >
                  保存する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
