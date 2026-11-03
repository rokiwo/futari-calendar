import React, { useRef, useState } from 'react';
import {
  X,
  Cloud,
  Calendar,
  Users,
  ShieldCheck,
  RefreshCw,
  Download,
  Upload,
  Sparkles,
  Copy,
  Check,
  KeyRound,
  FolderGit2,
} from 'lucide-react';
import {
  CalendarCategoryId,
  CalendarDataStore,
  CloudSyncConfig,
  EncryptedPayload,
  PartnerId,
  ScheduleEvent,
} from '../types/calendar';
import { decryptCalendarStore, encryptCalendarStore } from '../utils/crypto';
import { exportToIcs, IcsExportTarget, parseIcsEvents } from '../utils/ical';
import { createNewSecretGist } from '../utils/storage';

interface SettingsAndSyncModalProps {
  store: CalendarDataStore;
  activePartner: PartnerId;
  syncConfig: CloudSyncConfig;
  currentPassword: string;
  onClose: () => void;
  onUpdateSyncConfig: (config: CloudSyncConfig) => void;
  onUpdatePassword: (newPassword: string) => Promise<void>;
  onTriggerCloudSync: (configOverride?: CloudSyncConfig, passwordOverride?: string) => Promise<void>;
  onMergeRemoteStore: (remoteStore: CalendarDataStore, message: string) => void;
  onImportEvents: (events: ScheduleEvent[]) => void;
  onUpdatePartnerProfiles: (
    partnerAName: string,
    partnerAAvatar: string,
    partnerBName: string,
    partnerBAvatar: string
  ) => void;
}

type SettingsTab = 'sync' | 'ical_backup' | 'profile';

const AVATAR_CHOICES = ['🐻', '🐰', '🐱', '🐶', '🦊', '🐼', '🐨', '🦁', '🐥', '🐧', '🧑', '👩', '🤵', '👰'];

