import React, { useEffect, useState } from 'react';
import { Check, Clock, X, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { CoupleMetadata, PartnerId, ShiftEntry } from '../types/calendar';
import {
  formatMinutesToJa,
  getLocalDateStrOffset,
  getLocalTodayStr,
  getShiftHolidayWorkMinutes,
  getShiftOvertimeMinutes,
} from '../utils/presets';

interface ConfirmOvertimeCardProps {
  activePartner: PartnerId;
  metadata: CoupleMetadata;
  shifts: Record<string, ShiftEntry>;
  onConfirmShift: (dateStr: string, partnerId: PartnerId, actualMinutes: number, isHolidayWork: boolean) => void;
  onCancelTentative: (dateStr: string, partnerId: PartnerId) => void;
}

export const ConfirmOvertimeCard: React.FC<ConfirmOvertimeCardProps> = ({
  activePartner,
  metadata,
  shifts,
  onConfirmShift,
  onCancelTentative,
}) => {
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [customMin, setCustomMin] = useState<string>('');
  const [todayStr, setTodayStr] = useState<string>(() => getLocalTodayStr());

  // 画面復帰時や日付またぎ（PWAを翌日まで開いたままにした場合など）にローカル今日日付を再評価
  useEffect(() => {
    const refreshToday = () => {
      const next = getLocalTodayStr();
      setTodayStr((prev) => (prev === next ? prev : next));
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshToday();
      }
    };
    window.addEventListener('focus', refreshToday);
    window.addEventListener('pageshow', refreshToday);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(refreshToday, 60_000);
    return () => {
      window.removeEventListener('focus', refreshToday);
      window.removeEventListener('pageshow', refreshToday);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, []);

  // 操作中パートナーのシフトの中で、未確定（仮・見込み）かつ昨日以前（翌日以降にアプリを開いたとき対象）のものを抽出
  const pendingEntries: ShiftEntry[] = Object.values(shifts)
    .filter((s) => {
      if (s.deletedAt || s.partnerId !== activePartner) return false;
      const otMin = getShiftOvertimeMinutes(s);
      const hwMin = getShiftHolidayWorkMinutes(s);
      const isTentative = Boolean(
        (otMin > 0 && s.isTentativeOvertime) ||
        (hwMin > 0 && s.isTentativeHolidayWork)
      );
      if (!isTentative) return false;
      // 当日は表示せず、翌日以降（s.date < todayStr）になったときに確定カードを表示
      return s.date < todayStr;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // 一番古い未確定日をターゲットにする
  const currentEntry = pendingEntries[0];

  useEffect(() => {
    setIsAdjusting(false);
    setCustomMin('');
  }, [currentEntry?.id]);

  if (!currentEntry) {
    return null; // 未確定がなければ何も表示しない
  }

  const [ty, tm, td] = todayStr.split('-').map(Number);
  const yesterdayStr = getLocalDateStrOffset(-1, new Date(ty, tm - 1, td));
  const isYesterday = currentEntry.date === yesterdayStr;

  const hwMin = getShiftHolidayWorkMinutes(currentEntry);
  const otMin = getShiftOvertimeMinutes(currentEntry);
  const isHw = Boolean(
    (hwMin > 0 && currentEntry.isTentativeHolidayWork) ||
    (hwMin > 0 && otMin === 0)
  );
  const plannedMinutes = isHw ? hwMin : otMin;

  const partner = metadata.partners[activePartner];
  const [, m, d] = currentEntry.date.split('-').map(Number);

  // 予定通り確定
  const handleConfirmAsIs = () => {
    onConfirmShift(currentEntry.date, activePartner, plannedMinutes, isHw);
    setIsAdjusting(false);
    setCustomMin('');
  };

  // 実時間を変更して確定
  const handleConfirmCustom = (min: number) => {
    onConfirmShift(currentEntry.date, activePartner, min, isHw);
    setIsAdjusting(false);
    setCustomMin('');
  };

  // 残業・休出なし（0分）にして完了
  const handleZeroAndComplete = () => {
    onCancelTentative(currentEntry.date, activePartner);
    setIsAdjusting(false);
    setCustomMin('');
  };

  // 微調整ボタンを押した時の初期値セット
  const toggleAdjusting = () => {
    if (!isAdjusting && customMin === '') {
      setCustomMin(String(plannedMinutes));
    }
    setIsAdjusting(!isAdjusting);
  };

  return (
    <div className="mb-2.5 mx-2 rounded-2xl bg-linear-to-r from-[#FFF4EA] to-[#FFEBEF] border-2 border-[#FFD0BF] p-3 shadow-md animate-pop">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-black text-[#9C3D1C] flex items-center gap-1">
              <span>{partner.avatar}</span>
              <span>{partner.name}</span>
              <span>
                {isYesterday
                  ? `お疲れさま！昨日の${isHw ? '休日出勤' : '残業'}はどうだった？`
                  : `${m}月${d}日の${isHw ? '休日出勤' : '残業'}はどうだった？`}
              </span>
            </span>
            {pendingEntries.length > 1 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-extrabold text-[10px]">
                未確定あと{pendingEntries.length}件
              </span>
            )}
          </div>
          <p className="text-xs text-stone-600 font-bold">
            📅 {m}月{d}日({isYesterday ? '昨日' : '過去'})の{isHw ? '休日出勤予定' : '残業予定'}:{' '}
            <span className="text-rose-600 font-black text-sm">{formatMinutesToJa(plannedMinutes)}</span>
            <span className="text-stone-400 text-[10px] ml-1">（仮登録中）</span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleZeroAndComplete}
          title={isHw ? '休日出勤なし（0分）にする' : '残業なし（0分）にする'}
          className="text-stone-400 hover:text-stone-600 font-bold text-xs p-1"
        >
          ✕
        </button>
      </div>

      {/* アクションボタン群 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={handleConfirmAsIs}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-linear-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-black text-xs shadow-xs active:scale-95 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>予定通り {formatMinutesToJa(plannedMinutes)} で確定</span>
        </button>

        <button
          type="button"
          onClick={toggleAdjusting}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold shadow-2xs active:scale-95 transition-all ${
            isAdjusting
              ? 'bg-rose-500 text-white border-rose-500'
              : 'bg-white hover:bg-stone-50 border-stone-200 text-stone-700'
          }`}
        >
          <Clock className={`w-3.5 h-3.5 ${isAdjusting ? 'text-white' : 'text-[#FFB703]'}`} />
          <span>⏱️ 分単位で入力・調整</span>
          {isAdjusting ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={handleZeroAndComplete}
          className="px-2 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold text-xs active:scale-95 transition-all"
        >
          {isHw ? '休出なし（0分）' : '残業なし（0分）'}
        </button>
      </div>

      {/* 分単位の直接入力パネル（展開時） */}
      {isAdjusting && (
        <div className="mt-2.5 pt-2 border-t border-[#FFD0BF]/60 space-y-2 animate-fade-in text-xs">
          <div className="bg-white/95 p-3 rounded-2xl border border-rose-200 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-stone-800 text-xs flex items-center gap-1">
                <span>⏱️</span>
                <span>実際の{isHw ? '実休日出勤時間' : '実残業時間'}（分単位）を入力：</span>
              </span>
              {customMin !== '' && Number(customMin) >= 0 && (
                <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                  ＝ {formatMinutesToJa(Number(customMin))}
                </span>
              )}
            </div>

            {/* 直接入力フォーム */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="分数を入力（例: 35）"
                  value={customMin}
                  onChange={(e) => setCustomMin(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 text-base font-black text-rose-600 bg-[#FFFBF7] rounded-xl border-2 border-rose-300 focus:outline-rose-500 shadow-inner"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-black text-stone-400 text-xs pointer-events-none">
                  分
                </span>
              </div>
              <button
                type="button"
                disabled={customMin === '' || Number(customMin) < 0}
                onClick={() => handleConfirmCustom(Number(customMin))}
                className="px-4 py-2.5 rounded-xl bg-linear-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 disabled:opacity-40 text-white font-black text-xs shadow-md active:scale-95 transition-all shrink-0"
              >
                この時間で確定 ✨
              </button>
            </div>

            {/* 片手でもサッと調整できる増減ボタン */}
            <div className="space-y-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-stone-400 font-bold shrink-0">クイック増減:</span>
                {[-30, -15, -10, -5, +5, +10, +15, +30].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => {
                      const base = customMin === '' ? plannedMinutes : Number(customMin);
                      const next = Math.max(0, base + delta);
                      setCustomMin(String(next));
                    }}
                    className={`px-2 py-1 rounded-lg border font-black text-[10px] active:scale-95 transition-all ${
                      delta > 0
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                        : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200'
                    }`}
                  >
                    {delta > 0 ? `+${delta}分` : `${delta}分`}
                  </button>
                ))}
              </div>

              {/* 定番の分数ショートカット */}
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <span className="text-[10px] text-stone-400 font-bold shrink-0">直接セット:</span>
                {[0, 15, 30, 35, 45, 60, 90, 120, 150, 180, 240, 300].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setCustomMin(String(min))}
                    className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold active:scale-95 transition-all ${
                      customMin !== '' && Number(customMin) === min
                        ? 'bg-rose-500 text-white border-rose-500 font-black'
                        : 'bg-white hover:bg-stone-50 text-stone-600 border-stone-200'
                    }`}
                  >
                    {min === 0 ? '0分' : `${min}分`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
