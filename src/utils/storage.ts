// IndexedDB + localStorage 永続化 ＆ Conflict-Free 差分マージ ＆ GitHub Gist/Repo クラウド同期モジュール
import {
  CalendarDataStore,
  CloudSyncConfig,
  DaySupportEntry,
  EncryptedPayload,
  GoogleCalendarSyncConfig,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
  WelcomeImageConfig,
} from '../types/calendar';
import { decryptCalendarStore, encryptCalendarStore } from './crypto';
import {
  createInitialDataStore,
  DEFAULT_STAMP_PRESETS,
  LEGACY_DEFAULT_STAMP_IDS,
} from './presets';
import { getDefaultCloudCredentials } from './defaultCloud';

const DB_NAME = 'FutariCalDB';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

const LS_STORE_KEY = 'futarical_store_v1';
const LS_ENCRYPTED_KEY = 'futarical_encrypted_v1';
const LS_PASS_HASH_KEY = 'futarical_pass_hash_v1';
const LS_SYNC_CONFIG_KEY = 'futarical_sync_config_v1';
const LS_ACTIVE_PARTNER_KEY = 'futarical_active_partner_v1';
export const LS_WELCOME_PHOTO_KEY = 'paircal_welcome_photo_dedicated_v1';
export const LS_SHARED_KEYWORD_KEY = 'futarical_shared_keyword_v1';
export const LS_CUSTOM_KEYWORD_DEF_KEY = 'futarical_custom_keyword_def_v1';
const IDB_AUTO_BACKUPS_KEY = 'paircal_auto_backups_v1';
const LS_AUTO_BACKUPS_FALLBACK_KEY = 'paircal_auto_backups_fallback_v1';
const MAX_LOCAL_BACKUPS = 20;

export interface LocalBackupSnapshot {
  id: string;
  createdAt: string;
  reason: string;
  counts: {
    shifts: number;
    events: number;
    tasks: number;
  };
  store: CalendarDataStore;
}

export interface CloudBackupRevision {
  version: string;
  committedAt: string;
}

// デフォルトの特定の合言葉（ひらがな、カタカナ、アルファベット表記揺れを許容）
export const DEFAULT_SHARED_KEYWORDS = ['ゆうとさや', 'ゆとさや', 'yutosaya', 'paircal', 'futari'];

/**
 * 文字列を正規化（全角半角スペース除去、英字小文字化、全角英数を半角化、カタカナをひらがなへ変換）
 */
export function normalizeKeyword(input: string): string {
  if (!input) return '';
  let s = input.trim().replace(/\s+/g, '').toLowerCase();
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  s = s.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  return s;
}

/**
 * 入力された合言葉（キーワード）が合致するか検証
 */
export function isSharedKeywordValid(input: string, customDef?: string): boolean {
  const normInput = normalizeKeyword(input);
  if (!normInput) return false;

  if (customDef && customDef.trim()) {
    if (normInput === normalizeKeyword(customDef)) return true;
  }
  const savedCustomDef = localStorage.getItem(LS_CUSTOM_KEYWORD_DEF_KEY);
  if (savedCustomDef && savedCustomDef.trim()) {
    if (normInput === normalizeKeyword(savedCustomDef)) return true;
  }

  return DEFAULT_SHARED_KEYWORDS.some((kw) => normInput === normalizeKeyword(kw));
}

export function getSavedSharedKeyword(): string | null {
  return localStorage.getItem(LS_SHARED_KEYWORD_KEY);
}

export function setSavedSharedKeyword(kw: string | null): void {
  if (!kw) {
    localStorage.removeItem(LS_SHARED_KEYWORD_KEY);
  } else {
    localStorage.setItem(LS_SHARED_KEYWORD_KEY, kw.trim());
  }
}

export function getCustomKeywordDef(): string | null {
  return localStorage.getItem(LS_CUSTOM_KEYWORD_DEF_KEY);
}

export function setCustomKeywordDef(kw: string | null): void {
  if (!kw) {
    localStorage.removeItem(LS_CUSTOM_KEYWORD_DEF_KEY);
  } else {
    localStorage.setItem(LS_CUSTOM_KEYWORD_DEF_KEY, kw.trim());
  }
}

const GIST_FILENAME = 'futari-calendar-encrypted.json';

// IndexedDB ヘルパー
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openIdb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(key: string, val: T): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDBが使えない環境ではlocalStorageでカバー
  }
}

// 📸 お気に入り写真・ウェルカム画像の専用永続化（クラウド同期や容量制限で絶対に消えない独立保存領域）
export async function saveDedicatedWelcomePhoto(config: WelcomeImageConfig): Promise<void> {
  try {
    await idbSet(LS_WELCOME_PHOTO_KEY, config);
  } catch {}
  try {
    localStorage.setItem(LS_WELCOME_PHOTO_KEY, JSON.stringify(config));
  } catch {}
}

export async function loadDedicatedWelcomePhoto(): Promise<WelcomeImageConfig | null> {
  const fromIdb = await idbGet<WelcomeImageConfig>(LS_WELCOME_PHOTO_KEY);
  if (fromIdb && fromIdb.dataUrl) {
    return fromIdb;
  }
  try {
    const raw = localStorage.getItem(LS_WELCOME_PHOTO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WelcomeImageConfig;
      if (parsed && parsed.dataUrl) return parsed;
    }
  } catch {}
  return fromIdb || null;
}

