import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Copy,
  Check,
  ExternalLink,
  Calendar,
  Sparkles,
  Heart,
  Maximize2,
} from 'lucide-react';
import {
  CalendarDataStore,
  StampPreset,
} from '../types/calendar';
import { CATEGORY_MAP, getJapaneseHoliday } from '../utils/presets';

interface WidgetCompactViewProps {
  store: CalendarDataStore;
  matchedHolidaysCount: number;
  onExitWidgetMode: () => void;
  onSelectDateInFullCalendar: (dateStr: string) => void;
}

// 今日から n 日間の日付配列を生成
function getUpcomingDates(daysCount = 5): {
  dateStr: string;
  label: string;
  subLabel: string;
  dayOfWeek: number;
  holidayName: string | null;
}[] {
  const now = new Date();
  const list = [];
  const weekNames = ['日', '月', '火', '水', '木', '金', '土'];

  for (let i = 0; i < daysCount; i++) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    const d = dt.getDate();
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const w = weekNames[dt.getDay()];
    const rel = i === 0 ? '今日' : i === 1 ? '明日' : i === 2 ? '明後日' : `${m}/${d}`;
    list.push({
      dateStr,
      label: `${m}/${d}(${w})`,
      subLabel: rel,
      dayOfWeek: dt.getDay(),
      holidayName: getJapaneseHoliday(dateStr),
    });
  }
  return list;
}

/**
 * スマホのホーム画面ウィジェット用コンパクトビュー（?widget=1 またはアプリ内ウィジェットモード）
 * 今日〜5日間の「2人のシフト並列＋予定＋すれ違い目印」を一目で確認できます。
 */
