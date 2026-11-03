// 音声入力（Web Speech API）自然言語解析 ＆ Gemini Vision API によるシフト表画像・ナスカレスクショ自動読み取りモジュール
import {
  CalendarCategoryId,
  ScheduleEvent,
  StampPreset,
} from '../types/calendar';

const LS_GEMINI_KEY = 'futarical_gemini_api_key_v1';

export function getSavedGeminiApiKey(): string {
  return localStorage.getItem(LS_GEMINI_KEY) || '';
}

export function setSavedGeminiApiKey(key: string): void {
  if (!key.trim()) {
    localStorage.removeItem(LS_GEMINI_KEY);
  } else {
    localStorage.setItem(LS_GEMINI_KEY, key.trim());
  }
}

// 音声解析結果の型定義
export interface ParsedVoiceSchedule {
  date: string;           // "YYYY-MM-DD"
  title: string;
  isAllDay: boolean;
  startTime?: string;     // "HH:mm"
  endTime?: string;       // "HH:mm"
  categoryId: CalendarCategoryId;
  supportBadges: string[];
  shiftLabel?: string;    // 「12日は夜勤」のようにシフトを話した場合
}

// 全角数字・漢数字を半角数字に正規化
function normalizeNumbers(str: string): string {
  return str
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/時半/g, '時30分')
    .replace(/：/g, ':');
}

/**
 * 話した日本語テキスト（例：「15日の19時から駅前イタリアンでディナー 夜ご飯不要」「明日10時半から歯医者」）から
 * 日付・時間・カテゴリ・サポートバッジ・予定タイトルを自動抽出します。
 */
