// 初期シフトスタンプ・デフォルト予定項目（二人予定・夫予定・妻予定）・日本の祝日判定・サンプルデータ定義
import {
  CalendarCategoryId,
  CalendarCategoryItem,
  CalendarDataStore,
  CoupleMetadata,
  PartnerId,
  ShiftEntry,
  StampPreset,
} from '../types/calendar';

export type CategoryInfo = CalendarCategoryItem;

// デフォルトのカレンダー予定項目（二人予定・夫予定・妻予定の3つを基本とし、自由に追加・削除可能）
export const DEFAULT_CATEGORIES: CalendarCategoryItem[] = [
  {
    id: 'shared',
    label: '二人予定',
    shortLabel: '二人予定',
    icon: '💕',
    accentColor: '#FF8FAB',
    bgColor: '#FFE5EC',
    textColor: '#9E2A47',
    borderColor: '#FFC2D1',
    order: 1,
  },
  {
    id: 'partnerA',
    label: '夫予定',
    shortLabel: '夫予定',
    icon: '🐻',
    accentColor: '#56CFE1',
    bgColor: '#E2F9FC',
    textColor: '#136370',
    borderColor: '#A9E9F2',
    order: 2,
  },
  {
    id: 'partnerB',
    label: '妻予定',
    shortLabel: '妻予定',
    icon: '🐰',
    accentColor: '#B388EB',
    bgColor: '#F3EAFF',
    textColor: '#59318F',
    borderColor: '#DEC9FC',
    order: 3,
  },
];

// 後方互換＆フォールバック用マップ
export const CATEGORY_MAP: Record<string, CalendarCategoryItem> = {
  shared: DEFAULT_CATEGORIES[0],
  partnerA: DEFAULT_CATEGORIES[1],
  partnerB: DEFAULT_CATEGORIES[2],
  anniversary: {
    id: 'anniversary',
    label: '記念日・特別日',
    shortLabel: '記念日',
    icon: '🎉',
    accentColor: '#FFB703',
    bgColor: '#FFF6D6',
    textColor: '#8A5A00',
    borderColor: '#FFE28A',
    order: 4,
  },
  chore: {
    id: 'chore',
    label: '家事・暮らし',
    shortLabel: '家事',
    icon: '🏠',
    accentColor: '#52B788',
    bgColor: '#E6F7EF',
    textColor: '#1E6645',
    borderColor: '#B2E6CE',
    order: 5,
  },
};

// カテゴリIDから安全にカテゴリ情報を取得するヘルパー
export function resolveCategoryInfo(
  categoryId: CalendarCategoryId,
  categories?: CalendarCategoryItem[],
  metadata?: CoupleMetadata
): CalendarCategoryItem {
  const list = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  const found = list.find((c) => c.id === categoryId) || CATEGORY_MAP[categoryId] || list[0] || DEFAULT_CATEGORIES[0];

  if (metadata) {
    if (found.id === 'partnerA') {
      return {
        ...found,
        icon: metadata.partners.partnerA.avatar,
        label: `${metadata.partners.partnerA.name}予定`,
        shortLabel: `${metadata.partners.partnerA.name}予定`,
      };
    }
    if (found.id === 'partnerB') {
      return {
        ...found,
        icon: metadata.partners.partnerB.avatar,
        label: `${metadata.partners.partnerB.name}予定`,
        shortLabel: `${metadata.partners.partnerB.name}予定`,
      };
    }
  }
  return found;
}

// すれ違いサポートアイコン（日付や予定に1タップで添えられる目印）
export const SUPPORT_BADGE_PRESETS: { id: string; label: string; short: string; desc: string }[] = [
  { id: '🍳夜ごはん不要', label: '🍳 夜ごはん不要', short: '🍳夕飯不要', desc: '飲み会や夜勤で夕食がいらない日' },
  { id: '🍱お弁当あり', label: '🍱 お弁当あり', short: '🍱お弁当', desc: 'お弁当を持参・準備する日' },
  { id: '🚗お迎えお願い', label: '🚗 お迎えお願い', short: '🚗お迎え', desc: '駅や職場へのお迎えリクエスト' },
  { id: '🍚夕飯おねがい', label: '🍚 夕飯おねがい', short: '🍚夕飯担当', desc: 'パートナーに夕食準備をお願い' },
  { id: '🛒買い物お願い', label: '🛒 買い物お願い', short: '🛒買い物', desc: '帰りに食材・日用品の買い物' },
  { id: '🧺洗濯お願い', label: '🧺 洗濯お願い', short: '🧺洗濯', desc: '洗濯物の取り込み・洗濯お願い' },
  { id: '🔑遅くなります', label: '🔑 遅くなります', short: '🔑帰宅遅め', desc: '残業やバイトで帰りが遅くなる目印' },
  { id: '👶送り迎え', label: '👶 送り迎え担当', short: '👶送迎', desc: '保育園や習い事の送迎目印' },
];

