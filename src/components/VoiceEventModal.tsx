import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Mic,
  MicOff,
  Check,
  Sparkles,
  Calendar,
  Clock,
  Square,
  Plus,
  Minus,
  Timer,
  User,
} from 'lucide-react';
import {
  CalendarCategoryId,
  CalendarCategoryItem,
  CoupleMetadata,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
} from '../types/calendar';
import {
  DEFAULT_CATEGORIES,
  resolveCategoryInfo,
  SUPPORT_BADGE_PRESETS,
} from '../utils/presets';
import { parseSpokenScheduleText } from '../utils/voiceAndAi';

interface VoiceEventModalProps {
  selectedDate: string; // "YYYY-MM-DD"
  activePartner: PartnerId;
  metadata: CoupleMetadata;
  categories?: CalendarCategoryItem[];
  onClose: () => void;
  onSaveEvent: (ev: ScheduleEvent) => void;
  onUpdateShiftDetails?: (
    dateStr: string,
    partnerId: PartnerId,
    patch: Partial<ShiftEntry>
  ) => void;
}

/**
 * 音声認識（Web Speech API）で一度しか言っていない言葉が何度も繰り返し入力されるバグを防止する重複除去ユーティリティ
 * 例: "明日2時間残業 明日2時間残業" -> "明日2時間残業"
 * 例: "明日2時間残業明日2時間残業" -> "明日2時間残業"
 */
function cleanDuplicateSpeech(text: string): string {
  if (!text) return '';
  let str = text.trim();

  // 1. スペース区切りの連続する同一単語・フレーズの除去
  const words = str.split(/\s+/).filter(Boolean);
  const dedupedWords: string[] = [];
  for (const w of words) {
    if (dedupedWords.length === 0 || dedupedWords[dedupedWords.length - 1] !== w) {
      dedupedWords.push(w);
    }
  }
  str = dedupedWords.join(' ');

  // 2. スペースなしで結合された同一フレーズの重複（例: '残業2時間残業2時間'）の除去
  for (let len = Math.floor(str.length / 2); len >= 2; len--) {
    let replaced = true;
    while (replaced) {
      replaced = false;
      for (let i = 0; i <= str.length - 2 * len; i++) {
        const chunk1 = str.slice(i, i + len);
        const chunk2 = str.slice(i + len, i + 2 * len);
        if (chunk1 === chunk2) {
          str = str.slice(0, i + len) + str.slice(i + 2 * len);
          replaced = true;
          break;
        }
      }
    }
  }

  return str.trim();
}