export function parseSpokenScheduleText(
  rawText: string,
  baseDateStr: string, // 現在選択中の日付 "YYYY-MM-DD"
  defaultCategoryId: CalendarCategoryId = 'shared'
): ParsedVoiceSchedule {
  let text = normalizeNumbers(rawText.trim());
  const [baseY, baseM, baseD] = baseDateStr.split('-').map(Number);
  const now = new Date();

  let targetYear = baseY;
  let targetMonth = baseM;
  let targetDay = baseD;

  // 1. 日付表現の抽出
  if (text.includes('今日') || text.includes('きょう')) {
    targetYear = now.getFullYear();
    targetMonth = now.getMonth() + 1;
    targetDay = now.getDate();
    text = text.replace(/(今日|きょう)の?/g, ' ');
  } else if (text.includes('明後日') || text.includes('あさって')) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    targetYear = dt.getFullYear();
    targetMonth = dt.getMonth() + 1;
    targetDay = dt.getDate();
    text = text.replace(/(明後日|あさって)の?/g, ' ');
  } else if (text.includes('明日') || text.includes('あした')) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    targetYear = dt.getFullYear();
    targetMonth = dt.getMonth() + 1;
    targetDay = dt.getDate();
    text = text.replace(/(明日|あした)の?/g, ' ');
  } else {
    // 「11月24日」または「24日」
    const mdMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*の?/);
    if (mdMatch) {
      targetMonth = Math.min(12, Math.max(1, Number(mdMatch[1])));
      targetDay = Math.min(31, Math.max(1, Number(mdMatch[2])));
      text = text.replace(mdMatch[0], ' ');
    } else {
      const dOnlyMatch = text.match(/(?:^|\s)(\d{1,2})\s*日\s*の?/);
      if (dOnlyMatch) {
        targetDay = Math.min(31, Math.max(1, Number(dOnlyMatch[1])));
        text = text.replace(dOnlyMatch[0], ' ');
      }
    }
  }

  const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(
    targetDay
  ).padStart(2, '0')}`;

  // 2. 時刻表現の抽出（例：「19時から21時まで」「午後2時30分から」「10:30から」）
  let isAllDay = true;
  let startTime: string | undefined;
  let endTime: string | undefined;

  const formatHHMM = (h: number, m: number, isPm: boolean) => {
    let hh = h;
    if (isPm && hh < 12) hh += 12;
    hh = Math.min(23, Math.max(0, hh));
    const mm = Math.min(59, Math.max(0, m));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  // パターンA: 「(午前|午後)?10時30分から(午前|午後)?12時00分まで」
  const rangeMatch = text.match(
    /(午前|午後)?\s*(\d{1,2})(?:時|:)(\d{1,2})?分?\s*(?:から|〜|~|-)\s*(午前|午後)?\s*(\d{1,2})(?:時|:)(\d{1,2})?分?\s*(?:まで|に)?/
  );
  if (rangeMatch) {
    const isPm1 = rangeMatch[1] === '午後';
    const h1 = Number(rangeMatch[2]);
    const m1 = rangeMatch[3] ? Number(rangeMatch[3]) : 0;
    const isPm2 = rangeMatch[4] === '午後' || (isPm1 && Number(rangeMatch[5]) < 12);
    const h2 = Number(rangeMatch[5]);
    const m2 = rangeMatch[6] ? Number(rangeMatch[6]) : 0;

    startTime = formatHHMM(h1, m1, isPm1);
    endTime = formatHHMM(h2, m2, isPm2);
    isAllDay = false;
    text = text.replace(rangeMatch[0], ' ');
  } else {
    // パターンB: 単一開始時刻「(午前|午後)?19時30分から」「14時に」
    const singleTimeMatch = text.match(
      /(午前|午後)?\s*(\d{1,2})(?:時|:)(\d{1,2})?分?\s*(?:から|に|より)?/
    );
    if (singleTimeMatch) {
      const isPm = singleTimeMatch[1] === '午後';
      const h1 = Number(singleTimeMatch[2]);
      const m1 = singleTimeMatch[3] ? Number(singleTimeMatch[3]) : 0;
      startTime = formatHHMM(h1, m1, isPm);
      // 終了時間は1時間後を初期セット
      const endH = Math.min(23, (isPm && h1 < 12 ? h1 + 12 : h1) + 1);
      endTime = `${String(endH).padStart(2, '0')}:${String(m1).padStart(2, '0')}`;
      isAllDay = false;
      text = text.replace(singleTimeMatch[0], ' ');
    }
  }

  // 3. すれ違いサポート目印の自動検出
  const supportBadges: string[] = [];
  if (/夕飯不要|夜ごはん不要|夜ご飯不要|夕飯いらない|夜ご飯いらない|夕食不要/.test(text)) {
    supportBadges.push('🍳夜ごはん不要');
    text = text.replace(/(夕飯不要|夜ごはん不要|夜ご飯不要|夕飯いらない|夜ご飯いらない|夕食不要)/g, ' ');
  }
  if (/お弁当あり|お弁当お願い|弁当いる/.test(text)) {
    supportBadges.push('🍱お弁当あり');
    text = text.replace(/(お弁当あり|お弁当お願い|弁当いる)/g, ' ');
  }
  if (/お迎えお願い|迎えに来て/.test(text)) {
    supportBadges.push('🚗お迎えお願い');
    text = text.replace(/(お迎えお願い|迎えに来て)/g, ' ');
  }

  // 4. カテゴリの自動推測
  let categoryId: CalendarCategoryId = defaultCategoryId;
  if (/記念日|誕生日|お祝い|アニバーサリー/.test(text)) {
    categoryId = 'anniversary';
  } else if (/ごみ|ゴミ|掃除|洗濯|買い出し|買い物|家事|引き落とし/.test(text)) {
    categoryId = 'chore';
  } else if (/デート|ふたりで|二人で|家族で|旅行|外食/.test(text)) {
    categoryId = 'shared';
  }

  // 5. 残りのテキストを整形してタイトルにする
  const cleanedTitle = text
    .replace(/^[、。・\s]+|[、。・\s]+$/g, '')
    .replace(/\s+(です|を入れる|を追加|の予定|予定)$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    date: dateStr,
    title: cleanedTitle || rawText.trim(),
    isAllDay,
    startTime,
    endTime,
    categoryId,
    supportBadges,
  };
}

// シフト表画像AI解析の結果アイテム型
export interface ExtractedShiftItem {
  date: string;           // "YYYY-MM-DD"
  rawShiftText: string;   // 画像上の表記（例: "日", "夜", "休", "早", "公"）
  matchedStampId: string; // 自動マッチした StampPreset.id
  startTime?: string;
  endTime?: string;
}

export interface ExtractedImageScheduleResult {
  shifts: ExtractedShiftItem[];
  events: {
    date: string;
    title: string;
    startTime?: string;
    endTime?: string;
    isAllDay: boolean;
  }[];
}

// シフト文字列から最も近い StampPreset を自動マッチングするヘルパー
export function matchShiftStampByText(
  rawText: string,
  stamps: StampPreset[]
): StampPreset | undefined {
  const clean = rawText.trim();
  if (!clean) return undefined;

  // 完全一致または前方一致
  const exact = stamps.find(
    (s) => s.label === clean || s.shortLabel === clean
  );
  if (exact) return exact;

  // 2夜・準早・準遅・遅A・遅B・早A・早B の優先マッチング
  if (/2夜|２夜/.test(clean)) {
    return stamps.find((s) => s.label === '２夜' || s.id === 'shift_a_2night');
  }
  if (/準早/.test(clean)) {
    return stamps.find((s) => s.label === '準早' || s.id === 'shift_a_semi_early');
  }
  if (/準遅/.test(clean)) {
    return stamps.find((s) => s.label === '準遅' || s.id === 'shift_a_semi_late');
  }
  if (/遅[BbＢ]/.test(clean)) {
    return stamps.find((s) => s.label === '遅B' || s.id === 'shift_a_late_b');
  }
  if (/遅[AaＡ]/.test(clean)) {
    return stamps.find((s) => s.label === '遅A' || s.id === 'shift_a_late_a');
  }
  if (/早[BbＢ]/.test(clean)) {
    return stamps.find((s) => s.label === '早B' || s.id === 'shift_a_early_b');
  }
  if (/早[AaＡ]/.test(clean)) {
    return stamps.find((s) => s.label === '早A' || s.id === 'shift_a_early_a');
  }

  // キーワードによる柔軟マッチング（ナスカレ・病院・一般シフト表の略称に完全対応）
  if (/^(日勤|日|D|日1|日2)$/i.test(clean) || clean.includes('日勤')) {
    return stamps.find((s) => s.id === 'shift_a_day' || s.label.includes('日勤')) || stamps[0];
  }
  if (/^(夜勤|夜|深|深夜|N|入り|夜入)$/i.test(clean) || clean.includes('夜勤') || clean.includes('深夜')) {
    return stamps.find((s) => s.id === 'shift_a_night' || s.label.includes('夜勤'));
  }
  if (/^(早番|早|早出|E)$/i.test(clean) || clean.includes('早')) {
    return stamps.find((s) => s.id === 'shift_a_early_a' || s.label.includes('早'));
  }
  if (/^(遅番|遅|遅出|L)$/i.test(clean) || clean.includes('遅')) {
    return stamps.find((s) => s.id === 'shift_a_late_a' || s.label.includes('遅'));
  }
  if (/^(年休|有休|有給|有|年|夏休|特休)$/i.test(clean) || clean.includes('年休') || clean.includes('有休') || clean.includes('有給')) {
    return stamps.find((s) => s.id === 'shift_a_paid' || s.label.includes('年休') || s.label.includes('有休'));
  }
  if (/^(明|明け|明休|／|\/)$/i.test(clean) || clean.includes('明')) {
    return stamps.find((s) => s.id === 'shift_a_ake' || s.label.includes('明'));
  }
  if (/^(休み|休|公休|公|週休|代休|振休|×|〇|○)$/i.test(clean) || clean.includes('休')) {
    return stamps.find((s) => s.id === 'shift_a_off' || s.label === '休み' || s.isHoliday);
  }

  // 部分一致フォールバック
  return stamps.find(
    (s) => clean.includes(s.label) || s.label.includes(clean)
  );
}

// 画像をリサイズして Canvas と Base64 JPEG を返す（スマホの高解像度スクショでも高速・確実に処理するため）
async function loadImageToCanvas(
  file: File,
  maxDim = 1400
): Promise<{ canvas: HTMLCanvasElement; mimeType: string; base64Data: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context error'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      const base64Data = dataUrl.split(',')[1] || '';
      resolve({ canvas, mimeType: 'image/jpeg', base64Data });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };
    img.src = url;
  });
}

// RGB を HSL (h: 0-360, s: 0-100, l: 0-100) に変換
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// ナスカレ等のカレンダーセル内のスタンプ色（色相・彩度・明度）からシフト種別を推定
function classifyStampFromCellColor(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  stamps: StampPreset[]
): { stamp: StampPreset; label: string } | null {
  // 日付数字の下（セルの高さ22%〜62%、横幅15%〜85%）にあるスタンプバッジ領域をサンプリング
  const sx = Math.max(0, Math.floor(cellX + cellW * 0.15));
  const sy = Math.max(0, Math.floor(cellY + cellH * 0.22));
  const sw = Math.max(4, Math.floor(cellW * 0.7));
  const sh = Math.max(4, Math.floor(cellH * 0.4));

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(sx, sy, sw, sh);
  } catch {
    return null;
  }

  const data = imgData.data;
  const buckets: Record<string, number> = {
    day_blue: 0,
    off_pink_red: 0,
    night_purple_dark: 0,
    early_orange_yellow: 0,
    paid_green: 0,
    ake_teal_gray: 0,
  };
  let coloredCount = 0;
  const totalPixels = sw * sh;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);

    // 背景の白・薄いグレー・黒文字は除外
    if (l > 93 || l < 12 || (s < 16 && l > 65)) continue;

    coloredCount++;
    if (l < 35 && (h >= 200 && h <= 290)) {
      buckets.night_purple_dark += 2;
    } else if (h >= 325 || h <= 18) {
      // ピンク・赤・コーラル系（ナスカレでは「休／公休」または「日勤」スタンプに多用）
      buckets.off_pink_red += 1;
    } else if (h >= 19 && h <= 58) {
      // オレンジ・黄色系（早番・遅番・日勤）
      buckets.early_orange_yellow += 1;
    } else if (h >= 75 && h <= 165) {
      // グリーン・ミント系（有休・休み）
      buckets.paid_green += 1;
    } else if (h >= 175 && h <= 235) {
      // スカイブルー・水色系（日勤・準夜）
      buckets.day_blue += 1;
    } else if (h >= 236 && h <= 324) {
      // パープル・ラベンダー系（夜勤・準夜）
      buckets.night_purple_dark += 1;
    } else {
      buckets.ake_teal_gray += 1;
    }
  }

  // スタンプ領域に色付きピクセルが少なすぎる場合は空欄とみなす
  if (coloredCount < totalPixels * 0.06) {
    return null;
  }

  let bestKey = 'day_blue';
  let bestVal = 0;
  for (const [k, v] of Object.entries(buckets)) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }

  const findStamp = (id: string, fallbackKw: string) =>
    stamps.find((s) => s.id === id || s.label.includes(fallbackKw)) || stamps[0];

  switch (bestKey) {
    case 'off_pink_red':
      return { stamp: findStamp('shift_off', '休'), label: '休み(スタンプ色検出)' };
    case 'night_purple_dark':
      return { stamp: findStamp('shift_night', '夜勤'), label: '夜勤(スタンプ色検出)' };
    case 'early_orange_yellow':
      return { stamp: findStamp('shift_early', '早番'), label: '早番(スタンプ色検出)' };
    case 'paid_green':
      return { stamp: findStamp('shift_paid', '有休'), label: '有休(スタンプ色検出)' };
    default:
      return { stamp: findStamp('shift_day', '日勤'), label: '日勤(スタンプ色検出)' };
  }
}

// CDNから Tesseract.js (v5) を動的に読み込む
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTesseractFromCdn(): Promise<any | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.Tesseract) return w.Tesseract;

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => resolve(w.Tesseract || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

/**
 * APIキー不要！ブラウザ内AI OCR (Tesseract.js 日本語) ＋ ナスカレ7列カレンダーグリッド＆スタンプ色解析
 */
export async function analyzeImageWithoutApiKey(
  canvas: HTMLCanvasElement,
  year: number,
  month: number,
  stamps: StampPreset[],
  weekStartsOnMonday = false,
  onProgress?: (msg: string) => void
): Promise<ExtractedImageScheduleResult> {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const daysInMonth = new Date(year, month, 0).getDate();

  // 月初（1日）の曜日インデックス（0..6）
  const firstDowSun = new Date(year, month - 1, 1).getDay(); // 0=Sun..6=Sat
  const startOffset = weekStartsOnMonday ? (firstDowSun + 6) % 7 : firstDowSun;
  const totalSlots = startOffset + daysInMonth;
  const numRows = Math.ceil(totalSlots / 7);

  // スマホ縦長スクショかトリミング済み画像かでカレンダーグリッドの上下範囲を自動推定
  const aspect = H / Math.max(1, W);
  const gridTopY = aspect > 1.45 ? H * 0.17 : H * 0.1;
  const gridBottomY = aspect > 1.45 ? H * 0.83 : H * 0.94;
  const gridLeftX = W * 0.02;
  const gridRightX = W * 0.98;
  const gridW = gridRightX - gridLeftX;
  const gridH = gridBottomY - gridTopY;
  const cellW = gridW / 7;
  const cellH = gridH / numRows;

  const shiftByDay = new Map<number, ExtractedShiftItem>();
  const extractedEvents: ExtractedImageScheduleResult['events'] = [];

  // 1. まず各日付セルのスタンプ色を解析して初期候補を作成
  onProgress?.('🔍 ナスカレ・カレンダーのマス目とスタンプ色を解析中...');
  for (let d = 1; d <= daysInMonth; d++) {
    const slotIdx = startOffset + (d - 1);
    const r = Math.floor(slotIdx / 7);
    const c = slotIdx % 7;
    const cx = gridLeftX + c * cellW;
    const cy = gridTopY + r * cellH;

    const colorDetected = classifyStampFromCellColor(ctx, cx, cy, cellW, cellH, stamps);
    if (colorDetected) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      shiftByDay.set(d, {
        date: dateStr,
        rawShiftText: colorDetected.label,
        matchedStampId: colorDetected.stamp.id,
        startTime: colorDetected.stamp.startTime,
        endTime: colorDetected.stamp.endTime,
      });
    }
  }

  // 2. Tesseract.js 日本語OCRで画像内の文字（日勤・夜勤・休・早・遅・有休など）と座標を読み取って上書き精度向上
  onProgress?.('🤖 AI文字認識（日本語OCR）でシフト文字を読み取り中...');
  try {
    const Tesseract = await loadTesseractFromCdn();
    if (Tesseract) {
      const result = await Tesseract.recognize(canvas, 'jpn', {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: (m: any) => {
          if (m && m.status === 'recognizing text' && typeof m.progress === 'number') {
            onProgress?.(`🤖 AI文字認識中... ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      const words = result?.data?.words || [];
      for (const wObj of words) {
        const raw = String(wObj.text || '').replace(/\s+/g, '').trim();
        if (!raw) continue;
        const bbox = wObj.bbox;
        if (!bbox) continue;

        const centerX = (bbox.x0 + bbox.x1) / 2;
        const centerY = (bbox.y0 + bbox.y1) / 2;

        // グリッド範囲内の文字なら、どの日付セル（row, col）にあるか逆算
        if (
          centerX >= gridLeftX &&
          centerX <= gridRightX &&
          centerY >= gridTopY &&
          centerY <= gridBottomY
        ) {
          const col = Math.min(6, Math.max(0, Math.floor((centerX - gridLeftX) / cellW)));
          const row = Math.min(
            numRows - 1,
            Math.max(0, Math.floor((centerY - gridTopY) / cellH))
          );
          const dayNum = row * 7 + col - startOffset + 1;

          if (dayNum >= 1 && dayNum <= daysInMonth) {
            const matched = matchShiftStampByText(raw, stamps);
            if (matched) {
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(
                dayNum
              ).padStart(2, '0')}`;
              shiftByDay.set(dayNum, {
                date: dateStr,
                rawShiftText: raw,
                matchedStampId: matched.id,
                startTime: matched.startTime,
                endTime: matched.endTime,
              });
            }
          }
        }
      }

      // 行テキストからも「1日 日勤」のような一覧表形式を抽出
      const fullText: string = result?.data?.text || '';
      const lines = fullText.split(/\r?\n/);
      for (const line of lines) {
        const cleanLine = normalizeNumbers(line).trim();
        const m = cleanLine.match(/(?:^|\b)(\d{1,2})\s*(?:日|\([月火水木金土日]\))?\s*([^\d\s]{1,6})/);
        if (m) {
          const d = Number(m[1]);
          const token = m[2];
          if (d >= 1 && d <= daysInMonth) {
            const matched = matchShiftStampByText(token, stamps);
            if (matched) {
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(
                2,
                '0'
              )}`;
              shiftByDay.set(d, {
                date: dateStr,
                rawShiftText: token,
                matchedStampId: matched.id,
                startTime: matched.startTime,
                endTime: matched.endTime,
              });
            }
          }
        }
      }
    }
  } catch {
    // OCR失敗時もスタンプ色解析結果を返す
  }

  // もし色検出でもOCRでも1件も入らなかった場合は、1ヶ月分の枠を「日勤（または先頭スタンプ）」で初期生成し、その場でポチポチ直せるようにする
  if (shiftByDay.size === 0) {
    const defaultStamp = stamps.find((s) => s.id === 'shift_day') || stamps[0];
    const offStamp = stamps.find((s) => s.id === 'shift_off' || s.isHoliday) || defaultStamp;
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      const chosen = dow === 0 || dow === 6 ? offStamp : defaultStamp;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      shiftByDay.set(d, {
        date: dateStr,
        rawShiftText: chosen.label,
        matchedStampId: chosen.id,
        startTime: chosen.startTime,
        endTime: chosen.endTime,
      });
    }
  }

  const finalShifts = Array.from(shiftByDay.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);

  return {
    shifts: finalShifts,
    events: extractedEvents,
  };
}

