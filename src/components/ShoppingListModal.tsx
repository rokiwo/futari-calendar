import React, { useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  X,
  RefreshCw,
  Mic,
  MicOff,
  ShoppingCart,
  RotateCcw,
  Sparkles,
  Pencil,
  Check,
} from 'lucide-react';
import {
  CoupleMetadata,
  PartnerId,
  ScheduleEvent,
} from '../types/calendar';
import { getLocalTodayStr, isEventVisibleToPartner } from '../utils/presets';

interface ShoppingListModalProps {
  events: Record<string, ScheduleEvent>;
  activePartner: PartnerId;
  metadata: CoupleMetadata;
  onClose: () => void;
  onSaveEvent: (ev: ScheduleEvent) => void;
  onSaveEvents: (evs: ScheduleEvent[]) => void;
  onDeleteEvent: (id: string) => void;
  onClearBoughtItems: (ids: string[]) => void;
  onToggleTaskComplete: (id: string) => void;
  onSyncGoogleTasks?: () => void;
  onOpenTaskManager?: () => void;
  isSyncing?: boolean;
}

type ShoppingCategory = 'food' | 'daily' | 'other';
type FilterCategory = 'all' | ShoppingCategory;

const CATEGORY_DEFS: {
  id: ShoppingCategory;
  label: string;
  shortLabel: string;
  icon: string;
  badgeClass: string;
}[] = [
  {
    id: 'food',
    label: '🥦 食材・スーパー',
    shortLabel: '食材',
    icon: '🥦',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    id: 'daily',
    label: '🧻 日用品・ドラッグ',
    shortLabel: '日用品',
    icon: '🧻',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    id: 'other',
    label: '🎁 ほしい物・その他',
    shortLabel: 'ほしい物',
    icon: '🎁',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
];

const QUICK_PRESET_ITEMS: { label: string; category: ShoppingCategory; icon: string }[] = [
  { label: '牛乳', category: 'food', icon: '🥛' },
  { label: '卵', category: 'food', icon: '🥚' },
  { label: 'パン', category: 'food', icon: '🍞' },
  { label: 'お米', category: 'food', icon: '🍚' },
  { label: '納豆・豆腐', category: 'food', icon: '🫘' },
  { label: '野菜', category: 'food', icon: '🥬' },
  { label: 'お肉', category: 'food', icon: '🥩' },
  { label: '飲み物・お茶', category: 'food', icon: '🍵' },
  { label: 'トイレットペーパー', category: 'daily', icon: '🧻' },
  { label: 'ティッシュ', category: 'daily', icon: '🤧' },
  { label: '洗濯洗剤', category: 'daily', icon: '🧺' },
  { label: '食器用洗剤', category: 'daily', icon: '🫧' },
  { label: 'シャンプー・石鹸', category: 'daily', icon: '🧴' },
  { label: 'ゴミ袋', category: 'daily', icon: '🗑️' },
  { label: 'ラップ・ホイル', category: 'daily', icon: '📦' },
  { label: '電池', category: 'other', icon: '🔋' },
];

function inferShoppingCategory(title: string, fallback: ShoppingCategory): ShoppingCategory {
  if (/牛乳|卵|たまご|パン|米|お米|肉|魚|野菜|玉ねぎ|にんじん|キャベツ|レタス|トマト|納豆|豆腐|チーズ|バター|ヨーグルト|お茶|水|コーヒー|ビール|調味料|醤油|マヨネーズ|冷凍|お菓子/.test(title)) {
    return 'food';
  }
  if (/ペーパー|ティッシュ|洗剤|シャンプー|リンス|ボディソープ|石鹸|歯磨き|歯ブラシ|ゴミ袋|ラップ|ホイル|スポンジ|柔軟剤|漂白剤|オムツ|おむつ|薬|マスク/.test(title)) {
    return 'daily';
  }
  return fallback;
}

export const ShoppingListModal: React.FC<ShoppingListModalProps> = ({
  events,
  activePartner,
  metadata,
  onClose,
  onSaveEvent,
  onSaveEvents,
  onDeleteEvent,
  onClearBoughtItems,
  onToggleTaskComplete,
  onSyncGoogleTasks,
  onOpenTaskManager,
  isSyncing = false,
}) => {
  const [inputTitle, setInputTitle] = useState('');
  const [inputMemo, setInputMemo] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ShoppingCategory>('food');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [isListening, setIsListening] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editCat, setEditCat] = useState<ShoppingCategory>('food');

  const recognitionRef = useRef<any>(null);

  const shoppingItems = useMemo(() => {
    return Object.values(events)
      .filter(
        (ev) =>
          ev &&
          !ev.deletedAt &&
          Boolean(ev.isShoppingItem) &&
          isEventVisibleToPartner(ev, activePartner)
      )
      .sort(
        (a, b) =>
          Number(Boolean(a.isCompleted)) - Number(Boolean(b.isCompleted)) ||
          (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
      );
  }, [activePartner, events]);

  const filteredItems = useMemo(() => {
    if (filterCategory === 'all') return shoppingItems;
    return shoppingItems.filter(
      (item) => (item.shoppingCategory || inferShoppingCategory(item.title, 'food')) === filterCategory
    );
  }, [filterCategory, shoppingItems]);

  const unboughtItems = useMemo(
    () => filteredItems.filter((item) => !item.isCompleted),
    [filteredItems]
  );
  const boughtItems = useMemo(
    () => filteredItems.filter((item) => Boolean(item.isCompleted)),
    [filteredItems]
  );

  const handleAddItemsFromText = (rawText: string, memoText = '', forceCategory?: ShoppingCategory) => {
    const cleaned = rawText
      .replace(/^(?:買い物(?:リスト)?|買う(?:もの)?|購入)[:：\s・]*/i, '')
      .trim();
    if (!cleaned) return;

    // 「、」「,」「／」「改行」または「牛乳と卵」などで分割してまとめて登録可能
    const parts = cleaned
      .split(/[、,，／/\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length === 0) return;

    const nowIso = new Date().toISOString();
    const todayStr = getLocalTodayStr();
    const toSave: ScheduleEvent[] = [];

    for (let i = 0; i < parts.length; i++) {
      const itemTitle = parts[i];
      // すでに購入済み履歴に同じ名前のものがあれば未購入に戻して再利用
      const existingBought = shoppingItems.find(
        (it) => it.isCompleted && it.title.trim().toLowerCase() === itemTitle.toLowerCase()
      );
      if (existingBought) {
        toSave.push({
          ...existingBought,
          isCompleted: false,
          memo: memoText.trim() || existingBought.memo,
          shoppingCategory:
            forceCategory ||
            existingBought.shoppingCategory ||
            inferShoppingCategory(itemTitle, selectedCategory),
          updatedAt: nowIso,
        });
        continue;
      }

      // すでに未購入リストに同名がある場合はスキップ
      const existingUnbought = shoppingItems.find(
        (it) => !it.isCompleted && it.title.trim().toLowerCase() === itemTitle.toLowerCase()
      );
      if (existingUnbought) {
        if (memoText.trim() && existingUnbought.memo !== memoText.trim()) {
          toSave.push({
            ...existingUnbought,
            memo: memoText.trim(),
            updatedAt: nowIso,
          });
        }
        continue;
      }

      const cat = forceCategory || inferShoppingCategory(itemTitle, selectedCategory);
      toSave.push({
        id: `shop_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        date: todayStr,
        title: itemTitle,
        categoryId: 'shared',
        color: '#10B981',
        isAllDay: true,
        memo: memoText.trim() || undefined,
        isTask: true,
        isShoppingItem: true,
        shoppingCategory: cat,
        isCompleted: false,
        notifyTarget: 'both',
        createdBy: activePartner,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    if (toSave.length === 1) {
      onSaveEvent(toSave[0]);
    } else if (toSave.length > 1) {
      onSaveEvents(toSave);
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputTitle.trim()) return;
    handleAddItemsFromText(inputTitle, inputMemo);
    setInputTitle('');
    setInputMemo('');
  };

  const handleToggleVoiceInput = () => {
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('お使いのブラウザは音声入力に対応していません。キーボードのマイクボタンをご利用ください。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || '';
      if (transcript.trim()) {
        // 「牛乳と卵とパン」のような発話も読点に変換して一括追加しやすくする
        const normalized = transcript
          .trim()
          .replace(/\s+/g, '、')
          .replace(/(.{1,12}?)と(.{1,12})/g, '$1、$2');
        handleAddItemsFromText(normalized);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const startEditing = (item: ScheduleEvent) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditMemo(item.memo || '');
    setEditCat(item.shoppingCategory || inferShoppingCategory(item.title, 'food'));
  };

  const saveEdit = (item: ScheduleEvent) => {
    if (!editTitle.trim()) return;
    onSaveEvent({
      ...item,
      title: editTitle.trim(),
      memo: editMemo.trim() || undefined,
      shoppingCategory: editCat,
      updatedAt: new Date().toISOString(),
    });
    setEditingId(null);
  };

  const getCategoryBadge = (item: ScheduleEvent) => {
    const catId = item.shoppingCategory || inferShoppingCategory(item.title, 'food');
    return CATEGORY_DEFS.find((c) => c.id === catId) || CATEGORY_DEFS[0];
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-[#FFFBF7] w-full max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-emerald-300 max-h-[92vh] flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-500 to-[#34D399] text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingCart className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm sm:text-base font-black truncate">
                  🛒 ふたりの買い物・ほしい物リスト
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-white/25 text-white font-black text-[11px] shrink-0">
                  残り { shoppingItems.filter((i) => !i.isCompleted).length }件
                </span>
              </div>
              <p className="text-[10px] text-emerald-50 truncate">
                2人で共有 ＆ スマホのGemini・Google ToDoリストと自動連携✨
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenTaskManager && (
              <button
                type="button"
                onClick={onOpenTaskManager}
                className="px-2.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-extrabold text-[11px] flex items-center gap-1 transition-colors"
                title="個人タスクカレンダーへ切り替え"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>タスクへ</span>
              </button>
            )}
            {onSyncGoogleTasks && (
              <button
                type="button"
                onClick={onSyncGoogleTasks}
                disabled={isSyncing}
                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors"
                title="Google ToDoリストと今すぐ同期"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* メインコンテンツ */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 text-xs">
          {/* 1. サクサク追加フォーム（複数まとめ入力・音声追加対応） */}
          <form
            onSubmit={handleSubmitForm}
            className="bg-white rounded-2xl p-3 border-2 border-emerald-200 shadow-xs space-y-2.5"
          >
            {/* カテゴリ選択ピル */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {CATEGORY_DEFS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-xl font-extrabold text-[11px] border transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={inputTitle}
                onChange={(e) => setInputTitle(e.target.value)}
                placeholder="買うものを入力（例：牛乳、卵、洗剤 と続けて入力もOK）"
                className="flex-1 px-3 py-2.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold text-stone-800 text-xs sm:text-sm focus:outline-none focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={handleToggleVoiceInput}
                className={`p-2.5 rounded-xl font-extrabold flex items-center justify-center transition-all shrink-0 ${
                  isListening
                    ? 'bg-rose-500 text-white animate-pulse shadow-md'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                }`}
                title="声で買い物リストに追加"
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                type="submit"
                disabled={!inputTitle.trim()}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-xs sm:text-sm flex items-center gap-1 shadow-xs active:scale-95 transition-all shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>追加</span>
              </button>
            </div>

            <input
              type="text"
              value={inputMemo}
              onChange={(e) => setInputMemo(e.target.value)}
              placeholder="メモ・数量・お店など（任意：例 2本、業務スーパー）"
              className="w-full px-3 py-1.5 rounded-xl border border-stone-200/80 bg-stone-50/70 text-[11px] text-stone-700 focus:outline-none focus:border-emerald-300"
            />
          </form>

          {/* 2. よく買う定番アイテム ＆ Gemini音声連携ガイド（アコーディオン・デフォルト閉じ） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <details className="bg-white rounded-2xl border border-stone-200/90 overflow-hidden">
              <summary className="cursor-pointer px-3 py-2 font-extrabold text-stone-700 text-[11px] select-none hover:bg-stone-50">
                ⚡ よく買う定番を1タップ追加
              </summary>
              <div className="px-3 pb-3 pt-1.5 border-t border-stone-100 flex flex-wrap gap-1.5">
                {QUICK_PRESET_ITEMS.map((preset) => {
                  const alreadyUnbought = shoppingItems.some(
                    (it) => !it.isCompleted && it.title === preset.label
                  );
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={alreadyUnbought}
                      onClick={() => handleAddItemsFromText(preset.label, '', preset.category)}
                      className={`px-2.5 py-1 rounded-xl font-bold text-[11px] border flex items-center gap-1 transition-all ${
                        alreadyUnbought
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200 opacity-60'
                          : 'bg-[#FFFBF7] hover:bg-emerald-50 text-stone-700 border-stone-200 active:scale-95'
                      }`}
                    >
                      <span>{preset.icon}</span>
                      <span>{preset.label}</span>
                      {alreadyUnbought && <span className="text-[10px]">✓</span>}
                    </button>
                  );
                })}
              </div>
            </details>

            <details className="bg-gradient-to-r from-emerald-50/80 to-sky-50/80 rounded-2xl border border-emerald-200/80 overflow-hidden">
              <summary className="cursor-pointer px-3 py-2 font-extrabold text-emerald-900 text-[11px] select-none flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>スマホのGeminiから声で自動追加する方法</span>
              </summary>
              <div className="px-3 pb-3 pt-1.5 border-t border-emerald-200/60 text-[11px] text-stone-700 space-y-1 leading-relaxed">
                <p>
                  思いついたときにスマホの <strong>Gemini</strong> にこう話しかけてください：
                </p>
                <div className="p-2 rounded-xl bg-white border border-emerald-200 font-extrabold text-emerald-900 text-[11px]">
                  🗣️「ToDoリストに『買い物 牛乳』を追加して」
                  <br />
                  🗣️「『買う ティッシュ』をToDoリストに追加して」
                </div>
                <p className="text-[10px] text-stone-500">
                  ※先頭に「<strong>買い物</strong>」や「<strong>買う</strong>」が付いたToDo（またはカレンダー予定）は、自動的にこの買い物リストへ振り分けられます！
                </p>
              </div>
            </details>
          </div>

          {/* 3. カテゴリ絞り込みタブ */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1.5 rounded-xl font-extrabold text-[11px] shrink-0 transition-all ${
                filterCategory === 'all'
                  ? 'bg-stone-800 text-white shadow-2xs'
                  : 'bg-white text-stone-600 border border-stone-200'
              }`}
            >
              すべて ({shoppingItems.filter((i) => !i.isCompleted).length})
            </button>
            {CATEGORY_DEFS.map((cat) => {
              const count = shoppingItems.filter(
                (i) =>
                  !i.isCompleted &&
                  (i.shoppingCategory || inferShoppingCategory(i.title, 'food')) === cat.id
              ).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setFilterCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl font-extrabold text-[11px] shrink-0 transition-all ${
                    filterCategory === cat.id
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white text-stone-600 border border-stone-200'
                  }`}
                >
                  {cat.icon} {cat.shortLabel} ({count})
                </button>
              );
            })}
          </div>

          {/* 4. 買うものリスト（未購入） */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-black text-stone-800 text-xs flex items-center gap-1.5">
                <span>🛒 買うものリスト</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                  {unboughtItems.length}件
                </span>
              </h3>
              <span className="text-[10px] text-stone-400 font-bold">
                タップで買ったチェック✅
              </span>
            </div>

            {unboughtItems.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 border border-dashed border-stone-200 text-center space-y-1">
                <div className="text-2xl">🛍️</div>
                <div className="font-extrabold text-stone-600 text-xs">
                  買うものリストは空です✨
                </div>
                <div className="text-[11px] text-stone-400">
                  上の入力欄・マイク🎙️・またはスマホのGeminiから追加できます
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {unboughtItems.map((item) => {
                  const catBadge = getCategoryBadge(item);
                  const creator = metadata.partners[item.createdBy || 'partnerA'];
                  const isEditing = editingId === item.id;

                  if (isEditing) {
                    return (
                      <div
                        key={item.id}
                        className="p-3 rounded-2xl bg-white border-2 border-emerald-400 space-y-2 shadow-xs"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {CATEGORY_DEFS.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setEditCat(cat.id)}
                              className={`px-2 py-0.5 rounded-lg font-bold text-[10px] border ${
                                editCat === cat.id
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-stone-50 text-stone-600 border-stone-200'
                              }`}
                            >
                              {cat.label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 font-bold text-xs"
                        />
                        <input
                          type="text"
                          value={editMemo}
                          onChange={(e) => setEditMemo(e.target.value)}
                          placeholder="メモ・数量"
                          className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 text-[11px]"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 font-bold text-[11px]"
                          >
                            キャンセル
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(item)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-extrabold text-[11px] flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>保存</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-white border border-stone-200/90 hover:border-emerald-300 shadow-2xs transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleTaskComplete(item.id)}
                        className="flex-1 flex items-center gap-2.5 text-left min-w-0 group"
                      >
                        <Square className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-stone-800 text-sm break-words">
                              {item.title}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${catBadge.badgeClass}`}
                            >
                              {catBadge.icon} {catBadge.shortLabel}
                            </span>
                          </div>
                          {(item.memo || creator) && (
                            <div className="text-[11px] text-stone-500 flex items-center gap-2 mt-0.5 flex-wrap">
                              {item.memo && (
                                <span className="font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded">
                                  📝 {item.memo}
                                </span>
                              )}
                              {creator && (
                                <span className="text-[10px] text-stone-400">
                                  {creator.avatar} {creator.name}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditing(item)}
                          className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                          title="編集"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteEvent(item.id)}
                          className="p-1.5 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 5. 購入済み（チェック済み）履歴 ＆ もう一度買う・一括消去 */}
          {boughtItems.length > 0 && (
            <div className="pt-2 border-t border-stone-200/80 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="font-extrabold text-stone-500 text-xs">
                  ✅ 購入済み（{boughtItems.length}件）
                </span>
                <button
                  type="button"
                  onClick={() => onClearBoughtItems(boughtItems.map((i) => i.id))}
                  className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-extrabold text-[11px] flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>購入済みをまとめて消去</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {boughtItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-stone-100/80 border border-stone-200/70 text-stone-500"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleTaskComplete(item.id)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                      title="タップで未購入（買うものリスト）に戻す"
                    >
                      <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="line-through font-bold text-xs truncate">
                        {item.title}
                      </span>
                      {item.memo && (
                        <span className="text-[10px] text-stone-400 truncate">
                          ({item.memo})
                        </span>
                      )}
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleTaskComplete(item.id)}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold text-[10px] flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>もう一度買う</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteEvent(item.id)}
                        className="p-1 rounded-lg text-stone-400 hover:text-rose-600"
                        title="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
