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
import { createInitialDataStore, DEFAULT_CATEGORIES } from './utils/presets';
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
import { MonthlyOvertimeSummary, TopHeader } from './components/TopHeader';
import { MonthlyCalendarGrid } from './components/MonthlyCalendarGrid';
import { StampDrawer, StampDrawerTab } from './components/StampDrawer';
import { DayDetailModal } from './components/DayDetailModal';
import { SettingsAndSyncModal } from './components/SettingsAndSyncModal';
import { PasscodeModal } from './components/PasscodeModal';
import { ShiftStampManagerModal } from './components/ShiftStampManagerModal';
import { ShiftImageOcrModal } from './components/ShiftImageOcrModal';
import { VoiceEventModal } from './components/VoiceEventModal';
import { WidgetCompactView, WidgetGuideModal } from './components/WidgetModalAndView';
import { CategoryManagerModal } from './components/CategoryManagerModal';

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

  // デフォルトで「🏠ウィジェット（ふたりホーム）」画面で起動し、そこから月間カレンダーへ飛べる構成
  const [isWidgetMode, setIsWidgetMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') !== 'calendar';
  });

  // 表示中の年月・選択日
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(initialDateStr);

  // 操作中のパートナー（夫 / 妻）
  const [activePartner, setActivePartner] = useState<PartnerId>(() => getActivePartnerId());

  // フィルタ＆表示モード（コンパクト3件表示をデフォルトにし、ヘッダーから全件表示へ切替可能）
  const [filterCategory, setFilterCategory] = useState<FilterCategoryId>('all');
  const [isExpandedView, setIsExpandedView] = useState<boolean>(false);
  const [showShiftTimeInCell, setShowShiftTimeInCell] = useState<boolean>(false);

  // シフト連続入力ドロワー状態
  const [stampDrawerOpen, setStampDrawerOpen] = useState<boolean>(false);
  const [stampDrawerTab, setStampDrawerTab] = useState<StampDrawerTab>('partnerA_shift');
  const [selectedStampId, setSelectedStampId] = useState<string | null>('shift_day');

  // 各種モーダル開閉状態
  const [dayDetailOpen, setDayDetailOpen] = useState<boolean>(false);
  const [openEventFormDirectly, setOpenEventFormDirectly] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [shiftManagerOpen, setShiftManagerOpen] = useState<boolean>(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState<boolean>(false);
  const [imageOcrOpen, setImageOcrOpen] = useState<boolean>(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState<boolean>(false);
  const [widgetGuideOpen, setWidgetGuideOpen] = useState<boolean>(false);

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
    const timer = setTimeout(() => setToastText(null), 2400);
    return () => clearTimeout(timer);
  }, [toastText]);

  // 初回ロード（IndexedDB / localStorage から復元＋「いったん今登録してある全部の予定削除」マイグレーション実行）
  useEffect(() => {
    let mounted = true;
    loadLocalStore().then(async (loaded) => {
      if (!mounted) return;
      const defaultStore = createInitialDataStore();
      const shiftOnlyStamps = (loaded.stamps || []).filter((s) => s.type === 'shift');
      const mergedStamps =
        shiftOnlyStamps.length > 0 ? [...shiftOnlyStamps] : [...defaultStore.stamps];

      for (const reqId of ['shift_part', 'shift_hol_work']) {
        if (!mergedStamps.some((s) => s.id === reqId)) {
          const found = defaultStore.stamps.find((s) => s.id === reqId);
          if (found) mergedStamps.push(found);
        }
      }

      // ご要望：「既存の予定データとシフトデータを削除しておいてほしい」を自動適用
      const CLEAR_SHIFTS_AND_EVENTS_FLAG = 'futarical_clear_all_shifts_and_events_20261103_v2';
      const shouldClearAll = localStorage.getItem(CLEAR_SHIFTS_AND_EVENTS_FLAG) !== '1';

      const nextStore: CalendarDataStore = {
        ...loaded,
        shifts: shouldClearAll ? {} : loaded.shifts || {},
        events: shouldClearAll ? {} : loaded.events || {},
        daySupports: shouldClearAll ? {} : loaded.daySupports || {},
        categories:
          loaded.categories && loaded.categories.length > 0
            ? loaded.categories
            : DEFAULT_CATEGORIES,
        stamps: mergedStamps,
      };

      if (shouldClearAll) {
        localStorage.setItem(CLEAR_SHIFTS_AND_EVENTS_FLAG, '1');
        await saveLocalStore(nextStore);
      }

      setStore(nextStore);
      setIsLoaded(true);

      // 初回起動時に自動でクラウドから最新データをマージ取得（夫婦間の設定不要同期）
      const initialCfg = loadSyncConfig();
      if (initialCfg.enabled && initialCfg.githubToken) {
        try {
          setIsSyncing(true);
          const { mergedStore } = await syncWithGitHub(nextStore, initialCfg);
          if (mounted) {
            setStore(mergedStore);
          }
        } catch {
          // オフライン時はローカルデータを維持
        } finally {
          if (mounted) setIsSyncing(false);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // ストア変更時のローカル保存＆自動クラウド同期（合言葉未設定でもデフォルト夫婦暗号鍵で自動同期）
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
        syncConfig.githubToken
      ) {
        try {
          setIsSyncing(true);
          const { mergedStore } = await syncWithGitHub(stamped, syncConfig, sessionPassword);
          setStore(mergedStore);
        } catch {
          // オフライン時はローカル保存を維持
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

  // 指定日にシフトを登録または消去する（advanceDate=true の場合は翌日へ自動移動、false の場合は同じ日に留まる）
  const handleSetShiftAndAdvance = useCallback(
    (
      dateStr: string,
      partnerId: PartnerId,
      stamp: StampPreset | null,
      advanceDate = true
    ) => {
      const shiftId = `${dateStr}_${partnerId}`;
      const nowIso = new Date().toISOString();
      const existing = store.shifts[shiftId];

      let nextShift: ShiftEntry;
      if (!stamp) {
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
          ...(existing && !existing.deletedAt ? existing : {}),
          id: shiftId,
          date: dateStr,
          partnerId,
          stampId: stamp.id,
          startTime: stamp.startTime,
          endTime: stamp.endTime,
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

      if (advanceDate) {
        // 連続スタンプモード時は翌日へ自動移動！
        const nextDate = addDaysToDateStr(dateStr, 1);
        setSelectedDate(nextDate);
        const [ny, nm] = nextDate.split('-').map(Number);
        setYear(ny);
        setMonth(nm);
      } else {
        const [, m, d] = dateStr.split('-').map(Number);
        showToast(
          stamp
            ? `✨ ${m}/${d} のシフトを「${stamp.label}」に更新しました`
            : `🧹 ${m}/${d} のシフトをクリアしました`
        );
      }
    },
    [activePartner, commitStore, showToast, store]
  );

  // 指定日のサブシフト（仕事終わり・休日のバイト）や残業・休日出勤時間を更新（日付は移動しない）
  const handleUpdateShiftDetails = useCallback(
    (dateStr: string, partnerId: PartnerId, patch: Partial<ShiftEntry>) => {
      const shiftId = `${dateStr}_${partnerId}`;
      const nowIso = new Date().toISOString();
      const existing = store.shifts[shiftId];
      const activeExisting = existing && !existing.deletedAt ? existing : undefined;

      const defaultStampId = activeExisting?.stampId
        ? activeExisting.stampId
        : patch.isHolidayWork || (patch.holidayWorkHours && patch.holidayWorkHours > 0)
        ? 'shift_hol_work'
        : '';

      const nextShift: ShiftEntry = {
        ...(activeExisting || {
          id: shiftId,
          date: dateStr,
          partnerId,
          stampId: defaultStampId,
          createdBy: activePartner,
          createdAt: nowIso,
        }),
        ...patch,
        id: shiftId,
        date: dateStr,
        partnerId,
        updatedAt: nowIso,
        deletedAt: null,
      };

      commitStore({
        ...store,
        shifts: {
          ...store.shifts,
          [shiftId]: nextShift,
        },
      });

      const [, m, d] = dateStr.split('-').map(Number);
      const pName = store.metadata.partners[partnerId].name;
      if (patch.overtimeHours !== undefined || patch.holidayWorkHours !== undefined) {
        const hrs = patch.holidayWorkHours || patch.overtimeHours || 0;
        const kind = patch.isHolidayWork || (patch.holidayWorkHours || 0) > 0 ? '休日出勤' : '残業';
        showToast(
          hrs > 0
            ? `⏱️ ${m}/${d}（${pName}）に${kind} +${hrs}h を反映しました！`
            : `⏱️ ${m}/${d}（${pName}）の残業・休出時間を0hにリセットしました`
        );
      } else {
        showToast(`✨ ${m}/${d}（${pName}）のシフト詳細を反映しました！`);
      }
    },
    [activePartner, commitStore, showToast, store]
  );

  // AI画像読取やナスカレ連携からの一括シフト＆予定登録
  const handleBulkApplyShiftsAndEvents = useCallback(
    (newShifts: ShiftEntry[], newEvents: ScheduleEvent[], summaryMsg: string) => {
      const nextShifts = { ...store.shifts };
      for (const s of newShifts) {
        nextShifts[s.id] = s;
      }
      const nextEvents = { ...store.events };
      for (const ev of newEvents) {
        nextEvents[ev.id] = ev;
      }
      commitStore({
        ...store,
        shifts: nextShifts,
        events: nextEvents,
      });
      showToast(summaryMsg);
    },
    [commitStore, showToast, store]
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

  // 月間カレンダーの日付セルを「シングルタップ」した時の処理（その日に移動。スタンプドロワー展開中のみシフト押印）
  const handleCellSingleTap = useCallback(
    (dateStr: string) => {
      setSelectedDate(dateStr);
      const [ny, nm] = dateStr.split('-').map(Number);
      if (ny !== year || nm !== month) {
        setYear(ny);
        setMonth(nm);
      }

      if (stampDrawerOpen) {
        if (stampDrawerTab === 'support_badge') {
          return;
        }
        const targetPartner: PartnerId =
          stampDrawerTab === 'partnerB_shift' ? 'partnerB' : 'partnerA';

        if (selectedStampId === '__ERASER__') {
          handleSetShiftAndAdvance(dateStr, targetPartner, null);
          return;
        }

        const stamp = store.stamps.find((s) => s.id === selectedStampId);
        if (stamp) {
          handleSetShiftAndAdvance(dateStr, targetPartner, stamp);
        }
      }
    },
    [
      handleSetShiftAndAdvance,
      month,
      selectedStampId,
      stampDrawerOpen,
      stampDrawerTab,
      store.stamps,
      year,
    ]
  );

  // 月間カレンダーの日付セルを「ダブルタップ」した時の処理（TimeTree風：その日のすべての予定を表示）
  const handleCellDoubleTap = useCallback(
    (dateStr: string) => {
      setSelectedDate(dateStr);
      const [ny, nm] = dateStr.split('-').map(Number);
      if (ny !== year || nm !== month) {
        setYear(ny);
        setMonth(nm);
      }
      setOpenEventFormDirectly(false);
      setDayDetailOpen(true);
    },
    [month, year]
  );

  // 右下の「＋」ボタンから選択中の日（または指定日）に予定・タスクを直接追加する処理
  const handleQuickAddForDate = useCallback(
    (dateStr: string) => {
      setSelectedDate(dateStr);
      const [ny, nm] = dateStr.split('-').map(Number);
      if (ny !== year || nm !== month) {
        setYear(ny);
        setMonth(nm);
      }
      setOpenEventFormDirectly(true);
      setDayDetailOpen(true);
    },
    [month, year]
  );

  // 予定・タスクの追加・更新
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
      const [, m, d] = ev.date.split('-').map(Number);
      showToast(
        `${ev.isTask ? '✅' : '📅'} ${m}/${d} に「${ev.title}」を登録しました💕`
      );
    },
    [commitStore, showToast, store]
  );

  // タスクの完了／未完了を1タップ切替
  const handleToggleTaskComplete = useCallback(
    (eventId: string) => {
      const existing = store.events[eventId];
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const nextCompleted = !existing.isCompleted;
      const nextStore: CalendarDataStore = {
        ...store,
        events: {
          ...store.events,
          [eventId]: {
            ...existing,
            isCompleted: nextCompleted,
            updatedAt: nowIso,
          },
        },
      };
      commitStore(nextStore);
      showToast(nextCompleted ? '✅ タスクを完了にしました！' : '⬜ タスクを未完了に戻しました');
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

  // 登録されているすべての予定・タスクを一括削除
  const handleClearAllEvents = useCallback(() => {
    const nowIso = new Date().toISOString();
    const deletedEvents: Record<string, ScheduleEvent> = {};
    for (const [id, ev] of Object.entries(store.events)) {
      deletedEvents[id] = {
        ...ev,
        updatedAt: nowIso,
        deletedAt: nowIso,
      };
    }
    commitStore({
      ...store,
      events: deletedEvents,
      daySupports: {},
    });
    showToast('🗑️ すべての予定・タスクを削除しました');
  }, [commitStore, showToast, store]);

  // 登録されているすべてのシフトデータ（残業・休出・バイト含む）を一括削除
  const handleClearAllShifts = useCallback(() => {
    const nowIso = new Date().toISOString();
    const deletedShifts: Record<string, ShiftEntry> = {};
    for (const [id, s] of Object.entries(store.shifts)) {
      deletedShifts[id] = {
        ...s,
        overtimeHours: 0,
        holidayWorkHours: 0,
        isHolidayWork: false,
        subStampId: undefined,
        subCustomLabel: undefined,
        updatedAt: nowIso,
        deletedAt: nowIso,
      };
    }
    commitStore({
      ...store,
      shifts: deletedShifts,
    });
    showToast('🗑️ すべてのシフトデータを削除しました');
  }, [commitStore, showToast, store]);

  // 予定データ＋シフトデータを両方すべて一括削除
  const handleClearAllData = useCallback(() => {
    const nowIso = new Date().toISOString();
    const deletedEvents: Record<string, ScheduleEvent> = {};
    for (const [id, ev] of Object.entries(store.events)) {
      deletedEvents[id] = {
        ...ev,
        updatedAt: nowIso,
        deletedAt: nowIso,
      };
    }
    const deletedShifts: Record<string, ShiftEntry> = {};
    for (const [id, s] of Object.entries(store.shifts)) {
      deletedShifts[id] = {
        ...s,
        overtimeHours: 0,
        holidayWorkHours: 0,
        isHolidayWork: false,
        subStampId: undefined,
        subCustomLabel: undefined,
        updatedAt: nowIso,
        deletedAt: nowIso,
      };
    }
    commitStore({
      ...store,
      shifts: deletedShifts,
      events: deletedEvents,
      daySupports: {},
    });
    showToast('🗑️ 予定データとシフトデータをすべて削除しました');
  }, [commitStore, showToast, store]);

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

  // 今月の「⏱️残業・休日出勤・バイト集計」を自動算出
  const overtimeSummary: MonthlyOvertimeSummary = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const calcFor = (pid: PartnerId) => {
      let overtimeHours = 0;
      let holidayWorkHours = 0;
      let partTimeCount = 0;
      const entries: ShiftEntry[] = [];

      for (const s of Object.values(store.shifts)) {
        if (s.deletedAt || s.partnerId !== pid || !s.date.startsWith(prefix)) continue;
        const ot = Number(s.overtimeHours || 0);
        const hw = Number(s.holidayWorkHours || 0);
        const hasSub = Boolean(s.subCustomLabel || s.subStampId || s.stampId === 'shift_part');

        if (ot > 0) overtimeHours = Math.round((overtimeHours + ot) * 10) / 10;
        if (hw > 0) holidayWorkHours = Math.round((holidayWorkHours + hw) * 10) / 10;
        if (hasSub) partTimeCount += 1;

        if (ot > 0 || hw > 0 || s.isHolidayWork || hasSub) {
          entries.push(s);
        }
      }

      entries.sort((a, b) => a.date.localeCompare(b.date));
      return {
        overtimeHours,
        holidayWorkHours,
        totalExtraHours: Math.round((overtimeHours + holidayWorkHours) * 10) / 10,
        partTimeCount,
        entries,
      };
    };

    return {
      partnerA: calcFor('partnerA'),
      partnerB: calcFor('partnerB'),
    };
  }, [month, store.shifts, year]);

  // カレンダー予定項目リスト（未設定時はデフォルト：二人予定・夫予定・妻予定）
  const activeCategories = useMemo(
    () =>
      store.categories && store.categories.length > 0
        ? store.categories
        : DEFAULT_CATEGORIES,
    [store.categories]
  );

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

  const handleTriggerCloudSync = useCallback(
    async (configOverride?: CloudSyncConfig, passwordOverride?: string) => {
      const cfg = configOverride || syncConfig;
      const pass = passwordOverride || sessionPassword;
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

  // スマホでアプリ画面を開き直した時（フォーカス復帰時）に自動でクラウド同期
  useEffect(() => {
    if (!isLoaded || !syncConfig.enabled || !syncConfig.githubToken) return;
    const onFocus = () => {
      syncWithGitHub(store, syncConfig, sessionPassword)
        .then(({ mergedStore }) => setStore(mergedStore))
        .catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isLoaded, sessionPassword, store, syncConfig]);

  const handlePrevMonth = useCallback(() => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }, [month]);

  const handleNextMonth = useCallback(() => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }, [month]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF7] text-stone-600 font-bold">
        🐻💕🐰 ふたりカレを読み込み中...
      </div>
    );
  }

  const currentDrawerPartner: PartnerId =
    stampDrawerTab === 'partnerB_shift' ? 'partnerB' : 'partnerA';
  const currentShiftOnSelectedDate = store.shifts[
    `${selectedDate}_${currentDrawerPartner}`
  ]?.deletedAt
    ? undefined
    : store.shifts[`${selectedDate}_${currentDrawerPartner}`];

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

      {/* 🏠 デフォルト画面：ウィジェット（ふたりホーム）モード */}
      {isWidgetMode ? (
        <WidgetCompactView
          store={store}
          activePartner={activePartner}
          onToggleActivePartner={handleToggleActivePartner}
          onMarkSeenNow={handleMarkSeenNow}
          matchedHolidays={matchedHolidays}
          overtimeSummary={overtimeSummary}
          onExitWidgetMode={() => setIsWidgetMode(false)}
          onOpenCalendarWithStampDrawer={() => {
            setIsWidgetMode(false);
            setStampDrawerOpen(true);
          }}
          onOpenDayDetail={(dateStr) => {
            setSelectedDate(dateStr);
            const [ny, nm] = dateStr.split('-').map(Number);
            setYear(ny);
            setMonth(nm);
            setOpenEventFormDirectly(false);
            setDayDetailOpen(true);
          }}
          onQuickAddEventForDate={(dateStr) => {
            handleQuickAddForDate(dateStr);
          }}
          onToggleTaskComplete={handleToggleTaskComplete}
          onSelectDateInFullCalendar={(dateStr) => {
            setIsWidgetMode(false);
            setSelectedDate(dateStr);
            const [ny, nm] = dateStr.split('-').map(Number);
            setYear(ny);
            setMonth(nm);
          }}
          onOpenVoiceModal={(dateStr) => {
            setSelectedDate(dateStr);
            setVoiceModalOpen(true);
          }}
          onOpenImageOcrModal={() => setImageOcrOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <>
          {/* トップヘッダー */}
          <TopHeader
            year={year}
            month={month}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
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
            categories={activeCategories}
            onOpenCategoryManager={() => setCategoryManagerOpen(true)}
            onMarkSeenNow={handleMarkSeenNow}
            matchedHolidays={matchedHolidays}
            overtimeSummary={overtimeSummary}
            onSelectDate={(dateStr) => {
              setSelectedDate(dateStr);
              setOpenEventFormDirectly(false);
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
            onOpenWidgetHome={() => setIsWidgetMode(true)}
          />

          {/* 月間カレンダーグリッド（シングルタップ移動・ダブルタップ予定一覧・右下＋予定追加） */}
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
              onCellSingleTap={handleCellSingleTap}
              onCellDoubleTap={handleCellDoubleTap}
              onQuickAddForSelectedDate={() => handleQuickAddForDate(selectedDate)}
              onSwipePrevMonth={handlePrevMonth}
              onSwipeNextMonth={handleNextMonth}
            />
          </main>

          {/* ボトム「シフト連続入力ドロワー ＆ スマホ用下部5ボタンアクションドック」 */}
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
            onApplyShiftAndAdvance={(stamp, targetPartner) =>
              handleSetShiftAndAdvance(selectedDate, targetPartner, stamp)
            }
            onClearShiftAndAdvance={(targetPartner) =>
              handleSetShiftAndAdvance(selectedDate, targetPartner, null)
            }
            onUpdateShiftDetailsOnSelectedDate={(targetPartner, patch) => {
              handleUpdateShiftDetails(selectedDate, targetPartner, patch);
              const [, m, d] = selectedDate.split('-').map(Number);
              showToast(`✨ ${m}/${d} のシフト詳細（バイト・残業）を更新しました`);
            }}
            currentShiftOnSelectedDate={currentShiftOnSelectedDate}
            onToggleSupportBadgeOnSelectedDate={(badge) =>
              handleToggleDaySupportBadge(selectedDate, badge)
            }
            activeSupportBadgesOnSelectedDate={store.daySupports?.[selectedDate]?.badges || []}
            onOpenDayDetail={() => {
              setOpenEventFormDirectly(true);
              setDayDetailOpen(true);
            }}
            onOpenShiftStampManager={() => setShiftManagerOpen(true)}
            onOpenVoiceModal={() => setVoiceModalOpen(true)}
            onOpenImageOcrModal={() => setImageOcrOpen(true)}
            onOpenWidgetModal={() => setIsWidgetMode(true)}
            metadata={store.metadata}
          />
        </>
      )}

      {/* 日付詳細＆シフト・予定・タスクモーダル */}
      {dayDetailOpen && (
        <DayDetailModal
          dateStr={selectedDate}
          store={store}
          activePartner={activePartner}
          initialOpenEventForm={openEventFormDirectly}
          onClose={() => {
            setDayDetailOpen(false);
            setOpenEventFormDirectly(false);
          }}
          onMoveDate={moveSelectedDate}
          onSetShiftAndAdvance={handleSetShiftAndAdvance}
          onUpdateShiftDetails={handleUpdateShiftDetails}
          onToggleDaySupportBadge={handleToggleDaySupportBadge}
          onSaveEvent={handleSaveEvent}
          onToggleTaskComplete={handleToggleTaskComplete}
          onDeleteEvent={handleDeleteEvent}
          onOpenVoiceModal={() => setVoiceModalOpen(true)}
          onOpenShiftStampManager={() => setShiftManagerOpen(true)}
          onOpenCategoryManager={() => setCategoryManagerOpen(true)}
        />
      )}

      {/* 🗂️ カレンダー予定項目の追加・削除モーダル（デフォ：二人予定・夫予定・妻予定） */}
      {categoryManagerOpen && (
        <CategoryManagerModal
          categories={activeCategories}
          metadata={store.metadata}
          onClose={() => setCategoryManagerOpen(false)}
          onUpdateCategories={(nextCats) => {
            commitStore({
              ...store,
              categories: nextCats,
            });
            if (
              filterCategory !== 'all' &&
              !nextCats.some((c) => c.id === filterCategory)
            ) {
              setFilterCategory('all');
            }
            showToast('カレンダーの予定項目を更新しました🗂️');
          }}
        />
      )}

      {/* 🎨 シフト種類の登録・かんたん編集モーダル */}
      {shiftManagerOpen && (
        <ShiftStampManagerModal
          stamps={store.stamps}
          onClose={() => setShiftManagerOpen(false)}
          onUpdateStamps={(nextStamps) => {
            commitStore({
              ...store,
              stamps: nextStamps,
            });
            showToast('シフト種類を更新しました🎨');
          }}
        />
      )}

      {/* 📷 シフト表AI画像自動読み取り ＆ 🏥 ナスカレ一括取込モーダル */}
      {imageOcrOpen && (
        <ShiftImageOcrModal
          year={year}
          month={month}
          activePartner={activePartner}
          metadata={store.metadata}
          stamps={store.stamps}
          onClose={() => setImageOcrOpen(false)}
          onBulkApplyShiftsAndEvents={handleBulkApplyShiftsAndEvents}
        />
      )}

      {/* 🎙️ 音声で予定を入れるモーダル */}
      {voiceModalOpen && (
        <VoiceEventModal
          selectedDate={selectedDate}
          activePartner={activePartner}
          metadata={store.metadata}
          categories={activeCategories}
          onClose={() => setVoiceModalOpen(false)}
          onSaveEvent={handleSaveEvent}
        />
      )}

      {/* 📱 iPhone / Android ホーム画面ウィジェット設定モーダル */}
      {widgetGuideOpen && (
        <WidgetGuideModal
          store={store}
          onClose={() => setWidgetGuideOpen(false)}
          onOpenWidgetPreview={() => {
            setWidgetGuideOpen(false);
            setIsWidgetMode(true);
          }}
        />
      )}

      {/* 設定・GitHub暗号化同期・iCal連携・バックアップモーダル */}
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
          onClearAllEvents={handleClearAllEvents}
          onClearAllShifts={handleClearAllShifts}
          onClearAllData={handleClearAllData}
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
