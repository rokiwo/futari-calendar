// IndexedDB + localStorage 永続化 ＆ Conflict-Free 差分マージ ＆ GitHub Gist/Repo クラウド同期モジュール
import {
  CalendarDataStore,
  CloudSyncConfig,
  DaySupportEntry,
  EncryptedPayload,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
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

  // 2. 予定イベントのマージ（IDごと）
  const mergedEvents: Record<string, ScheduleEvent> = { ...local.events };
  for (const [id, remoteEvent] of Object.entries(remote.events || {})) {
    const localEvent = mergedEvents[id];
    if (!localEvent || toTimeMs(remoteEvent.updatedAt) > toTimeMs(localEvent.updatedAt)) {
      mergedEvents[id] = remoteEvent;
    }
  }

  // 3. すれ違いサポートアイコン（日付ごと）のマージ
  const mergedSupports: Record<string, DaySupportEntry> = { ...(local.daySupports || {}) };
  for (const [date, remoteSup] of Object.entries(remote.daySupports || {})) {
    const localSup = mergedSupports[date];
    if (!localSup || toTimeMs(remoteSup.updatedAt) > toTimeMs(localSup.updatedAt)) {
      mergedSupports[date] = remoteSup;
    }
  }

  // 4. スタンププリセットのマージ（旧デフォルトスタンプは除外し、更新日時が新しい方を優先しつつ統合）
  const isRemoteNewer = toTimeMs(remote.updatedAt) > toTimeMs(local.updatedAt);
  const primaryStamps = (isRemoteNewer ? remote.stamps : local.stamps) || [];
  const secondaryStamps = (isRemoteNewer ? local.stamps : remote.stamps) || [];

  const stampMap = new Map<string, StampPreset>();
  for (const s of DEFAULT_STAMP_PRESETS) {
    stampMap.set(s.id, s);
  }
  for (const s of secondaryStamps) {
    if (!LEGACY_DEFAULT_STAMP_IDS.has(s.id) && s.type === 'shift') {
      stampMap.set(s.id, { ...s, partnerId: s.partnerId || 'partnerA' });
    }
  }
  for (const s of primaryStamps) {
    if (!LEGACY_DEFAULT_STAMP_IDS.has(s.id) && s.type === 'shift') {
      stampMap.set(s.id, { ...s, partnerId: s.partnerId || 'partnerA' });
    }
  }
  const mergedStamps = Array.from(stampMap.values()).sort((a, b) => a.order - b.order);

  // 4-2. カレンダー予定項目（categories）のマージ
  const mergedCategories =
    toTimeMs(remote.updatedAt) > toTimeMs(local.updatedAt)
      ? remote.categories || local.categories
      : local.categories || remote.categories;

  // 5. メタデータ＆最終確認日時（lastSeenAt は常に新しい方を採用）
  const localMeta = local.metadata;
  const remoteMeta = remote.metadata;
  const newerMeta =
    toTimeMs(remoteMeta?.updatedAt) > toTimeMs(localMeta?.updatedAt) ? remoteMeta : localMeta;

  const partnerALastSeen =
    toTimeMs(remoteMeta?.partners?.partnerA?.lastSeenAt) >
    toTimeMs(localMeta?.partners?.partnerA?.lastSeenAt)
      ? remoteMeta.partners.partnerA.lastSeenAt
      : localMeta.partners.partnerA.lastSeenAt;

  const partnerBLastSeen =
    toTimeMs(remoteMeta?.partners?.partnerB?.lastSeenAt) >
    toTimeMs(localMeta?.partners?.partnerB?.lastSeenAt)
      ? remoteMeta.partners.partnerB.lastSeenAt
      : localMeta.partners.partnerB.lastSeenAt;

  const nowIso = new Date().toISOString();

  return {
    version: 1,
    metadata: {
      partners: {
        partnerA: {
          ...(newerMeta?.partners?.partnerA || localMeta.partners.partnerA),
          lastSeenAt: partnerALastSeen,
        },
        partnerB: {
          ...(newerMeta?.partners?.partnerB || localMeta.partners.partnerB),
          lastSeenAt: partnerBLastSeen,
        },
      },
      lastSyncedAt: nowIso,
      updatedAt:
        toTimeMs(remoteMeta?.updatedAt) > toTimeMs(localMeta?.updatedAt)
          ? remoteMeta.updatedAt
          : localMeta.updatedAt,
    },
    categories: mergedCategories,
    stamps: mergedStamps,
    shifts: mergedShifts,
    events: mergedEvents,
    daySupports: mergedSupports,
    updatedAt: nowIso,
  };
}

// ローカルからデータストアを読み込み
export async function loadLocalStore(): Promise<CalendarDataStore> {
  const idbData = await idbGet<CalendarDataStore>(LS_STORE_KEY);
  if (idbData && idbData.version) {
    return idbData;
  }
  try {
    const raw = localStorage.getItem(LS_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CalendarDataStore;
      if (parsed && parsed.version) {
        await idbSet(LS_STORE_KEY, parsed);
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  const initial = createInitialDataStore();
  await saveLocalStore(initial);
  return initial;
}

// ローカルへデータストアを保存（IndexedDB + localStorage 両方に保存し、パスワードがあれば暗号化データも更新）
export async function saveLocalStore(
  store: CalendarDataStore,
  password?: string
): Promise<void> {
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

// クラウド同期設定の取得・保存（デフォルトで自動クラウド同期がONになる設計）
export function loadSyncConfig(): CloudSyncConfig {
  const defaults = getDefaultCloudCredentials();
  try {
    const raw = localStorage.getItem(LS_SYNC_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CloudSyncConfig;
      const token = parsed.githubToken?.trim() || defaults.token;
      const gistId = parsed.gistId?.trim() || defaults.gistId;
      return {
        ...parsed,
        enabled: Boolean(token && (parsed.mode === 'repo' ? parsed.repoOwner : gistId)),
        githubToken: token,
        gistId,
        autoSync: parsed.autoSync ?? true,
      };
    }
  } catch {
    // ignore
  }
  return {
    enabled: Boolean(defaults.token && defaults.gistId),
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
      description: 'ふたりカレ (FutariCal) 暗号化スケジュールデータ（AES-GCM 256bit）',
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
      (Object.values(gistData.files || {})[0] as { content?: string } | undefined);

    if (fileObj && fileObj.content) {
      try {
        const parsed = JSON.parse(fileObj.content) as EncryptedPayload;
        if (parsed && parsed.app === 'FutariCal') {
          try {
            const remoteStore = await decryptCalendarStore(parsed, effectivePass);
            mergedStore = mergeCalendarStores(localStore, remoteStore);
          } catch {
            // カスタムパスワードからデフォルトキーへフォールバック試行
            const remoteStore = await decryptCalendarStore(parsed, defaults.defaultPass);
            mergedStore = mergeCalendarStores(localStore, remoteStore);
          }
        }
      } catch {
        // 初回または空ファイルの場合はそのままアップロードへ進む
      }
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
      if (fileData.content) {
        const jsonStr = base64ToUtf8(fileData.content);
        const parsed = JSON.parse(jsonStr) as EncryptedPayload;
        if (parsed && parsed.app === 'FutariCal') {
          const remoteStore = await decryptCalendarStore(parsed, effectivePass);
          mergedStore = mergeCalendarStores(localStore, remoteStore);
        }
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