// 旧バージョンのデフォルトスタンプID（マイグレーションやマージ時に除外するため保持）
export const LEGACY_DEFAULT_STAMP_IDS = new Set([
  'shift_day',
  'shift_off',
  'shift_part',
  'shift_hol_work',
  'shift_night',
  'shift_semi_night',
  'shift_early',
  'shift_late',
  'shift_paid',
  'shift_ake',
  'shift_remote',
]);

// デフォルトのシフトスタンププリセット
// 🐻 夫（partnerA）：ご指定の12種類の勤務リストを初期登録済み
// 🐰 妻（partnerB）：ご要望により初期状態は空（[]）に設定（あとから自由に追加可能）
export const DEFAULT_STAMP_PRESETS: StampPreset[] = [
  {
    id: 'shift_a_day',
    partnerId: 'partnerA',
    label: '日勤',
    shortLabel: '日勤',
    type: 'shift',
    color: '#E2F9FC',
    textColor: '#126875',
    startTime: '09:00',
    endTime: '18:05',
    icon: '☀️',
    isHoliday: false,
    order: 1,
  },
  {
    id: 'shift_a_late_a',
    partnerId: 'partnerA',
    label: '遅A',
    shortLabel: '遅A',
    type: 'shift',
    color: '#FFF3D6',
    textColor: '#996300',
    startTime: '10:50',
    endTime: '20:05',
    icon: '🌆',
    isHoliday: false,
    order: 2,
  },
  {
    id: 'shift_a_late_b',
    partnerId: 'partnerA',
    label: '遅B',
    shortLabel: '遅B',
    type: 'shift',
    color: '#FFECE5',
    textColor: '#9C3D1C',
    startTime: '10:50',
    endTime: '20:05',
    icon: '🌇',
    isHoliday: false,
    order: 3,
  },
  {
    id: 'shift_a_early_a',
    partnerId: 'partnerA',
    label: '早A',
    shortLabel: '早A',
    type: 'shift',
    color: '#FFF6D6',
    textColor: '#8A5A00',
    startTime: '07:20',
    endTime: '16:35',
    icon: '🌅',
    isHoliday: false,
    order: 4,
  },
  {
    id: 'shift_a_early_b',
    partnerId: 'partnerA',
    label: '早B',
    shortLabel: '早B',
    type: 'shift',
    color: '#FEF3C7',
    textColor: '#92400E',
    startTime: '07:20',
    endTime: '16:35',
    icon: '🌄',
    isHoliday: false,
    order: 5,
  },
  {
    id: 'shift_a_2early',
    partnerId: 'partnerA',
    label: '２早',
    shortLabel: '２早',
    type: 'shift',
    color: '#D8F8EE',
    textColor: '#0F6E56',
    startTime: '07:20',
    endTime: '16:35',
    icon: '🌅',
    isHoliday: false,
    order: 6,
  },
  {
    id: 'shift_a_night',
    partnerId: 'partnerA',
    label: '夜勤',
    shortLabel: '夜勤',
    type: 'shift',
    color: '#E8E5FF',
    textColor: '#483D8B',
    startTime: '16:45',
    endTime: '23:59',
    icon: '🌙',
    isHoliday: false,
    order: 7,
  },
  {
    id: 'shift_a_2night',
    partnerId: 'partnerA',
    label: '２夜',
    shortLabel: '２夜',
    type: 'shift',
    color: '#F3EAFF',
    textColor: '#59318F',
    startTime: '16:45',
    endTime: '23:59',
    icon: '🌌',
    isHoliday: false,
    order: 8,
  },
  {
    id: 'shift_a_ake',
    partnerId: 'partnerA',
    label: '明け',
    shortLabel: '明け',
    type: 'shift',
    color: '#E0E7FF',
    textColor: '#3730A3',
    startTime: '00:00',
    endTime: '09:45',
    icon: '🍵',
    isHoliday: false,
    order: 9,
  },
  {
    id: 'shift_a_semi_early',
    partnerId: 'partnerA',
    label: '準早',
    shortLabel: '準早',
    type: 'shift',
    color: '#E6F7EF',
    textColor: '#1E6645',
    startTime: '07:50',
    endTime: '17:05',
    icon: '🌤️',
    isHoliday: false,
    order: 10,
  },
  {
    id: 'shift_a_semi_late',
    partnerId: 'partnerA',
    label: '準遅',
    shortLabel: '準遅',
    type: 'shift',
    color: '#EDE9FE',
    textColor: '#6D28D9',
    startTime: '09:50',
    endTime: '19:05',
    icon: '🌥️',
    isHoliday: false,
    order: 11,
  },
  {
    id: 'shift_a_off',
    partnerId: 'partnerA',
    label: '休み',
    shortLabel: '休み',
    type: 'shift',
    color: '#FFE5EC',
    textColor: '#D63864',
    icon: '🏠',
    isHoliday: true,
    order: 12,
  },
  {
    id: 'shift_a_paid',
    partnerId: 'partnerA',
    label: '年休',
    shortLabel: '年休',
    type: 'shift',
    color: '#D8F3DC',
    textColor: '#1B5E3A',
    icon: '🌴',
    isHoliday: true,
    order: 13,
  },
];

