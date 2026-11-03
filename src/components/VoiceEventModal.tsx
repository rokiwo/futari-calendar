import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Mic,
  MicOff,
  Check,
  Sparkles,
  Calendar,
  Clock,
} from 'lucide-react';
import {
  CalendarCategoryId,
  CoupleMetadata,
  PartnerId,
  ScheduleEvent,
} from '../types/calendar';
import { CATEGORY_MAP, SUPPORT_BADGE_PRESETS } from '../utils/presets';
import { parseSpokenScheduleText } from '../utils/voiceAndAi';

interface VoiceEventModalProps {
  selectedDate: string; // "YYYY-MM-DD"
  activePartner: PartnerId;
  metadata: CoupleMetadata;
  onClose: () => void;
  onSaveEvent: (ev: ScheduleEvent) => void;
}

// ブラウザの SpeechRecognition 型宣言
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export const VoiceEventModal: React.FC<VoiceEventModalProps> = ({
  selectedDate,
  activePartner,
  metadata,
  onClose,
  onSaveEvent,
}) => {
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

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // 音声テキストが変化したらリアルタイムに日付・時間・タイトルを自動解析
  const applyVoiceParse = (raw: string) => {
    setSpokenText(raw);
    if (!raw.trim()) return;
    const parsed = parseSpokenScheduleText(raw, selectedDate, 'shared');
    setDateStr(parsed.date);
    setTitle(parsed.title);
    setCategoryId(parsed.categoryId);
    setIsAllDay(parsed.isAllDay);
    if (parsed.startTime) setStartTime(parsed.startTime);
    if (parsed.endTime) setEndTime(parsed.endTime);
    if (parsed.supportBadges.length > 0) {
      setSupportBadges(parsed.supportBadges);
    }
  };

  // 音声認識の開始・停止
  const toggleListening = () => {
    setSpeechError(null);
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

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
      const rec = new SpeechRec();
      rec.lang = 'ja-JP';
      rec.interimResults = true;
      rec.continuous = false;

      rec.onresult = (event) => {
        let transcript = '';
        const resObj = event.results;
        const len = Object.keys(resObj).length;
        for (let i = 0; i < len; i++) {
          transcript += resObj[i][0].transcript;
        }
        applyVoiceParse(transcript);
      };

      rec.onerror = () => {
        setIsListening(false);
        setSpeechError(
          'マイクの読み取りが中断されました。もう一度マイクボタンを押すか、キーボードの音声入力をお使いください🐾'
        );
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = title.trim() || spokenText.trim();
    if (!finalTitle) return;

    const nowIso = new Date().toISOString();
    const cat = CATEGORY_MAP[categoryId] || CATEGORY_MAP.shared;

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
    onClose();
  };

  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
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
              <span>声で予定をかんたん入力</span>
            </h2>
            <p className="text-[11px] text-stone-400">
              「15日の19時からイタリアン」「明日10時半から歯医者」と話すだけ！
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* 1. 大型マイクボタン */}
          <div className="bg-white rounded-3xl p-4 border-2 border-[#FFE5EC] text-center space-y-3 shadow-xs">
            <button
              type="button"
              onClick={toggleListening}
              className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center shadow-lg transition-all ${
                isListening
                  ? 'bg-rose-500 text-white ring-8 ring-rose-200 animate-pulse scale-105'
                  : 'bg-gradient-to-tr from-[#FF8FAB] to-[#B388EB] text-white hover:scale-105 active:scale-95'
              }`}
            >
              {isListening ? <MicOff className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
            </button>

            <div className="font-extrabold text-sm text-stone-800">
              {isListening
                ? '🔴 聞き取り中... 予定をお話しください'
                : 'タップして予定を話す'}
            </div>

            {/* 音声認識テキスト（スマホのキーボード音声入力もそのまま使える） */}
            <div>
              <input
                type="text"
                value={spokenText}
                onChange={(e) => applyVoiceParse(e.target.value)}
                placeholder="例: 12日の14時から美容院 / 明日19時から飲み会 夜ご飯不要"
                className="w-full px-3.5 py-2.5 rounded-2xl border-2 border-stone-200 bg-[#FFFBF7] font-bold text-sm text-stone-800 focus:border-[#FF8FAB] focus:outline-none text-center"
              />
            </div>

            {/* サンプルフレーズ1タップ体験チップ */}
            <div className="flex flex-wrap justify-center gap-1 pt-1">
              {[
                '明日10時半から歯医者',
                '15日の19時から記念日ディナー',
                '金曜19時から飲み会 夜ご飯不要',
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => applyVoiceParse(sample)}
                  className="px-2 py-1 rounded-lg bg-[#FFFBF7] hover:bg-[#FFE5EC] border border-stone-200 text-[10px] font-bold text-stone-500"
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

          {/* 2. 自動解析された予定内容の確認・微調整カード */}
          <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 space-y-3 shadow-2xs">
            <div className="font-extrabold text-[#9E2A47] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#FF8FAB]" />
              <span>自動判定された予定内容（そのまま変更もできます）</span>
            </div>

            <div>
              <label className="block font-bold text-stone-500 mb-1">予定タイトル</label>
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
              {(Object.keys(CATEGORY_MAP) as CalendarCategoryId[]).map((cid) => {
                const cat = CATEGORY_MAP[cid];
                const selected = categoryId === cid;
                const label =
                  cid === 'partnerA'
                    ? `${partnerA.avatar}${partnerA.name}`
                    : cid === 'partnerB'
                    ? `${partnerB.avatar}${partnerB.name}`
                    : `${cat.icon}${cat.shortLabel}`;
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => setCategoryId(cid)}
                    style={
                      selected
                        ? { backgroundColor: cat.accentColor, color: '#fff' }
                        : { backgroundColor: cat.bgColor, color: cat.textColor }
                    }
                    className="px-2.5 py-1 rounded-xl font-extrabold text-xs"
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
            disabled={!title.trim() && !spokenText.trim()}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] disabled:opacity-40 text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>この内容でカレンダーに登録する</span>
          </button>
        </form>
      </div>
    </div>
  );
};