export const SettingsAndSyncModal: React.FC<SettingsAndSyncModalProps> = ({
  store,
  activePartner,
  syncConfig,
  currentPassword,
  onClose,
  onUpdateSyncConfig,
  onUpdatePassword,
  onTriggerCloudSync,
  onMergeRemoteStore,
  onImportEvents,
  onUpdatePartnerProfiles,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sync');

  // クラウド同期フォーム状態
  const [mode, setMode] = useState<'gist' | 'repo'>(syncConfig.mode || 'gist');
  const [githubToken, setGithubToken] = useState(syncConfig.githubToken || '');
  const [gistId, setGistId] = useState(syncConfig.gistId || '');
  const [repoOwner, setRepoOwner] = useState(syncConfig.repoOwner || '');
  const [repoName, setRepoName] = useState(syncConfig.repoName || 'futari-calendar');
  const [repoBranch, setRepoBranch] = useState(syncConfig.repoBranch || 'main');
  const [repoFilePath, setRepoFilePath] = useState(
    syncConfig.repoFilePath || 'data/calendar-encrypted.json'
  );
  const [autoSync, setAutoSync] = useState(syncConfig.autoSync ?? true);
  const [passwordInput, setPasswordInput] = useState(currentPassword || '');

  // プロフィール編集状態
  const [nameA, setNameA] = useState(store.metadata.partners.partnerA.name);
  const [avatarA, setAvatarA] = useState(store.metadata.partners.partnerA.avatar);
  const [nameB, setNameB] = useState(store.metadata.partners.partnerB.name);
  const [avatarB, setAvatarB] = useState(store.metadata.partners.partnerB.avatar);

  // iCal設定状態
  const [icsExportTarget, setIcsExportTarget] = useState<IcsExportTarget>('all');
  const [icsImportCategory, setIcsImportCategory] = useState<CalendarCategoryId>('shared');

  // UIメッセージ状態
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const icsFileInputRef = useRef<HTMLInputElement>(null);
  const jsonRestoreInputRef = useRef<HTMLInputElement>(null);

  const buildCurrentConfig = (overrideGistId?: string): CloudSyncConfig => ({
    enabled: Boolean(githubToken.trim() && (mode === 'repo' ? repoOwner.trim() : (overrideGistId ?? gistId).trim())),
    mode,
    githubToken: githubToken.trim(),
    gistId: (overrideGistId ?? gistId).trim(),
    repoOwner: repoOwner.trim(),
    repoName: repoName.trim() || 'futari-calendar',
    repoBranch: repoBranch.trim() || 'main',
    repoFilePath: repoFilePath.trim() || 'data/calendar-encrypted.json',
    autoSync,
  });

  // 設定保存＆今すぐ同期
  const handleSaveAndSync = async () => {
    setStatusMsg(null);
    if (!passwordInput.trim() || passwordInput.trim().length < 4) {
      setStatusMsg({
        type: 'err',
        text: '暗号化用の「ふたりの合言葉（4文字以上）」を入力してください🔑',
      });
      return;
    }

    setBusy(true);
    try {
      await onUpdatePassword(passwordInput.trim());
      const nextCfg = buildCurrentConfig();
      onUpdateSyncConfig(nextCfg);

      if (nextCfg.enabled) {
        await onTriggerCloudSync(nextCfg, passwordInput.trim());
        setStatusMsg({
          type: 'ok',
          text: '設定を保存し、GitHubクラウドとAES-GCM暗号化マージ同期を完了しました✨',
        });
      } else {
        setStatusMsg({
          type: 'ok',
          text: '合言葉とローカル暗号化設定を保存しました✨',
        });
      }
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '同期中にエラーが発生しました',
      });
    } finally {
      setBusy(false);
    }
  };

  // ワンタップで新しい Secret Gist を自動作成
  const handleCreateSecretGist = async () => {
    setStatusMsg(null);
    if (!githubToken.trim()) {
      setStatusMsg({
        type: 'err',
        text: '先に GitHub Personal Access Token (gistスコープ付き) を入力してください',
      });
      return;
    }
    if (!passwordInput.trim() || passwordInput.trim().length < 4) {
      setStatusMsg({
        type: 'err',
        text: '暗号化用の「ふたりの合言葉（4文字以上）」を入力してください🔑',
      });
      return;
    }

    setBusy(true);
    try {
      await onUpdatePassword(passwordInput.trim());
      const newId = await createNewSecretGist(githubToken.trim(), store, passwordInput.trim());
      setGistId(newId);
      const nextCfg = buildCurrentConfig(newId);
      onUpdateSyncConfig(nextCfg);
      setStatusMsg({
        type: 'ok',
        text: `専用シークレットGist (${newId}) を自動作成し、暗号化データを保存しました✨`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gist作成に失敗しました',
      });
    } finally {
      setBusy(false);
    }
  };

  // パートナー共有用ワンタップ設定テキストをコピー
  const handleCopyPartnerShareText = async () => {
    const shareText = [
      '【ふたりカレ (FutariCal) 共有設定💕】',
      `🌐 アプリURL: ${window.location.origin}${window.location.pathname}`,
      `🔑 合言葉(パスワード): ${passwordInput || '(設定した合言葉)'}`,
      mode === 'gist' ? `☁️ Gist ID: ${gistId}` : `☁️ Repo: ${repoOwner}/${repoName}`,
      `🔐 GitHub Token: ${githubToken}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      // ignore
    }
  };

  // .ics エクスポート実行
  const handleExportIcs = () => {
    const icsText = exportToIcs(store, icsExportTarget);
    const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `futarical-${icsExportTarget}-${new Date().toISOString().slice(0, 10)}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg({
      type: 'ok',
      text: 'iCal (.ics) ファイルを書き出しました📅 スマホやPCの標準カレンダーに取り込めます。',
    });
  };

  // .ics インポート実行
  const handleImportIcsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const events = parseIcsEvents(text, icsImportCategory, activePartner);
      if (events.length === 0) {
        setStatusMsg({ type: 'err', text: '.ics ファイル内に予定データが見つかりませんでした。' });
        return;
      }
      onImportEvents(events);
      setStatusMsg({
        type: 'ok',
        text: `${events.length} 件の予定を .ics ファイルからインポートしました✨`,
      });
    } catch {
      setStatusMsg({ type: 'err', text: '.ics ファイルの読み込みに失敗しました。' });
    } finally {
      e.target.value = '';
    }
  };

  // JSON フルバックアップ書き出し（暗号化 or 平文選択可能）
  const handleDownloadBackupJson = async (encrypt: boolean) => {
    try {
      let contentStr = '';
      let suffix = 'plain';
      if (encrypt) {
        const pass = passwordInput.trim() || currentPassword;
        if (!pass) {
          setStatusMsg({
            type: 'err',
            text: '暗号化バックアップには「合言葉（パスワード）」の設定が必要です🔑',
          });
          return;
        }
        const encryptedPayload = await encryptCalendarStore(store, pass);
        contentStr = JSON.stringify(encryptedPayload, null, 2);
        suffix = 'encrypted';
      } else {
        contentStr = JSON.stringify(store, null, 2);
      }

      const blob = new Blob([contentStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `futarical-backup-${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg({
        type: 'ok',
        text: `JSONバックアップファイル（${encrypt ? 'AES-GCM暗号化済' : '標準JSON'}）を保存しました💾`,
      });
    } catch {
      setStatusMsg({ type: 'err', text: 'バックアップの作成に失敗しました' });
    }
  };

  // JSON バックアップから差分マージ復元
  const handleRestoreBackupJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      let restoredStore: CalendarDataStore;
      if (parsed && parsed.app === 'FutariCal' && parsed.ciphertext) {
        const pass = passwordInput.trim() || currentPassword;
        if (!pass) {
          setStatusMsg({
            type: 'err',
            text: '暗号化バックアップの復元には「同期・暗号化」タブで合言葉を入力してください🔑',
          });
          return;
        }
        restoredStore = await decryptCalendarStore(parsed as EncryptedPayload, pass);
      } else if (parsed && parsed.shifts && parsed.events) {
        restoredStore = parsed as CalendarDataStore;
      } else {
        throw new Error('対応していないJSONフォーマットです');
      }

      onMergeRemoteStore(restoredStore, 'バックアップJSONから差分マージ復元しました✨');
      setStatusMsg({
        type: 'ok',
        text: 'バックアップデータを既存データと安全に差分マージ復元しました✨',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'バックアップファイルの復元に失敗しました',
      });
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[90vh] bg-[#FFFBF7] rounded-3xl shadow-2xl border-2 border-[#FFE5EC] flex flex-col overflow-hidden animate-pop"
      >
        {/* ヘッダー */}
        <div className="bg-white px-5 py-3.5 border-b border-[#FFE5EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-stone-800">
                設定・クラウド暗号化同期・連携
              </h2>
              <p className="text-[11px] text-stone-400">
                アプリをアップデートしてもデータが100%残る分離保存設計
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブバー */}
        <div className="grid grid-cols-3 gap-1 bg-white px-4 pt-2 pb-2 border-b border-stone-100">
          <button
            type="button"
            onClick={() => {
              setActiveTab('sync');
              setStatusMsg(null);
            }}
            className={`py-2 px-2 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'sync'
                ? 'bg-[#FFE5EC] text-[#9E2A47] shadow-2xs'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>暗号化・GitHub同期</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('ical_backup');
              setStatusMsg(null);
            }}
            className={`py-2 px-2 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'ical_backup'
                ? 'bg-[#E2F9FC] text-[#136370] shadow-2xs'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>iCal連携・バックアップ</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('profile');
              setStatusMsg(null);
            }}
            className={`py-2 px-2 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'profile'
                ? 'bg-[#F3EAFF] text-[#59318F] shadow-2xs'
                : 'text-stone-500 hover:bg-stone-50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>ふたりの設定</span>
          </button>
        </div>

        {/* コンテンツ領域 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {statusMsg && (
            <div
              className={`p-3 rounded-2xl font-bold border ${
                statusMsg.type === 'ok'
                  ? 'bg-[#E6F7EF] border-[#52B788] text-[#1E6645]'
                  : 'bg-rose-50 border-rose-200 text-rose-600'
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          {/* タブ1：暗号化＆GitHub同期 */}
          {activeTab === 'sync' && (
            <div className="space-y-4">
              {/* 合言葉（AES-GCM暗号鍵）設定 */}
              <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-stone-800 text-sm flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-[#FF8FAB]" />
                    1. 夫婦の合言葉（パスワードロック＆暗号鍵）
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#FFE5EC] text-[#9E2A47] font-bold text-[10px]">
                    PBKDF2 + AES-GCM 256bit
                  </span>
                </div>
                <p className="text-stone-500 leading-relaxed">
                  設定した合言葉で予定データをブラウザ内で暗号化してからGitHubに保存するため、第三者には一切解読できません。
                </p>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="夫婦の合言葉（4文字以上）を入力"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-[#FFFBF7] font-bold text-stone-800 text-sm"
                />
              </div>

              {/* GitHub 同期設定 */}
              <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-stone-800 text-sm flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#56CFE1]" />
                    2. GitHub クラウド永続化（コード更新でも消えない保存先）
                  </span>
                </div>

                {/* 保存モード選択：Secret Gist or 専用データファイル */}
                <div className="grid grid-cols-2 gap-2 bg-[#FFFBF7] p-1 rounded-xl border border-stone-200">
                  <button
                    type="button"
                    onClick={() => setMode('gist')}
                    className={`py-1.5 rounded-lg font-extrabold text-xs transition-all ${
                      mode === 'gist'
                        ? 'bg-[#FF8FAB] text-white shadow-2xs'
                        : 'text-stone-600 hover:bg-white'
                    }`}
                  >
                    🔒 Secret Gist に保存（推奨）
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('repo')}
                    className={`py-1.5 rounded-lg font-extrabold text-xs transition-all flex items-center justify-center gap-1 ${
                      mode === 'repo'
                        ? 'bg-[#56CFE1] text-white shadow-2xs'
                        : 'text-stone-600 hover:bg-white'
                    }`}
                  >
                    <FolderGit2 className="w-3.5 h-3.5" />
                    リポジトリ内専用JSON
                  </button>
                </div>

                <div>
                  <label className="block font-bold text-stone-600 mb-1">
                    GitHub Personal Access Token ({mode === 'gist' ? 'gist権限' : 'repo権限'})
                  </label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_... または github_pat_..."
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-mono text-xs"
                  />
                </div>

                {mode === 'gist' ? (
                  <div className="space-y-2">
                    <label className="block font-bold text-stone-600">
                      保存先 Secret Gist ID
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={gistId}
                        onChange={(e) => setGistId(e.target.value)}
                        placeholder="Gist ID（空欄なら右のボタンで自動作成！）"
                        className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7] font-mono text-xs"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleCreateSecretGist}
                        className="px-3 py-2 rounded-xl bg-[#F3EAFF] hover:bg-[#B388EB] text-[#59318F] hover:text-white font-extrabold text-xs transition-colors shrink-0 flex items-center gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>新しいGistを自動作成</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-stone-600 mb-1">GitHub Owner (ID)</label>
                      <input
                        type="text"
                        value={repoOwner}
                        onChange={(e) => setRepoOwner(e.target.value)}
                        placeholder="例: rokiwo"
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-stone-600 mb-1">リポジトリ名</label>
                      <input
                        type="text"
                        value={repoName}
                        onChange={(e) => setRepoName(e.target.value)}
                        placeholder="futari-calendar"
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-stone-600 mb-1">データ保存ブランチ</label>
                      <input
                        type="text"
                        value={repoBranch}
                        onChange={(e) => setRepoBranch(e.target.value)}
                        placeholder="main"
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-stone-600 mb-1">暗号化データファイルパス</label>
                      <input
                        type="text"
                        value={repoFilePath}
                        onChange={(e) => setRepoFilePath(e.target.value)}
                        placeholder="data/calendar-encrypted.json"
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FFFBF7]"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 pt-1 font-bold text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                    className="rounded text-[#FF8FAB]"
                  />
                  <span>予定やシフトを変更した時に自動でクラウド同期する</span>
                </label>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSaveAndSync}
                    className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-[#FF8FAB] to-[#B388EB] text-white font-extrabold text-xs sm:text-sm shadow-md hover:opacity-95 flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                    <span>設定を保存して今すぐ暗号化マージ同期</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyPartnerShareText}
                    className="py-3 px-3.5 rounded-2xl bg-[#FFFBF7] hover:bg-[#FFE5EC] border border-[#FFC2D1] text-[#9E2A47] font-extrabold text-xs flex items-center gap-1"
                    title="LINE等でパートナーに共有するための設定メモをコピーします"
                  >
                    {copiedShare ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedShare ? 'コピー完了!' : 'パートナー共有用コピー'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* タブ2：iCal (.ics) カレンダー連携 ＆ JSONバックアップ */}
          {activeTab === 'ical_backup' && (
            <div className="space-y-4">
              {/* iCal (.ics) エクスポート＆インポート */}
              <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-3 shadow-2xs">
                <h3 className="text-sm font-extrabold text-stone-800 flex items-center gap-1.5">
                  📅 外部カレンダー連携（.ics インポート＆エクスポート）
                </h3>
                <p className="text-stone-500">
                  Appleカレンダー・Googleカレンダー・ナスカレ等と標準iCal（.ics）形式で予定やシフトを入出力できます。
                </p>

                <div className="p-3 rounded-xl bg-[#FFFBF7] border border-stone-200/80 space-y-2">
                  <label className="block font-bold text-stone-700">
                    📤 ふたりカレのシフト・予定を .ics ファイルとして書き出す
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={icsExportTarget}
                      onChange={(e) => setIcsExportTarget(e.target.value as IcsExportTarget)}
                      className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-white font-bold"
                    >
                      <option value="all">🌈 2人のシフト＋すべての予定</option>
                      <option value="shared_and_events">💕 予定のみ（シフトを除く）</option>
                      <option value="partnerA">
                        {store.metadata.partners.partnerA.avatar}{' '}
                        {store.metadata.partners.partnerA.name}のシフト＆共有予定
                      </option>
                      <option value="partnerB">
                        {store.metadata.partners.partnerB.avatar}{' '}
                        {store.metadata.partners.partnerB.name}のシフト＆共有予定
                      </option>
                    </select>
                    <button
                      type="button"
                      onClick={handleExportIcs}
                      className="px-4 py-2 rounded-xl bg-[#56CFE1] hover:bg-[#2EA8BA] text-white font-extrabold flex items-center gap-1.5 shadow-xs"
                    >
                      <Download className="w-4 h-4" />
                      <span>.ics エクスポート</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#FFFBF7] border border-stone-200/80 space-y-2">
                  <label className="block font-bold text-stone-700">
                    📥 外部の .ics ファイルをふたりカレにインポート
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={icsImportCategory}
                      onChange={(e) =>
                        setIcsImportCategory(e.target.value as CalendarCategoryId)
                      }
                      className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-white font-bold"
                    >
                      <option value="shared">💕 ふたりの共有予定として取込</option>
                      <option value="partnerA">
                        {store.metadata.partners.partnerA.avatar}{' '}
                        {store.metadata.partners.partnerA.name}の予定として取込
                      </option>
                      <option value="partnerB">
                        {store.metadata.partners.partnerB.avatar}{' '}
                        {store.metadata.partners.partnerB.name}の予定として取込
                      </option>
                      <option value="anniversary">🎉 記念日として取込</option>
                      <option value="chore">🏠 家事予定として取込</option>
                    </select>
                    <input
                      ref={icsFileInputRef}
                      type="file"
                      accept=".ics,text/calendar"
                      onChange={handleImportIcsFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => icsFileInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl bg-[#B388EB] hover:bg-[#8C5EC7] text-white font-extrabold flex items-center gap-1.5 shadow-xs"
                    >
                      <Upload className="w-4 h-4" />
                      <span>.ics ファイルを選択</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 1タップ JSONバックアップ保存・復元 */}
              <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-3 shadow-2xs">
                <h3 className="text-sm font-extrabold text-stone-800">
                  💾 ワンタップ JSON バックアップ保存 ＆ 差分マージ復元
                </h3>
                <p className="text-stone-500">
                  機種変更時や念のための控えとして、すべてのシフト・予定・スタンプ設定を1ファイルに保存・復元できます（復元時も既存データを消さずに差分マージします）。
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadBackupJson(true)}
                    className="px-3.5 py-2.5 rounded-xl bg-[#FFE5EC] hover:bg-[#FF8FAB] text-[#9E2A47] hover:text-white font-extrabold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>🔐 暗号化JSONバックアップ保存</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadBackupJson(false)}
                    className="px-3.5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>📄 標準JSONバックアップ保存</span>
                  </button>

                  <input
                    ref={jsonRestoreInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleRestoreBackupJson}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => jsonRestoreInputRef.current?.click()}
                    className="px-3.5 py-2.5 rounded-xl bg-[#E6F7EF] hover:bg-[#52B788] text-[#1E6645] hover:text-white font-extrabold flex items-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>📂 JSONファイルからマージ復元</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* タブ3：ふたりのプロフィール設定 */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-2xl p-4 border border-stone-200/90 space-y-4 shadow-2xs">
              <h3 className="text-sm font-extrabold text-stone-800">
                👫 ふたりの表示名＆アイコン設定
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* パートナーA */}
                <div className="p-3.5 rounded-2xl bg-[#E2F9FC]/60 border border-[#56CFE1]/40 space-y-2.5">
                  <div className="font-extrabold text-[#136370] text-xs">
                    パートナーA（左側シフト枠）
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      表示名（ニックネーム）
                    </label>
                    <input
                      type="text"
                      value={nameA}
                      onChange={(e) => setNameA(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white font-extrabold text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      アイコン絵文字
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {AVATAR_CHOICES.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setAvatarA(em)}
                          className={`w-8 h-8 rounded-xl text-base flex items-center justify-center ${
                            avatarA === em
                              ? 'bg-[#56CFE1] text-white shadow-xs scale-110'
                              : 'bg-white hover:bg-stone-100'
                          }`}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* パートナーB */}
                <div className="p-3.5 rounded-2xl bg-[#F3EAFF]/60 border border-[#B388EB]/40 space-y-2.5">
                  <div className="font-extrabold text-[#59318F] text-xs">
                    パートナーB（右側シフト枠）
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      表示名（ニックネーム）
                    </label>
                    <input
                      type="text"
                      value={nameB}
                      onChange={(e) => setNameB(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white font-extrabold text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      アイコン絵文字
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {AVATAR_CHOICES.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setAvatarB(em)}
                          className={`w-8 h-8 rounded-xl text-base flex items-center justify-center ${
                            avatarB === em
                              ? 'bg-[#B388EB] text-white shadow-xs scale-110'
                              : 'bg-white hover:bg-stone-100'
                          }`}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onUpdatePartnerProfiles(
                    nameA.trim() || '夫',
                    avatarA || '🐻',
                    nameB.trim() || '妻',
                    avatarB || '🐰'
                  );
                  setStatusMsg({
                    type: 'ok',
                    text: 'ふたりのプロフィール（名前・アイコン）を更新しました💕',
                  });
                }}
                className="w-full py-3 rounded-2xl bg-[#FF8FAB] hover:bg-[#E06C88] text-white font-extrabold text-sm shadow-sm transition-colors"
              >
                プロフィールを保存する
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