// パートナー別のシフトスタンプ一覧を取得（partnerId未設定の旧スタンプはpartnerA扱いにする）
export function getPartnerShiftStamps(
  stamps: StampPreset[],
  partnerId: PartnerId
): StampPreset[] {
  return stamps
    .filter((s) => s.type === 'shift' && (s.partnerId || 'partnerA') === partnerId)
    .sort((a, b) => a.order - b.order);
}

// パステルカラー選択肢（シフトスタンプ＆予定項目カラー用）
export const PASTEL_COLOR_PALETTE = [
  { name: 'さくらピンク', hex: '#FF8FAB', bg: '#FFE5EC', text: '#B8335A', border: '#FFC2D1' },
  { name: 'ベビーローズ', hex: '#FF6B8B', bg: '#FFF0F5', text: '#E05277', border: '#FFB3C6' },
  { name: 'ミントブルー', hex: '#56CFE1', bg: '#E2F9FC', text: '#126875', border: '#A9E9F2' },
  { name: 'ラベンダー', hex: '#B388EB', bg: '#F3EAFF', text: '#6638A6', border: '#DEC9FC' },
  { name: 'ナイトパープル', hex: '#7C83FD', bg: '#E8E5FF', text: '#483D8B', border: '#C5C8FF' },
  { name: 'ミモザイエロー', hex: '#FFB703', bg: '#FFF3D6', text: '#996300', border: '#FFE28A' },
  { name: 'セージグリーン', hex: '#52B788', bg: '#E6F7EF', text: '#1E6645', border: '#B2E6CE' },
  { name: 'ピーチコーラル', hex: '#FF9E7D', bg: '#FFECE5', text: '#9C3D1C', border: '#FFD0BF' },
];

// シフト用アイコン絵文字のクイック選択リスト（フラット互換用）
export const SHIFT_ICON_CHOICES = [
  '☀️', '🌙', '🌆', '🌅', '⏰', '🏠', '🌴', '🍵', '💻', '🏪',
  '💼', '🚄', '🏥', '🏢', '🩺', '🚑', '🍳', '✨', '💤', '🎉',
];

// パターン別・シフト用アイコン絵文字グループ
export const SHIFT_ICON_PATTERNS: {
  category: string;
  icons: string[];
}[] = [
  {
    category: '☀️ 時間帯・基本シフト',
    icons: ['☀️', '🌤️', '🌅', '🌆', '🌙', '🌌', '⏰', '⏱️', '🍵', '💤', '🛌', '🔥', '⚡', '🌈'],
  },
  {
    category: '🏥 医療・オフィス・現場',
    icons: ['🏥', '🩺', '💉', '🚑', '💊', '🏢', '💻', '💼', '📊', '📝', '📞', '✈️', '🚄', '🚗'],
  },
  {
    category: '🏪 バイト・副業・店舗',
    icons: ['🏪', '☕', '🍽️', '🍔', '🍰', '🛒', '📦', '🚚', '🛵', '🍳', '🍺', '💇‍♀️', '📚', '🎵'],
  },
  {
    category: '🌴 休日・休暇・暮らし',
    icons: ['🏠', '🌴', '🌸', '🌻', '🍁', '⛄', '🎉', '🎂', '👶', '🏫', '🐶', '🐱', '💕', '✨'],
  },
];