// ISO日時文字列をミリ秒に変換
function toTimeMs(iso?: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Conflict-Free Merge（データが消えない差分マージ）
 * ローカルとクラウド（またはバックアップ）のデータをIDごとに updatedAt タイムスタンプ比較し、
 * 新しい方を採用して統合します。
 */
export function mergeCalendarStores(
  local: CalendarDataStore,
  remote: CalendarDataStore
): CalendarDataStore {
  // 1. シフトのマージ（IDごと）
  const mergedShifts: Record<string, ShiftEntry> = { ...local.shifts };
  for (const [id, remoteShift] of Object.entries(remote.shifts || {})) {
    const localShift = mergedShifts[id];
    if (!localShift || toTimeMs(remoteShift.updatedAt) > toTimeMs(localShift.updatedAt)) {
      mergedShifts[id] = remoteShift;
    }
  }

  // クラウド同期・マージ時にも休出と残業の重複二重登録を自動クリーンアップ
  for (const [id, s] of Object.entries(mergedShifts)) {
    if (!s || s.deletedAt) continue;
    const otMin = s.overtimeMinutes ?? (s.overtimeHours ? s.overtimeHours * 60 : 0);
    const hwMin = s.holidayWorkMinutes ?? (s.holidayWorkHours ? s.holidayWorkHours * 60 : 0);
    if (hwMin > 0 && otMin > 0) {
      mergedShifts[id] = {
        ...s,
        isHolidayWork: true,
        overtimeMinutes: 0,
        overtimeHours: 0,
        overtimeStartTime: undefined,
        overtimeEndTime: undefined,
      };
    }
  }

  // 2. 予定イベントのマージ（IDごと：更新時刻が新しい方を優先しつつ同期メタデータを欠落させない）
  const mergedEvents: Record<string, ScheduleEvent> = { ...local.events };
  for (const [id, remoteEvent] of Object.entries(remote.events || {})) {
    const localEvent = mergedEvents[id];
    if (!localEvent) {
      mergedEvents[id] = remoteEvent;
      continue;
    }
    const remoteIsNewer = toTimeMs(remoteEvent.updatedAt) > toTimeMs(localEvent.updatedAt);
    const primary = remoteIsNewer ? remoteEvent : localEvent;
    const secondary = remoteIsNewer ? localEvent : remoteEvent;

    if (primary.deletedAt) {
      if (!secondary.deletedAt) {
        const mergedDelGEventIds =
          primary.googleEventIds || secondary.googleEventIds
            ? { ...(secondary.googleEventIds || {}), ...(primary.googleEventIds || {}) }
            : undefined;
        mergedEvents[id] = {
          ...primary,
          googleEventId: primary.googleEventId || secondary.googleEventId,
          googleEventIds: mergedDelGEventIds,
          googleTaskId: primary.googleTaskId || secondary.googleTaskId,
          googleTaskListId: primary.googleTaskListId || secondary.googleTaskListId,
        };
      } else {
        mergedEvents[id] = primary;
      }
      continue;
    }

    const mergedGEventIds =
      primary.googleEventIds || secondary.googleEventIds
        ? { ...(secondary.googleEventIds || {}), ...(primary.googleEventIds || {}) }
        : undefined;

    mergedEvents[id] = {
      ...primary,
      googleEventId: primary.googleEventId || secondary.googleEventId,
      googleEventIds: mergedGEventIds,
      googleCalSynced: Boolean(primary.googleCalSynced || secondary.googleCalSynced),
      googleTaskId: primary.googleTaskId || secondary.googleTaskId,
      googleTaskListId: primary.googleTaskListId || secondary.googleTaskListId,
      googleTaskSynced: Boolean(primary.googleTaskSynced || secondary.googleTaskSynced),
    };
  }

  // 3. すれ違いサポートアイコン（日付ごと）のマージ
  const mergedSupports: Record<string, DaySupportEntry> = { ...(local.daySupports || {}) };
  for (const [date, remoteSup] of Object.entries(remote.daySupports || {})) {
    const localSup = mergedSupports[date];
    if (!localSup || toTimeMs(remoteSup.updatedAt) > toTimeMs(localSup.updatedAt)) {
      mergedSupports[date] = remoteSup;
    }
  }

  // 4. スタンププリセットのマージ（専用 updatedAt を比較し、新規端末や無関係な編集による上書きを防止）
  const hasStampsTs = Boolean(local.stampsUpdatedAt || remote.stampsUpdatedAt);
  const pickRemoteStamps = hasStampsTs
    ? toTimeMs(remote.stampsUpdatedAt) > toTimeMs(local.stampsUpdatedAt)
    : !local.updatedAt && Boolean(remote.updatedAt)
    ? true
    : !remote.updatedAt && Boolean(local.updatedAt)
    ? false
    : toTimeMs(remote.updatedAt) > toTimeMs(local.updatedAt);

  const primaryStamps = (pickRemoteStamps ? remote.stamps : local.stamps) || [];
  const mergedStampsUpdatedAt = pickRemoteStamps
    ? remote.stampsUpdatedAt || local.stampsUpdatedAt
    : local.stampsUpdatedAt || remote.stampsUpdatedAt;

  const stampMap = new Map<string, StampPreset>();
  for (const s of primaryStamps) {
    if (!LEGACY_DEFAULT_STAMP_IDS.has(s.id) && s.type === 'shift') {
      stampMap.set(s.id, { ...s, partnerId: s.partnerId || 'partnerA' });
    }
  }
  // さや側（partnerB）のスタンプが万一1件も無い場合のみデフォルトを維持
  if (!Array.from(stampMap.values()).some((s) => s.partnerId === 'partnerB')) {
    for (const s of DEFAULT_STAMP_PRESETS) {
      if (s.partnerId === 'partnerB') {
        stampMap.set(s.id, s);
      }
    }
  }
  const mergedStamps = Array.from(stampMap.values()).sort((a, b) => a.order - b.order);

  // 4-2. カレンダー予定項目（categories）のマージ（専用 updatedAt で比較）
  const hasCatsTs = Boolean(local.categoriesUpdatedAt || remote.categoriesUpdatedAt);
  const pickRemoteCats = hasCatsTs
    ? toTimeMs(remote.categoriesUpdatedAt) > toTimeMs(local.categoriesUpdatedAt)
    : !local.updatedAt && Boolean(remote.updatedAt)
    ? true
    : !remote.updatedAt && Boolean(local.updatedAt)
    ? false
    : toTimeMs(remote.updatedAt) > toTimeMs(local.updatedAt);
  const mergedCategories = pickRemoteCats
    ? remote.categories || local.categories
    : local.categories || remote.categories;
  const mergedCategoriesUpdatedAt = pickRemoteCats
    ? remote.categoriesUpdatedAt || local.categoriesUpdatedAt
    : local.categoriesUpdatedAt || remote.categoriesUpdatedAt;

  // 5. メタデータ＆最終確認日時（lastSeenAt は常に新しい方を採用）
  const localMeta = local.metadata;
  const remoteMeta = remote.metadata;

  // 📸 お気に入り写真・ウェルカム設定のマージ保護（updatedAt がある場合は削除も含めて新しい方を優先）
  const localWelcome = localMeta?.welcomeImageConfig;
  const remoteWelcome = remoteMeta?.welcomeImageConfig;
  let mergedWelcome: WelcomeImageConfig | undefined = localWelcome || remoteWelcome;

  if (localWelcome?.updatedAt || remoteWelcome?.updatedAt) {
    mergedWelcome =
      toTimeMs(remoteWelcome?.updatedAt) > toTimeMs(localWelcome?.updatedAt)
        ? remoteWelcome
        : localWelcome;
  } else if (localWelcome?.dataUrl) {
    mergedWelcome = localWelcome;
  } else if (remoteWelcome?.dataUrl) {
    mergedWelcome = remoteWelcome;
  } else if (localWelcome) {
    mergedWelcome = localWelcome;
  } else if (remoteWelcome) {
    mergedWelcome = remoteWelcome;
  }

  // 👫 パートナーA / B のアイコン・プロフィールマージ保護（相手端末の同期でアイコンが初期化されるのを完全防止）
  const mergePartnerProfile = (
    pid: 'partnerA' | 'partnerB',
    defaultAvatar: string,
    defaultName: string
  ) => {
    const locP = localMeta?.partners?.[pid];
    const remP = remoteMeta?.partners?.[pid];
    if (!locP && !remP) {
      return { name: defaultName, avatar: defaultAvatar, themeColor: '', bgColor: '', lastSeenAt: '' };
    }
    if (!remP) return locP;
    if (!locP) return remP;

    // もしローカルのアバターがデフォルト以外にカスタマイズされていて、リモートがデフォルトならローカルを優先
    const locCustom = locP.avatar && locP.avatar !== defaultAvatar;
    const remCustom = remP.avatar && remP.avatar !== defaultAvatar;

    let chosenAvatar = locP.avatar || defaultAvatar;
    let chosenName = locP.name || defaultName;

    if (locCustom && !remCustom) {
      chosenAvatar = locP.avatar;
    } else if (!locCustom && remCustom) {
      chosenAvatar = remP.avatar;
    } else {
      // 両方カスタムまたは両方デフォルトの場合は更新時刻が新しい方を優先
      chosenAvatar =
        toTimeMs(remoteMeta?.updatedAt) > toTimeMs(localMeta?.updatedAt)
          ? remP.avatar || locP.avatar || defaultAvatar
          : locP.avatar || remP.avatar || defaultAvatar;
    }

    if (locP.name && locP.name !== defaultName && (!remP.name || remP.name === defaultName)) {
      chosenName = locP.name;
    } else if (remP.name && remP.name !== defaultName && (!locP.name || locP.name === defaultName)) {
      chosenName = remP.name;
    } else {
      chosenName =
        toTimeMs(remoteMeta?.updatedAt) > toTimeMs(localMeta?.updatedAt)
          ? remP.name || locP.name || defaultName
          : locP.name || remP.name || defaultName;
    }

    const lastSeen =
      toTimeMs(remP.lastSeenAt) > toTimeMs(locP.lastSeenAt)
        ? remP.lastSeenAt
        : locP.lastSeenAt;

    return {
      ...(toTimeMs(remoteMeta?.updatedAt) > toTimeMs(localMeta?.updatedAt) ? remP : locP),
      name: chosenName,
      avatar: chosenAvatar,
      lastSeenAt: lastSeen,
    };
  };

  const partnerA = mergePartnerProfile('partnerA', '🐻', 'ゆうと');
  const partnerB = mergePartnerProfile('partnerB', '🐰', 'さや');

  // 📅 Googleカレンダー双方向自動同期設定のマージ保護（明示的な空文字クリアを尊重）
  const locGcal = localMeta?.googleCalendarSyncConfig;
  const remGcal = remoteMeta?.googleCalendarSyncConfig;
  let mergedGcal: GoogleCalendarSyncConfig | undefined = locGcal || remGcal;
  if (locGcal && remGcal) {
    const isRemGcalNewer = toTimeMs(remGcal.updatedAt) > toTimeMs(locGcal.updatedAt);
    const primaryGcal = isRemGcalNewer ? remGcal : locGcal;
    const secondaryGcal = isRemGcalNewer ? locGcal : remGcal;
    mergedGcal = {
      ...secondaryGcal,
      ...primaryGcal,
      partnerAGasUrl: primaryGcal.partnerAGasUrl ?? secondaryGcal.partnerAGasUrl,
      partnerACalendarId: primaryGcal.partnerACalendarId ?? secondaryGcal.partnerACalendarId,
      partnerBGasUrl: primaryGcal.partnerBGasUrl ?? secondaryGcal.partnerBGasUrl,
      partnerBCalendarId: primaryGcal.partnerBCalendarId ?? secondaryGcal.partnerBCalendarId,
      sharedCalendarId: primaryGcal.sharedCalendarId ?? secondaryGcal.sharedCalendarId,
    };
  }

  const nowIso = new Date().toISOString();
  const maxUpdatedAt =
    toTimeMs(remote.updatedAt) > toTimeMs(local.updatedAt)
      ? remote.updatedAt
      : local.updatedAt || remote.updatedAt || '';

  return {
    version: 1,
    metadata: {
      partners: {
        partnerA,
        partnerB,
      },
      welcomeImageConfig: mergedWelcome,
      googleCalendarSyncConfig: mergedGcal,
      lastSyncedAt: nowIso,
      updatedAt:
        toTimeMs(remoteMeta?.updatedAt) > toTimeMs(localMeta?.updatedAt)
          ? remoteMeta.updatedAt
          : localMeta?.updatedAt || remoteMeta?.updatedAt || '',
    },
    categories: mergedCategories,
    categoriesUpdatedAt: mergedCategoriesUpdatedAt,
    stamps: mergedStamps,
    stampsUpdatedAt: mergedStampsUpdatedAt,
    shifts: mergedShifts,
    events: mergedEvents,
    daySupports: mergedSupports,
    updatedAt: maxUpdatedAt,
  };
}

// ローカルからデータストアを読み込み（写真専用ストレージとも自動連携復元）
export async function loadLocalStore(): Promise<CalendarDataStore> {
  let loadedStore: CalendarDataStore | null = null;
  const idbData = await idbGet<CalendarDataStore>(LS_STORE_KEY);
  if (idbData && idbData.version) {
    loadedStore = idbData;
  } else {
    try {
      const raw = localStorage.getItem(LS_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CalendarDataStore;
        if (parsed && parsed.version) {
          await idbSet(LS_STORE_KEY, parsed);
          loadedStore = parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!loadedStore) {
    loadedStore = createInitialDataStore();
    await saveLocalStore(loadedStore);
  }

  // 📸 写真専用ストレージからの確実な復元（ストア内に写真が無ければ独立保存領域から復元）
  const dedicatedPhoto = await loadDedicatedWelcomePhoto();
  if (dedicatedPhoto && dedicatedPhoto.dataUrl) {
    if (!loadedStore.metadata?.welcomeImageConfig?.dataUrl) {
      loadedStore = {
        ...loadedStore,
        metadata: {
          ...loadedStore.metadata,
          welcomeImageConfig: dedicatedPhoto,
        },
      };
    }
  }

  return loadedStore;
}

// ローカルへデータストアを保存（IndexedDB + localStorage 両方に保存し、写真専用ストレージにも二重保存）
export async function saveLocalStore(
  store: CalendarDataStore,
  password?: string
): Promise<void> {
  // 📸 写真データがあれば専用ストレージにも即座に二重保存（クラウド同期や容量制限で消えるのを100%防止）
  if (store.metadata?.welcomeImageConfig?.dataUrl) {
    await saveDedicatedWelcomePhoto(store.metadata.welcomeImageConfig);
  }

  try {
    localStorage.setItem(LS_STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota error
  }
  await idbSet(LS_STORE_KEY, store);

  if (password) {
    try {
      const encrypted = await encryptCalendarStore(store, password);
      localStorage.setItem(LS_ENCRYPTED_KEY, JSON.stringify(encrypted));
      await idbSet(LS_ENCRYPTED_KEY, encrypted);
    } catch {
      // ignore
    }
  }
}

// 保存済みパスワードハッシュの取得・設定
export function getSavedPassHash(): string | null {
  return localStorage.getItem(LS_PASS_HASH_KEY);
}

export function setSavedPassHash(hash: string | null): void {
  if (!hash) {
    localStorage.removeItem(LS_PASS_HASH_KEY);
  } else {
    localStorage.setItem(LS_PASS_HASH_KEY, hash);
  }
}

// 現在操作中のパートナーID（夫 / 妻）の取得・保存
export function getActivePartnerId(): PartnerId {
  const saved = localStorage.getItem(LS_ACTIVE_PARTNER_KEY);
  return saved === 'partnerB' ? 'partnerB' : 'partnerA';
}

export function setActivePartnerId(partnerId: PartnerId): void {
  localStorage.setItem(LS_ACTIVE_PARTNER_KEY, partnerId);
}

// クラウド同期設定の取得・保存（特定の合言葉が入力された場合のみ自動同期が有効になる）
export function loadSyncConfig(): CloudSyncConfig {
  const defaults = getDefaultCloudCredentials();
  const isKeywordAuthenticated = Boolean(getSavedSharedKeyword());
  try {
    const raw = localStorage.getItem(LS_SYNC_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CloudSyncConfig;
      const token = parsed.githubToken?.trim() || defaults.token;
      const gistId = parsed.gistId?.trim() || defaults.gistId;
      return {
        ...parsed,
        enabled: isKeywordAuthenticated && Boolean(token && (parsed.mode === 'repo' ? parsed.repoOwner : gistId)),
        githubToken: token,
        gistId,
        autoSync: parsed.autoSync ?? true,
      };
    }
  } catch {
    // ignore
  }
  return {
    enabled: isKeywordAuthenticated && Boolean(defaults.token && defaults.gistId),
    mode: 'gist',
    githubToken: defaults.token,
    gistId: defaults.gistId,
    repoOwner: 'rokiwo',
    repoName: 'futari-calendar',
    repoBranch: 'main',
    repoFilePath: 'data/calendar-encrypted.json',
    autoSync: true,
  };
}

export function saveSyncConfig(config: CloudSyncConfig): void {
  localStorage.setItem(LS_SYNC_CONFIG_KEY, JSON.stringify(config));
}

// UTF-8 文字列と Base64 の変換（GitHub Contents API用）
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const clean = b64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// 新しいシークレットGistをワンタップで自動作成
export async function createNewSecretGist(
  githubToken: string,
  store: CalendarDataStore,
  password: string
): Promise<string> {
  const defaults = getDefaultCloudCredentials();
  const effectivePass = password?.trim() || defaults.defaultPass;
  const effectiveToken = githubToken?.trim() || defaults.token;
  const encrypted = await encryptCalendarStore(store, effectivePass);
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${effectiveToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: 'ペアカレ (PairCal) 暗号化スケジュールデータ（AES-GCM 256bit）',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(encrypted, null, 2),
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gistの作成に失敗しました (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.id as string;
}

// GitHub (Secret Gist または リポジトリ内専用データファイル) と双方向マージ同期を実行
export async function syncWithGitHub(
  localStore: CalendarDataStore,
  config: CloudSyncConfig,
  password?: string
): Promise<{ mergedStore: CalendarDataStore; statusMessage: string }> {
  const defaults = getDefaultCloudCredentials();
  const effectiveToken = config.githubToken?.trim() || defaults.token;
  const effectiveGistId = config.gistId?.trim() || defaults.gistId;
  const effectivePass = password?.trim() || defaults.defaultPass;

  if (!effectiveToken) {
    throw new Error('クラウド同期トークンが設定されていません。');
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${effectiveToken}`,
    'Content-Type': 'application/json',
  };

  let mergedStore = localStore;

  if (config.mode === 'gist') {
    if (!effectiveGistId) {
      throw new Error('Gist ID が未設定です。');
    }
    const gistUrl = `https://api.github.com/gists/${effectiveGistId}`;
    const getRes = await fetch(gistUrl, { headers, cache: 'no-store' });
    if (!getRes.ok) {
      throw new Error(`クラウドデータの取得に失敗しました (${getRes.status})。`);
    }
    const gistData = await getRes.json();
    const fileObj =
      gistData.files?.[GIST_FILENAME] ||
      (Object.values(gistData.files || {})[0] as
        | { content?: string; truncated?: boolean; raw_url?: string }
        | undefined);

    let rawContent = fileObj?.content || '';
    if (fileObj?.truncated && fileObj.raw_url) {
      let rawRes = await fetch(fileObj.raw_url, { cache: 'no-store' });
      if (!rawRes.ok) {
        rawRes = await fetch(fileObj.raw_url, {
          headers: { Authorization: `Bearer ${effectiveToken}` },
          cache: 'no-store',
        });
      }
      if (!rawRes.ok) {
        throw new Error(`大容量クラウドデータの取得に失敗しました (${rawRes.status})。`);
      }
      rawContent = await rawRes.text();
    }

    if (rawContent.trim()) {
      let parsed: EncryptedPayload;
      try {
        parsed = JSON.parse(rawContent) as EncryptedPayload;
      } catch {
        throw new Error('クラウドデータの解析に失敗しました（破損またはサイズ制限の可能性があります）。データ保護のため上書きを中止しました。');
      }
      if (!parsed || parsed.app !== 'FutariCal' || !parsed.ciphertext) {
        throw new Error('クラウドデータの形式が不正なため、データ保護のため上書きを中止しました。');
      }
      let remoteStore: CalendarDataStore;
      try {
        remoteStore = await decryptCalendarStore(parsed, effectivePass);
      } catch {
        try {
          // カスタムパスワードからデフォルトキーへフォールバック試行
          remoteStore = await decryptCalendarStore(parsed, defaults.defaultPass);
        } catch {
          throw new Error('クラウドデータの復号に失敗しました（合言葉/パスワードが違う可能性があります）。データ保護のため上書きを中止しました。');
        }
      }
      mergedStore = mergeCalendarStores(localStore, remoteStore);
    }

    // マージ後のストアを暗号化してGistへ保存
    const encrypted = await encryptCalendarStore(mergedStore, effectivePass);
    const patchRes = await fetch(gistUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(encrypted, null, 2),
          },
        },
      }),
    });

    if (!patchRes.ok) {
      throw new Error(`クラウドへの保存に失敗しました (${patchRes.status})。`);
    }

    await saveLocalStore(mergedStore, effectivePass);
    return {
      mergedStore,
      statusMessage: '✨ 夫婦クラウドと自動同期しました！',
    };
  } else {
    // リポジトリ内専用ファイル (例: data/calendar-encrypted.json) モード
    const owner = config.repoOwner?.trim() || 'rokiwo';
    const repo = config.repoName?.trim() || 'futari-calendar';
    const branch = config.repoBranch?.trim() || 'main';
    const filePath = (config.repoFilePath?.trim() || 'data/calendar-encrypted.json').replace(/^\/+/, '');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    let existingSha: string | undefined;

    const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
      headers,
      cache: 'no-store',
    });

    if (getRes.ok) {
      const fileData = await getRes.json();
      existingSha = fileData.sha;
      let rawB64 = fileData.content || '';
      if ((fileData.encoding === 'none' || (!rawB64 && fileData.size > 0)) && fileData.sha) {
        const blobRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs/${fileData.sha}`,
          { headers, cache: 'no-store' }
        );
        if (!blobRes.ok) {
          throw new Error(`大容量リポジトリデータの取得に失敗しました (${blobRes.status})`);
        }
        const blobData = await blobRes.json();
        rawB64 = blobData.content || '';
      }
      if (rawB64.trim()) {
        const jsonStr = base64ToUtf8(rawB64);
        const parsed = JSON.parse(jsonStr) as EncryptedPayload;
        if (!parsed || parsed.app !== 'FutariCal' || !parsed.ciphertext) {
          throw new Error('リポジトリデータの形式が不正なため上書きを中止しました');
        }
        let remoteStore: CalendarDataStore;
        try {
          remoteStore = await decryptCalendarStore(parsed, effectivePass);
        } catch {
          remoteStore = await decryptCalendarStore(parsed, defaults.defaultPass);
        }
        mergedStore = mergeCalendarStores(localStore, remoteStore);
      }
    } else if (getRes.status !== 404) {
      throw new Error(`リポジトリデータ取得エラー (${getRes.status})`);
    }

    const encrypted = await encryptCalendarStore(mergedStore, effectivePass);
    const contentB64 = utf8ToBase64(JSON.stringify(encrypted, null, 2));

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Sync encrypted calendar data (${new Date().toLocaleString('ja-JP')})`,
        content: contentB64,
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });

    if (!putRes.ok) {
      throw new Error(`リポジトリへの暗号化データ保存に失敗しました (${putRes.status})`);
    }

    await saveLocalStore(mergedStore, effectivePass);
    return {
      mergedStore,
      statusMessage: `✨ 夫婦クラウド (${owner}/${repo}) と自動同期しました！`,
    };
  }
}