/**
 * シフト表の画像（ナスカレのスクリーンショット・紙の勤務表写真等）から
 * 1ヶ月分のシフトと予定を自動抽出します。
 * - APIキーが未入力でもブラウザ内AI OCR＋ナスカレグリッド色解析で即座に動作します！
 * - Gemini APIキーが入力されている場合は Gemini Vision API も併用して高精度解析します。
 */
export async function analyzeShiftImageWithGemini(
  file: File,
  apiKey: string,
  year: number,
  month: number,
  targetPersonName: string,
  stamps: StampPreset[],
  weekStartsOnMonday = false,
  onProgress?: (msg: string) => void
): Promise<ExtractedImageScheduleResult> {
  const { canvas, mimeType, base64Data } = await loadImageToCanvas(file, 1400);

  // APIキーが未入力の場合は、APIキー不要のブラウザ内AI OCR＋ナスカレカレンダー解析を実行
  if (!apiKey.trim()) {
    return analyzeImageWithoutApiKey(
      canvas,
      year,
      month,
      stamps,
      weekStartsOnMonday,
      onProgress
    );
  }

  onProgress?.('✨ Gemini AI Vision でシフト表画像を解析中...');
  const stampLabels = stamps.map((s) => `${s.label}(${s.shortLabel})`).join(', ');

  const prompt = `
あなたは優秀なスケジュール＆シフト表OCRアシスタントです。
添付された画像（シフト表・勤務表・または「ナスカレ」等のカレンダースクリーンショット）から、
対象年月「${year}年${month}月」のシフト情報とスケジュール予定を読み取ってJSON形式で出力してください。

${
  targetPersonName.trim()
    ? `※複数人の名前が並んでいる勤務表の場合は、「${targetPersonName.trim()}」さんの行（または列）のシフトのみを抽出してください。`
    : `※カレンダー形式（ナスカレ等）の場合は各日付に入っているシフトスタンプと予定を抽出してください。`
}

登録可能なシフト種類の例: ${stampLabels}
（一般的な表記例: 日勤/日, 夜勤/夜/深夜, 準夜/準, 早番/早, 遅番/遅, 休み/休/公休, 有休/有, 明け/明, 在宅, 出張）

必ず以下のJSONスキーマのみを返してください:
{
  "shifts": [
    {
      "day": 1,
      "shiftType": "日勤",
      "startTime": "08:30",
      "endTime": "17:30"
    }
  ],
  "events": [
    {
      "day": 3,
      "title": "歯医者",
      "startTime": "10:00",
      "endTime": "11:00",
      "isAllDay": false
    }
  ]
}
`.trim();

  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  for (const modelName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
        apiKey.trim()
      )}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) {
        continue;
      }

      const json = await res.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanedJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleanedJson) as {
        shifts?: { day: number; shiftType: string; startTime?: string; endTime?: string }[];
        events?: {
          day: number;
          title: string;
          startTime?: string;
          endTime?: string;
          isAllDay?: boolean;
        }[];
      };

      const daysInMonth = new Date(year, month, 0).getDate();
      const extractedShifts: ExtractedShiftItem[] = [];

      for (const item of parsed.shifts || []) {
        const d = Number(item.day);
        if (!d || d < 1 || d > daysInMonth || !item.shiftType) continue;
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(
          2,
          '0'
        )}`;
        const matched = matchShiftStampByText(item.shiftType, stamps) || stamps[0];
        if (matched) {
          extractedShifts.push({
            date: dateStr,
            rawShiftText: item.shiftType,
            matchedStampId: matched.id,
            startTime: item.startTime || matched.startTime,
            endTime: item.endTime || matched.endTime,
          });
        }
      }

      const extractedEvents = (parsed.events || [])
        .filter((ev) => ev.day >= 1 && ev.day <= daysInMonth && ev.title)
        .map((ev) => ({
          date: `${year}-${String(month).padStart(2, '0')}-${String(Number(ev.day)).padStart(
            2,
            '0'
          )}`,
          title: ev.title,
          startTime: ev.startTime,
          endTime: ev.endTime,
          isAllDay: ev.isAllDay ?? !ev.startTime,
        }));

      if (extractedShifts.length > 0 || extractedEvents.length > 0) {
        return {
          shifts: extractedShifts,
          events: extractedEvents,
        };
      }
    } catch {
      // Gemini呼び出し失敗時はブラウザ内OCRへフォールバック
    }
  }

  // フォールバックとしてブラウザ内AI OCRを実行
  return analyzeImageWithoutApiKey(
    canvas,
    year,
    month,
    stamps,
    weekStartsOnMonday,
    onProgress
  );
}