// カレンダー予定追加時の「パターン別アイコン＆ワンタップ予定プリセット」
export interface EventPatternPresetItem {
  icon: string;
  label: string;       // ボタン表示名
  title: string;       // 自動入力される予定タイトル
  startTime?: string;  // 推奨開始時間
  endTime?: string;    // 推奨終了時間
  supportBadge?: string;
}

export interface EventPatternCategory {
  id: string;
  tabLabel: string;
  items: EventPatternPresetItem[];
  icons: string[];     // アイコンだけ選びたい時用の絵文字一覧
}

export const EVENT_PATTERN_CATEGORIES: EventPatternCategory[] = [
  {
    id: 'date_out',
    tabLabel: '💕 デート・外食',
    icons: ['💕', '💑', '🍽️', '☕', '🍰', '🍻', '🍷', '🎬', '🛍️', '🚗', '♨️', '✈️', '🎡', '🏕️', '🎂', '💐'],
    items: [
      { icon: '🍽️', label: '外食ディナー', title: '🍽️ 外食ディナー', startTime: '19:00', endTime: '21:00' },
      { icon: '☕', label: 'カフェ・ランチ', title: '☕ カフェ・ランチ', startTime: '12:00', endTime: '14:00' },
      { icon: '🎬', label: '映画デート', title: '🎬 映画デート' },
      { icon: '🛍️', label: 'お買い物', title: '🛍️ ショッピング・お買い物' },
      { icon: '🚗', label: 'ドライブ', title: '🚗 ドライブお出かけ' },
      { icon: '♨️', label: '温泉・サウナ', title: '♨️ 温泉・サウナ' },
      { icon: '✈️', label: '旅行・お泊まり', title: '✈️ 旅行' },
      { icon: '🎂', label: '記念日・誕生日', title: '🎂 記念日お祝い' },
      { icon: '🍻', label: '飲み会', title: '🍻 飲み会', startTime: '19:00', endTime: '22:00', supportBadge: '🍳夜ごはん不要' },
      { icon: '🎡', label: 'レジャー', title: '🎡 テーマパーク・お出かけ' },
    ],
  },
  {
    id: 'medical_beauty',
    tabLabel: '🏥 通院・美容',
    icons: ['🏥', '🦷', '💇‍♀️', '💅', '💆‍♀️', '🏋️', '🧘‍♀️', '💉', '💊', '🩺', '👓', '🧖‍♀️', '🌿', '✨'],
    items: [
      { icon: '🏥', label: '病院・通院', title: '🏥 病院・通院', startTime: '10:00', endTime: '11:30' },
      { icon: '🦷', label: '歯医者', title: '🦷 歯医者・歯科検診', startTime: '14:00', endTime: '15:00' },
      { icon: '💇‍♀️', label: '美容院', title: '💇‍♀️ 美容院・ヘアサロン', startTime: '11:00', endTime: '13:00' },
      { icon: '💅', label: 'ネイル・まつパ', title: '💅 ネイル・まつげサロン', startTime: '13:00', endTime: '15:00' },
      { icon: '💆‍♀️', label: '整体・エステ', title: '💆‍♀️ 整体・マッサージ' },
      { icon: '🏋️', label: 'ジム・運動', title: '🏋️ ジム・ピラティス' },
      { icon: '💉', label: '健診・予防接種', title: '💉 健康診断・予防接種' },
      { icon: '💊', label: '薬局・処方箋', title: '💊 薬受け取り' },
    ],
  },
  {
    id: 'chore_life',
    tabLabel: '🏠 家事・暮らし',
    icons: ['🛒', '📦', '🗑️', '🧹', '🧺', '🍚', '🍱', '🍳', '🏦', '💰', '🔧', '📮', '💡', '🪴'],
    items: [
      { icon: '🛒', label: 'まとめ買い', title: '🛒 スーパー買い出し' },
      { icon: '📦', label: '宅配受取', title: '📦 宅配便・荷物受け取り' },
      { icon: '🗑️', label: '資源・粗大ごみ', title: '🗑️ 資源ごみ・粗大ごみ出し' },
      { icon: '🧹', label: '掃除・片付け', title: '🧹 大掃除・片付け' },
      { icon: '🏦', label: '銀行・役所', title: '🏦 銀行・役所手続き' },
      { icon: '🔧', label: '車検・点検', title: '🔧 車の点検・メンテナンス' },
      { icon: '💰', label: '給料日・振込', title: '💰 給料日・振込手続き' },
      { icon: '🍱', label: '作り置き', title: '🍱 作り置き・料理' },
    ],
  },
  {
    id: 'work_sub',
    tabLabel: '🏪 バイト・仕事',
    icons: ['🏪', '💼', '⏱️', '🏢', '💻', '📝', '📊', '✈️', '🚄', '🤝', '📞', '🎓', '📚', '🔥'],
    items: [
      { icon: '🏪', label: 'バイト', title: '🏪 バイト', startTime: '18:00', endTime: '22:00' },
      { icon: '💼', label: '休日出勤', title: '💼 休日出勤', startTime: '09:00', endTime: '17:00' },
      { icon: '⏱️', label: '残業予定', title: '⏱️ 残業予定（帰りが遅くなります）', supportBadge: '🔑遅くなります' },
      { icon: '✈️', label: '出張', title: '✈️ 出張' },
      { icon: '📝', label: '研修・勉強会', title: '📝 研修・資格勉強' },
      { icon: '💻', label: 'オンライン会議', title: '💻 オンライン打ち合わせ' },
      { icon: '🤝', label: '職場飲み会', title: '🤝 職場会食・歓送迎会', startTime: '19:00', endTime: '22:00', supportBadge: '🍳夜ごはん不要' },
    ],
  },
  {
    id: 'family_pet',
    tabLabel: '👨‍👩‍👧 家族・実家',
    icons: ['🏠', '👵', '👴', '👶', '🏫', '🎒', '🐶', '🐱', '🐾', '🎁', '📸', '💐', '⛩️', '🎎'],
    items: [
      { icon: '🏠', label: '実家へ帰省', title: '🏠 実家へ帰省' },
      { icon: '👵', label: '親と食事', title: '👵 両親と食事' },
      { icon: '👶', label: '子ども行事', title: '👶 保育園・学校行事' },
      { icon: '🐶', label: '動物病院・ペット', title: '🐶 動物病院・トリミング' },
      { icon: '🎁', label: 'プレゼント準備', title: '🎁 プレゼント・お祝い準備' },
      { icon: '📸', label: '写真撮影', title: '📸 スタジオ写真撮影' },
      { icon: '💐', label: '冠婚葬祭', title: '💐 結婚式・法事' },
    ],
  },
];