// ===== 🛡️ 自動ローカルバックアップ（IndexedDBローリング保存）＆ クラウド履歴タイムマシン復元 =====

export function countActiveStoreItems(store: CalendarDataStore): {
  shifts: number;
  events: number;
  tasks: number;
} {
  let shifts = 0;
  for (const s of Object.values(store.shifts || {})) {
    if (s && !s.deletedAt) shifts++;
  }
  let events = 0;
  let tasks = 0;
  for (const ev of Object.values(store.events || {})) {
    if (!ev || ev.deletedAt) continue;
    if (ev.isTask) tasks++;
    else events++;
  }
  return { shifts, events, tasks };
}

function stripHeavyWelcomePhoto(store: CalendarDataStore): CalendarDataStore {
  if (!store.metadata?.welcomeImageConfig?.dataUrl) return store;
  return {
    ...store,
    metadata: {
      ...store.metadata,
      welcomeImageConfig: {
        ...store.metadata.welcomeImageConfig,
        dataUrl: '',
      },
    },
  };
}

export async function loadLocalBackupSnapshots(): Promise<LocalBackupSnapshot[]> {
  const fromIdb = await idbGet<LocalBackupSnapshot[]>(IDB_AUTO_BACKUPS_KEY);
  if (Array.isArray(fromIdb) && fromIdb.length > 0) {
    return fromIdb.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
  try {
    const raw = localStorage.getItem(LS_AUTO_BACKUPS_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalBackupSnapshot[];
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      }
    }
  } catch {
    // ignore
  }
  return [];
}

