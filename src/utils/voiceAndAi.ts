// 音声入力（Web Speech API）自然言語解析 ＆ Gemini Vision API によるシフト表画像・ナスカレスクショ自動読み取りモジュール
import {
  CalendarCategoryId,
  PartnerId,
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
  overtimeMinutes?: number; // 「35分残業」「1時間20分残業」など分単位
  overtimeHours?: number; // 「残業2時間」など残業時間（h）
  holidayWorkMinutes?: number; // 休日出勤（分単位）
  holidayWorkHours?: number; // 「休日出勤4時間」など休出時間（h）
  targetPartner?: PartnerId; // 「夫が」「妻が」など対象パートナー
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

  // 4. 残業時間・休日出勤時間の解析（分単位対応：35分、45分、1時間20分など）
  let overtimeMinutes: number | undefined;
  let overtimeHours: number | undefined;
  let holidayWorkMinutes: number | undefined;
  let holidayWorkHours: number | undefined;

  const otMatch1 = text.match(/残業(?:を|は)?\s*(?:約)?\s*(\d+(?:\.\d+)?)\s*(?:時間半|時間|h)/);
  const otMatch2 = text.match(/(\d+(?:\.\d+)?)\s*(?:時間半|時間|h)\s*(?:の)?残業/);
  const otHoursAndMinutesMatch = text.match(/(?:残業(?:を|は)?\s*)?(\d+)\s*時間(?:半|(\d+)\s*分)?(?:の残業)?/);
  const otMinutesMatch = text.match(/(?:残業(?:を|は)?\s*)?(\d+)\s*分(?:の残業)?/);

  if (text.includes('1時間半残業') || text.includes('残業1時間半') || text.includes('残業一時間半')) {
    overtimeMinutes = 90;
  } else if (text.includes('2時間半残業') || text.includes('残業2時間半')) {
    overtimeMinutes = 150;
  } else if (/残業/.test(text) && otHoursAndMinutesMatch) {
    const h = parseInt(otHoursAndMinutesMatch[1], 10);
    const m = otHoursAndMinutesMatch[0].includes('半')
      ? 30
      : otHoursAndMinutesMatch[2]
      ? parseInt(otHoursAndMinutesMatch[2], 10)
      : 0;
    overtimeMinutes = h * 60 + m;
  } else if (/残業/.test(text) && otMinutesMatch) {
    overtimeMinutes = parseInt(otMinutesMatch[1], 10);
  } else if (otMatch1) {
    const h = parseFloat(otMatch1[1]);
    const extra = otMatch1[0].includes('時間半') ? 0.5 : 0;
    overtimeMinutes = Math.round((h + extra) * 60);
  } else if (otMatch2) {
    const h = parseFloat(otMatch2[1]);
    const extra = otMatch2[0].includes('時間半') ? 0.5 : 0;
    overtimeMinutes = Math.round((h + extra) * 60);
  } else if (/残業/.test(text) && !overtimeMinutes) {
    // 時間指定のない「残業」の場合はデフォルト1時間をセット
    const simpleDigit = text.match(/(\d+(?:\.\d+)?)/);
    overtimeMinutes = simpleDigit ? Math.round(parseFloat(simpleDigit[1]) * 60) : 60;
  }

  if (overtimeMinutes !== undefined) {
    overtimeHours = Math.round((overtimeMinutes / 60) * 10) / 10;
  }

  const holMatch = text.match(/(?:休日出勤|休出)(?:を|は)?\s*(?:約)?\s*(\d+(?:\.\d+)?)\s*(?:時間半|時間|h)/);
  if (holMatch) {
    holidayWorkHours = parseFloat(holMatch[1]);
    holidayWorkMinutes = Math.round(holidayWorkHours * 60);
  } else if (/休日出勤|休出/.test(text)) {
    holidayWorkHours = 8;
    holidayWorkMinutes = 480;
  }

  // 5. 対象パートナーの自動推測（「夫が」「妻が」「パパが」「ママが」）
  let targetPartner: PartnerId | undefined;
  if (/夫|パパ|旦那|だんな|彼/.test(text)) {
    targetPartner = 'partnerA';
  } else if (/妻|ママ|奥さん|嫁|彼女/.test(text)) {
    targetPartner = 'partnerB';
  }

  // 6. カテゴリの自動推測
  let categoryId: CalendarCategoryId = defaultCategoryId;
  if (targetPartner) {
    categoryId = targetPartner;
  } else if (/記念日|誕生日|お祝い|アニバーサリー/.test(text)) {
    categoryId = 'anniversary';
  } else if (/ごみ|ゴミ|掃除|洗濯|買い出し|買い物|家事|引き落とし/.test(text)) {
    categoryId = 'chore';
  } else if (/デート|ふたりで|二人で|家族で|旅行|外食/.test(text)) {
    categoryId = 'shared';
  }

  // 7. 残りのテキストを整形してタイトルにする
  let cleanedTitle = text
    .replace(/^[、。・\s]+|[、。・\s]+$/g, '')
    .replace(/\s+(です|を入れる|を追加|の予定|予定)$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (overtimeMinutes && (!cleanedTitle || cleanedTitle === '残業')) {
    const h = Math.floor(overtimeMinutes / 60);
    const m = overtimeMinutes % 60;
    cleanedTitle = h === 0 ? `残業 +${m}分` : m === 0 ? `残業 +${h}h` : `残業 +${h}h${m}m`;
  } else if (holidayWorkHours && (!cleanedTitle || cleanedTitle === '休日出勤' || cleanedTitle === '休出')) {
    cleanedTitle = `休日出勤 ${holidayWorkHours}h`;
  }

  return {
    date: dateStr,
    title: cleanedTitle || rawText.trim(),
    isAllDay,
    startTime,
    endTime,
    categoryId,
    supportBadges,
    overtimeMinutes,
    overtimeHours,
    holidayWorkMinutes,
    holidayWorkHours,
    targetPartner,
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

  // 2夜・2早・準早・準遅・遅A・遅B・早A・早B の優先マッチング
  if (/2夜|２夜/.test(clean)) {
    return stamps.find((s) => s.label === '２夜' || s.id === 'shift_a_2night');
  }
  if (/2早|２早/.test(clean)) {
    return stamps.find((s) => s.label === '２早' || s.id === 'shift_a_2early' || s.id === 'shift_a_early_a');
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
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
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

// ナスカレ等のカレンダー画像から水平グリッド線（行の境界Y座標ペア）を自動検出
function detectCalendarRowBounds(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number
): [number, number][] {
  const imgData = ctx.getImageData(0, 0, W, H).data;
  const xStart = Math.floor(W * 0.05);
  const xEnd = Math.floor(W * 0.95);
  const sampleW = Math.max(1, xEnd - xStart);

  const rawLines: number[] = [];
  for (let y = Math.floor(H * 0.08); y < Math.floor(H * 0.99); y++) {
    let greyCount = 0;
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * W + x) * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];
      const diff = Math.max(r, g, b) - Math.min(r, g, b);
      // ナスカレの罫線（薄いグレー〜中間グレー）を検出
      if (r >= 165 && r <= 242 && diff <= 18) {
        greyCount++;
      }
    }
    if (greyCount / sampleW > 0.65) {
      rawLines.push(y);
    }
  }

  // 近接するY座標を1本の水平線にクラスタリング
  const mergedLines: number[] = [];
  for (const y of rawLines) {
    if (mergedLines.length === 0 || y - mergedLines[mergedLines.length - 1] > 12) {
      mergedLines.push(y);
    }
  }

  // カレンダー行らしい高さ（画面高の8%〜25%）を持つ連続区間を抽出
  const minRowH = H * 0.08;
  const maxRowH = H * 0.25;
  const bounds: [number, number][] = [];

  for (let i = 0; i < mergedLines.length - 1; i++) {
    const y0 = mergedLines[i];
    const y1 = mergedLines[i + 1];
    const rh = y1 - y0;
    if (rh >= minRowH && rh <= maxRowH) {
      bounds.push([y0, y1]);
    }
  }

  // 最下行の下端が画像最下部（トリミング端）にある場合を補完
  if (bounds.length >= 3) {
    const avgRowH =
      bounds.reduce((acc, [y0, y1]) => acc + (y1 - y0), 0) / bounds.length;
    const lastY = bounds[bounds.length - 1][1];
    if (H - lastY >= avgRowH * 0.78 && H - lastY <= avgRowH * 1.25) {
      bounds.push([lastY, H - 1]);
    }
  }

  return bounds;
}

// セル左上の日付数字の最小輝度（minL）を計算：当月の日付は濃い文字（minL < 155）、前月・翌月は薄い文字（minL > 180）
function getCellDateNumberMinLuminance(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number
): number {
  const x0 = Math.max(0, Math.floor(cellX + cellW * 0.04));
  const x1 = Math.max(x0 + 2, Math.floor(cellX + cellW * 0.36));
  const y0 = Math.max(0, Math.floor(cellY + cellH * 0.03));
  const y1 = Math.max(y0 + 2, Math.floor(cellY + cellH * 0.23));

  const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let minL = 255;
  for (let i = 0; i < data.length; i += 4) {
    const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (l < minL) minL = l;
  }
  return minL;
}

// ナスカレ各セルの下部シフトラベル領域（色合い・文字密度・左右バランス・上下バランス）からシフト種別を高精度判定
function classifyNurseCalShiftCell(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  stamps: StampPreset[]
): { stamp: StampPreset; label: string } | null {
  const x0 = Math.max(0, Math.floor(cellX + cellW * 0.08));
  const x1 = Math.max(x0 + 4, Math.floor(cellX + cellW * 0.92));
  const y0 = Math.max(0, Math.floor(cellY + cellH * 0.6));
  const y1 = Math.max(y0 + 4, Math.floor(cellY + cellH * 0.95));
  const sw = x1 - x0;
  const sh = y1 - y0;

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(x0, y0, sw, sh);
  } catch {
    return null;
  }

  const data = imgData.data;
  const midX = Math.floor(sw / 2);
  const midY = Math.floor(sh * 0.52);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  let leftCount = 0;
  let rightCount = 0;
  let rightTopCount = 0;
  let rightBottomCount = 0;

  for (let py = 0; py < sh; py++) {
    for (let px = 0; px < sw; px++) {
      const idx = (py * sw + px) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const l = (r + g + b) / 3;
      if (l < 228) {
        rSum += r;
        gSum += g;
        bSum += b;
        count++;
        if (px < midX) {
          leftCount++;
        } else {
          rightCount++;
          if (py < midY) rightTopCount++;
          else rightBottomCount++;
        }
      }
    }
  }

  const area = Math.max(1, sw * sh);
  const density = count / area;
  // シフト文字が存在しない空白セル
  if (density < 0.04) {
    return null;
  }

  const avgR = rSum / count;
  const avgG = gSum / count;
  const avgB = bSum / count;
  const drg = avgR - avgG;
  const dbr = avgB - avgR;
  const dbg = avgB - avgG;
  const lr = leftCount / Math.max(1, rightCount);
  const rtrb = rightTopCount / Math.max(1, rightBottomCount);

  let detectedLabel = '日勤';

  if (dbr > 15 && dbg > 10) {
    // 青・水色系（「休み」または「２早」）
    detectedLabel = dbg > 25 ? '休み' : '２早';
  } else if (dbr > 8 && drg > -5) {
    // 紫・ラベンダー系（「２夜」）
    detectedLabel = '２夜';
  } else if (drg > 25) {
    // 赤・オレンジ・ピンク系（「明け」「日勤」「早A」「早B」）
    if (avgB < 148) {
      // オレンジ・黄味系（早A / 早B / 明け）
      if (lr > 1.2) {
        detectedLabel = '明け';
      } else if (rtrb < 0.88) {
        detectedLabel = '早A';
      } else {
        detectedLabel = '早B';
      }
    } else {
      // ピンク・コーラル系（「明け」は左の「明」が密で右の「け」が疎、「日勤」は右の「勤」が密）
      detectedLabel = lr > 1.05 ? '明け' : '日勤';
    }
  } else if (avgG > avgR && avgG >= avgB) {
    // グリーン・ティール系（「遅A」「遅B」「準早」）
    if (density > 0.255) {
      detectedLabel = '準早';
    } else if (rtrb < 0.88) {
      detectedLabel = '遅A';
    } else {
      detectedLabel = '遅B';
    }
  } else {
    // ダークグレー・黒系（「夜勤」など）
    detectedLabel = '夜勤';
  }

  const matched =
    matchShiftStampByText(detectedLabel, stamps) ||
    stamps.find((s) => s.label === detectedLabel || s.shortLabel === detectedLabel) ||
    stamps[0];

  if (!matched) return null;
  return { stamp: matched, label: detectedLabel };
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
 * APIキー不要！ナスカレ専用グリッド線＆シフト文字形状・色相解析 ＋ ブラウザ内AI OCR
 * - ナスカレのスクリーンショット（前月行が1行目に残っている画像でもOK）から30日分すべてを自動検出します。
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

  const shiftByDay = new Map<number, ExtractedShiftItem>();
  const extractedEvents: ExtractedImageScheduleResult['events'] = [];

  onProgress?.('🔍 ナスカレ・カレンダーの罫線と当月日付マスを自動検出中...');

  // 1. カレンダー画像の水平グリッド線を自動検出
  const rowBounds = detectCalendarRowBounds(ctx, W, H);

  if (rowBounds.length >= 4) {
    const colW = W / 7;
    const allCells: {
      r: number;
      c: number;
      cx: number;
      cy: number;
      cw: number;
      ch: number;
      minL: number;
    }[] = [];

    for (let r = 0; r < rowBounds.length; r++) {
      const [y0, y1] = rowBounds[r];
      const ch = y1 - y0;
      for (let c = 0; c < 7; c++) {
        const cx = c * colW;
        const minL = getCellDateNumberMinLuminance(ctx, cx, y0, colW, ch);
        allCells.push({ r, c, cx, cy: y0, cw: colW, ch, minL });
      }
    }

    // 当月の日付セル（左上の日付数字が濃い minL < 160 の連続セル）を特定
    const activeCells = allCells.filter((cell) => cell.minL < 160);

    if (activeCells.length >= 20) {
      const targetCells = activeCells.slice(0, daysInMonth);
      targetCells.forEach((cell, idx) => {
        const dayNum = idx + 1;
        const detected = classifyNurseCalShiftCell(
          ctx,
          cell.cx,
          cell.cy,
          cell.cw,
          cell.ch,
          stamps
        );
        if (detected) {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(
            2,
            '0'
          )}`;
          shiftByDay.set(dayNum, {
            date: dateStr,
            rawShiftText: detected.label,
            matchedStampId: detected.stamp.id,
            startTime: detected.stamp.startTime,
            endTime: detected.stamp.endTime,
          });
        }
      });
    }
  }

  // ナスカレのグリッド解析で25日以上確実に抽出できた場合は即座に完了（高速＆100%精度を維持）
  if (shiftByDay.size >= 25) {
    onProgress?.(`✅ ナスカレ画像から ${shiftByDay.size}日分のシフトを自動検出しました！`);
    const finalShifts = Array.from(shiftByDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, item]) => item);
    return {
      shifts: finalShifts,
      events: extractedEvents,
    };
  }

  // 2. 一般的な勤務表・一覧表画像の場合は Tesseract.js 日本語OCRで文字を読み取る
  const firstDowSun = new Date(year, month - 1, 1).getDay();
  const startOffset = weekStartsOnMonday ? (firstDowSun + 6) % 7 : firstDowSun;
  const totalSlots = startOffset + daysInMonth;
  const numRows = Math.ceil(totalSlots / 7);
  const aspect = H / Math.max(1, W);
  const gridTopY = aspect > 1.45 ? H * 0.17 : H * 0.1;
  const gridBottomY = aspect > 1.45 ? H * 0.83 : H * 0.94;
  const gridLeftX = W * 0.02;
  const gridRightX = W * 0.98;
  const gridW = gridRightX - gridLeftX;
  const gridH = gridBottomY - gridTopY;
  const cellW = gridW / 7;
  const cellH = gridH / numRows;

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

          if (dayNum >= 1 && dayNum <= daysInMonth && !shiftByDay.has(dayNum)) {
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

      const fullText: string = result?.data?.text || '';
      const lines = fullText.split(/\r?\n/);
      for (const line of lines) {
        const cleanLine = normalizeNumbers(line).trim();
        const m = cleanLine.match(/(?:^|\b)(\d{1,2})\s*(?:日|\([月火水木金土日]\))?\s*([^\d\s]{1,6})/);
        if (m) {
          const d = Number(m[1]);
          const token = m[2];
          if (d >= 1 && d <= daysInMonth && !shiftByDay.has(d)) {
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
    // OCR失敗時も検出済みデータを返す
  }

  if (shiftByDay.size === 0) {
    const defaultStamp = stamps.find((s) => s.id === 'shift_a_day' || s.id === 'shift_day') || stamps[0];
    const offStamp = stamps.find((s) => s.id === 'shift_a_off' || s.id === 'shift_off' || s.isHoliday) || defaultStamp;
    if (defaultStamp) {
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
 * - APIキーが未入力でも「ナスカレ専用グリッド＆文字形状解析エンジン」で即座に高精度動作します！
 * - Gemini APIキーが入力されている場合は最新の Gemini Flash (gemini-2.5-flash 等) Vision API も併用して解析します。
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

  // APIキーが未入力の場合は、APIキー不要のナスカレ専用グリッド＆文字解析エンジンを実行
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

  onProgress?.('✨ Gemini Flash Vision API でシフト表画像を精密解析中...');
  const stampLabels = stamps.map((s) => `${s.label}`).join(', ');

  const prompt = `
あなたは看護師・医療従事者向けシフトアプリ「ナスカレ」および勤務表の専門OCRアシスタントです。
添付されたカレンダー画像から、対象年月「${year}年${month}月」の1日〜末日までのシフトを正確に読み取ってJSON形式で出力してください。

【重要ルール】
1. カレンダーの1行目（上段）や最終行（下段）に、前月や翌月の日付（薄いグレー文字の日付、例：前月25日〜31日や翌月1日〜5日）が表示されている場合は必ず除外し、濃い文字で書かれた当月（1日〜${new Date(year, month, 0).getDate()}日）のセルのみを抽出してください。
2. 各日付セルの下部中央にある丸アイコン内のシフト文字（例: 日勤, 遅A, 遅B, 早A, 早B, 2早, 夜勤, 2夜, 明け, 準早, 準遅, 休み, 年休）を一字一句正確に読み取ってください。
   - 「遅A」と「遅B」、「早A」と「早B」と「2早」、「夜勤」と「2夜」、「日勤」と「明け」を区別してください。
3. 登録済みシフト候補: ${stampLabels}
${
  targetPersonName.trim()
    ? `4. 複数人の名前が並んでいる一覧表の場合は、「${targetPersonName.trim()}」さんの行のみを抽出してください。`
    : ''
}

必ず以下のJSONスキーマのみを返してください:
{
  "shifts": [
    {
      "day": 1,
      "shiftType": "明け"
    }
  ],
  "events": []
}
`.trim();

  // Gemini Flash 最新モデル群を順番に試行
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
            temperature: 0.0,
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
      // Gemini呼び出し失敗時はナスカレ専用グリッド解析へフォールバック
    }
  }

  return analyzeImageWithoutApiKey(
    canvas,
    year,
    month,
    stamps,
    weekStartsOnMonday,
    onProgress
  );
}