// シフト時間のワンタッププリセット
export const SHIFT_TIME_PRESETS = [
  { label: '時間なし（休日等）', start: '', end: '' },
  { label: '08:30〜17:30 (日勤)', start: '08:30', end: '17:30' },
  { label: '09:00〜18:00 (定時)', start: '09:00', end: '18:00' },
  { label: '18:00〜22:00 (夜バイト)', start: '18:00', end: '22:00' },
  { label: '10:00〜15:00 (昼バイト)', start: '10:00', end: '15:00' },
  { label: '16:30〜09:00 (夜勤)', start: '16:30', end: '09:00' },
  { label: '07:00〜16:00 (早番)', start: '07:00', end: '16:00' },
  { label: '11:00〜20:00 (遅番)', start: '11:00', end: '20:00' },
];

// 日本の祝日リスト（2025〜2028年主要祝日＋固定祝日フォールバック）
const FIXED_HOLIDAYS: Record<string, string> = {
  // 2025年
  '2025-01-01': '元日',
  '2025-01-13': '成人の日',
  '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日',
  '2025-02-24': '振替休日',
  '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日',
  '2025-05-03': '憲法記念日',
  '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日',
  '2025-05-06': '振替休日',
  '2025-07-21': '海の日',
  '2025-08-11': '山の日',
  '2025-09-15': '敬老の日',
  '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日',
  '2025-11-03': '文化の日',
  '2025-11-23': '勤労感謝の日',
  '2025-11-24': '振替休日',
  // 2026年
  '2026-01-01': '元日',
  '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日',
  '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日',
  '2026-07-20': '海の日',
  '2026-08-11': '山の日',
  '2026-09-21': '敬老の日',
  '2026-09-22': '国民の休日',
  '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日',
  // 2027年
  '2027-01-01': '元日',
  '2027-01-11': '成人の日',
  '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日',
  '2027-03-21': '春分の日',
  '2027-03-22': '振替休日',
  '2027-04-29': '昭和の日',
  '2027-05-03': '憲法記念日',
  '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日',
  '2027-07-19': '海の日',
  '2027-08-11': '山の日',
  '2027-09-20': '敬老の日',
  '2027-09-23': '秋分の日',
  '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日',
  '2027-11-23': '勤労感謝の日',
};

