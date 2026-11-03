import React, { useRef, useState } from 'react';
import {
  X,
  Camera,
  Sparkles,
  Check,
  Upload,
  FileText,
  KeyRound,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import {
  CalendarCategoryId,
  CoupleMetadata,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';
import { CATEGORY_MAP } from '../utils/presets';
import {
  analyzeShiftImageWithGemini,
  ExtractedImageScheduleResult,
  getSavedGeminiApiKey,
  setSavedGeminiApiKey,
} from '../utils/voiceAndAi';
import {
  parseIcsWithShiftDetection,
  parseNurseKarText,
} from '../utils/ical';

interface ShiftImageOcrModalProps {
  year: number;
  month: number;
  activePartner: PartnerId;
  metadata: CoupleMetadata;
  stamps: StampPreset[];
  onClose: () => void;
  onBulkApplyShiftsAndEvents: (
    shifts: ShiftEntry[],
    events: ScheduleEvent[],
    summaryMsg: string
  ) => void;
}

type ModalTab = 'image_ocr' | 'nursekar_import';

export const ShiftImageOcrModal: React.FC<ShiftImageOcrModalProps> = ({
  year,
  month,
  activePartner,
  metadata,
  stamps,
  onClose,
  onBulkApplyShiftsAndEvents,
}) => {
  const [tab, setTab] = useState<ModalTab>('image_ocr');
  const [targetPartner, setTargetPartner] = useState<PartnerId>(activePartner);
  const [targetYear, setTargetYear] = useState<number>(year);
  const [targetMonth, setTargetMonth] = useState<number>(month);
  const [personNameInTable, setPersonNameInTable] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>(() => getSavedGeminiApiKey());

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // AI抽出結果プレビュー
  const [ocrResult, setOcrResult] = useState<ExtractedImageScheduleResult | null>(null);

  // ナスカレテキスト貼り付け用
  const [nurseKarText, setNurseKarText] = useState<string>('');
  const icsInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const shiftStamps = stamps.filter((s) => s.type === 'shift');
  const partnerA = metadata.partners.partnerA;
  const partnerB = metadata.partners.partnerB;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setOcrResult(null);
    setError(null);
  };

  // Gemini Vision API でシフト表画像を解析
  const handleRunOcr = async () => {
    if (!selectedFile) {
      setError('シフト表またはナスカレのスクリーンショット画像を選択してください📷');
      return;
    }
    if (!apiKey.trim()) {
      setError('Gemini APIキーを入力してください🔑');
      return;
    }

    setError(null);
    setAnalyzing(true);
    setSavedGeminiApiKey(apiKey.trim());

    try {
      const result = await analyzeShiftImageWithGemini(
        selectedFile,
        apiKey.trim(),
        targetYear,
        targetMonth,
        personNameInTable,
        shiftStamps
      );
      if (result.shifts.length === 0 && result.events.length === 0) {
        setError('画像からシフトや予定を検出できませんでした。対象年月や画像をご確認ください。');
      } else {
        setOcrResult(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像解析中にエラーが発生しました');
    } finally {
      setAnalyzing(false);
    }
  };

  // AI解析プレビューをカレンダーに一括反映
  const handleConfirmOcrApply = () => {
    if (!ocrResult) return;
    const nowIso = new Date().toISOString();
    const stampMap = new Map<string, StampPreset>();
    for (const s of shiftStamps) stampMap.set(s.id, s);

    const newShifts: ShiftEntry[] = ocrResult.shifts.map((item) => {
      const st = stampMap.get(item.matchedStampId) || shiftStamps[0];
      return {
        id: `${item.date}_${targetPartner}`,
        date: item.date,
        partnerId: targetPartner,
        stampId: st.id,
        startTime: item.startTime || st.startTime,
        endTime: item.endTime || st.endTime,
        createdBy: activePartner,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };
    });

    const catId: CalendarCategoryId = targetPartner;
    const cat = CATEGORY_MAP[catId];
    const newEvents: ScheduleEvent[] = ocrResult.events.map((ev, idx) => ({
      id: `ocr_ev_${Date.now()}_${idx}`,
      date: ev.date,
      title: ev.title,
      categoryId: catId,
      color: cat.accentColor,
      isAllDay: ev.isAllDay,
      startTime: ev.startTime,
      endTime: ev.endTime,
      createdBy: activePartner,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    const pInfo = metadata.partners[targetPartner];
    onBulkApplyShiftsAndEvents(
      newShifts,
      newEvents,
      `✨ ${pInfo.avatar}${pInfo.name}のシフト${newShifts.length}件・予定${newEvents.length}件を一括登録しました！`
    );
    onClose();
  };

  // ナスカレ連携 .ics ファイルからシフトと予定を自動振り分けインポート
  const handleNurseKarIcsImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const content = await file.text();
      const { shifts, events } = parseIcsWithShiftDetection(
        content,
        targetPartner,
        targetPartner,
        shiftStamps,
        true
      );
      if (shifts.length === 0 && events.length === 0) {
        setError('.icsファイル内に有効なシフトや予定が見つかりませんでした');
        return;
      }
      const pInfo = metadata.partners[targetPartner];
      onBulkApplyShiftsAndEvents(
        shifts,
        events,
        `🏥 ナスカレ/カレンダーから ${pInfo.avatar}シフト${shifts.length}件・予定${events.length}件を取り込みました！`
      );
      onClose();
    } catch {
      setError('ファイルの読み込みに失敗しました');
    } finally {
      e.target.value = '';
    }
  };

  // ナスカレ共有テキストから一括変換・登録
  const handleNurseKarTextImport = () => {
    if (!nurseKarText.trim()) {
      setError('ナスカレの共有テキストを貼り付けてください');
      return;
    }
    const { shifts, events } = parseNurseKarText(
      nurseKarText,
      targetYear,
      targetMonth,
      targetPartner,
      shiftStamps,
      targetPartner
    );
    if (shifts.length === 0 && events.length === 0) {
      setError('テキストから日付とシフトを読み取れませんでした（例: 11/3 日勤 の形式で入力してください）');
      return;
    }
    const pInfo = metadata.partners[targetPartner];
    onBulkApplyShiftsAndEvents(
      shifts,
      events,
      `🏥 テキストから ${pInfo.avatar}シフト${shifts.length}件・予定${events.length}件を一括登録しました！`
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] bg-[#FFFBF7] rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-white px-4 py-3.5 border-b border-[#FFE5EC] flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-stone-800 flex items-center gap-1.5">
              <span>📷</span>
              <span>シフト表AI画像読取 ＆ ナスカレ取込</span>
            </h2>
            <p className="text-[11px] text-stone-400">
              シフト表の写真・ナスカレのスクショやカレンダー連携から一括登録
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

        {/* タブ切替 */}
        <div className="grid grid-cols-2 gap-1.5 bg-white px-4 py-2 border-b border-stone-100">
          <button
            type="button"
            onClick={() => {
              setTab('image_ocr');
              setError(null);
            }}
            className={`py-2 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
              tab === 'image_ocr'
                ? 'bg-[#FFE5EC] text-[#9E2A47] shadow-2xs'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>シフト表画像をAI読取</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('nursekar_import');
              setError(null);
            }}
            className={`py-2 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
              tab === 'nursekar_import'
                ? 'bg-[#E2F9FC] text-[#136370] shadow-2xs'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>🏥 ナスカレから取込</span>
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* 共通：誰の・何年何月のシフトか選択 */}
          <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 space-y-2.5 shadow-2xs">
            <div className="font-extrabold text-stone-700">
              1. 登録するパートナーと対象年月を選択
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTargetPartner('partnerA')}
                className={`py-2 px-3 rounded-xl font-extrabold flex items-center justify-center gap-1.5 border-2 transition-all ${
                  targetPartner === 'partnerA'
                    ? 'bg-[#E2F9FC] border-[#56CFE1] text-[#136370]'
                    : 'bg-stone-50 border-stone-200 text-stone-500'
                }`}
              >
                <span className="text-base">{partnerA.avatar}</span>
                <span>{partnerA.name}のシフト</span>
              </button>

              <button
                type="button"
                onClick={() => setTargetPartner('partnerB')}
                className={`py-2 px-3 rounded-xl font-extrabold flex items-center justify-center gap-1.5 border-2 transition-all ${
                  targetPartner === 'partnerB'
                    ? 'bg-[#F3EAFF] border-[#B388EB] text-[#59318F]'
                    : 'bg-stone-50 border-stone-200 text-stone-500'
                }`}
              >
                <span className="text-base">{partnerB.avatar}</span>
                <span>{partnerB.name}のシフト</span>
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <select
                value={targetYear}
                onChange={(e) => setTargetYear(Number(e.target.value))}
                className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-extrabold"
              >
                {[year - 1, year, year + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </select>
              <select
                value={targetMonth}
                onChange={(e) => setTargetMonth(Number(e.target.value))}
                className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-extrabold"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}月分
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 font-bold">
              {error}
            </div>
          )}

          {/* タブ1：AI画像OCR */}
          {tab === 'image_ocr' && (
            <div className="space-y-3.5">
              {/* Gemini APIキー入力 */}
              <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-stone-700 flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5 text-[#FF8FAB]" />
                    <span>Gemini APIキー（初回のみ入力・端末に保存）</span>
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-bold text-[#FF8FAB] hover:underline flex items-center gap-0.5"
                  >
                    <span>無料キー取得</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy... (Google AI StudioのAPIキー)"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-mono text-xs"
                />
                <input
                  type="text"
                  value={personNameInTable}
                  onChange={(e) => setPersonNameInTable(e.target.value)}
                  placeholder="勤務表に複数人の名前がある場合のみ：抽出する名前（例: 佐藤）"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] text-xs"
                />
              </div>

              {/* 画像選択ボタン＆プレビュー */}
              <div className="bg-white rounded-2xl p-4 border-2 border-dashed border-[#FFC2D1] text-center space-y-3">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="space-y-2">
                    <img
                      src={previewUrl}
                      alt="シフト表プレビュー"
                      className="max-h-48 mx-auto rounded-2xl border border-stone-200 object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 font-bold text-xs"
                    >
                      別の画像を選び直す
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full py-6 flex flex-col items-center justify-center gap-2 text-[#9E2A47]"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#FFE5EC] flex items-center justify-center">
                      <Camera className="w-6 h-6 text-[#FF8FAB]" />
                    </div>
                    <div className="font-extrabold text-sm">
                      タップしてシフト表の画像・スクショを選択
                    </div>
                    <div className="text-[11px] text-stone-400">
                      紙の勤務表の写真・ナスカレの月間画面スクショ・Excel画像に対応
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  disabled={!selectedFile || analyzing}
                  onClick={handleRunOcr}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] disabled:opacity-40 text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2"
                >
                  <Sparkles className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />
                  <span>
                    {analyzing
                      ? 'AIがシフト表を読み取り中...'
                      : '✨ AIでシフト表を自動読み取りする'}
                  </span>
                </button>
              </div>

              {/* 読み取り結果プレビュー＆微修正 */}
              {ocrResult && (
                <div className="bg-white rounded-2xl p-3.5 border-2 border-[#FF8FAB] space-y-3 animate-pop">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-[#9E2A47]">
                      🎉 読み取り結果（シフト {ocrResult.shifts.length}日分 / 予定 {ocrResult.events.length}件）
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {ocrResult.shifts.map((item, idx) => {
                      const dayNum = Number(item.date.split('-')[2]);
                      return (
                        <div
                          key={item.date}
                          className="flex items-center justify-between gap-2 bg-[#FFFBF7] px-3 py-1.5 rounded-xl border border-stone-200/80"
                        >
                          <span className="font-extrabold text-stone-700 w-16">
                            {targetMonth}/{dayNum}日
                          </span>
                          <span className="text-[11px] text-stone-400 truncate">
                            読取:「{item.rawShiftText}」
                          </span>
                          <select
                            value={item.matchedStampId}
                            onChange={(e) => {
                              const nextShifts = [...ocrResult.shifts];
                              nextShifts[idx] = {
                                ...item,
                                matchedStampId: e.target.value,
                              };
                              setOcrResult({ ...ocrResult, shifts: nextShifts });
                            }}
                            className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white font-extrabold text-xs"
                          >
                            {shiftStamps.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.icon} {st.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              setOcrResult({
                                ...ocrResult,
                                shifts: ocrResult.shifts.filter((_, i) => i !== idx),
                              });
                            }}
                            className="text-stone-400 hover:text-rose-500 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}

                    {ocrResult.events.map((ev, idx) => (
                      <div
                        key={`${ev.date}_${idx}`}
                        className="flex items-center justify-between gap-2 bg-[#FFE5EC]/30 px-3 py-1.5 rounded-xl border border-[#FFC2D1]"
                      >
                        <span className="font-extrabold text-[#9E2A47]">
                          📅 {ev.date.slice(5)}: {ev.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setOcrResult({
                              ...ocrResult,
                              events: ocrResult.events.filter((_, i) => i !== idx),
                            });
                          }}
                          className="text-stone-400 hover:text-rose-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmOcrApply}
                    className="w-full py-3 rounded-2xl bg-[#52B788] hover:bg-[#389268] text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>カレンダーに一括登録する</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* タブ2：🏥 ナスカレ（NurseKar）連携インポート */}
          {tab === 'nursekar_import' && (
            <div className="space-y-3.5">
              {/* 方法A：ナスカレのスクショ画像で一括取込 */}
              <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 space-y-2 shadow-2xs">
                <div className="font-extrabold text-[#9E2A47] text-sm">
                  💡 方法① ナスカレのカレンダー画面をスクショして取込（一番簡単！）
                </div>
                <p className="text-stone-500 leading-relaxed">
                  スマホで「ナスカレ」の月間カレンダー画面をスクリーンショット撮影し、隣の「📷 シフト表画像をAI読取」タブに画像を入れるだけで、シフトも予定も一括で自動登録できます！
                </p>
                <button
                  type="button"
                  onClick={() => setTab('image_ocr')}
                  className="px-3.5 py-2 rounded-xl bg-[#FFE5EC] text-[#9E2A47] font-extrabold text-xs"
                >
                  👉 スクショAI読取タブを開く
                </button>
              </div>

              {/* 方法B：ナスカレ同期済み iOS / Google カレンダー (.ics) 取込 */}
              <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 space-y-2.5 shadow-2xs">
                <div className="font-extrabold text-[#136370] text-sm">
                  📥 方法② ナスカレ連携カレンダー（.icsファイル）から自動振り分け取込
                </div>
                <p className="text-stone-500 leading-relaxed">
                  ナスカレと同期している iPhoneカレンダー / Googleカレンダーの `.ics` ファイルを選ぶと、「日勤・夜勤・休み・有休・準夜・遅番・早番」は自動的に上部の**シフト枠**へ、それ以外の予定は下部の**予定リスト**へ自動で振り分けて一括登録します。
                </p>
                <input
                  ref={icsInputRef}
                  type="file"
                  accept=".ics,text/calendar"
                  onChange={handleNurseKarIcsImport}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => icsInputRef.current?.click()}
                  className="w-full py-2.5 rounded-xl bg-[#56CFE1] hover:bg-[#2EA8BA] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Upload className="w-4 h-4" />
                  <span>.ics ファイルを選択してシフト＆予定を一括取込</span>
                </button>
              </div>

              {/* 方法C：ナスカレの「LINEで共有」テキスト貼り付け */}
              <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 space-y-2.5 shadow-2xs">
                <div className="font-extrabold text-[#59318F] text-sm">
                  📋 方法③ ナスカレの共有テキスト・メモを貼り付けて一括登録
                </div>
                <textarea
                  rows={4}
                  value={nurseKarText}
                  onChange={(e) => setNurseKarText(e.target.value)}
                  placeholder={`例:\n11/1(日) 日勤\n11/2(月) 夜勤\n11/3(火) 休み デート\n11/4(水) 遅番`}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] text-xs font-bold"
                />
                <button
                  type="button"
                  onClick={handleNurseKarTextImport}
                  className="w-full py-2.5 rounded-xl bg-[#B388EB] hover:bg-[#8C5EC7] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>貼り付けたテキストからシフト＆予定を一括登録</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