async function persistLocalBackupSnapshots(list: LocalBackupSnapshot[]): Promise<void> {
  await idbSet(IDB_AUTO_BACKUPS_KEY, list);
  try {
    // localStorage 側には容量超過しない範囲で最新3件のみ保険保存
    localStorage.setItem(LS_AUTO_BACKUPS_FALLBACK_KEY, JSON.stringify(list.slice(0, 3)));
  } catch {
    // ignore quota error
  }
}

/**
 * 端末内（IndexedDB）へローリング自動バックアップを保存する。
 * - 空データのスナップショットは自動保存しない（force=true時を除く）
 * - 最新19件＋過去データの中で件数が最大の1件を必ず保持し、万が一空同期が連続しても良質な控えが押し出されないように保護
 */
export async function saveLocalBackupSnapshot(
  store: CalendarDataStore,
  reason: string,
  options?: { force?: boolean; minIntervalMs?: number }
): Promise<LocalBackupSnapshot | null> {
  const counts = countActiveStoreItems(store);
  const totalCount = counts.shifts + counts.events + counts.tasks;
  if (totalCount === 0 && !options?.force) {
    return null;
  }

  const existing = await loadLocalBackupSnapshots();
  const latest = existing[0];
  const nowMs = Date.now();
  const minInterval = options?.minIntervalMs ?? 5 * 60 * 1000;

  if (
    !options?.force &&
    latest &&
    latest.counts.shifts === counts.shifts &&
    latest.counts.events === counts.events &&
    latest.counts.tasks === counts.tasks &&
    latest.store.updatedAt === store.updatedAt &&
    nowMs - (Date.parse(latest.createdAt) || 0) < minInterval
  ) {
    return null;
  }

  const nowIso = new Date(nowMs).toISOString();
  const snap: LocalBackupSnapshot = {
    id: `bak_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: nowIso,
    reason,
    counts,
    store: stripHeavyWelcomePhoto(store),
  };

  const combined = [snap, ...existing];
  // 各日付（ローカル YYYY-MM-DD）ごとにその日の最後に保存された1件を確実に残す（1日に何度同期しても前日・前々日が押し出されない）
  const latestByDay = new Map<string, LocalBackupSnapshot>();
  for (const item of combined) {
    const dk = toLocalDateKey(item.createdAt);
    if (!latestByDay.has(dk)) {
      latestByDay.set(dk, item);
    }
  }
  const dedupedDaily = Array.from(latestByDay.values()).sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  );
  let trimmed = dedupedDaily;
  if (dedupedDaily.length > MAX_LOCAL_BACKUPS) {
    const recent = dedupedDaily.slice(0, MAX_LOCAL_BACKUPS - 1);
    const overflow = dedupedDaily.slice(MAX_LOCAL_BACKUPS - 1);
    let richest = overflow[0];
    let richestTotal =
      richest.counts.shifts + richest.counts.events + richest.counts.tasks;
    for (const cand of overflow.slice(1)) {
      const t = cand.counts.shifts + cand.counts.events + cand.counts.tasks;
      if (t > richestTotal) {
        richest = cand;
        richestTotal = t;
      }
    }
    trimmed = [...recent, richest];
  }

  await persistLocalBackupSnapshots(trimmed);
  return snap;
}

function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return (iso || '').slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface DailyBackupSlot {
  dayOffset: 0 | 1 | 2;
  dayLabel: string;
  dateKey: string;
  snapshot: LocalBackupSnapshot | null;
}

/**
 * 過去3日間（今日・前日・前々日）について、各日の最後に保存されたバックアップ1件ずつを返す
 */
export function getRecent3DaysLatestBackups(
  snapshots: LocalBackupSnapshot[],
  nowDate = new Date()
): DailyBackupSlot[] {
  const sorted = [...(snapshots || [])].sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  );
  const byDay = new Map<string, LocalBackupSnapshot>();
  for (const snap of sorted) {
    const dk = toLocalDateKey(snap.createdAt);
    if (!byDay.has(dk)) {
      byDay.set(dk, snap);
    }
  }

  const labels: ['今日', '前日', '前々日'] = ['今日', '前日', '前々日'];
  return ([0, 1, 2] as const).map((offset) => {
    const dt = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate() - offset
    );
    const dk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
      dt.getDate()
    ).padStart(2, '0')}`;
    return {
      dayOffset: offset,
      dayLabel: labels[offset],
      dateKey: dk,
      snapshot: byDay.get(dk) || null,
    };
  });
}