export function getJapaneseHoliday(dateStr: string): string | null {
  if (FIXED_HOLIDAYS[dateStr]) return FIXED_HOLIDAYS[dateStr];
  const monthDay = dateStr.slice(5);
  const fallbackMap: Record<string, string> = {
    '01-01': '元日',
    '02-11': '建国記念の日',
    '02-23': '天皇誕生日',
    '04-29': '昭和の日',
    '05-03': '憲法記念日',
    '05-04': 'みどりの日',
    '05-05': 'こどもの日',
    '08-11': '山の日',
    '11-03': '文化の日',
    '11-23': '勤労感謝の日',
  };
  return fallbackMap[monthDay] || null;
}

export function createDefaultMetadata(): CoupleMetadata {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  return {
    partners: {
      partnerA: {
        name: '夫',
        avatar: '🐻',
        themeColor: '#56CFE1',
        bgColor: '#E2F9FC',
        lastSeenAt: now.toISOString(),
      },
      partnerB: {
        name: '妻',
        avatar: '🐰',
        themeColor: '#B388EB',
        bgColor: '#F3EAFF',
        lastSeenAt: twoHoursAgo,
      },
    },
    lastSyncedAt: '',
    updatedAt: now.toISOString(),
  };
}

// ご添付いただいた2026年11月ナスカレ勤務表（1日〜30日）の正確なシフト一覧
export const UPLOADED_2026_11_NURSECAL_LABELS: Record<number, string> = {
  1: '明け',
  2: '休み',
  3: '２早',
  4: '遅A',
  5: '休み',
  6: '休み',
  7: '２夜',
  8: '明け',
  9: '休み',
  10: '休み',
  11: '遅A',
  12: '遅B',
  13: '日勤',
  14: '夜勤',
  15: '明け',
  16: '休み',
  17: '早A',
  18: '早B',
  19: '遅A',
  20: '休み',
  21: '日勤',
  22: '夜勤',
  23: '明け',
  24: '休み',
  25: '早B',
  26: '遅A',
  27: '準早',
  28: '夜勤',
  29: '明け',
  30: '休み',
};

// 2026年11月の30日分のシフトデータを生成（夫のデフォルト勤務表として初期反映＆ワンタップ復元可能）
export function createUploaded2026NovShifts(
  partnerId: PartnerId = 'partnerA',
  stamps: StampPreset[] = DEFAULT_STAMP_PRESETS
): Record<string, ShiftEntry> {
  const result: Record<string, ShiftEntry> = {};
  const partnerStamps = getPartnerShiftStamps(stamps, partnerId);
  const pool = partnerStamps.length > 0 ? partnerStamps : DEFAULT_STAMP_PRESETS;
  const nowIso = '2026-11-04T00:00:00.000Z';

  for (let day = 1; day <= 30; day++) {
    const label = UPLOADED_2026_11_NURSECAL_LABELS[day];
    if (!label) continue;
    const stamp =
      pool.find((s) => s.label === label || s.shortLabel === label) ||
      DEFAULT_STAMP_PRESETS.find((s) => s.label === label || s.shortLabel === label);
    if (!stamp) continue;
    const dateStr = `2026-11-${String(day).padStart(2, '0')}`;
    result[`${dateStr}_${partnerId}`] = {
      id: `shift_${dateStr}_${partnerId}`,
      date: dateStr,
      partnerId,
      stampId: stamp.id,
      customLabel: stamp.shortLabel,
      startTime: stamp.startTime,
      endTime: stamp.endTime,
      createdBy: partnerId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }
  return result;
}

// 初期ストアを作成（初期登録されていたサンプル予定はすべて削除し、2026年11月ナスカレ勤務表を初期セット）
export function createInitialDataStore(): CalendarDataStore {
  const now = new Date();
  const metadata = createDefaultMetadata();

  return {
    version: 1,
    metadata,
    categories: DEFAULT_CATEGORIES,
    stamps: DEFAULT_STAMP_PRESETS,
    shifts: createUploaded2026NovShifts('partnerA', DEFAULT_STAMP_PRESETS),
    events: {},
    daySupports: {},
    updatedAt: now.toISOString(),
  };
}

