// 初期シフトスタンプ・デフォルト予定項目（二人予定・夫予定・妻予定）・日本の祝日判定・サンプルデータ定義
import {
  CalendarCategoryId,
  CalendarCategoryItem,
  CalendarDataStore,
  CoupleMetadata,
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

// デフォルトのシフトスタンププリセット（本業シフト＋バイト・休日出勤に対応）
export const DEFAULT_STAMP_PRESETS: StampPreset[] = [
  {
    id: 'shift_day',
    label: '日勤',
    shortLabel: '日勤',
    type: 'shift',
    color: '#FFE5EC',
    textColor: '#B8335A',
    startTime: '08:30',
    endTime: '17:30',
    icon: '☀️',
    isHoliday: false,
    order: 1,
  },
  {
    id: 'shift_off',
    label: '休み',
    shortLabel: '休み',
    type: 'shift',
    color: '#FFF0F5',
    textColor: '#E05277',
    icon: '🏠',
    isHoliday: true,
    order: 2,
  },
  {
    id: 'shift_part',
    label: 'バイト',
    shortLabel: 'バイト',
    type: 'shift',
    color: '#FFF3D6',
    textColor: '#996300',
    startTime: '18:00',
    endTime: '22:00',
    icon: '🏪',
    isHoliday: false,
    order: 3,
  },
  {
    id: 'shift_hol_work',
    label: '休出',
    shortLabel: '休出',
    type: 'shift',
    color: '#FFECE5',
    textColor: '#9C3D1C',
    startTime: '09:00',
    endTime: '17:00',
    icon: '💼',
    isHoliday: false,
    order: 4,
  },
  {
    id: 'shift_night',
    label: '夜勤',
    shortLabel: '夜勤',
    type: 'shift',
    color: '#E8E5FF',
    textColor: '#483D8B',
    startTime: '16:30',
    endTime: '09:00',
    icon: '🌙',
    isHoliday: false,
    order: 5,
  },
  {
    id: 'shift_semi_night',
    label: '準夜',
    shortLabel: '準夜',
    type: 'shift',
    color: '#F3EAFF',
    textColor: '#6638A6',
    startTime: '16:30',
    endTime: '01:00',
    icon: '🌆',
    isHoliday: false,
    order: 6,
  },
  {
    id: 'shift_early',
    label: '早番',
    shortLabel: '早番',
    type: 'shift',
    color: '#E2F9FC',
    textColor: '#126875',
    startTime: '07:00',
    endTime: '16:00',
    icon: '🌅',
    isHoliday: false,
    order: 7,
  },
  {
    id: 'shift_late',
    label: '遅番',
    shortLabel: '遅番',
    type: 'shift',
    color: '#FFF3D6',
    textColor: '#996300',
    startTime: '11:00',
    endTime: '20:00',
    icon: '⏰',
    isHoliday: false,
    order: 8,
  },
  {
    id: 'shift_paid',
    label: '有休',
    shortLabel: '有休',
    type: 'shift',
    color: '#FFE5EC',
    textColor: '#D63864',
    icon: '🌴',
    isHoliday: true,
    order: 9,
  },
  {
    id: 'shift_ake',
    label: '明け',
    shortLabel: '明け',
    type: 'shift',
    color: '#E6F7EF',
    textColor: '#256D4B',
    icon: '🍵',
    isHoliday: false,
    order: 10,
  },
  {
    id: 'shift_remote',
    label: '在宅',
    shortLabel: '在宅',
    type: 'shift',
    color: '#E6F7EF',
    textColor: '#1E6645',
    startTime: '09:00',
    endTime: '18:00',
    icon: '💻',
    isHoliday: false,
    order: 11,
  },
];

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

// シフト用アイコン絵文字のクイック選択リスト
export const SHIFT_ICON_CHOICES = [
  '☀️', '🌙', '🌆', '🌅', '⏰', '🏠', '🌴', '🍵', '💻', '🏪',
  '💼', '🚄', '🏥', '🏢', '🩺', '🚑', '🍳', '✨', '💤', '🎉',
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

// 初回起動時に機能が一目でわかるサンプルデータ付き初期ストアを作成
export function createInitialDataStore(): CalendarDataStore {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const metadata = createDefaultMetadata();

  const readTime = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
  const unreadTime = new Date(now.getTime() - 20 * 60 * 1000).toISOString();

  const d = (day: number) => `${year}-${month}-${String(day).padStart(2, '0')}`;

  const shifts: CalendarDataStore['shifts'] = {
    [`${d(1)}_partnerA`]: {
      id: `${d(1)}_partnerA`,
      date: d(1),
      partnerId: 'partnerA',
      stampId: 'shift_day',
      startTime: '08:30',
      endTime: '17:30',
      overtimeHours: 1.5,
      createdBy: 'partnerA',
      createdAt: readTime,
      updatedAt: readTime,
    },
    [`${d(1)}_partnerB`]: {
      id: `${d(1)}_partnerB`,
      date: d(1),
      partnerId: 'partnerB',
      stampId: 'shift_early',
      startTime: '07:00',
      endTime: '16:00',
      createdBy: 'partnerB',
      createdAt: readTime,
      updatedAt: readTime,
    },
    // 2日：仕事＋残業 2.0h
    [`${d(2)}_partnerA`]: {
      id: `${d(2)}_partnerA`,
      date: d(2),
      partnerId: 'partnerA',
      stampId: 'shift_day',
      startTime: '08:30',
      endTime: '17:30',
      overtimeHours: 2.0,
      createdBy: 'partnerA',
      createdAt: readTime,
      updatedAt: readTime,
    },
    [`${d(2)}_partnerB`]: {
      id: `${d(2)}_partnerB`,
      date: d(2),
      partnerId: 'partnerB',
      stampId: 'shift_night',
      startTime: '16:30',
      endTime: '09:00',
      overtimeHours: 1.0,
      createdBy: 'partnerB',
      createdAt: readTime,
      updatedAt: readTime,
    },
    // 3日：ふたり休日一致 💕
    [`${d(3)}_partnerA`]: {
      id: `${d(3)}_partnerA`,
      date: d(3),
      partnerId: 'partnerA',
      stampId: 'shift_off',
      createdBy: 'partnerA',
      createdAt: readTime,
      updatedAt: readTime,
    },
    [`${d(3)}_partnerB`]: {
      id: `${d(3)}_partnerB`,
      date: d(3),
      partnerId: 'partnerB',
      stampId: 'shift_off',
      createdBy: 'partnerB',
      createdAt: readTime,
      updatedAt: readTime,
    },
    // 4日：普通の仕事＋仕事終わりにバイトへ行く日！
    [`${d(4)}_partnerA`]: {
      id: `${d(4)}_partnerA`,
      date: d(4),
      partnerId: 'partnerA',
      stampId: 'shift_day',
      startTime: '08:30',
      endTime: '17:30',
      subStampId: 'shift_part',
      subCustomLabel: 'バイト',
      subStartTime: '18:30',
      subEndTime: '22:00',
      createdBy: 'partnerA',
      createdAt: unreadTime,
      updatedAt: unreadTime,
    },
    [`${d(4)}_partnerB`]: {
      id: `${d(4)}_partnerB`,
      date: d(4),
      partnerId: 'partnerB',
      stampId: 'shift_late',
      startTime: '11:00',
      endTime: '20:00',
      createdBy: 'partnerB',
      createdAt: readTime,
      updatedAt: readTime,
    },
    // 5日：休みの日にバイトへ行く日！
    [`${d(5)}_partnerA`]: {
      id: `${d(5)}_partnerA`,
      date: d(5),
      partnerId: 'partnerA',
      stampId: 'shift_night',
      startTime: '16:30',
      endTime: '09:00',
      createdBy: 'partnerA',
      createdAt: unreadTime,
      updatedAt: unreadTime,
    },
    [`${d(5)}_partnerB`]: {
      id: `${d(5)}_partnerB`,
      date: d(5),
      partnerId: 'partnerB',
      stampId: 'shift_off',
      subStampId: 'shift_part',
      subCustomLabel: 'バイト',
      subStartTime: '10:00',
      subEndTime: '15:00',
      createdBy: 'partnerB',
      createdAt: unreadTime,
      updatedAt: unreadTime,
    },
    // 6日：休日出勤（休出4.0h）
    [`${d(6)}_partnerA`]: {
      id: `${d(6)}_partnerA`,
      date: d(6),
      partnerId: 'partnerA',
      stampId: 'shift_hol_work',
      startTime: '09:00',
      endTime: '13:00',
      isHolidayWork: true,
      holidayWorkHours: 4.0,
      createdBy: 'partnerA',
      createdAt: unreadTime,
      updatedAt: unreadTime,
    },
    // 7日：ふたり休日一致 💕（有休＋休み）
    [`${d(7)}_partnerA`]: {
      id: `${d(7)}_partnerA`,
      date: d(7),
      partnerId: 'partnerA',
      stampId: 'shift_paid',
      createdBy: 'partnerA',
      createdAt: unreadTime,
      updatedAt: unreadTime,
    },
    [`${d(7)}_partnerB`]: {
      id: `${d(7)}_partnerB`,
      date: d(7),
      partnerId: 'partnerB',
      stampId: 'shift_off',
      createdBy: 'partnerB',
      createdAt: readTime,
      updatedAt: readTime,
    },
    // 15日：ふたり休日一致 💕
    [`${d(15)}_partnerA`]: {
      id: `${d(15)}_partnerA`,
      date: d(15),
      partnerId: 'partnerA',
      stampId: 'shift_off',
      createdBy: 'partnerA',
      createdAt: readTime,
      updatedAt: readTime,
    },
    [`${d(15)}_partnerB`]: {
      id: `${d(15)}_partnerB`,
      date: d(15),
      partnerId: 'partnerB',
      stampId: 'shift_off',
      createdBy: 'partnerB',
      createdAt: readTime,
      updatedAt: readTime,
    },
  };

  const events: CalendarDataStore['events'] = {
    ev_sample_1: {
      id: 'ev_sample_1',
      date: d(3),
      title: '💕 鎌倉カフェ巡り＆紅葉デート',
      categoryId: 'shared',
      color: '#FF8FAB',
      isAllDay: false,
      startTime: '10:30',
      endTime: '18:30',
      memo: '小町通りでランチ→長谷寺へお散歩🍁',
      supportBadges: ['🍱お弁当あり'],
      createdBy: 'partnerB',
      createdAt: readTime,
      updatedAt: readTime,
    },
    ev_sample_2: {
      id: 'ev_sample_2',
      date: d(3),
      title: '🍽️ 夜は駅前イタリアン予約済',
      categoryId: 'shared',
      color: '#FF8FAB',
      isAllDay: false,
      startTime: '19:00',
      endTime: '21:00',
      memo: 'コース予約済み（窓際席）',
      createdBy: 'partnerA',
      createdAt: unreadTime,
      updatedAt: unreadTime,
    },
    ev_sample_3: {
      id: 'ev_sample_3',
      date: d(3),
      title: '🛒 帰りに成城石井で朝食パン購入',
      categoryId: 'partnerA',
      color: '#56CFE1',
      isAllDay: false,
      startTime: '21:15',
      endTime: '21:45',
      createdBy: 'partnerA',
      createdAt: readTime,
      updatedAt: readTime,
    },
    ev_sample_4: {
      id: 'ev_sample_4',
      date: d(3),
      title: '📦 ふるさと納税フルーツ届く（午前指定）',
      categoryId: 'partnerB',
      color: '#B388EB',
      isAllDay: false,
      startTime: '09:30',
      endTime: '10:15',
      createdBy: 'partnerB',
      createdAt: readTime,
      updatedAt: readTime,
    },
    ev_sample_5: {
      id: 'ev_sample_5',
      date: d(5),
      title: '🍻 部署の歓迎会（二次会なし）',
      categoryId: 'partnerA',
      color: '#56CFE1',
      isAllDay: false,
      startTime: '19:00',
      endTime: '21:30',
      supportBadges: ['🍳夜ごはん不要'],
      createdBy: 'partnerA',
      createdAt: unreadTime,
      updatedAt: unreadTime,
    },
    ev_sample_6: {
      id: 'ev_sample_6',
      date: d(7),
      title: '💇‍♀️ 表参道ヘアサロン（カット＆カラー）',
      categoryId: 'partnerB',
      color: '#B388EB',
      isAllDay: false,
      startTime: '11:00',
      endTime: '13:30',
      createdBy: 'partnerB',
      createdAt: readTime,
      updatedAt: readTime,
    },
    ev_sample_7: {
      id: 'ev_sample_7',
      date: d(15),
      title: '🎂 結婚記念日ディナー＆ケーキ受取✨',
      categoryId: 'shared',
      color: '#FF8FAB',
      isAllDay: false,
      startTime: '18:00',
      endTime: '21:00',
      memo: '17:30にパティスリーでホールケーキ受取',
      createdBy: 'partnerA',
      createdAt: unreadTime,
      updatedAt: unreadTime,
    },
  };

  const daySupports: CalendarDataStore['daySupports'] = {
    [d(2)]: {
      id: `support_${d(2)}`,
      date: d(2),
      badges: ['🍚夕飯おねがい', '🚗お迎えお願い'],
      updatedBy: 'partnerB',
      updatedAt: readTime,
    },
    [d(5)]: {
      id: `support_${d(5)}`,
      date: d(5),
      badges: ['🍳夜ごはん不要'],
      updatedBy: 'partnerA',
      updatedAt: unreadTime,
    },
  };

  return {
    version: 1,
    metadata,
    categories: DEFAULT_CATEGORIES,
    stamps: DEFAULT_STAMP_PRESETS,
    shifts,
    events,
    daySupports,
    updatedAt: now.toISOString(),
  };
}