export async function deleteLocalBackupSnapshot(id: string): Promise<LocalBackupSnapshot[]> {
  const existing = await loadLocalBackupSnapshots();
  const next = existing.filter((s) => s.id !== id);
  await persistLocalBackupSnapshots(next);
  return next;
}

/**
 * バックアップスナップショットから安全にデータを復活マージする。
 * 通常の mergeCalendarStores では「新しい削除(deletedAt)」が勝ってしまうため、
 * バックアップ側で有効(!deletedAt)な予定・タスク・シフトは新しい updatedAt を付与して確実に復活させ、
 * Google カレンダー / Google タスクへも再同期できるよう stale な Google ID をリセットする。
 */
export function buildRestoredStoreFromBackup(
  currentStore: CalendarDataStore,
  backupStore: CalendarDataStore
): CalendarDataStore {
  const nowIso = new Date().toISOString();

  // 1. シフト復活マージ
  const mergedShifts: Record<string, ShiftEntry> = { ...(currentStore.shifts || {}) };
  for (const [id, bShift] of Object.entries(backupStore.shifts || {})) {
    if (!bShift || bShift.deletedAt) continue;
    const cur = mergedShifts[id];
    if (!cur || cur.deletedAt) {
      mergedShifts[id] = {
        ...bShift,
        deletedAt: null,
        updatedAt: nowIso,
        googleCalSynced: false,
        googleEventIds: undefined,
      };
    } else if (toTimeMs(bShift.updatedAt) > toTimeMs(cur.updatedAt)) {
      mergedShifts[id] = bShift;
    }
  }

  // 2. 予定・タスク復活マージ（消去済みのものは新しい updatedAt で復活させ、Google再同期対象にする）
  const mergedEvents: Record<string, ScheduleEvent> = { ...(currentStore.events || {}) };
  for (const [id, bEv] of Object.entries(backupStore.events || {})) {
    if (!bEv || bEv.deletedAt) continue;
    const cur = mergedEvents[id];
    if (!cur || cur.deletedAt) {
      mergedEvents[id] = {
        ...bEv,
        deletedAt: null,
        updatedAt: nowIso,
        googleCalSynced: false,
        googleEventId: undefined,
        googleEventIds: undefined,
        googleTaskSynced: false,
        googleTaskId: undefined,
        googleTaskListId: undefined,
      };
    } else if (toTimeMs(bEv.updatedAt) > toTimeMs(cur.updatedAt)) {
      mergedEvents[id] = {
        ...bEv,
        googleEventId: cur.googleEventId || bEv.googleEventId,
        googleEventIds: cur.googleEventIds || bEv.googleEventIds,
        googleCalSynced: Boolean(cur.googleCalSynced || bEv.googleCalSynced),
        googleTaskId: cur.googleTaskId || bEv.googleTaskId,
        googleTaskListId: cur.googleTaskListId || bEv.googleTaskListId,
        googleTaskSynced: Boolean(cur.googleTaskSynced || bEv.googleTaskSynced),
      };
    }
  }

  // 3. すれ違いサポート復活マージ
  const mergedSupports: Record<string, DaySupportEntry> = { ...(currentStore.daySupports || {}) };
  for (const [date, bSup] of Object.entries(backupStore.daySupports || {})) {
    if (!bSup || !bSup.badges || bSup.badges.length === 0) continue;
    const cur = mergedSupports[date];
    if (!cur || !cur.badges || cur.badges.length === 0) {
      mergedSupports[date] = {
        ...bSup,
        updatedAt: nowIso,
      };
    }
  }

  const nextStamps =
    currentStore.stamps && currentStore.stamps.length > 0
      ? currentStore.stamps
      : backupStore.stamps || DEFAULT_STAMP_PRESETS;
  const nextCategories =
    currentStore.categories && currentStore.categories.length > 0
      ? currentStore.categories
      : backupStore.categories;

  const preservedWelcome =
    currentStore.metadata?.welcomeImageConfig?.dataUrl
      ? currentStore.metadata.welcomeImageConfig
      : backupStore.metadata?.welcomeImageConfig || currentStore.metadata?.welcomeImageConfig;

  return {
    ...currentStore,
    shifts: mergedShifts,
    events: mergedEvents,
    daySupports: mergedSupports,
    stamps: nextStamps,
    categories: nextCategories,
    metadata: {
      ...currentStore.metadata,
      welcomeImageConfig: preservedWelcome,
      updatedAt: nowIso,
    },
    updatedAt: nowIso,
  };
}