// ブラウザの SpeechRecognition 型宣言
interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export const VoiceEventModal: React.FC<VoiceEventModalProps> = ({
  selectedDate,
  activePartner,
  metadata,
  categories,
  onClose,
  onSaveEvent,
  onUpdateShiftDetails,
}) => {
  const categoryList =
    categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  const [isListening, setIsListening] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);

  // 自動解析された予定フィールド（手動で微修正も可能）
  const [dateStr, setDateStr] = useState(selectedDate);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<CalendarCategoryId>('shared');
  const [isAllDay, setIsAllDay] = useState(true);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [supportBadges, setSupportBadges] = useState<string[]>([]);

  // 残業・休日出勤の音声解析フィールド
  const [targetPartner, setTargetPartner] = useState<PartnerId>(activePartner);
  const [overtimeHours, setOvertimeHours] = useState<number | null>(null);
  const [holidayWorkHours, setHolidayWorkHours] = useState<number | null>(null);
  const [applyToShift, setApplyToShift] = useState<boolean>(true);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false);

  // 音声テキストが変化したらリアルタイムに日付・時間・残業・タイトルを自動解析
  const applyVoiceParse = (raw: string) => {
    const cleaned = cleanDuplicateSpeech(raw);
    setSpokenText(cleaned);
    if (!cleaned.trim()) return;
    const parsed = parseSpokenScheduleText(cleaned, selectedDate, 'shared');
    setDateStr(parsed.date);
    setTitle(parsed.title);
    setCategoryId(parsed.categoryId);
    setIsAllDay(parsed.isAllDay);
    if (parsed.startTime) setStartTime(parsed.startTime);
    if (parsed.endTime) setEndTime(parsed.endTime);
    if (parsed.supportBadges.length > 0) {
      setSupportBadges(parsed.supportBadges);
    }
    if (parsed.overtimeHours !== undefined) {
      setOvertimeHours(parsed.overtimeHours);
    }
    if (parsed.holidayWorkHours !== undefined) {
      setHolidayWorkHours(parsed.holidayWorkHours);
    }
    if (parsed.targetPartner) {
      setTargetPartner(parsed.targetPartner);
    }
  };

  // 音声認識の停止（ユーザーが明示的に押した時のみ完全停止）
  const stopListening = () => {
    isListeningRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setIsListening(false);
  };

  // 音声認識の開始・再開
  const startListening = () => {
    setSpeechError(null);
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRec) {
      setSpeechError(
        'このブラウザでは直接マイク起動がサポートされていません。下の入力欄をタップしてスマホキーボードの「🎤マイクキー」からお話しください✨'
      );
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }

      const rec = new SpeechRec();
      rec.lang = 'ja-JP';
      rec.interimResults = true;
      rec.continuous = false;

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        const resList = event.results;
        for (let i = 0; i < resList.length; i++) {
          transcript += resList[i][0]?.transcript || '';
        }
        applyVoiceParse(transcript);
      };

      rec.onerror = () => {
        setIsListening(false);
        isListeningRef.current = false;
        setSpeechError(
          'マイクの読み取りが中断されました。もう一度マイクボタンを押すか、キーボードの音声入力をお使いください🐾'
        );
      };

      rec.onend = () => {
        setIsListening(false);
        isListeningRef.current = false;
      };

      recognitionRef.current = rec;
      isListeningRef.current = true;
      rec.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
      isListeningRef.current = false;
    }
  };

  // トグル
  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    stopListening();

    const finalTitle = title.trim() || spokenText.trim() || (overtimeHours ? `残業 +${overtimeHours}h` : '');
    if (!finalTitle && !overtimeHours && !holidayWorkHours) return;

    const nowIso = new Date().toISOString();
    const cat = resolveCategoryInfo(categoryId, categoryList);

    // 1. もし残業・休日出勤が指定されていて、シフト反映がONならシフトデータを更新！
    if (applyToShift && onUpdateShiftDetails && (overtimeHours !== null || holidayWorkHours !== null)) {
      onUpdateShiftDetails(dateStr, targetPartner, {
        overtimeHours: overtimeHours !== null ? overtimeHours : undefined,
        holidayWorkHours: holidayWorkHours !== null ? holidayWorkHours : undefined,
        isHolidayWork: holidayWorkHours !== null && holidayWorkHours > 0,
      });
    }

    // 2. カレンダーの予定としても保存（残業の場合もカレンダー上で一目でわかるよう登録）
    if (finalTitle) {
      const ev: ScheduleEvent = {
        id: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: dateStr,
        title: finalTitle,
        categoryId,
        color: cat.accentColor,
        isAllDay,
        startTime: isAllDay ? undefined : startTime,
        endTime: isAllDay ? undefined : endTime,
        supportBadges: supportBadges.length > 0 ? supportBadges : undefined,
        createdBy: activePartner,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      onSaveEvent(ev);
    }

    onClose();
  };

  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;
  const currentPartner = targetPartner === 'partnerA' ? partnerA : partnerB;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={() => {
        stopListening();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[92vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-white px-4 py-3.5 border-b border-[#FFE5EC] flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-stone-800 flex items-center gap-1.5">
              <span>🎙️</span>
              <span>声で予定・残業をかんたん入力</span>
            </h2>
            <p className="text-[11px] text-stone-400">
              「明日2時間残業」「15日の19時から飲み会 夜ご飯不要」と話すだけ！
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopListening();
              onClose();
            }}
            className="p-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
          {/* 1. 大型マイクボタン ＆ 明示的な「音声終了」ボタン */}
          <div className="bg-white rounded-3xl p-4 border-2 border-[#FFE5EC] text-center space-y-3 shadow-xs">
            <button
              type="button"
              onClick={toggleListening}
              className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center shadow-lg transition-all ${
                isListening
                  ? 'bg-rose-500 text-white ring-8 ring-rose-200 animate-pulse scale-105'
                  : 'bg-gradient-to-tr from-[#FF8FAB] to-[#B388EB] text-white hover:scale-105 active:scale-95'
              }`}
              title={isListening ? 'タップして音声を終了する' : 'タップして音声を始める'}
            >
              {isListening ? <MicOff className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
            </button>

            <div className="font-extrabold text-sm text-stone-700">
              {isListening
                ? '🔴 聞き取り中...（話し終わると自動で解析されます）'
                : '上のマイクをタップして話してください'}
            </div>

            {/* 音声認識テキスト表示欄（手動での修正・キーボード音声入力もOK） */}
            <div>
              <input
                type="text"
                value={spokenText}
                onChange={(e) => applyVoiceParse(e.target.value)}
                placeholder="例: 明日2時間残業 / 15日の19時から外食 夜ご飯不要"
                className="w-full px-3.5 py-2.5 rounded-2xl border-2 border-stone-200 bg-[#FFFBF7] font-bold text-sm text-stone-800 focus:border-[#FF8FAB] focus:outline-none text-center"
              />
            </div>

            {/* サンプルフレーズ1タップ体験チップ（残業フレーズも充実！） */}
            <div className="flex flex-wrap justify-center gap-1 pt-0.5">
              {[
                '明日2時間残業',
                '今日1.5時間残業 夜ご飯不要',
                '15日の19時から記念日ディナー',
                '金曜19時から飲み会',
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => applyVoiceParse(sample)}
                  className="px-2 py-1 rounded-lg bg-[#FFFBF7] hover:bg-[#FFE5EC] border border-stone-200 text-[10px] font-bold text-stone-600 transition-colors"
                >
                  💬「{sample}」
                </button>
              ))}
            </div>

            {speechError && (
              <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl p-2 font-bold">
                {speechError}
              </p>
            )}
          </div>

          {/* 2. 残業・休日出勤の音声解析カード（話した言葉から自動検出された場合に大きく表示！） */}
          {(overtimeHours !== null || holidayWorkHours !== null) && (
            <div className="bg-gradient-to-r from-[#FFF0F5] to-[#FFF9FB] rounded-2xl p-3.5 border-2 border-[#FFB3C6] space-y-2.5 shadow-xs animate-pop">
              <div className="flex items-center justify-between">
                <div className="font-black text-rose-700 flex items-center gap-1.5 text-xs sm:text-sm">
                  <Timer className="w-4 h-4 text-rose-500" />
                  <span>⏱️ 残業・勤務時間を検出しました！</span>
                </div>
                <label className="flex items-center gap-1 text-[11px] font-extrabold text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToShift}
                    onChange={(e) => setApplyToShift(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-500 focus:ring-rose-400"
                  />
                  <span>シフトデータに反映</span>
                </label>
              </div>

              {/* 対象パートナー切替 */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-rose-100">
                <span className="font-extrabold text-stone-600 flex items-center gap-1 text-[11px]">
                  <User className="w-3.5 h-3.5 text-stone-400" /> 対象者:
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTargetPartner('partnerA')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${
                      targetPartner === 'partnerA'
                        ? 'bg-[#56CFE1] text-white shadow-xs'
                        : 'bg-white text-stone-600 border border-stone-200'
                    }`}
                  >
                    {partnerA.avatar} {partnerA.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetPartner('partnerB')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${
                      targetPartner === 'partnerB'
                        ? 'bg-[#B388EB] text-white shadow-xs'
                        : 'bg-white text-stone-600 border border-stone-200'
                    }`}
                  >
                    {partnerB.avatar} {partnerB.name}
                  </button>
                </div>
              </div>

              {/* 残業時間の微調整カウンター */}
              {overtimeHours !== null && (
                <div className="flex items-center justify-between gap-2 bg-white rounded-xl p-2 border border-rose-200">
                  <span className="font-black text-stone-700">残業時間:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOvertimeHours((prev) => Math.max(0, (prev || 0) - 0.5))}
                      className="p-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700"
                      title="30分減らす"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-black text-rose-600 min-w-[50px] text-center">
                      +{overtimeHours} h
                    </span>
                    <button
                      type="button"
                      onClick={() => setOvertimeHours((prev) => (prev || 0) + 0.5)}
                      className="p-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700"
                      title="30分増やす"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* 休日出勤時間の微調整カウンター */}
              {holidayWorkHours !== null && (
                <div className="flex items-center justify-between gap-2 bg-white rounded-xl p-2 border border-rose-200">
                  <span className="font-black text-stone-700">休日出勤時間:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHolidayWorkHours((prev) => Math.max(0, (prev || 0) - 0.5))}
                      className="p-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-black text-rose-600 min-w-[50px] text-center">
                      {holidayWorkHours} h
                    </span>
                    <button
                      type="button"
                      onClick={() => setHolidayWorkHours((prev) => (prev || 0) + 0.5)}
                      className="p-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. 自動解析された予定内容の確認・微調整カード */}
          <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 space-y-3 shadow-2xs">
            <div className="font-extrabold text-[#9E2A47] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#FF8FAB]" />
              <span>予定内容の確認（日付・タイトルの変更も可能）</span>
            </div>

            <div>
              <label className="block font-bold text-stone-500 mb-1">タイトル</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="予定のタイトル"
                className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-extrabold text-sm text-stone-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-stone-500 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> 日付
                </label>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-extrabold"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-500 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 時間区分
                </label>
                <button
                  type="button"
                  onClick={() => setIsAllDay(!isAllDay)}
                  className={`w-full py-1.5 px-3 rounded-xl font-extrabold border ${
                    isAllDay
                      ? 'bg-[#FFE5EC] border-[#FF8FAB] text-[#9E2A47]'
                      : 'bg-[#E2F9FC] border-[#56CFE1] text-[#136370]'
                  }`}
                >
                  {isAllDay ? '終日予定' : `${startTime} 〜 ${endTime}`}
                </button>
              </div>
            </div>

            {!isAllDay && (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold"
                />
                <span>〜</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold"
                />
              </div>
            )}

            {/* カテゴリ選択 */}
            <div className="flex flex-wrap gap-1.5">
              {categoryList.map((cat) => {
                const selected = categoryId === cat.id;
                const label =
                  cat.id === 'partnerA'
                    ? `${partnerA.avatar}${partnerA.name}予定`
                    : cat.id === 'partnerB'
                    ? `${partnerB.avatar}${partnerB.name}予定`
                    : `${cat.icon}${cat.label}`;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    style={
                      selected
                        ? { backgroundColor: cat.accentColor, color: '#fff' }
                        : { backgroundColor: cat.bgColor, color: cat.textColor }
                    }
                    className="px-2.5 py-1 rounded-xl font-extrabold text-xs transition-colors"
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* すれ違いサポートバッジ */}
            <div className="flex flex-wrap gap-1">
              {SUPPORT_BADGE_PRESETS.slice(0, 4).map((b) => {
                const active = supportBadges.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      setSupportBadges(
                        active
                          ? supportBadges.filter((x) => x !== b.id)
                          : [...supportBadges, b.id]
                      )
                    }
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                      active
                        ? 'bg-[#FFF6D6] border-[#FFB703] text-[#8A5A00]'
                        : 'bg-stone-50 border-stone-200 text-stone-500'
                    }`}
                  >
                    {b.short}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={!title.trim() && !spokenText.trim() && overtimeHours === null && holidayWorkHours === null}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] disabled:opacity-40 text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>
              {overtimeHours !== null
                ? `⏱️ ${currentPartner.name}の残業(+${overtimeHours}h)を登録する`
                : 'この内容でカレンダーに登録する'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};
