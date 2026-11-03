// ふたりカレ (FutariCal) データモデル定義

export type PartnerId = 'partnerA' | 'partnerB';
export type CalendarCategoryId = 'shared' | 'partnerA' | 'partnerB' | 'anniversary' | 'chore';
export type FilterCategoryId = 'all' | CalendarCategoryId;

// シフト＆予定スタンプの定義（ポチポチ連続入力用）
export interface StampPreset {
  id: string;
  label: string;          // 例: "日勤", "夜勤", "休み", "デート", "通院"
  shortLabel: string;     // カレンダーセル表示用（例: "日", "夜", "休", "💕"）
  type: 'shift' | 'event'; // シフト枠に入るか、予定リスト枠に入るか
  color: string;          // 背景パステルカラー (HEX)
  textColor: string;      // 文字カラー (HEX)
  startTime?: string;     // 付随する開始時間 例: "08:30"
  endTime?: string;       // 付随する終了時間 例: "17:30"
  icon?: string;          // 絵文字またはアイコン名
  isHoliday?: boolean;    // ふたり休日一致判定用の休日フラグ（休・有休・公休など）
  categoryId?: CalendarCategoryId; // eventタイプの場合のデフォルトカテゴリ
  order: number;
}

// 日ごとのシフトデータ（2人並べて表示用）
export interface ShiftEntry {
  id: string;             // `${date}_${partnerId}` (例: "2026-11-03_partnerA")
  date: string;           // "YYYY-MM-DD"
  partnerId: PartnerId;
  stampId: string;
  customLabel?: string;
  startTime?: string;
  endTime?: string;
  memo?: string;
  createdBy: PartnerId;
  createdAt: string;      // ISO 8601
  updatedAt: string;      // ISO 8601
  deletedAt?: string | null;
}

// カレンダー予定データ（1日あたりの件数無制限）
export interface ScheduleEvent {
  id: string;             // UUID
  date: string;           // "YYYY-MM-DD"（複数日またぎの場合は終了日も保持）
  endDate?: string;       // "YYYY-MM-DD"
  title: string;          // 複数行表示対応
  categoryId: CalendarCategoryId;
  color: string;          // 色分け用カラーコード
  isAllDay: boolean;
  startTime?: string;     // "HH:mm"
  endTime?: string;       // "HH:mm"
  memo?: string;
  supportBadges?: string[]; // 例: ["🍳夕飯不要", "🍱お弁当"]
  createdBy: PartnerId;   // 誰が入れたか
  createdAt: string;      // いつ予定を入れたか
  updatedAt: string;      // いつ更新したか
  deletedAt?: string | null;
}

// 日付ごとの「🍳すれ違いサポートアイコン（ごはん・家事目印）」記録
export interface DaySupportEntry {
  id: string;             // `support_${date}`
  date: string;           // "YYYY-MM-DD"
  badges: string[];       // 例: ["🍳夜ごはん不要", "🍱お弁当あり", "🚗お迎えお願い"]
  memo?: string;
  updatedBy: PartnerId;
  updatedAt: string;      // ISO 8601
}

// 夫婦のプロフィール＆最終確認（既読）ステータス
export interface PartnerProfile {
  name: string;
  avatar: string;
  themeColor: string;
  bgColor: string;
  lastSeenAt: string;     // ISO 8601
}

export interface CoupleMetadata {
  partners: {
    partnerA: PartnerProfile;
    partnerB: PartnerProfile;
  };
  lastSyncedAt: string;
  updatedAt?: string;
}

// カレンダー全体の保存データストア構造（Conflict-Free Merge対応）
export interface CalendarDataStore {
  version: number;
  metadata: CoupleMetadata;
  stamps: StampPreset[];
  shifts: Record<string, ShiftEntry>;        // key: `${date}_${partnerId}`
  events: Record<string, ScheduleEvent>;     // key: event.id
  daySupports: Record<string, DaySupportEntry>; // key: date ("YYYY-MM-DD")
  updatedAt: string;
}

// クラウド同期設定（GitHub Gist または GitHub リポジトリ内専用データファイル）
export interface CloudSyncConfig {
  enabled: boolean;
  mode: 'gist' | 'repo';
  githubToken: string;
  gistId: string;
  repoOwner?: string;
  repoName?: string;
  repoBranch?: string;
  repoFilePath?: string;
  autoSync: boolean;
}

// 暗号化ペイロード形式（GitHub Gist / リポジトリ保存用）
export interface EncryptedPayload {
  app: 'FutariCal';
  version: number;
  cipher: 'AES-GCM-256';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;           // Base64
  iv: string;             // Base64
  ciphertext: string;     // Base64
  updatedAt: string;
}