/**
 * GitHub Gist の過去リビジョン一覧（クラウド・タイムマシン履歴）を取得
 */
export async function fetchCloudBackupRevisions(
  config: CloudSyncConfig,
  limit = 15
): Promise<CloudBackupRevision[]> {
  const defaults = getDefaultCloudCredentials();
  const effectiveToken = config.githubToken?.trim() || defaults.token;
  const effectiveGistId = config.gistId?.trim() || defaults.gistId;
  if (!effectiveToken || !effectiveGistId) {
    throw new Error('クラウド同期設定（Gist ID / Token）が見つかりません。');
  }
  const res = await fetch(
    `https://api.github.com/gists/${effectiveGistId}/commits?per_page=${Math.min(30, Math.max(1, limit))}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${effectiveToken}`,
      },
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    throw new Error(`クラウド履歴の取得に失敗しました (${res.status})`);
  }
  const list = (await res.json()) as Array<{ version?: string; committed_at?: string }>;
  return (list || [])
    .filter((c) => Boolean(c.version && c.committed_at))
    .map((c) => ({
      version: String(c.version),
      committedAt: String(c.committed_at),
    }));
}

/**
 * 指定した GitHub Gist リビジョンを取得して復号する
 */
export async function loadCloudBackupRevision(
  config: CloudSyncConfig,
  versionSha: string,
  password?: string
): Promise<CalendarDataStore> {
  const defaults = getDefaultCloudCredentials();
  const effectiveToken = config.githubToken?.trim() || defaults.token;
  const effectiveGistId = config.gistId?.trim() || defaults.gistId;
  const effectivePass = password?.trim() || defaults.defaultPass;
  if (!effectiveToken || !effectiveGistId) {
    throw new Error('クラウド同期設定（Gist ID / Token）が見つかりません。');
  }
  const res = await fetch(`https://api.github.com/gists/${effectiveGistId}/${versionSha}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${effectiveToken}`,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`クラウド履歴データの取得に失敗しました (${res.status})`);
  }
  const gistData = await res.json();
  const fileObj =
    gistData.files?.[GIST_FILENAME] ||
    (gistData.files ? Object.values(gistData.files)[0] : null);
  if (!fileObj) {
    throw new Error('このリビジョンにカレンダーデータが見つかりませんでした。');
  }
  let rawContent: string = fileObj.content || '';
  if (fileObj.truncated && fileObj.raw_url) {
    const rawRes = await fetch(fileObj.raw_url, { cache: 'no-store' });
    if (!rawRes.ok) {
      throw new Error(`大容量クラウド履歴データの取得に失敗しました (${rawRes.status})`);
    }
    rawContent = await rawRes.text();
  }
  const parsed = JSON.parse(rawContent) as EncryptedPayload | CalendarDataStore;
  if ('ciphertext' in parsed && parsed.ciphertext) {
    try {
      return await decryptCalendarStore(parsed as EncryptedPayload, effectivePass);
    } catch {
      return await decryptCalendarStore(parsed as EncryptedPayload, defaults.defaultPass);
    }
  }
  if ('shifts' in parsed && 'events' in parsed) {
    return parsed as CalendarDataStore;
  }
  throw new Error('クラウド履歴データの形式を認識できませんでした。');
}
