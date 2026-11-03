import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDataStore,
  CloudSyncConfig,
  FilterCategoryId,
  PartnerId,
  ScheduleEvent,
  ShiftEntry,
  StampPreset,
} from './types/calendar';
import { CATEGORY_MAP, createInitialDataStore } from './utils/presets';
import { hashPasscode } from './utils/crypto';
import {
  getActivePartnerId,
  getSavedPassHash,
  loadLocalStore,
  loadSyncConfig,
  mergeCalendarStores,
  saveLocalStore,
  saveSyncConfig,
  setActivePartnerId,
  setSavedPassHash,
  syncWithGitHub,
} from './utils/storage';
import { TopHeader } from './components/TopHeader';
import { MonthlyCalendarGrid } from './components/MonthlyCalendarGrid';
import { StampDrawer, StampDrawerTab } from './components/StampDrawer';
import { DayDetailModal } from './components/DayDetailModal';
import { SettingsAndSyncModal } from './components/SettingsAndSyncModal';
import { PasscodeModal } from './components/PasscodeModal';

// 日付文字列 "YYYY-MM-DD" に deltaDays 日を加算した "YYYY-MM-DD" を返す
function addDaysToDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export const App: React.FC = () => {
  const now = new Date();
  const initialDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(now.getDate()).padStart(2, '0')}`;

  const [store, setStore] = useState<CalendarDataStore>(() => createInitialDataStore());
  const [isLoaded, setIsLoaded] = useState(false);

  // 表示中の年月・選択日
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(initialDateStr);

  // 操作中のパートナー（夫 / 妻）
  const [activePartner, setActivePartner] = useState<PartnerId>(() => getActivePartnerId());

  // フィルタ＆表示モード
  const [filterCategory, setFilterCategory] = useState<FilterCategoryId>('all');
  const [isExpandedView, setIsExpandedView] = useState<boolean>(true);
  const [showShiftTimeInCell, setShowShiftTimeInCell] = useState<boolean>(false);

  // ポチポチ連続スタンプドロワー状態
  const [stampDrawerOpen, setStampDrawerOpen] = useState<boolean>(false);
  const [stampDrawerTab, setStampDrawerTab] = useState<StampDrawerTab>('partnerA_shift');
  const [selectedStampId, setSelectedStampId] = useState<string | null>('shift_day');
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);

  // モーダル開閉状態
  const [dayDetailOpen, setDayDetailOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // パスワードロック＆クラウド同期状態
  const [savedPassHash, setSavedPassHashState] = useState<string | null>(() => getSavedPassHash());
  const [isLocked, setIsLocked] = useState<boolean>(() => Boolean(getSavedPassHash()));
  const [sessionPassword, setSessionPassword] = useState<string>('');
  const [syncConfig, setSyncConfig] = useState<CloudSyncConfig>(() => loadSyncConfig());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // トースト通知メッセージ
  const [toastText, setToastText] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastText(msg);
  }, []);

  useEffect(() => {
    if (!toastText) return;
    const timer = setTimeout(() => setToastText(null), 2600);
    return () => clearTimeout(timer);
  }, [toastText]);

  // 初回ロード（IndexedDB / localStorage から復元）
  useEffect(() => {
    let mounted = true;
    loadLocalStore().then((loaded) => {
      if (!mounted) return;
      setStore(loaded);
      setIsLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // ストア変更時のローカル保存＆自動クラウド同期
  const commitStore = useCallback(
    async (nextStore: CalendarDataStore, triggerAutoCloud = true) => {
      const stamped: CalendarDataStore = {
        ...nextStore,
        updatedAt: new Date().toISOString(),
      };
      setStore(stamped);
      await saveLocalStore(stamped, sessionPassword || undefined);

      if (
        triggerAutoCloud &&
        syncConfig.enabled &&
        syncConfig.autoSync &&
        syncConfig.githubToken &&
        sessionPassword
      ) {
        try {
          setIsSyncing(true);
          const { mergedStore } = await syncWithGitHub(stamped, syncConfig, sessionPassword);
          setStore(mergedStore);
        } catch {
          // バックグラウンド自動同期失敗時はローカル保存を維持
        } finally {
          setIsSyncing(false);
        }
      }
    },
    [sessionPassword, syncConfig]
  );

  // 選択日を移動し、月が変わればカレンダー表示月も追従させる
  const moveSelectedDate = useCallback((deltaDays: number) => {
    setSelectedDate((prev) => {
      const nextDate = addDaysToDateStr(prev, deltaDays);
      const [ny, nm] = nextDate.split('-').map(Number);
      setYear(ny);
      setMonth(nm);
      return nextDate;
    });
  }, []);

  // 指定日にシフトを登録または消去
  const handleSetShift = useCallback(
    (
      dateStr: string,
      partnerId: PartnerId,
      stamp: StampPreset | null,
      customStartTime?: string,
      customEndTime?: string,
      memo?: string
    ) => {
      const shiftId = `${dateStr}_${partnerId}`;
      const nowIso = new Date().toISOString();
      const existing = store.shifts[shiftId];

      let nextShift: ShiftEntry;
      if (!stamp) {
        // 論理削除（クラウド差分マージでも消去が正しく伝播するように deletedAt を記録）
        nextShift = {
          id: shiftId,
          date: dateStr,
          partnerId,
          stampId: existing?.stampId || '',
          createdBy: activePartner,
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso,
          deletedAt: nowIso,
        };
      } else {
        nextShift = {
          id: shiftId,
          date: dateStr,
          partnerId,
          stampId: stamp.id,
          startTime: customStartTime ?? stamp.startTime,
          endTime: customEndTime ?? stamp.endTime,
          memo,
          createdBy: activePartner,
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };
      }

      const nextStore: CalendarDataStore = {
        ...store,
        shifts: {
          ...store.shifts,
          [shiftId]: nextShift,
        },
      };
      commitStore(nextStore);
    },
    [activePartner, commitStore, store]
  );

  // 定型予定スタンプからワンタップで予定を追加
  const handleQuickAddEventFromStamp = useCallback(
    (dateStr: string, stamp: StampPreset) => {
      const nowIso = new Date().toISOString();
      const catId = stamp.categoryId || 'shared';
      const cat = CATEGORY_MAP[catId] || CATEGORY_MAP.shared;
      const newEvent: ScheduleEvent = {
        id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: dateStr,
        title: stamp.label,
        categoryId: catId,
        color: stamp.color || cat.accentColor,
        isAllDay: !stamp.startTime,
        startTime: stamp.startTime,
        endTime: stamp.endTime,
        createdBy: activePartner,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const nextStore: CalendarDataStore = {
        ...store,
        events: {
          ...store.events,
          [newEvent.id]: newEvent,
        },
      };
      commitStore(nextStore);
      const [, m, d] = dateStr.split('-').map(Number);
      showToast(`${m}/${d} に「${stamp.label}」を追加しました✨`);
    },
    [activePartner, commitStore, showToast, store]
  );

  // 日付ごとの「🍳すれ違いサポートアイコン」をON/OFF
  const handleToggleDaySupportBadge = useCallback(
    (dateStr: string, badge: string) => {
      const nowIso = new Date().toISOString();
      const existing = store.daySupports?.[dateStr];
      const currentBadges = existing?.badges || [];
      const nextBadges = currentBadges.includes(badge)
        ? currentBadges.filter((b) => b !== badge)
        : [...currentBadges, badge];

      const nextStore: CalendarDataStore = {
        ...store,
        daySupports: {
          ...(store.daySupports || {}),
          [dateStr]: {
            id: `support_${dateStr}`,
            date: dateStr,
            badges: nextBadges,
            updatedBy: activePartner,
            updatedAt: nowIso,
          },
        },
      };
      commitStore(nextStore);
    },
    [activePartner, commitStore, store]
  );

  // スタンプドロワーでスタンプボタンを押した時の処理（即反映＆自動翌日移動）
  const handleApplyStampToDate = useCallback(
    (targetDate: string, stamp: StampPreset, targetPartner?: PartnerId) => {
      if (stamp.type === 'shift') {
        const pid =
          targetPartner ||
          (stampDrawerTab === 'partnerB_shift' ? 'partnerB' : 'partnerA');
        handleSetShift(targetDate, pid, stamp);
      } else {
        handleQuickAddEventFromStamp(targetDate, stamp);
      }

      if (autoAdvance) {
        const nextDate = addDaysToDateStr(targetDate, 1);
        setSelectedDate(nextDate);
        const [ny, nm] = nextDate.split('-').map(Number);
        setYear(ny);
        setMonth(nm);
      }
    },
    [autoAdvance, handleQuickAddEventFromStamp, handleSetShift, stampDrawerTab]
  );

  // カレンダーの日付セルをタップした時の処理
  const handleCellClick = useCallback(
    (dateStr: string) => {
      setSelectedDate(dateStr);
      const [ny, nm] = dateStr.split('-').map(Number);
      if (ny !== year || nm !== month) {
        setYear(ny);
        setMonth(nm);
      }

      // スタンプドロワーが開いている時は、タップした日付に即スタンプを押す！
      if (stampDrawerOpen) {
        if (stampDrawerTab === 'support_badge') {
          return;
        }
        const targetPartner: PartnerId =
          stampDrawerTab === 'partnerB_shift' ? 'partnerB' : 'partnerA';

        if (selectedStampId === '__ERASER__') {
          handleSetShift(dateStr, targetPartner, null);
          if (autoAdvance) {
            const nextDate = addDaysToDateStr(dateStr, 1);
            setSelectedDate(nextDate);
          }
          return;
        }

        const stamp = store.stamps.find((s) => s.id === selectedStampId);
        if (stamp) {
          handleApplyStampToDate(dateStr, stamp, targetPartner);
        }
      } else {
        // 通常モード時はその日の詳細・ワンタップ予定追加モーダルを開く
        setDayDetailOpen(true);
      }
    },
    [
      autoAdvance,
      handleApplyStampToDate,
      handleSetShift,
      month,
      selectedStampId,
      stampDrawerOpen,
      stampDrawerTab,
      store.stamps,
      year,
    ]
  );

  // 予定の追加・更新
  const handleSaveEvent = useCallback(
    (ev: ScheduleEvent) => {
      const nextStore: CalendarDataStore = {
        ...store,
        events: {
          ...store.events,
          [ev.id]: ev,
        },
      };
      commitStore(nextStore);
      showToast(`「${ev.title}」を保存しました💕`);
    },
    [commitStore, showToast, store]
  );

  // 予定の論理削除
  const handleDeleteEvent = useCallback(
    (eventId: string) => {
      const existing = store.events[eventId];
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const nextStore: CalendarDataStore = {
        ...store,
        events: {
          ...store.events,
          [eventId]: {
            ...existing,
            updatedAt: nowIso,
            deletedAt: nowIso,
          },
        },
      };
      commitStore(nextStore);
      showToast('予定を削除しました');
    },
    [commitStore, showToast, store]
  );

  // スタンププリセットの追加・更新・削除
  const handleSaveStampPreset = useCallback(
    (stamp: StampPreset) => {
      const exists = store.stamps.some((s) => s.id === stamp.id);
      const nextStamps = exists
        ? store.stamps.map((s) => (s.id === stamp.id ? stamp : s))
        : [...store.stamps, stamp];
      commitStore({
        ...store,
        stamps: nextStamps,
      });
      setSelectedStampId(stamp.id);
      showToast(`スタンプ「${stamp.label}」を保存しました🎨`);
    },
    [commitStore, showToast, store]
  );

  const handleDeleteStampPreset = useCallback(
    (stampId: string) => {
      const nextStamps = store.stamps.filter((s) => s.id !== stampId);
      commitStore({
        ...store,
        stamps: nextStamps,
      });
      showToast('スタンプを削除しました');
    },
    [commitStore, showToast, store]
  );

  // 操作中パートナーの切り替え（🐻夫 ⇔ 🐰妻）
  const handleToggleActivePartner = useCallback(
    (partnerId: PartnerId) => {
      setActivePartner(partnerId);
      setActivePartnerId(partnerId);
      setStampDrawerTab(partnerId === 'partnerB' ? 'partnerB_shift' : 'partnerA_shift');
      const p = store.metadata.partners[partnerId];
      showToast(`${p.avatar} ${p.name}として操作中に切り替えました`);
    },
    [showToast, store.metadata.partners]
  );

  // 自分の最終確認日時（既読ステータス）を「たった今」に更新
  const handleMarkSeenNow = useCallback(() => {
    const nowIso = new Date().toISOString();
    const currentPartnerProfile = store.metadata.partners[activePartner];
    const nextStore: CalendarDataStore = {
      ...store,
      metadata: {
        ...store.metadata,
        partners: {
          ...store.metadata.partners,
          [activePartner]: {
            ...currentPartnerProfile,
            lastSeenAt: nowIso,
          },
        },
        updatedAt: nowIso,
      },
    };
    commitStore(nextStore);
    showToast(
      `✅ ${currentPartnerProfile.avatar}${currentPartnerProfile.name}の最終確認時刻を更新しました！`
    );
  }, [activePartner, commitStore, showToast, store]);

  // 今月の「✨ふたり休日一致」の日付リストを自動検出
  const matchedHolidays = useMemo(() => {
    const stampMap = new Map<string, StampPreset>();
    for (const s of store.stamps) stampMap.set(s.id, s);

    const isHol = (shift?: ShiftEntry) => {
      if (!shift || shift.deletedAt) return false;
      const st = stampMap.get(shift.stampId);
      if (!st) return false;
      return Boolean(st.isHoliday || /休|有休|公休|夏休|冬休/.test(st.label));
    };

    const daysInMonth = new Date(year, month, 0).getDate();
    const matched: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const sA = store.shifts[`${dateStr}_partnerA`];
      const sB = store.shifts[`${dateStr}_partnerB`];
      if (isHol(sA) && isHol(sB)) {
        matched.push(dateStr);
      }
    }
    return matched;
  }, [month, store.shifts, store.stamps, year]);

  // パートナーがまだ見ていない変更（未確認件数）をカウント
  const unreadCountForPartner = useMemo(() => {
    const otherId: PartnerId = activePartner === 'partnerA' ? 'partnerB' : 'partnerA';
    const otherSeenMs = Date.parse(store.metadata.partners[otherId].lastSeenAt || '') || 0;
    let count = 0;

    for (const s of Object.values(store.shifts)) {
      if (s.deletedAt) continue;
      if (s.createdBy === activePartner && (Date.parse(s.updatedAt) || 0) > otherSeenMs) {
        count++;
      }
    }
    for (const ev of Object.values(store.events)) {
      if (ev.deletedAt) continue;
      if (ev.createdBy === activePartner && (Date.parse(ev.updatedAt) || 0) > otherSeenMs) {
        count++;
      }
    }
    return count;
  }, [activePartner, store.events, store.metadata.partners, store.shifts]);

  // クラウド手動・設定同期トリガー
  const handleTriggerCloudSync = useCallback(
    async (configOverride?: CloudSyncConfig, passwordOverride?: string) => {
      const cfg = configOverride || syncConfig;
      const pass = passwordOverride || sessionPassword;
      if (!pass) {
        setSettingsOpen(true);
        showToast('🔑 同期には「合言葉（パスワード）」の設定が必要です');
        return;
      }
      setIsSyncing(true);
      try {
        const { mergedStore, statusMessage } = await syncWithGitHub(store, cfg, pass);
        setStore(mergedStore);
        showToast(statusMessage);
      } catch (err) {
        showToast(err instanceof Error ? err.message : '同期エラーが発生しました');
        throw err;
      } finally {
        setIsSyncing(false);
      }
    },
    [sessionPassword, showToast, store, syncConfig]
  );

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF7] text-stone-600 font-bold">
        🐻💕🐰 ふたりカレを読み込み中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF7] text-stone-700 flex flex-col">
      {/* パスワードロック画面 */}
      {isLocked && (
        <PasscodeModal
          hasSavedPasscode={Boolean(savedPassHash)}
          onUnlock={async (pass) => {
            const h = await hashPasscode(pass);
            if (savedPassHash && h !== savedPassHash) {
              return false;
            }
            setSessionPassword(pass);
            setIsLocked(false);
            showToast('🔓 ロックを解除しました✨');
            return true;
          }}
          onSetupPasscode={async (pass) => {
            const h = await hashPasscode(pass);
            setSavedPassHash(h);
            setSavedPassHashState(h);
            setSessionPassword(pass);
            await saveLocalStore(store, pass);
            setIsLocked(false);
            showToast('🔐 夫婦の合言葉を設定し、AES-GCM暗号化を有効にしました✨');
          }}
          onSkipForNow={() => {
            setIsLocked(false);
          }}
        />
      )}

      {/* トースト通知 */}
      {toastText && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-stone-800/95 text-white text-xs font-extrabold shadow-lg animate-pop whitespace-nowrap">
          {toastText}
        </div>
      )}

      {/* トップヘッダー（既読ステータス・ふたり休日一致・カテゴリフィルタ・表示モード切替） */}
      <TopHeader
        year={year}
        month={month}
        onPrevMonth={() => {
          if (month === 1) {
            setYear(year - 1);
            setMonth(12);
          } else {
            setMonth(month - 1);
          }
        }}
        onNextMonth={() => {
          if (month === 12) {
            setYear(year + 1);
            setMonth(1);
          } else {
            setMonth(month + 1);
          }
        }}
        onToday={() => {
          const t = new Date();
          setYear(t.getFullYear());
          setMonth(t.getMonth() + 1);
          setSelectedDate(
            `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
              t.getDate()
            ).padStart(2, '0')}`
          );
        }}
        onSelectYearMonth={(y, m) => {
          setYear(y);
          setMonth(m);
        }}
        activePartner={activePartner}
        onToggleActivePartner={handleToggleActivePartner}
        metadata={store.metadata}
        onMarkSeenNow={handleMarkSeenNow}
        matchedHolidays={matchedHolidays}
        onSelectDate={(dateStr) => {
          setSelectedDate(dateStr);
          setDayDetailOpen(true);
        }}
        filterCategory={filterCategory}
        onChangeFilter={setFilterCategory}
        isExpandedView={isExpandedView}
        onToggleExpandedView={() => setIsExpandedView(!isExpandedView)}
        showShiftTimeInCell={showShiftTimeInCell}
        onToggleShowShiftTime={() => setShowShiftTimeInCell(!showShiftTimeInCell)}
        unreadCountForPartner={unreadCountForPartner}
        isSyncing={isSyncing}
        syncEnabled={syncConfig.enabled}
        onTriggerSync={() => handleTriggerCloudSync()}
        onOpenSettings={() => setSettingsOpen(true)}
        onLockScreen={() => setIsLocked(true)}
      />

      {/* 月間カレンダーグリッド（2人並列シフト＋無制限複数行予定＋未確認ドット＋ふたり休日ハイライト） */}
      <main className="flex-1">
        <MonthlyCalendarGrid
          year={year}
          month={month}
          store={store}
          activePartner={activePartner}
          filterCategory={filterCategory}
          isExpandedView={isExpandedView}
          showShiftTimeInCell={showShiftTimeInCell}
          selectedDate={selectedDate}
          stampModeActive={stampDrawerOpen}
          onCellClick={handleCellClick}
        />
      </main>

      {/* ボトム「ポチポチ連続スタンプ入力ドロワー」 */}
      <StampDrawer
        isOpen={stampDrawerOpen}
        onToggleOpen={setStampDrawerOpen}
        activeTab={stampDrawerTab}
        onChangeTab={setStampDrawerTab}
        stamps={store.stamps}
        selectedStampId={selectedStampId}
        onSelectStamp={setSelectedStampId}
        selectedDate={selectedDate}
        onMoveDate={moveSelectedDate}
        autoAdvance={autoAdvance}
        onToggleAutoAdvance={() => setAutoAdvance(!autoAdvance)}
        onApplyStampToSelectedDate={(stamp, targetPartner) =>
          handleApplyStampToDate(selectedDate, stamp, targetPartner)
        }
        onClearShiftOnSelectedDate={(targetPartner) => {
          handleSetShift(selectedDate, targetPartner, null);
          if (autoAdvance) {
            moveSelectedDate(1);
          }
        }}
        onToggleSupportBadgeOnSelectedDate={(badge) =>
          handleToggleDaySupportBadge(selectedDate, badge)
        }
        activeSupportBadgesOnSelectedDate={store.daySupports?.[selectedDate]?.badges || []}
        onOpenDayDetail={() => setDayDetailOpen(true)}
        onSaveStampPreset={handleSaveStampPreset}
        onDeleteStampPreset={handleDeleteStampPreset}
        metadata={store.metadata}
      />

      {/* 日付詳細＆ワンタップ予定追加モーダル */}
      {dayDetailOpen && (
        <DayDetailModal
          dateStr={selectedDate}
          store={store}
          activePartner={activePartner}
          onClose={() => setDayDetailOpen(false)}
          onMoveDate={moveSelectedDate}
          onSetShift={handleSetShift}
          onToggleDaySupportBadge={handleToggleDaySupportBadge}
          onQuickAddEventFromStamp={handleQuickAddEventFromStamp}
          onSaveEvent={handleSaveEvent}
          onDeleteEvent={handleDeleteEvent}
        />
      )}

      {/* 設定・GitHub暗号化同期・iCal (.ics) 連携・バックアップモーダル */}
      {settingsOpen && (
        <SettingsAndSyncModal
          store={store}
          activePartner={activePartner}
          syncConfig={syncConfig}
          currentPassword={sessionPassword}
          onClose={() => setSettingsOpen(false)}
          onUpdateSyncConfig={(nextCfg) => {
            setSyncConfig(nextCfg);
            saveSyncConfig(nextCfg);
          }}
          onUpdatePassword={async (newPass) => {
            const h = await hashPasscode(newPass);
            setSavedPassHash(h);
            setSavedPassHashState(h);
            setSessionPassword(newPass);
            await saveLocalStore(store, newPass);
          }}
          onTriggerCloudSync={handleTriggerCloudSync}
          onMergeRemoteStore={(remoteStore, message) => {
            const merged = mergeCalendarStores(store, remoteStore);
            commitStore(merged, false);
            showToast(message);
          }}
          onImportEvents={(events) => {
            const nextEvents = { ...store.events };
            for (const ev of events) {
              nextEvents[ev.id] = ev;
            }
            commitStore({
              ...store,
              events: nextEvents,
            });
          }}
          onUpdatePartnerProfiles={(nameA, avatarA, nameB, avatarB) => {
            const nowIso = new Date().toISOString();
            commitStore({
              ...store,
              metadata: {
                ...store.metadata,
                partners: {
                  partnerA: {
                    ...store.metadata.partners.partnerA,
                    name: nameA,
                    avatar: avatarA,
                  },
                  partnerB: {
                    ...store.metadata.partners.partnerB,
                    name: nameB,
                    avatar: avatarB,
                  },
                },
                updatedAt: nowIso,
              },
            });
          }}
        />
      )}
    </div>
  );
};

export default App;
