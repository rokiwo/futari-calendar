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

  // キーワードによる柔軟マッチング（ナスカレ・病院・一般シフト表の略称に完全対応）
  if (/^(日勤|日|A|D|日1|日2)$/i.test(clean) || clean.includes('日勤')) {
    return stamps.find((s) => s.id === 'shift_day' || s.label.includes('日勤')) || stamps[0];
  }
  if (/^(夜勤|夜|深|深夜|N|入り|夜入)$/i.test(clean) || clean.includes('夜勤') || clean.includes('深夜')) {
    return stamps.find((s) => s.id === 'shift_night' || s.label.includes('夜勤'));
  }
  if (/^(準夜|準|J|夕)$/i.test(clean) || clean.includes('準夜')) {
    return stamps.find((s) => s.id === 'shift_semi_night' || s.label.includes('準夜'));
  }
  if (/^(早番|早|早出|E)$/i.test(clean) || clean.includes('早')) {
    return stamps.find((s) => s.id === 'shift_early' || s.label.includes('早'));
  }
  if (/^(遅番|遅|遅出|L)$/i.test(clean) || clean.includes('遅')) {
    return stamps.find((s) => s.id === 'shift_late' || s.label.includes('遅'));
  }
  if (/^(有休|有給|有|年休|夏休|特休)$/i.test(clean) || clean.includes('有休') || clean.includes('有給')) {
    return stamps.find((s) => s.id === 'shift_paid' || s.label.includes('有休'));
  }
  if (/^(明|明け|明休|／|\/)$/i.test(clean) || clean.includes('明')) {
    return stamps.find((s) => s.id === 'shift_ake' || s.label.includes('明'));
  }
  if (/^(在宅|テレワーク|リモ)$/i.test(clean) || clean.includes('在宅')) {
    return stamps.find((s) => s.id === 'shift_remote' || s.label.includes('在宅'));
  }
  if (/^(出張|外勤)$/i.test(clean) || clean.includes('出張')) {
    return stamps.find((s) => s.id === 'shift_trip' || s.label.includes('出張'));
  }
  if (/^(休み|休|公休|公|週休|代休|振休|×|〇|○)$/i.test(clean) || clean.includes('休')) {
    return stamps.find((s) => s.id === 'shift_off' || s.isHoliday);
  }

  // 部分一致フォールバック
  return stamps.find(
    (s) => clean.includes(s.label) || s.label.includes(clean)
  );
}

// ファイルを Base64 Data URL から { mimeType, base64Data } に変換
async function fileToBase64Parts(file: File): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(',');
      const mimeMatch = header.match(/data:(.*?);base64/);
      resolve({
        mimeType: mimeMatch ? mimeMatch[1] : file.type || 'image/jpeg',
        data: base64,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Gemini Vision API を使用してシフト表の画像（紙の勤務表写真・ナスカレのスクリーンショット等）から
 * 1ヶ月分のシフトと予定を自動抽出します。
 */
export async function analyzeShiftImageWithGemini(
  file: File,
  apiKey: string,
  year: number,
  month: number,
  targetPersonName: string,
  stamps: StampPreset[]
): Promise<ExtractedImageScheduleResult> {
  if (!apiKey.trim()) {
    throw new Error('Gemini APIキーを入力してください🔑（Google AI Studioで無料取得可能）');
  }

  const { mimeType, data } = await fileToBase64Parts(file);
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
  let lastError = '';

  for (const modelName of modelsToTry) {
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
                  data,
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
      lastError = `Gemini API エラー (${res.status}): ${await res.text()}`;
      continue;
    }

    const json = await res.json();
    const rawText =
      json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanedJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleanedJson) as {
      shifts?: { day: number; shiftType: string; startTime?: string; endTime?: string }[];
      events?: { day: number; title: string; startTime?: string; endTime?: string; isAllDay?: boolean }[];
    };

    const daysInMonth = new Date(year, month, 0).getDate();
    const extractedShifts: ExtractedShiftItem[] = [];

    for (const item of parsed.shifts || []) {
      const d = Number(item.day);
      if (!d || d < 1 || d > daysInMonth || !item.shiftType) continue;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
        date: `${year}-${String(month).padStart(2, '0')}-${String(Number(ev.day)).padStart(2, '0')}`,
        title: ev.title,
        startTime: ev.startTime,
        endTime: ev.endTime,
        isAllDay: ev.isAllDay ?? !ev.startTime,
      }));

    return {
      shifts: extractedShifts,
      events: extractedEvents,
    };
  }

  throw new Error(lastError || '画像の解析に失敗しました。APIキーや画像をご確認ください。');
}