export const WidgetCompactView: React.FC<WidgetCompactViewProps> = ({
  store,
  matchedHolidaysCount,
  onExitWidgetMode,
  onSelectDateInFullCalendar,
}) => {
  const upcoming = getUpcomingDates(5);
  const stampMap = new Map<string, StampPreset>();
  for (const s of store.stamps) stampMap.set(s.id, s);

  const partnerA = store.metadata.partners.partnerA;
  const partnerB = store.metadata.partners.partnerB;

  return (
    <div className="min-h-screen bg-[#FFFBF7] p-3 flex flex-col justify-between max-w-md mx-auto">
      <div className="bg-white rounded-3xl shadow-lg border-2 border-[#FFE5EC] p-3.5 space-y-2.5">
        {/* ウィジェットヘッダー */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-base">🐻💕🐰</span>
            <span className="font-extrabold text-sm text-stone-800">ふたりカレ</span>
            <span className="px-2 py-0.5 rounded-full bg-[#FFE5EC] text-[#D63864] text-[10px] font-extrabold flex items-center gap-0.5">
              <Heart className="w-2.5 h-2.5 fill-[#FF8FAB] text-[#FF8FAB]" />
              今月一致 {matchedHolidaysCount}日
            </span>
          </div>

          <button
            type="button"
            onClick={onExitWidgetMode}
            className="px-2.5 py-1 rounded-xl bg-stone-800 text-white text-[11px] font-extrabold flex items-center gap-1 shadow-xs"
          >
            <Maximize2 className="w-3 h-3" />
            <span>月間カレンダーを開く</span>
          </button>
        </div>

        {/* 今日〜5日間の2人並列シフト＆予定リスト */}
        <div className="space-y-2">
          {upcoming.map((day, idx) => {
            const sA = store.shifts[`${day.dateStr}_partnerA`];
            const sB = store.shifts[`${day.dateStr}_partnerB`];
            const shiftA = sA && !sA.deletedAt ? sA : undefined;
            const shiftB = sB && !sB.deletedAt ? sB : undefined;
            const stampA = shiftA ? stampMap.get(shiftA.stampId) : undefined;
            const stampB = shiftB ? stampMap.get(shiftB.stampId) : undefined;

            const events = Object.values(store.events)
              .filter((e) => !e.deletedAt && e.date === day.dateStr)
              .sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));

            const supports = store.daySupports?.[day.dateStr]?.badges || [];

            return (
              <div
                key={day.dateStr}
                onClick={() => onSelectDateInFullCalendar(day.dateStr)}
                className={`rounded-2xl p-2.5 border transition-all cursor-pointer ${
                  idx === 0
                    ? 'bg-[#FFF9FB] border-[#FF8FAB] shadow-xs'
                    : 'bg-[#FFFBF7] border-stone-200/80 hover:border-[#FF8FAB]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* 左：日付ラベル */}
                  <div className="flex items-center gap-1.5 min-w-[88px]">
                    <span
                      className={`px-1.5 py-0.5 rounded-lg text-[10px] font-extrabold ${
                        idx === 0
                          ? 'bg-[#FF8FAB] text-white'
                          : 'bg-stone-200/70 text-stone-600'
                      }`}
                    >
                      {day.subLabel}
                    </span>
                    <span
                      className={`text-xs font-extrabold ${
                        day.dayOfWeek === 0 || day.holidayName
                          ? 'text-rose-500'
                          : day.dayOfWeek === 6
                          ? 'text-sky-600'
                          : 'text-stone-800'
                      }`}
                    >
                      {day.label}
                    </span>
                  </div>

                  {/* 右：2人のシフト並列バッジ */}
                  <div className="grid grid-cols-2 gap-1.5 flex-1 max-w-[210px]">
                    <div
                      style={
                        stampA
                          ? { backgroundColor: stampA.color, color: stampA.textColor }
                          : undefined
                      }
                      className={`px-2 py-1 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 truncate ${
                        stampA ? '' : 'bg-stone-100 text-stone-400'
                      }`}
                    >
                      <span>{partnerA.avatar}</span>
                      <span>{stampA ? `${stampA.icon || ''}${stampA.label}` : '未定'}</span>
                    </div>

                    <div
                      style={
                        stampB
                          ? { backgroundColor: stampB.color, color: stampB.textColor }
                          : undefined
                      }
                      className={`px-2 py-1 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 truncate ${
                        stampB ? '' : 'bg-stone-100 text-stone-400'
                      }`}
                    >
                      <span>{partnerB.avatar}</span>
                      <span>{stampB ? `${stampB.icon || ''}${stampB.label}` : '未定'}</span>
                    </div>
                  </div>
                </div>

                {/* 予定＆すれ違いサポートがあれば下段に表示 */}
                {(events.length > 0 || supports.length > 0) && (
                  <div className="mt-1.5 pt-1.5 border-t border-stone-200/50 flex flex-wrap items-center gap-1">
                    {supports.map((b) => (
                      <span
                        key={b}
                        className="px-1.5 py-0.5 rounded-md bg-[#FFF6D6] text-[#8A5A00] text-[10px] font-extrabold"
                      >
                        {b}
                      </span>
                    ))}
                    {events.map((ev) => {
                      const cat = CATEGORY_MAP[ev.categoryId] || CATEGORY_MAP.shared;
                      return (
                        <span
                          key={ev.id}
                          style={{ backgroundColor: cat.bgColor, color: cat.textColor }}
                          className="px-2 py-0.5 rounded-md text-[10px] font-extrabold truncate max-w-full"
                        >
                          {ev.startTime ? `${ev.startTime} ` : ''}
                          {ev.title}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface WidgetGuideModalProps {
  store: CalendarDataStore;
  onClose: () => void;
  onOpenWidgetPreview: () => void;
}

export const WidgetGuideModal: React.FC<WidgetGuideModalProps> = ({
  store,
  onClose,
  onOpenWidgetPreview,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedScriptable, setCopiedScriptable] = useState(false);

  const widgetUrl = `${window.location.origin}${window.location.pathname}?widget=1`;

  // iPhone Scriptableアプリ用のネイティブウィジェットコードを自動生成
  const generateScriptableCode = () => {
    const upcoming = getUpcomingDates(3);
    const stampMap = new Map<string, StampPreset>();
    for (const s of store.stamps) stampMap.set(s.id, s);

    const pA = store.metadata.partners.partnerA;
    const pB = store.metadata.partners.partnerB;

    const summaryRows = upcoming.map((d) => {
      const sA = store.shifts[`${d.dateStr}_partnerA`];
      const sB = store.shifts[`${d.dateStr}_partnerB`];
      const stA = sA && !sA.deletedAt ? stampMap.get(sA.stampId) : undefined;
      const stB = sB && !sB.deletedAt ? stampMap.get(sB.stampId) : undefined;
      const evs = Object.values(store.events)
        .filter((e) => !e.deletedAt && e.date === d.dateStr)
        .map((e) => e.title)
        .join(' / ');
      return {
        day: `${d.subLabel} ${d.label}`,
        shiftA: `${pA.avatar}${stA ? stA.label : '-'}`,
        shiftB: `${pB.avatar}${stB ? stB.label : '-'}`,
        events: evs || '予定なし',
      };
    });

    return `// ふたりカレ (FutariCal) iPhone ホーム画面ウィジェット用スクリプト (Scriptable用)
const APP_URL = "${window.location.origin}${window.location.pathname}";
const DAYS = ${JSON.stringify(summaryRows, null, 2)};

let w = new ListWidget();
w.backgroundColor = new Color("#FFFBF7");
w.url = APP_URL;
w.setPadding(12, 14, 12, 14);

let header = w.addStack();
let title = header.addText("🐻💕🐰 ふたりカレ");
title.font = Font.boldRoundedSystemFont(13);
title.textColor = new Color("#9E2A47");
w.addSpacer(6);

for (const item of DAYS) {
  let row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  
  let dTxt = row.addText(item.day + "  ");
  dTxt.font = Font.boldRoundedSystemFont(11);
  dTxt.textColor = new Color("#44403C");
  
  let sTxt = row.addText(item.shiftA + " | " + item.shiftB);
  sTxt.font = Font.boldRoundedSystemFont(11);
  sTxt.textColor = new Color("#D63864");
  w.addSpacer(2);

  if (item.events !== "予定なし") {
    let eTxt = w.addText("  📅 " + item.events);
    eTxt.font = Font.mediumRoundedSystemFont(10);
    eTxt.textColor = new Color("#6638A6");
    eTxt.lineLimit = 1;
  }
  w.addSpacer(4);
}

Script.setWidget(w);
Script.complete();
w.presentMedium();`;
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
        <div className="bg-white px-4 py-3.5 border-b border-[#FFE5EC] flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-stone-800 flex items-center gap-1.5">
              <Smartphone className="w-5 h-5 text-[#FF8FAB]" />
              <span>iPhone / Android ウィジェット設定</span>
            </h2>
            <p className="text-[11px] text-stone-400">
              スマホのホーム画面に2人のシフト＆予定を常時表示する方法
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

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* 1. ウィジェット専用コンパクト画面のプレビュー＆URL */}
          <div className="bg-white rounded-2xl p-4 border-2 border-[#FFE5EC] space-y-2.5 shadow-2xs">
            <div className="font-extrabold text-sm text-[#9E2A47] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#FF8FAB]" />
              <span>① ウィジェット専用コンパクト画面（Android / iPhone 共通）</span>
            </div>
            <p className="text-stone-600 leading-relaxed">
              「今日・明日・明後日の2人のシフトと予定」だけをカード表示する専用URL（`?widget=1`）を搭載しています。
              Androidの「Web Widget」アプリ等にこのURLを設定すると、ホーム画面にそのまま常時表示できます！
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={onOpenWidgetPreview}
                className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>ウィジェット画面を今すぐ表示</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(widgetUrl);
                  setCopiedUrl(true);
                  setTimeout(() => setCopiedUrl(false), 2000);
                }}
                className="py-2.5 px-3 rounded-xl bg-[#FFFBF7] hover:bg-[#FFE5EC] border border-[#FFC2D1] text-[#9E2A47] font-extrabold text-xs flex items-center gap-1"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'URLコピー済!' : '専用URLをコピー'}</span>
              </button>
            </div>
          </div>

          {/* 2. iPhone (iOS) ホーム画面ウィジェット (Scriptable連携) */}
          <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-2.5 shadow-2xs">
            <div className="font-extrabold text-sm text-[#59318F] flex items-center gap-1.5">
              <span>🍎</span>
              <span>② iPhone ホーム画面ウィジェット（Scriptable用コード自動生成）</span>
            </div>
            <p className="text-stone-600 leading-relaxed">
              iPhoneの無料定番アプリ「Scriptable」に以下の自動生成コードを貼り付けるだけで、iPhoneのホーム画面に本物のネイティブウィジェットとして2人のシフト＆予定を表示できます（タップするとふたりカレが開きます）。
            </p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(generateScriptableCode());
                setCopiedScriptable(true);
                setTimeout(() => setCopiedScriptable(false), 2500);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-[#F3EAFF] hover:bg-[#B388EB] text-[#59318F] hover:text-white font-extrabold text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              {copiedScriptable ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>
                {copiedScriptable
                  ? '✅ iPhone Scriptable用コードをコピーしました！'
                  : '📋 iPhone用ウィジェットコードをワンタップでコピー'}
              </span>
            </button>
          </div>

          {/* 3. スマホのホーム画面にアプリアイコン追加 ＆ 標準カレンダーウィジェット連携 */}
          <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-2 shadow-2xs">
            <div className="font-extrabold text-sm text-[#136370] flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#56CFE1]" />
              <span>③ ホーム画面アプリ化（PWA）＆ 標準カレンダーウィジェット連携</span>
            </div>
            <ul className="space-y-1.5 text-stone-600 list-disc pl-4 leading-relaxed">
              <li>
                <strong>iPhone (Safari)</strong>：画面下の「共有ボタン（四角から上矢印）」➔ <strong>「ホーム画面に追加」</strong> で可愛いアプリアイコンとして1タップ起動できます。
              </li>
              <li>
                <strong>Android (Chrome)</strong>：右上のメニュー「⋮」➔ <strong>「ホーム画面に追加（アプリをインストール）」</strong> でホーム画面に配置できます。
              </li>
              <li>
                <strong>iPhone / Android 標準カレンダーウィジェットに表示したい場合</strong>：「設定・同期」➔「.icsエクスポート」を押すと、スマホ標準カレンダーのウィジェットに2人のシフトを表示できます。
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
