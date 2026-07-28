"use client";

import {
  useCallback,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";
import {
  RACING_CLIENT_EVENTS,
  RACING_NAMESPACE,
  RACING_SERVER_EVENTS,
  type RacingBetHistorySnapshot,
  type RacingBetHistoryStatus,
  type RacingBetType,
  type RacingBetsResponse,
  type RacingJoinTablePayload,
  type RacingPlaceBetPayload,
  type RacingPrestartTickSnapshot,
  type RacingRaceEntrySnapshot,
  type RacingRaceResultsResponse,
  type RacingRaceTickSnapshot,
  type RacingSettledRaceSnapshot,
  type RacingSocketErrorPayload,
  type RacingTableEventPayload,
  type RacingTableSummary,
  type RacingTableState,
  type RacingTablesResponse,
  type RacingWalletUpdatedPayload,
} from "@bk-games/shared/src/socket-events";
import type { GameTokenRole } from "@bk-games/shared/src/types";
import { io, type Socket } from "socket.io-client";

import styles from "./page.module.css";

type AssetHorse = {
  color: string;
  duration: string;
  file: string;
  leader?: boolean;
  offset: string;
};

type DisplayHorse = AssetHorse & {
  isCoasting: boolean;
  lane: number;
  name: string;
  number: number;
  progress: number;
  raceEntryId: string;
  rank: number | null;
  startLaneTop: string;
  startX: string;
};

type DisplayRacePosition = RacingRaceTickSnapshot["positions"][number] & {
  finishedAtMs?: number | null;
};

type DisplayRaceTickSnapshot = Omit<RacingRaceTickSnapshot, "positions"> & {
  positions: DisplayRacePosition[];
};

type RaceResultEntry = {
  color: AssetHorse["color"];
  finishedAtMs: number | null;
  name: string;
  number: number;
  raceEntryId: string;
  rank: number | null;
};

type RaceResultBoard = {
  entries: RaceResultEntry[];
  isComplete: boolean;
  raceId: string;
  raceNo: number;
};

type RaceFinishMark = {
  finishedAtMs: number;
  observedAtMs: number;
  raceEntryId: string;
  raceId: string;
  rank: number;
};

type PrestartTickView = RacingPrestartTickSnapshot & {
  raceId: string;
  raceNo: number | null;
  receivedAtMs: number;
};

type StartCountdownOverlay = {
  isStartCue: boolean;
  label: string;
  value: string;
};

type BetFeedback = {
  detail: string;
  tone: "pending" | "success" | "error";
  title: string;
};

type RacingTicketStatus = "pending" | "accepted" | "rejected";
type RacingTicketOutcomeStatus =
  | "issuing"
  | "pending"
  | "won"
  | "lost"
  | "rejected";

type RacingTicketSelection = {
  color: AssetHorse["color"];
  name: string;
  number: number;
  raceEntryId: string;
};

type RacingTicketSelectionEntry = Pick<
  RacingRaceEntrySnapshot,
  "name" | "number" | "raceEntryId"
> &
  Partial<Pick<DisplayHorse, "color">>;

type RacingTicketItem = {
  amount: number | null;
  betId: string | null;
  betType: RacingBetType;
  createdAt: string;
  localId: string;
  message: string | null;
  payoutAmount?: number | null;
  raceId: string;
  raceNo: number | null;
  selections: RacingTicketSelection[];
  serverStatus?: RacingBetHistoryStatus | null;
  settledAt?: string | null;
  status: RacingTicketStatus;
};

type RacingTicketResultEntry = {
  color: AssetHorse["color"];
  finalRank: number;
  number: number;
  raceEntryId: string;
};

type RacingTicketHistoryItem = RacingTicketItem & {
  outcomeDetail: string;
  outcomeStatus: RacingTicketOutcomeStatus;
  projectedReturn: number | null;
  resultOrder: RacingTicketResultEntry[];
};

type RaceHistoryStatus = "loading" | "ready" | "error";

type RaceHistoryViewState = {
  date: string | null;
  errorMessage: string | null;
  races: RacingSettledRaceSnapshot[];
  status: RaceHistoryStatus;
};

type BetHistoryStatus = "idle" | "loading" | "ready" | "error";

type BetHistoryViewState = {
  bets: RacingBetHistorySnapshot[];
  errorMessage: string | null;
  status: BetHistoryStatus;
};

type HorseRecord = {
  averageRank: number | null;
  color: AssetHorse["color"];
  name: string;
  number: number;
  recentRanks: number[];
  starts: number;
  top3: number;
  wins: number;
};

type GameTokenResponse = {
  expiresInSeconds: number;
  token: string;
  user: {
    id: string;
    nickname: string;
    role: GameTokenRole;
  };
  walletBalance: string;
};

type ConnectionStatus =
  | "requesting-token"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "polling";

type RacingTableViewState = RacingTableState | RacingTableSummary;

type RacingBetTypeConfig = {
  description: string;
  label: string;
  ordered: boolean;
  requiredSelections: number;
  shortLabel: string;
  type: RacingBetType;
};

const tableId = "main";
const restPollMs = 1_000;
const raceHistoryPollMs = 10_000;
const localTickMs = 160;
const startCountdownWindowMs = 5_000;
const startCountdownHoldMs = 1_400;
const prestartTickFreshMs = 1_500;
const raceBgmLeadMs = 14_000;
const raceBgmVolume = 0.58;
const raceBgmSrc = "/racing/audio/william-tell-overture-remix.mp3";
const worldScale = 7.2;
const trackStartPercent = 1.2;
const trackFinishPercent = 91.5;
const runnerFinishNoseOffsetPx = 185;
const postFinishTrackOvershootRatio = 0.075;
const maxVisualRaceProgress = 1 + postFinishTrackOvershootRatio;
const postFinishCoastDurationMs = 2_400;
const maxCameraTranslatePercent = ((worldScale - 1) / worldScale) * 100;
const leaderViewportAnchorPercent = 50 / worldScale;
const startLaneTops = [
  "31%",
  "39.5%",
  "48%",
  "56.5%",
  "65%",
  "73.5%",
  "82%",
  "90.5%",
];
const defaultRacingBetType: RacingBetType = "WIN";
const estimatedRacingPayoutRate = 0.9;
const quickStakeAmounts = [100, 500, 1_000, 5_000] as const;

const racingBetTypeConfigs: RacingBetTypeConfig[] = [
  {
    description: "1등",
    label: "단승",
    ordered: true,
    requiredSelections: 1,
    shortLabel: "WIN",
    type: "WIN",
  },
  {
    description: "2등 이내",
    label: "연승",
    ordered: false,
    requiredSelections: 1,
    shortLabel: "PLC",
    type: "PLACE",
  },
  {
    description: "1등-2등 조합",
    label: "복승",
    ordered: false,
    requiredSelections: 2,
    shortLabel: "QNL",
    type: "QUINELLA",
  },
  {
    description: "1등-2등 순서",
    label: "쌍승",
    ordered: true,
    requiredSelections: 2,
    shortLabel: "EXA",
    type: "EXACTA",
  },
  {
    description: "3등 내 2두",
    label: "복연승",
    ordered: false,
    requiredSelections: 2,
    shortLabel: "QPL",
    type: "QUINELLA_PLACE",
  },
  {
    description: "1등-3등 조합",
    label: "삼복승",
    ordered: false,
    requiredSelections: 3,
    shortLabel: "TRI",
    type: "TRIO",
  },
  {
    description: "1등-3등 순서",
    label: "삼쌍승",
    ordered: true,
    requiredSelections: 3,
    shortLabel: "TRF",
    type: "TRIFECTA",
  },
];

const assetHorses: AssetHorse[] = [
  {
    color: "red",
    duration: "4.2s",
    file: "/racing/generated-reference-style/horse-01-red-gallop-7f.png",
    leader: true,
    offset: "-2.7s",
  },
  {
    color: "orange",
    duration: "4.35s",
    file: "/racing/generated-reference-style/horse-02-orange-gallop-7f.png",
    offset: "-2.2s",
  },
  {
    color: "blue",
    duration: "4.5s",
    file: "/racing/generated-reference-style/horse-03-blue-gallop-7f.png",
    offset: "-1.75s",
  },
  {
    color: "yellow",
    duration: "4.65s",
    file: "/racing/generated-reference-style/horse-04-yellow-gallop-7f.png",
    offset: "-1.25s",
  },
  {
    color: "purple",
    duration: "4.85s",
    file: "/racing/generated-reference-style/horse-05-purple-gallop-7f.png",
    offset: "-0.75s",
  },
  {
    color: "green",
    duration: "5.05s",
    file: "/racing/generated-reference-style/horse-06-green-gallop-7f.png",
    offset: "-0.3s",
  },
];

const baseHorseProfiles: DisplayHorse[] = assetHorses.map((horse, index) => ({
  ...horse,
  isCoasting: false,
  lane: index + 1,
  name: `${horse.color} runner`,
  number: index + 1,
  progress: 0,
  raceEntryId: `asset-${index + 1}`,
  rank: index + 1,
  startLaneTop: startLaneTops[index] ?? startLaneTops[startLaneTops.length - 1],
  startX: "10.5%",
}));

export function BkDerbyClient() {
  const router = useRouter();
  const racing = useRacingTable();
  const raceHistory = useRacingRaceHistory();
  const betHistory = useRacingBetHistory(racing.gameToken);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [persistedResultBoard, setPersistedResultBoard] =
    useState<RaceResultBoard | null>(null);
  const [trackWidthPx, setTrackWidthPx] = useState(0);
  const [isBgmBlocked, setIsBgmBlocked] = useState(false);
  const [isBgmPlaying, setIsBgmPlaying] = useState(false);
  const [isBgmUnlocked, setIsBgmUnlocked] = useState(false);
  const [selectedBetType, setSelectedBetType] =
    useState<RacingBetType>(defaultRacingBetType);
  const [selectedBetEntryIds, setSelectedBetEntryIds] = useState<string[]>([]);
  const [betAmount, setBetAmount] = useState("100");
  const [betFeedback, setBetFeedback] = useState<BetFeedback | null>(null);
  const [clientFinishMarks, setClientFinishMarks] = useState<
    RaceFinishMark[]
  >([]);
  const [localTickets, setLocalTickets] = useState<RacingTicketItem[]>([]);
  const [pendingBetRequest, setPendingBetRequest] = useState<{
    commandId: string;
    previousAcceptedEventKeys: string[];
    raceId: string;
  } | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const bgmRaceIdRef = useRef<string | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const finishMarksRef = useRef<RaceFinishMark[]>([]);
  const latestTickRef = useRef<RacingRaceTickSnapshot | null>(null);
  const tableStateRef = useRef<RacingTableViewState | null>(null);
  const currentRaceId = racing.tableState?.race?.raceId ?? null;
  const activePrestartTick = getActivePrestartTick(
    racing.latestPrestartTick,
    racing.tableState,
    clockMs,
  );
  const isVisuallyRunning = isRaceVisuallyRunning(
    racing.tableState,
    clockMs,
    activePrestartTick,
  );
  const serverTick = useMemo(
    () =>
      racing.latestTick?.raceId === racing.tableState?.race?.raceId
        ? racing.latestTick
        : null,
    [racing.latestTick, racing.tableState?.race?.raceId],
  );
  const displayTick = useMemo<DisplayRaceTickSnapshot | null>(
    () => serverTick,
    [serverTick],
  );
  const raceFinishMarks = useMemo(
    () =>
      currentRaceId
        ? clientFinishMarks.filter((mark) => mark.raceId === currentRaceId)
        : [],
    [clientFinishMarks, currentRaceId],
  );
  const currentResultBoard = useMemo(
    () => buildRaceResultBoard(racing.tableState, displayTick, raceFinishMarks),
    [displayTick, raceFinishMarks, racing.tableState],
  );
  const visibleResultBoard = chooseVisibleResultBoard(
    currentResultBoard,
    persistedResultBoard,
  );
  const displayHorses = useMemo(
    () =>
      buildDisplayHorses(
        racing.tableState,
        displayTick,
        clockMs,
        raceFinishMarks,
      ),
    [clockMs, displayTick, raceFinishMarks, racing.tableState],
  );
  const isRaceRunning = isVisuallyRunning;
  const leaderHorse = getLeaderHorse(displayHorses);
  const cameraTranslatePercent = getCameraTranslatePercent(
    leaderHorse?.progress ?? 0,
  );
  const progressHorses = useMemo(
    () => [...displayHorses].sort((left, right) => left.number - right.number),
    [displayHorses],
  );
  const bettingHorses = progressHorses;
  const availableBetTypeConfigs = useMemo(
    () => getAvailableBetTypeConfigs(racing.tableState),
    [racing.tableState],
  );
  const effectiveBetType = availableBetTypeConfigs.some(
    (config) => config.type === selectedBetType,
  )
    ? selectedBetType
    : (availableBetTypeConfigs[0]?.type ?? defaultRacingBetType);
  const activeBetTypeConfig = getRacingBetTypeConfig(effectiveBetType);
  const activeEntryIds = useMemo(
    () => new Set(bettingHorses.map((horse) => horse.raceEntryId)),
    [bettingHorses],
  );
  const activeSelectedBetEntryIds = selectedBetEntryIds
    .filter((entryId) => activeEntryIds.has(entryId))
    .slice(0, activeBetTypeConfig.requiredSelections);
  const statusLabel = getStatusLabel(
    racing.connectionStatus,
    racing.tableState,
    isVisuallyRunning,
  );
  const statusDetail = getStatusDetail(
    racing.tableState,
    displayTick,
    isVisuallyRunning,
    activePrestartTick,
    clockMs,
  );
  const socketErrorMessage =
    racing.socketError?.message === "Server polling active."
      ? null
      : racing.socketError?.message;
  const worldLayerClassName = `${styles.worldLayer} ${styles.liveWorldLayer}`;
  const startCountdownOverlay = getStartCountdownOverlay(
    racing.tableState,
    clockMs,
    activePrestartTick,
  );
  const isPendingBetForCurrentRace =
    pendingBetRequest?.raceId === currentRaceId;
  const acceptedBetEvent = getAcceptedBetEvent({
    events: racing.betEvents,
    ignoredEventKeys: pendingBetRequest?.previousAcceptedEventKeys ?? [],
    playerId: racing.player?.id ?? null,
    raceId: isPendingBetForCurrentRace ? currentRaceId : null,
  });
  const betSocketError =
    pendingBetRequest &&
    racing.latestBetError?.event === RACING_CLIENT_EVENTS.BET_PLACE
      ? racing.latestBetError
      : null;
  const isBetSubmissionPending = Boolean(
    isPendingBetForCurrentRace &&
    !acceptedBetEvent &&
    !betSocketError,
  );
  const visibleBetFeedback = getVisibleBetFeedback({
    acceptedEvent: isPendingBetForCurrentRace ? acceptedBetEvent : null,
    fallback: isPendingBetForCurrentRace ? betFeedback : null,
    selectedBetType: effectiveBetType,
    socketError: isPendingBetForCurrentRace ? betSocketError : null,
  });
  const ticketHistory = useMemo(
    () =>
      buildTicketHistory({
        acceptedEvents: racing.betEvents,
        betSocketError,
        currentRace: racing.tableState?.race ?? null,
        entries: bettingHorses,
        fallbackBetType: effectiveBetType,
        localTickets,
        pendingBetRequest,
        playerId: racing.player?.id ?? null,
        serverBets: betHistory.bets,
        settledRaces: raceHistory.races,
      }),
    [
      betHistory.bets,
      betSocketError,
      bettingHorses,
      effectiveBetType,
      localTickets,
      pendingBetRequest,
      raceHistory.races,
      racing.betEvents,
      racing.player?.id,
      racing.tableState?.race,
    ],
  );
  const bettingValidation = getBettingValidation({
    amountText: betAmount,
    connectionStatus: racing.connectionStatus,
    isPending: isBetSubmissionPending,
    player: racing.player,
    selectedCount: activeSelectedBetEntryIds.length,
    tableState: racing.tableState,
    typeConfig: activeBetTypeConfig,
  });
  const shouldRaceBgmPlay = shouldPlayRaceBgm(
    racing.tableState,
    clockMs,
    isVisuallyRunning,
  );
  const bgmButtonLabel = isBgmPlaying
    ? "BGM playing"
    : isBgmBlocked
      ? "Enable BGM"
      : isBgmUnlocked
        ? "BGM ready"
        : "Prime BGM";

  useEffect(() => {
    tableStateRef.current = racing.tableState;
  }, [racing.tableState]);

  useEffect(() => {
    latestTickRef.current = racing.latestTick;
  }, [racing.latestTick]);

  useEffect(() => {
    finishMarksRef.current = clientFinishMarks;
  }, [clientFinishMarks]);

  useEffect(() => {
    const race = racing.tableState?.race;

    if (!race) {
      queueMicrotask(() => {
        setClientFinishMarks([]);
      });
      return;
    }

    queueMicrotask(() => {
      setClientFinishMarks((currentMarks) =>
        collectRaceFinishMarks({
          currentMarks,
          latestTick: displayTick,
          observedAtMs: Date.now(),
          race,
        }),
      );
    });
  }, [displayTick, racing.tableState?.race]);

  useEffect(() => {
    const audio = bgmRef.current;

    if (!audio) {
      return;
    }

    const handlePlay = () => {
      setIsBgmPlaying(true);
    };
    const handlePause = () => {
      setIsBgmPlaying(false);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handlePause);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handlePause);
    };
  }, []);

  useEffect(() => {
    const audio = bgmRef.current;

    if (!audio) {
      return;
    }

    audio.loop = true;
    audio.volume = raceBgmVolume;

    if (!shouldRaceBgmPlay || !currentRaceId) {
      audio.pause();
      audio.currentTime = 0;
      bgmRaceIdRef.current = null;
      return;
    }

    let isCancelled = false;

    if (bgmRaceIdRef.current !== currentRaceId) {
      audio.currentTime = 0;
      bgmRaceIdRef.current = currentRaceId;
    }

    if (audio.paused) {
      void audio
        .play()
        .then(() => {
          if (isCancelled) {
            return;
          }

          setIsBgmBlocked(false);
          setIsBgmUnlocked(true);
        })
        .catch(() => {
          if (isCancelled) {
            return;
          }

          setIsBgmBlocked(true);
          setIsBgmPlaying(false);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [currentRaceId, shouldRaceBgmPlay]);

  useEffect(() => {
    const trackNode = trackRef.current;

    if (!trackNode) {
      return;
    }

    const updateTrackWidth = () => {
      setTrackWidthPx(Math.round(trackNode.getBoundingClientRect().width));
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateTrackWidth);

    updateTrackWidth();
    resizeObserver?.observe(trackNode);
    window.addEventListener("resize", updateTrackWidth);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateTrackWidth);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nowMs = Date.now();

      setClockMs(nowMs);
      setPersistedResultBoard((current) => {
        const tableState = tableStateRef.current;
        const raceId = tableState?.race?.raceId ?? null;
        const latestTick =
          latestTickRef.current?.raceId === raceId
            ? latestTickRef.current
            : null;
        const finishMarks = finishMarksRef.current.filter(
          (mark) => mark.raceId === raceId,
        );
        const nextResultBoard = buildRaceResultBoard(
          tableState,
          latestTick,
          finishMarks,
        );

        if (
          isRaceVisuallyRunning(tableState, nowMs) &&
          current?.raceId !== raceId
        ) {
          return null;
        }

        return choosePersistedResultBoard(current, nextResultBoard);
      });
    }, localTickMs);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const handleBgmEnable = async () => {
    const audio = bgmRef.current;

    if (!audio) {
      return;
    }

    audio.loop = true;
    audio.volume = raceBgmVolume;

    try {
      if (shouldRaceBgmPlay && currentRaceId) {
        if (bgmRaceIdRef.current !== currentRaceId) {
          audio.currentTime = 0;
          bgmRaceIdRef.current = currentRaceId;
        }

        await audio.play();
        setIsBgmPlaying(true);
      } else {
        audio.muted = true;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        setIsBgmPlaying(false);
      }

      setIsBgmBlocked(false);
      setIsBgmUnlocked(true);
    } catch {
      audio.muted = false;
      setIsBgmBlocked(true);
      setIsBgmPlaying(false);
    }
  };

  const handleSelectBetType = (nextBetType: RacingBetType) => {
    setSelectedBetType(nextBetType);
    setSelectedBetEntryIds([]);
    setBetFeedback(null);
  };

  const handleToggleBetEntry = (raceEntryId: string) => {
    setSelectedBetEntryIds((current) => {
      if (current.includes(raceEntryId)) {
        return current.filter((entryId) => entryId !== raceEntryId);
      }

      if (current.length >= activeBetTypeConfig.requiredSelections) {
        return [...current.slice(1), raceEntryId];
      }

      return [...current, raceEntryId];
    });
    setBetFeedback(null);
  };

  const handleClearBetSlip = () => {
    setSelectedBetEntryIds([]);
    setBetFeedback(null);
  };

  const handleSetStake = (amount: number) => {
    setBetAmount(amount.toString());
    setBetFeedback(null);
  };

  const handleAddStake = (amount: number) => {
    setBetAmount((currentAmount) => {
      const currentPointAmount = parsePointAmountText(currentAmount) ?? 0;
      const maxBet = parsePointAmountText(
        racing.tableState?.bettingLimits.maxBet,
      );
      const nextAmount = currentPointAmount + amount;

      return Math.min(nextAmount, maxBet ?? nextAmount).toString();
    });
    setBetFeedback(null);
  };

  const handleBetAmountChange = (nextAmount: string) => {
    setBetAmount(nextAmount.replace(/[^\d]/g, ""));
    setBetFeedback(null);
  };

  const handleSubmitBet = () => {
    const race = racing.tableState?.race;
    const raceId = race?.raceId;
    const normalizedAmount = parsePointAmountText(betAmount);

    if (!raceId || !normalizedAmount || bettingValidation.reason) {
      return;
    }

    const commandId = createRacingCommandId("racing-bet");
    const ticketSelections = buildTicketSelections(
      activeSelectedBetEntryIds,
      bettingHorses,
    );
    const pendingTicket: RacingTicketItem = {
      amount: normalizedAmount,
      betId: null,
      betType: effectiveBetType,
      createdAt: new Date().toISOString(),
      localId: commandId,
      message: "Issuing ticket",
      raceId,
      raceNo: race?.raceNo ?? null,
      selections: ticketSelections,
      status: "pending",
    };

    try {
      racing.placeBet({
        amount: normalizedAmount.toString(),
        betType: effectiveBetType,
        commandId,
        raceEntryIds: activeSelectedBetEntryIds,
        raceId,
        tableId,
      } satisfies RacingPlaceBetPayload);
      setPendingBetRequest({
        commandId,
        previousAcceptedEventKeys: racing.betEvents.map(getRacingTableEventKey),
        raceId,
      });
      setLocalTickets((currentTickets) => [
        pendingTicket,
        ...currentTickets.filter((ticket) => ticket.localId !== commandId),
      ]);
      setBetFeedback({
        detail: `${activeBetTypeConfig.label} ${formatPoints(normalizedAmount)}P 발권 요청을 보냈습니다.`,
        title: "Issuing ticket",
        tone: "pending",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Bet request could not send.";

      setLocalTickets((currentTickets) => [
        {
          ...pendingTicket,
          message: errorMessage,
          status: "rejected",
        },
        ...currentTickets,
      ]);
      setBetFeedback({
        detail: errorMessage,
        title: "Ticket rejected",
        tone: "error",
      });
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="derby-title">
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>BK</span>
            <div>
              <h1 id="derby-title">BK Derby</h1>
              <p>실시간 레이스 관전과 마권 발권</p>
            </div>
          </div>
          <nav className={styles.headerActions} aria-label="BK Derby navigation">
            <button
              aria-label="Go back"
              className={styles.navButton}
              onClick={() => router.back()}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={16} />
              Back
            </button>
            <Link className={styles.navButton} href="/" aria-label="Go home">
              <Home aria-hidden="true" size={16} />
              Home
            </Link>
          </nav>
        </header>

        <div className={styles.raceFrame}>
          <div className={`${styles.track} ${styles.trackWithBetting}`}>
            <div className={styles.raceColumn}>
              <div
                className={styles.raceViewport}
                aria-label="Live racing game"
                ref={trackRef}
              >
                <div
                  className={worldLayerClassName}
                  style={
                    {
                      "--camera-duration": leaderHorse?.duration ?? "4.2s",
                      "--camera-offset": leaderHorse?.offset ?? "-2.7s",
                      "--camera-x": `-${cameraTranslatePercent}%`,
                    } as CSSProperties
                  }
                >
                  <div className={styles.cameraTrack} aria-hidden="true">
                    <div className={styles.cameraFinishPost} />
                  </div>
                  <div
                    className={styles.straightLaneOverlay}
                    aria-hidden="true"
                  />
                  <div className={styles.runnerLayer}>
                    {displayHorses.map((horse) => (
                      <Runner
                        horse={horse}
                        isLeader={
                          leaderHorse?.raceEntryId === horse.raceEntryId
                        }
                        isRaceRunning={isRaceRunning}
                        key={horse.raceEntryId}
                        trackWidthPx={trackWidthPx}
                      />
                    ))}
                  </div>
                </div>
                <audio preload="auto" ref={bgmRef} src={raceBgmSrc} />

                <div className={styles.gameHud} aria-label="Live race state">
                  <div className={styles.gameStatus}>
                    <span>{statusLabel}</span>
                    <strong>{statusDetail}</strong>
                    <small>
                      {isVisuallyRunning
                        ? "Track"
                        : getTimerLabel(racing.tableState)}
                    </small>
                    <em>
                      {isVisuallyRunning
                        ? "LIVE"
                        : getTimerText(
                            racing.tableState,
                            clockMs,
                            activePrestartTick,
                          )}
                    </em>
                    <button
                      aria-label={bgmButtonLabel}
                      aria-pressed={isBgmUnlocked && !isBgmBlocked}
                      className={`${styles.bgmButton} ${
                        isBgmPlaying ? styles.bgmButtonActive : ""
                      } ${isBgmBlocked ? styles.bgmButtonBlocked : ""}`}
                      onClick={() => {
                        void handleBgmEnable();
                      }}
                      type="button"
                    >
                      BGM
                    </button>
                  </div>
                  <div
                    className={styles.raceProgressBoard}
                    aria-label="Live race progress"
                  >
                    <div className={styles.progressLabels} aria-hidden="true">
                      <span>START</span>
                      <span>FINISH</span>
                    </div>
                    <div className={styles.progressRail}>
                      {progressHorses.map((horse, index) => (
                        <span
                          aria-label={`${horse.number}번 말 ${formatRank(
                            horse.rank,
                          )} ${Math.round(getRaceProgressPercent(horse.progress))}% 지점`}
                          className={`${styles.progressHorse} ${
                            styles[horse.color]
                          }`}
                          key={horse.raceEntryId}
                          style={getProgressHorseStyle(horse.progress, index)}
                        >
                          {horse.number}
                        </span>
                      ))}
                    </div>
                  </div>
                  {socketErrorMessage ? (
                    <p className={styles.socketError}>{socketErrorMessage}</p>
                  ) : null}
                </div>

                {startCountdownOverlay ? (
                  <div
                    aria-label={`${startCountdownOverlay.label} ${startCountdownOverlay.value}`}
                    aria-live="polite"
                    className={`${styles.startCountdown} ${
                      startCountdownOverlay.isStartCue
                        ? styles.startCountdownGo
                        : ""
                    }`}
                    key={startCountdownOverlay.value}
                  >
                    <span>{startCountdownOverlay.label}</span>
                    <strong>{startCountdownOverlay.value}</strong>
                  </div>
                ) : null}

                {visibleResultBoard ? (
                  <aside
                    className={styles.resultBoard}
                    aria-label="Race result"
                  >
                    <div className={styles.resultHeader}>
                      <span>Race {visibleResultBoard.raceNo}</span>
                      <strong>
                        {visibleResultBoard.isComplete ? "Result" : "Finishing"}
                      </strong>
                    </div>
                    <ol>
                      {visibleResultBoard.entries.map((entry) => (
                        <li key={entry.raceEntryId}>
                          <span
                            className={`${styles.badge} ${styles[entry.color]}`}
                          >
                            {entry.number}
                          </span>
                          <strong>{formatKoreanRank(entry.rank)}</strong>
                          <time>{formatFinishTime(entry.finishedAtMs)}</time>
                        </li>
                      ))}
                    </ol>
                  </aside>
                ) : null}
              </div>

              <div className={styles.raceHistoryDeck}>
                <RaceHistoryList history={raceHistory} />
                <HorseRecordViewer history={raceHistory} />
              </div>
            </div>

            <div className={styles.betColumn}>
              <RacingBettingPanel
                amount={betAmount}
                availableBetTypes={availableBetTypeConfigs}
                entries={bettingHorses}
                feedback={visibleBetFeedback}
                isPending={isBetSubmissionPending}
                onAddStake={handleAddStake}
                onAmountChange={handleBetAmountChange}
                onClearSelections={handleClearBetSlip}
                onSelectBetType={handleSelectBetType}
                onSetStake={handleSetStake}
                onSubmit={handleSubmitBet}
                onToggleEntry={handleToggleBetEntry}
                onRequireLogin={() => router.push("/auth")}
                playerNickname={racing.player?.nickname ?? null}
                selectedBetType={effectiveBetType}
                selectedEntryIds={activeSelectedBetEntryIds}
                tableState={racing.tableState}
                validationReason={bettingValidation.reason}
                walletBalance={racing.walletBalance}
              />
              <TicketHistoryPanel
                historyErrorMessage={betHistory.errorMessage}
                historyStatus={betHistory.status}
                ticketHistory={ticketHistory}
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const Runner = memo(function Runner({
  horse,
  isLeader,
  isRaceRunning,
  trackWidthPx,
}: {
  horse: DisplayHorse;
  isLeader: boolean;
  isRaceRunning: boolean;
  trackWidthPx: number;
}) {
  const runnerPosition = getRunnerPositionStyle(horse.progress, trackWidthPx);

  return (
    <div
      className={`${styles.runner} ${getRunnerLaneClassName(horse.lane)} ${
        styles.liveRunner
      } ${horse.isCoasting ? styles.coastingRunner : ""} ${
        isLeader ? styles.leaderRunner : ""
      }`}
      style={
        {
          "--duration": horse.duration,
          "--offset": horse.offset,
          "--runner-left": runnerPosition.left,
          "--runner-x": runnerPosition.x,
          zIndex: 30 + horse.lane,
        } as CSSProperties
      }
    >
      <div
        aria-label={`${horse.number}번 말 ${
          horse.isCoasting ? "감속" : isRaceRunning ? "달리기" : "출발 대기"
        } 애니메이션`}
        className={`${styles.sprite} ${
          isRaceRunning
            ? styles.runningSprite
            : horse.isCoasting
              ? styles.coastingSprite
              : styles.pausedSprite
        }`}
        style={
          {
            "--sprite": `url("${horse.file}")`,
          } as CSSProperties
        }
      />
    </div>
  );
});

function RacingBettingPanel({
  amount,
  availableBetTypes,
  entries,
  feedback,
  isPending,
  onAddStake,
  onAmountChange,
  onClearSelections,
  onSelectBetType,
  onSetStake,
  onSubmit,
  onToggleEntry,
  onRequireLogin,
  playerNickname,
  selectedBetType,
  selectedEntryIds,
  tableState,
  validationReason,
  walletBalance,
}: {
  amount: string;
  availableBetTypes: RacingBetTypeConfig[];
  entries: DisplayHorse[];
  feedback: BetFeedback | null;
  isPending: boolean;
  onAddStake: (amount: number) => void;
  onAmountChange: (amount: string) => void;
  onClearSelections: () => void;
  onSelectBetType: (betType: RacingBetType) => void;
  onSetStake: (amount: number) => void;
  onSubmit: () => void;
  onToggleEntry: (raceEntryId: string) => void;
  onRequireLogin: () => void;
  playerNickname: string | null;
  selectedBetType: RacingBetType;
  selectedEntryIds: string[];
  tableState: RacingTableViewState | null;
  validationReason: string | null;
  walletBalance: string | null;
}) {
  const activeConfig = getRacingBetTypeConfig(selectedBetType);
  const isLoggedIn = Boolean(playerNickname);
  const isBettingOpen =
    tableState?.phase === "BETTING" && Boolean(tableState.race);
  const canEditBet = isBettingOpen && isLoggedIn && !isPending;
  const amountValue = parsePointAmountText(amount);
  const fieldSize = tableState?.fieldSize ?? entries.length;
  const estimatedOdds = getEstimatedOddsMultiplier(selectedBetType, fieldSize);
  const estimatedReturn =
    amountValue === null ? null : Math.floor(amountValue * estimatedOdds);
  const entryById = new Map(entries.map((entry) => [entry.raceEntryId, entry]));
  const selectedOrderById = new Map(
    selectedEntryIds.map((entryId, index) => [entryId, index + 1]),
  );
  const selectionSlots = Array.from(
    { length: activeConfig.requiredSelections },
    (_, index) => selectedEntryIds[index] ?? null,
  );

  return (
    <aside
      aria-label="Racing betting terminal"
      className={`${styles.bettingPanel} ${
        isBettingOpen ? "" : styles.bettingPanelLocked
      } ${isLoggedIn ? "" : styles.bettingPanelGuest}`}
    >
      <div className={styles.betPanelHeader}>
        <div>
          <span>Ticket window</span>
          <strong>
            {tableState?.race ? `Race ${tableState.race.raceNo}` : "Race"}
          </strong>
        </div>
        <div className={styles.betPanelMeta}>
          <span>{getBettingPhaseLabel(tableState)}</span>
          <strong>{getTimerText(tableState)}</strong>
        </div>
      </div>

      <div className={styles.betAccountStrip}>
        <div>
          <span>{playerNickname ?? "Spectator mode"}</span>
          <strong>
            {isLoggedIn
              ? walletBalance
                ? `${formatPointText(walletBalance)}P`
                : "Wallet"
              : "Watching only"}
          </strong>
        </div>
        {!isLoggedIn ? (
          <a className={styles.betLoginLink} href="/auth">
            Sign in
          </a>
        ) : null}
      </div>

      <div className={styles.betTypeGrid} aria-label="Bet type">
        {availableBetTypes.map((config) => (
          <button
            aria-pressed={config.type === selectedBetType}
            className={`${styles.betTypeButton} ${
              config.type === selectedBetType ? styles.betTypeButtonActive : ""
            }`}
            disabled={!isLoggedIn}
            key={config.type}
            onClick={() => onSelectBetType(config.type)}
            type="button"
          >
            <span>{config.shortLabel}</span>
            <strong>{config.label}</strong>
            <em>{formatOddsMultiplier(config.type, fieldSize)}</em>
          </button>
        ))}
      </div>

      <div className={styles.betSlip}>
        <div className={styles.betSlipTopline}>
          <span>{activeConfig.ordered ? "ORDER" : "BOX"}</span>
          <strong>{activeConfig.description}</strong>
        </div>
        <div className={styles.betSlots}>
          {selectionSlots.map((entryId, index) => {
            const entry = entryId ? entryById.get(entryId) : null;

            return (
              <button
                className={`${styles.betSlot} ${
                  entry ? styles.betSlotFilled : ""
                }`}
                disabled={!isLoggedIn}
                key={`${selectedBetType}-${index}`}
                onClick={() => {
                  if (entry) {
                    onToggleEntry(entry.raceEntryId);
                  }
                }}
                type="button"
              >
                <span>{getSelectionSlotLabel(activeConfig, index)}</span>
                <strong>{entry ? entry.number : "-"}</strong>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.betHorseGrid} aria-label="Race entries">
        {entries.map((entry) => {
          const selectedOrder = selectedOrderById.get(entry.raceEntryId);

          return (
            <button
              aria-pressed={Boolean(selectedOrder)}
              className={`${styles.betHorseButton} ${styles[entry.color]} ${
                selectedOrder ? styles.betHorseSelected : ""
              }`}
              disabled={!canEditBet}
              key={entry.raceEntryId}
              onClick={() => onToggleEntry(entry.raceEntryId)}
              type="button"
            >
              <span className={styles.betHorseNumber}>{entry.number}</span>
              <span className={styles.betHorseName}>{entry.name}</span>
              {selectedOrder ? (
                <span className={styles.betHorseMark}>{selectedOrder}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <form
        className={styles.betStakeForm}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className={styles.betStakeInput}>
          <span>Stake</span>
          <input
            disabled={!canEditBet}
            inputMode="numeric"
            onChange={(event) => onAmountChange(event.target.value)}
            value={amount}
          />
        </label>
        <div className={styles.betChipRack}>
          {quickStakeAmounts.map((quickAmount) => (
            <button
              disabled={!canEditBet}
              key={quickAmount}
              onClick={() => onAddStake(quickAmount)}
              type="button"
            >
              +{formatPoints(quickAmount)}
            </button>
          ))}
          <button
            disabled={!canEditBet}
            onClick={() =>
              onSetStake(
                parsePointAmountText(tableState?.bettingLimits.minBet) ?? 100,
              )
            }
            type="button"
          >
            MIN
          </button>
        </div>
        <div className={styles.betSlipFooter}>
          <span>
            {formatPointText(tableState?.bettingLimits.minBet)}P-
            {formatPointText(tableState?.bettingLimits.maxBet)}P
          </span>
          <strong>
            x{estimatedOdds.toFixed(1)} /{" "}
            {estimatedReturn === null
              ? "-"
              : `${formatPoints(estimatedReturn)}P`}
          </strong>
        </div>
        <div className={styles.betActions}>
          <button
            disabled={!isLoggedIn || selectedEntryIds.length === 0 || isPending}
            onClick={onClearSelections}
            type="button"
          >
            Clear
          </button>
          <button
            className={styles.betSubmitButton}
            disabled={Boolean(validationReason)}
            type="submit"
          >
            {isPending ? "ISSUING" : "ISSUE TICKET"}
          </button>
        </div>
      </form>

      <div
        className={`${styles.betFeedback} ${
          feedback?.tone === "success"
            ? styles.betFeedbackSuccess
            : feedback?.tone === "error"
              ? styles.betFeedbackError
              : feedback?.tone === "pending"
                ? styles.betFeedbackPending
                : ""
        }`}
      >
        <strong>{feedback?.title ?? "Ticket status"}</strong>
        <span>{feedback?.detail ?? validationReason ?? "Ready"}</span>
      </div>

      {!isLoggedIn ? (
        <button
          className={styles.betLoginGate}
          onClick={onRequireLogin}
          type="button"
        >
          <strong>로그인 후 베팅</strong>
          <span>관전은 계속 가능합니다</span>
        </button>
      ) : null}
    </aside>
  );
}

function TicketHistoryPanel({
  historyErrorMessage,
  historyStatus,
  ticketHistory,
}: {
  historyErrorMessage: string | null;
  historyStatus: BetHistoryStatus;
  ticketHistory: RacingTicketHistoryItem[];
}) {
  return (
    <section
      className={`${styles.ticketList} ${styles.ticketHistoryPanel}`}
      aria-label="My ticket history"
    >
      <div className={styles.ticketListHeader}>
        <span>내 티켓 히스토리</span>
        <strong>{ticketHistory.length}</strong>
      </div>
      {ticketHistory.length > 0 ? (
        <ol>
          {ticketHistory.map((ticket) => {
            const ticketConfig = getRacingBetTypeConfig(ticket.betType);

            return (
              <li
                className={`${styles.ticketItem} ${getTicketHistoryClassName(
                  ticket.outcomeStatus,
                )}`}
                key={ticket.localId}
              >
                <div className={styles.ticketItemTopline}>
                  <span>
                    {ticket.raceNo ? `Race ${ticket.raceNo}` : "Race"}
                  </span>
                  <strong>
                    {getTicketHistoryStatusLabel(ticket.outcomeStatus)}
                  </strong>
                </div>
                <div className={styles.ticketItemMain}>
                  <strong>{ticketConfig.shortLabel}</strong>
                  <span>
                    {ticket.amount === null
                      ? "Stake -"
                      : `${formatPoints(ticket.amount)}P`}
                  </span>
                  <time>{formatTicketTime(ticket.createdAt)}</time>
                </div>
                <div
                  className={styles.ticketSelections}
                  aria-label="Ticket selections"
                >
                  {ticket.selections.length > 0 ? (
                    ticket.selections.map((selection, index) => (
                      <span
                        className={`${styles.ticketSelection} ${
                          styles[selection.color]
                        }`}
                        key={`${ticket.localId}-${selection.raceEntryId}-${index}`}
                      >
                        {ticketConfig.ordered ? `${index + 1}.` : ""}
                        {selection.number}
                      </span>
                    ))
                  ) : (
                    <span className={styles.ticketSelection}>-</span>
                  )}
                </div>
                {ticket.message ? (
                  <em className={styles.ticketMessage}>{ticket.message}</em>
                ) : null}
                <div className={styles.ticketResultLine}>
                  <span>{ticket.outcomeDetail}</span>
                  {ticket.projectedReturn !== null ? (
                    <strong>
                      {ticket.outcomeStatus === "won" ? "지급" : "반환"}{" "}
                      {formatPoints(ticket.projectedReturn)}P
                    </strong>
                  ) : null}
                </div>
                {ticket.resultOrder.length > 0 ? (
                  <div
                    className={styles.ticketResultOrder}
                    aria-label="Race result order"
                  >
                    <span>Result</span>
                    {ticket.resultOrder.map((entry) => (
                      <strong
                        className={`${styles.ticketResultChip} ${
                          styles[entry.color]
                        }`}
                        key={`${ticket.localId}-result-${entry.raceEntryId}`}
                        title={`${formatKoreanRank(entry.finalRank)} ${entry.number}번`}
                      >
                        {entry.number}
                        <em>{entry.finalRank}</em>
                      </strong>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.ticketEmpty}>
          {getTicketHistoryEmptyText(historyStatus, historyErrorMessage)}
        </p>
      )}
    </section>
  );
}

function HorseRecordViewer({ history }: { history: RaceHistoryViewState }) {
  const records = buildHorseRecords(history.races);

  return (
    <section className={styles.horseRecordViewer} aria-label="Horse records">
      <div className={styles.horseRecordHeader}>
        <div>
          <span>Horse records</span>
          <strong>말별 최근 성적</strong>
        </div>
        <em>{records.length}</em>
      </div>

      {records.length > 0 ? (
        <ol>
          {records.map((record) => (
            <li className={styles.horseRecordItem} key={record.number}>
              <span
                className={`${styles.horseRecordNumber} ${
                  styles[record.color]
                }`}
              >
                {record.number}
              </span>
              <div className={styles.horseRecordMain}>
                <div className={styles.horseRecordTopline}>
                  <strong>{record.name}</strong>
                  <span>
                    평균{" "}
                    {record.averageRank === null
                      ? "-"
                      : `${record.averageRank.toFixed(1)}등`}
                  </span>
                </div>
                <div className={styles.horseRecordStats}>
                  <span>
                    <em>출전</em>
                    <strong>{record.starts}회</strong>
                  </span>
                  <span>
                    <em>1등</em>
                    <strong>{record.wins}회</strong>
                  </span>
                  <span>
                    <em>3등 내</em>
                    <strong>{record.top3}회</strong>
                  </span>
                </div>
                <div className={styles.horseRecordRanks}>
                  <small>최근</small>
                  {record.recentRanks.length > 0 ? (
                    record.recentRanks.map((rank, index) => (
                      <HorseRecordRankBadge
                        key={`${record.number}-${rank}-${index}`}
                        rank={rank}
                      />
                    ))
                  ) : (
                    <span>-</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.raceHistoryEmpty}>
          {history.status === "loading"
            ? "Loading records"
            : (history.errorMessage ?? "No horse records yet")}
        </p>
      )}
    </section>
  );
}

function HorseRecordRankBadge({ rank }: { rank: number }) {
  return <span className={getHorseRecordRankClassName(rank)}>{rank}등</span>;
}

function RaceHistoryList({ history }: { history: RaceHistoryViewState }) {
  return (
    <section className={styles.raceHistoryList} aria-label="Race history">
      <div className={styles.raceHistoryHeader}>
        <div>
          <span>Race history</span>
          <strong>{history.date ?? "Today"}</strong>
        </div>
        <em>{history.races.length}</em>
      </div>

      {history.races.length > 0 ? (
        <ol>
          {history.races.map((race) => {
            const orderedEntries = [...race.entries].sort(
              (left, right) => left.finalRank - right.finalRank,
            );

            return (
              <li className={styles.raceHistoryItem} key={race.raceId}>
                <span className={styles.raceHistoryRaceNo}>
                  Race {race.raceNo}
                </span>
                <div
                  className={styles.raceHistoryResultChips}
                  aria-label={`Race ${race.raceNo} result order`}
                >
                  {orderedEntries.map((entry) => (
                    <span
                      className={`${styles.raceHistoryHorseChip} ${
                        styles[getHistoryHorseColor(entry.number)]
                      }`}
                      key={entry.raceEntryId}
                      title={`${formatKoreanRank(entry.finalRank)} ${entry.number}번`}
                    >
                      {entry.number}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.raceHistoryEmpty}>
          {history.status === "loading"
            ? "Loading results"
            : (history.errorMessage ?? "No settled races yet")}
        </p>
      )}
    </section>
  );
}

function useRacingRaceHistory(): RaceHistoryViewState {
  const [history, setHistory] = useState<RaceHistoryViewState>({
    date: null,
    errorMessage: null,
    races: [],
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let pollTimer: number | null = null;

    async function loadRaceHistory() {
      try {
        const nextHistory = await requestRacingRaceHistory(controller.signal);

        if (cancelled) {
          return;
        }

        setHistory({
          date: nextHistory.date,
          errorMessage: null,
          races: nextHistory.races,
          status: "ready",
        });
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        setHistory((currentHistory) => ({
          ...currentHistory,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Race history request failed.",
          status: "error",
        }));
      }
    }

    void loadRaceHistory();
    pollTimer = window.setInterval(() => {
      void loadRaceHistory();
    }, raceHistoryPollMs);

    return () => {
      cancelled = true;
      controller.abort();
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, []);

  return history;
}

function useRacingBetHistory(gameToken: string | null): BetHistoryViewState {
  const [history, setHistory] = useState<BetHistoryViewState>({
    bets: [],
    errorMessage: null,
    status: "idle",
  });

  useEffect(() => {
    if (!gameToken) {
      setHistory({
        bets: [],
        errorMessage: null,
        status: "idle",
      });
      return;
    }

    const authorizedGameToken = gameToken;
    let cancelled = false;
    const controller = new AbortController();
    let pollTimer: number | null = null;

    async function loadBetHistory() {
      setHistory((currentHistory) => ({
        ...currentHistory,
        errorMessage: null,
        status: currentHistory.status === "ready" ? "ready" : "loading",
      }));

      try {
        const nextHistory = await requestRacingBetHistory(
          authorizedGameToken,
          controller.signal,
        );

        if (cancelled) {
          return;
        }

        setHistory({
          bets: nextHistory.bets,
          errorMessage: null,
          status: "ready",
        });
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        setHistory((currentHistory) => ({
          ...currentHistory,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Ticket history request failed.",
          status: "error",
        }));
      }
    }

    void loadBetHistory();
    pollTimer = window.setInterval(() => {
      void loadBetHistory();
    }, raceHistoryPollMs);

    return () => {
      cancelled = true;
      controller.abort();
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, [gameToken]);

  return history;
}

function useRacingTable() {
  const socketRef = useRef<Socket | null>(null);
  const latestTableStateRef = useRef<RacingTableViewState | null>(null);
  const [gameToken, setGameToken] = useState<string | null>(null);
  const [player, setPlayer] = useState<GameTokenResponse["user"] | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("requesting-token");
  const [latestTableEvent, setLatestTableEvent] =
    useState<RacingTableEventPayload | null>(null);
  const [betEvents, setBetEvents] = useState<RacingTableEventPayload[]>([]);
  const [latestTick, setLatestTick] = useState<RacingRaceTickSnapshot | null>(
    null,
  );
  const [latestPrestartTick, setLatestPrestartTick] =
    useState<PrestartTickView | null>(null);
  const [latestWalletEvent, setLatestWalletEvent] =
    useState<RacingWalletUpdatedPayload | null>(null);
  const [latestBetError, setLatestBetError] =
    useState<RacingSocketErrorPayload | null>(null);
  const [socketError, setSocketError] =
    useState<RacingSocketErrorPayload | null>(null);
  const [tableState, setTableState] = useState<RacingTableViewState | null>(
    null,
  );
  const [walletBalance, setWalletBalance] = useState<string | null>(null);

  const placeBet = useCallback((payload: RacingPlaceBetPayload) => {
    const socket = socketRef.current;

    if (!socket?.connected) {
      throw new Error("Racing socket is not connected.");
    }

    setLatestBetError(null);
    setSocketError(null);
    socket.emit(RACING_CLIENT_EVENTS.BET_PLACE, payload);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pollController = new AbortController();
    let pollTimer: number | null = null;

    function applyTableState(nextState: RacingTableViewState) {
      const resolvedState = reconcileRacingTableState(
        latestTableStateRef.current,
        nextState,
        Date.now(),
      );

      latestTableStateRef.current = resolvedState;
      setTableState(resolvedState);
      setLatestTick((currentTick) =>
        currentTick?.raceId === resolvedState.race?.raceId ? currentTick : null,
      );
      setLatestPrestartTick((currentTick) =>
        currentTick?.raceId === resolvedState.race?.raceId &&
        isRaceStartCountdownPhase(resolvedState)
          ? currentTick
          : null,
      );
    }

    async function pollTableState() {
      try {
        const state = await requestRacingTableState(pollController.signal);

        if (cancelled) {
          return;
        }

        applyTableState(state);
        setConnectionStatus((currentStatus) =>
          currentStatus === "connected" ? currentStatus : "polling",
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setConnectionStatus((currentStatus) =>
          currentStatus === "connected" ? currentStatus : "error",
        );
        setSocketError({
          code: "UNKNOWN_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Racing table polling failed.",
        });
      }
    }

    async function connectSocket() {
      setConnectionStatus("requesting-token");
      setConnectionStatus("connecting");
      setGameToken(null);
      setSocketError(null);

      let tokenResponse: GameTokenResponse;

      try {
        tokenResponse = await requestGameToken(pollController.signal);
      } catch (error) {
        if (cancelled) {
          return false;
        }

        const message =
          error instanceof Error ? error.message : "Game token request failed.";

        if (message === "Authentication required.") {
          setConnectionStatus("polling");
          setGameToken(null);
          setPlayer(null);
          setSocketError(null);
          setWalletBalance(null);
          return false;
        }

        setSocketError(
          (currentError) =>
            currentError ?? {
              code: "UNAUTHORIZED",
              message,
            },
        );

        return false;
      }

      if (cancelled) {
        return false;
      }

      setPlayer(tokenResponse.user);
      setGameToken(tokenResponse.token);
      setWalletBalance(tokenResponse.walletBalance);

      const socket = io(resolveRacingSocketUrl(), {
        auth: {
          token: tokenResponse.token,
        },
        withCredentials: true,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        setConnectionStatus("connected");
        setSocketError(null);
        socket.emit(RACING_CLIENT_EVENTS.TABLE_JOIN, {
          nickname: tokenResponse.user.nickname,
          tableId,
        } satisfies RacingJoinTablePayload);
      });

      socket.on("connect_error", (error) => {
        setConnectionStatus((currentStatus) =>
          currentStatus === "polling" ? currentStatus : "error",
        );
        setSocketError({
          code: "UNKNOWN_ERROR",
          message: error.message,
        });
      });

      socket.on("disconnect", () => {
        setConnectionStatus((currentStatus) =>
          currentStatus === "polling" ? currentStatus : "disconnected",
        );
      });

      socket.on(
        RACING_SERVER_EVENTS.TABLE_STATE,
        (payload: RacingTableState) => {
          setConnectionStatus("connected");
          setSocketError(null);
          applyTableState(payload);
        },
      );

      socket.on(
        RACING_SERVER_EVENTS.TABLE_EVENT,
        (payload: RacingTableEventPayload) => {
          setLatestTableEvent(payload);

          if (payload.type === "BET_PLACED") {
            const eventKey = getRacingTicketEventKey(payload);

            setBetEvents((currentEvents) => [
              payload,
              ...currentEvents.filter(
                (event) => getRacingTicketEventKey(event) !== eventKey,
              ),
            ]);
          }

          if (payload.type === "RACE_TICK" && payload.tick) {
            setLatestTick(payload.tick);
            setLatestPrestartTick((currentTick) =>
              currentTick?.raceId === payload.tick?.raceId ? null : currentTick,
            );
          }

          if (
            payload.type === "PRESTART_TICK" &&
            payload.prestartTick &&
            payload.raceId
          ) {
            setLatestPrestartTick({
              ...payload.prestartTick,
              raceId: payload.raceId,
              raceNo: payload.raceNo ?? null,
              receivedAtMs: Date.now(),
            });
          }
        },
      );

      socket.on(
        RACING_SERVER_EVENTS.WALLET_UPDATED,
        (payload: RacingWalletUpdatedPayload) => {
          setLatestWalletEvent(payload);
          setWalletBalance(payload.balance);
        },
      );

      socket.on(
        RACING_SERVER_EVENTS.ERROR,
        (payload: RacingSocketErrorPayload) => {
          if (payload.event === RACING_CLIENT_EVENTS.BET_PLACE) {
            setLatestBetError(payload);
          }

          setSocketError({
            code: payload.code,
            message:
              payload.code === "UNAUTHORIZED"
                ? "Server polling active."
                : payload.message,
          });
        },
      );

      return true;
    }

    void (async () => {
      await connectSocket();

      if (cancelled) {
        return;
      }

      void pollTableState();
      pollTimer = window.setInterval(() => {
        void pollTableState();
      }, restPollMs);
    })();

    return () => {
      cancelled = true;
      pollController.abort();
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  return {
    betEvents,
    connectionStatus,
    gameToken,
    latestPrestartTick,
    latestTableEvent,
    latestTick,
    latestWalletEvent,
    latestBetError,
    placeBet,
    player,
    socketError,
    tableState,
    walletBalance,
  };
}

async function requestRacingTableState(signal: AbortSignal) {
  const response = await fetch(`${resolveRacingServerUrl()}/racing/tables`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Racing table request failed (${response.status}).`);
  }

  const body = (await response.json()) as RacingTablesResponse;
  const table = body.tables.find((candidate) => candidate.tableId === tableId);

  if (!table) {
    throw new Error(`Racing table ${tableId} was not returned.`);
  }

  return table;
}

async function requestRacingRaceHistory(signal: AbortSignal) {
  const url = new URL(`${resolveRacingServerUrl()}/racing/races`);

  url.searchParams.set("tableId", tableId);
  url.searchParams.set("limit", "8");

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Racing history request failed (${response.status}).`);
  }

  return (await response.json()) as RacingRaceResultsResponse;
}

async function requestRacingBetHistory(
  gameToken: string,
  signal: AbortSignal,
) {
  const url = new URL(`${resolveRacingServerUrl()}/racing/bets`);

  url.searchParams.set("tableId", tableId);
  url.searchParams.set("limit", "20");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${gameToken}`,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Ticket history request failed (${response.status}).`);
  }

  const body = (await response.json()) as Partial<RacingBetsResponse>;

  if (!Array.isArray(body.bets)) {
    throw new Error("Ticket history response was invalid.");
  }

  return body as RacingBetsResponse;
}

async function requestGameToken(signal: AbortSignal) {
  const response = await fetch("/api/game-token", {
    method: "POST",
    signal,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    throw new Error(
      body?.error ?? `Game token request failed (${response.status}).`,
    );
  }

  return (await response.json()) as GameTokenResponse;
}

function resolveRacingSocketUrl() {
  const normalizedUrl = resolveRacingServerUrl();

  return normalizedUrl.endsWith(RACING_NAMESPACE)
    ? normalizedUrl
    : `${normalizedUrl}${RACING_NAMESPACE}`;
}

function resolveRacingServerUrl() {
  return (
    process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:4000"
  ).replace(/\/$/, "");
}

function reconcileRacingTableState(
  currentState: RacingTableViewState | null,
  nextState: RacingTableViewState,
  nowMs: number,
) {
  if (shouldKeepCurrentRaceState(currentState, nextState, nowMs)) {
    return currentState ?? nextState;
  }

  return nextState;
}

function shouldKeepCurrentRaceState(
  currentState: RacingTableViewState | null,
  nextState: RacingTableViewState,
  nowMs: number,
) {
  const currentRace = currentState?.race;
  const nextRace = nextState.race;

  if (!currentState || !currentRace || !nextRace) {
    return false;
  }

  if (currentRace.raceId === nextRace.raceId) {
    return false;
  }

  if (nextRace.raceNo <= currentRace.raceNo) {
    return false;
  }

  if (!isRaceVisuallyRunning(currentState, nowMs)) {
    return false;
  }

  const nextStartMs = getScheduledRaceStartMs(nextState);
  const isFutureWaitingRace =
    (nextState.phase === "WAITING" || nextState.phase === "BETTING") &&
    (nextStartMs === null || nextStartMs > nowMs);

  return isFutureWaitingRace;
}

function getAvailableBetTypeConfigs(tableState: RacingTableViewState | null) {
  const availableTypes = tableState?.betTypes?.length
    ? new Set(tableState.betTypes)
    : new Set(racingBetTypeConfigs.map((config) => config.type));
  const availableConfigs = racingBetTypeConfigs.filter((config) =>
    availableTypes.has(config.type),
  );

  return availableConfigs.length > 0 ? availableConfigs : racingBetTypeConfigs;
}

function getRacingBetTypeConfig(betType: RacingBetType) {
  return (
    racingBetTypeConfigs.find((config) => config.type === betType) ??
    racingBetTypeConfigs[0]
  );
}

function getBettingValidation(input: {
  amountText: string;
  connectionStatus: ConnectionStatus;
  isPending: boolean;
  player: GameTokenResponse["user"] | null;
  selectedCount: number;
  tableState: RacingTableViewState | null;
  typeConfig: RacingBetTypeConfig;
}) {
  const amount = parsePointAmountText(input.amountText);
  const minBet = parsePointAmountText(input.tableState?.bettingLimits.minBet);
  const maxBet = parsePointAmountText(input.tableState?.bettingLimits.maxBet);

  if (input.isPending) {
    return { amount, reason: "Ticket is issuing." };
  }

  if (!input.player) {
    return { amount, reason: "Login wallet required." };
  }

  if (input.connectionStatus !== "connected") {
    return { amount, reason: "Racing socket is not connected." };
  }

  if (!input.tableState?.race) {
    return { amount, reason: "Race is not ready." };
  }

  if (input.tableState.phase !== "BETTING") {
    return { amount, reason: "Betting is closed." };
  }

  if (input.selectedCount !== input.typeConfig.requiredSelections) {
    return {
      amount,
      reason: `${input.typeConfig.label} requires ${input.typeConfig.requiredSelections} selection${input.typeConfig.requiredSelections > 1 ? "s" : ""}.`,
    };
  }

  if (amount === null) {
    return { amount, reason: "Enter a valid stake." };
  }

  if (minBet !== null && amount < minBet) {
    return { amount, reason: `Minimum stake is ${formatPoints(minBet)}P.` };
  }

  if (maxBet !== null && amount > maxBet) {
    return { amount, reason: `Maximum stake is ${formatPoints(maxBet)}P.` };
  }

  return { amount, reason: null };
}

function getAcceptedBetEvent(input: {
  events: RacingTableEventPayload[];
  ignoredEventKeys: string[];
  playerId: string | null;
  raceId: string | null;
}) {
  if (!input.playerId || !input.raceId) {
    return null;
  }

  const ignoredEventKeys = new Set(input.ignoredEventKeys);

  return (
    input.events.find(
      (event) =>
        event.type === "BET_PLACED" &&
        event.actorUserId === input.playerId &&
        event.raceId === input.raceId &&
        !ignoredEventKeys.has(getRacingTableEventKey(event)),
    ) ?? null
  );
}

function getVisibleBetFeedback(input: {
  acceptedEvent: RacingTableEventPayload | null;
  fallback: BetFeedback | null;
  selectedBetType: RacingBetType;
  socketError: RacingSocketErrorPayload | null;
}): BetFeedback | null {
  if (input.socketError) {
    return {
      detail: input.socketError.message,
      title: input.socketError.code,
      tone: "error",
    };
  }

  if (input.acceptedEvent) {
    const acceptedConfig = getRacingBetTypeConfig(
      input.acceptedEvent.betType ?? input.selectedBetType,
    );

    return {
      detail: `${acceptedConfig.label} 마권이 정상 접수되었습니다.`,
      title: "마권 접수 완료",
      tone: "success",
    };
  }

  return input.fallback;
}

function buildTicketHistory(input: {
  acceptedEvents: RacingTableEventPayload[];
  betSocketError: RacingSocketErrorPayload | null;
  currentRace: RacingTableViewState["race"];
  entries: DisplayHorse[];
  fallbackBetType: RacingBetType;
  localTickets: RacingTicketItem[];
  pendingBetRequest: { commandId: string; raceId: string } | null;
  playerId: string | null;
  serverBets: RacingBetHistorySnapshot[];
  settledRaces: RacingSettledRaceSnapshot[];
}): RacingTicketHistoryItem[] {
  const serverTickets = input.serverBets.map(buildTicketFromServerBet);
  const localTickets = input.localTickets.map((ticket) =>
    input.betSocketError && input.pendingBetRequest?.commandId === ticket.localId
      ? {
          ...ticket,
          message: input.betSocketError.message,
          status: "rejected" as const,
        }
      : ticket,
  );
  let mergedTickets = mergeServerAndLocalTickets(serverTickets, localTickets);

  for (let index = input.acceptedEvents.length - 1; index >= 0; index -= 1) {
    const event = input.acceptedEvents[index];
    const raceId = event?.raceId;

    if (
      !event ||
      event.type !== "BET_PLACED" ||
      !input.playerId ||
      event.actorUserId !== input.playerId ||
      !raceId
    ) {
      continue;
    }

    const raceEntryIds = event.raceEntryIds ?? [];
    const betType = event.betType ?? input.fallbackBetType;
    const ticketSelectionEntries = getTicketSelectionEntriesForRace({
      currentRace: input.currentRace,
      fallbackEntries: input.entries,
      raceEntryIds,
      raceId,
      settledRaces: input.settledRaces,
    });
    const existingSelections = findExistingTicketSelections(mergedTickets, {
      betId: event.betId ?? null,
      betType,
      raceEntryIds,
      raceId,
    });

    mergedTickets = upsertAcceptedTicket(mergedTickets, {
      amount: null,
      betId: event.betId ?? null,
      betType,
      createdAt: event.createdAt,
      localId: event.betId ?? getRacingTicketEventKey(event),
      message: null,
      raceId,
      raceNo: getTicketRaceNo(raceId, input.currentRace, input.settledRaces),
      selections:
        ticketSelectionEntries.length > 0
          ? buildTicketSelections(raceEntryIds, ticketSelectionEntries)
          : (existingSelections ?? buildTicketSelections(raceEntryIds, [])),
      status: "accepted",
    });
  }

  const settledRaceById = buildSettledRaceLookup(
    input.currentRace,
    input.settledRaces,
  );

  return [...mergedTickets]
    .sort((left, right) => getTicketTimestamp(right) - getTicketTimestamp(left))
    .map((ticket) =>
      buildTicketHistoryItem(
        ticket,
        settledRaceById.get(ticket.raceId) ?? null,
      ),
    );
}

function buildTicketFromServerBet(
  serverBet: RacingBetHistorySnapshot,
): RacingTicketItem {
  return {
    amount: parsePointAmountText(serverBet.amount),
    betId: serverBet.betId,
    betType: serverBet.betType,
    createdAt: serverBet.createdAt,
    localId: `server:${serverBet.betId}`,
    message: null,
    payoutAmount: parseNonNegativePointAmountText(serverBet.payoutAmount),
    raceId: serverBet.raceId,
    raceNo: serverBet.raceNo,
    selections: serverBet.selections.map((selection) => ({
      color: getHistoryHorseColor(selection.entryNo),
      name: selection.displayName,
      number: selection.entryNo,
      raceEntryId: selection.raceEntryId,
    })),
    serverStatus: serverBet.status,
    settledAt: serverBet.settledAt,
    status: "accepted",
  };
}

function mergeServerAndLocalTickets(
  serverTickets: RacingTicketItem[],
  localTickets: RacingTicketItem[],
) {
  const serverBetIds = new Set(
    serverTickets.flatMap((ticket) => (ticket.betId ? [ticket.betId] : [])),
  );
  const mergedTickets = [...serverTickets];

  for (const ticket of localTickets) {
    if (ticket.betId && serverBetIds.has(ticket.betId)) {
      continue;
    }

    mergedTickets.push(ticket);
  }

  return mergedTickets;
}

function getTicketSelectionEntriesForRace(input: {
  currentRace: RacingTableViewState["race"];
  fallbackEntries: RacingTicketSelectionEntry[];
  raceEntryIds: string[];
  raceId: string;
  settledRaces: RacingSettledRaceSnapshot[];
}): RacingTicketSelectionEntry[] {
  if (input.currentRace?.raceId === input.raceId) {
    return input.currentRace.entries;
  }

  const settledRace = input.settledRaces.find(
    (race) => race.raceId === input.raceId,
  );

  if (settledRace) {
    return settledRace.entries;
  }

  const raceEntryIdSet = new Set(input.raceEntryIds);

  return input.fallbackEntries.filter((entry) =>
    raceEntryIdSet.has(entry.raceEntryId),
  );
}

function findExistingTicketSelections(
  currentTickets: RacingTicketItem[],
  input: {
    betId: string | null;
    betType: RacingBetType;
    raceEntryIds: string[];
    raceId: string;
  },
) {
  const matchingTicket = input.betId
    ? currentTickets.find((ticket) => ticket.betId === input.betId)
    : currentTickets.find(
        (ticket) =>
          ticket.raceId === input.raceId &&
          ticket.betType === input.betType &&
          hasSameTicketSelectionIds(ticket.selections, input.raceEntryIds),
      );

  return matchingTicket?.selections ?? null;
}

function buildTicketSelections(
  raceEntryIds: string[],
  entries: RacingTicketSelectionEntry[],
): RacingTicketSelection[] {
  const entryById = new Map(entries.map((entry) => [entry.raceEntryId, entry]));

  return raceEntryIds.map((raceEntryId, index) => {
    const entry = entryById.get(raceEntryId);
    const fallback = baseHorseProfiles[index % baseHorseProfiles.length];
    const number = entry?.number ?? fallback?.number ?? index + 1;

    return {
      color: entry?.color ?? getHistoryHorseColor(number),
      name: entry?.name ?? fallback?.name ?? `Entry ${index + 1}`,
      number,
      raceEntryId,
    };
  });
}

function upsertAcceptedTicket(
  currentTickets: RacingTicketItem[],
  acceptedTicket: RacingTicketItem,
) {
  const duplicateIndex = acceptedTicket.betId
    ? currentTickets.findIndex(
        (ticket) => ticket.betId === acceptedTicket.betId,
      )
    : -1;

  if (duplicateIndex >= 0) {
    const nextTickets = [...currentTickets];
    const currentTicket = nextTickets[duplicateIndex];

    nextTickets[duplicateIndex] = {
      ...currentTicket,
      ...acceptedTicket,
      amount: currentTicket.amount ?? acceptedTicket.amount,
      localId: currentTicket.localId,
      message: null,
      raceNo: acceptedTicket.raceNo ?? currentTicket.raceNo,
      status: "accepted",
    };

    return nextTickets;
  }

  const pendingIndex = currentTickets.findIndex(
    (ticket) =>
      ticket.status === "pending" &&
      ticket.raceId === acceptedTicket.raceId &&
      ticket.betType === acceptedTicket.betType &&
      hasSameTicketSelections(ticket.selections, acceptedTicket.selections),
  );

  if (pendingIndex >= 0) {
    const nextTickets = [...currentTickets];
    const pendingTicket = nextTickets[pendingIndex];

    nextTickets[pendingIndex] = {
      ...pendingTicket,
      ...acceptedTicket,
      amount: pendingTicket.amount ?? acceptedTicket.amount,
      createdAt: pendingTicket.createdAt,
      localId: pendingTicket.localId,
      message: null,
      raceNo: acceptedTicket.raceNo ?? pendingTicket.raceNo,
      status: "accepted",
    };

    return nextTickets;
  }

  return [acceptedTicket, ...currentTickets];
}

function hasSameTicketSelections(
  leftSelections: RacingTicketSelection[],
  rightSelections: RacingTicketSelection[],
) {
  if (leftSelections.length !== rightSelections.length) {
    return false;
  }

  return leftSelections.every(
    (selection, index) =>
      selection.raceEntryId === rightSelections[index]?.raceEntryId,
  );
}

function hasSameTicketSelectionIds(
  selections: RacingTicketSelection[],
  raceEntryIds: string[],
) {
  if (selections.length !== raceEntryIds.length) {
    return false;
  }

  return selections.every(
    (selection, index) => selection.raceEntryId === raceEntryIds[index],
  );
}

function buildSettledRaceLookup(
  currentRace: RacingTableViewState["race"],
  settledRaces: RacingSettledRaceSnapshot[],
) {
  const settledRaceById = new Map(
    settledRaces.map((race) => [race.raceId, race]),
  );
  const currentSettledRace = toSettledRaceSnapshot(currentRace);

  if (currentSettledRace) {
    settledRaceById.set(currentSettledRace.raceId, currentSettledRace);
  }

  return settledRaceById;
}

function toSettledRaceSnapshot(
  race: RacingTableViewState["race"],
): RacingSettledRaceSnapshot | null {
  if (
    !race ||
    race.entries.length === 0 ||
    race.entries.some(
      (entry) => entry.finalRank === null || entry.finishedAtMs === null,
    )
  ) {
    return null;
  }

  return {
    ...race,
    entries: race.entries.map((entry) => ({
      ...entry,
      finalRank: entry.finalRank ?? 0,
      finishedAtMs: entry.finishedAtMs ?? 0,
    })),
  };
}

function buildTicketHistoryItem(
  ticket: RacingTicketItem,
  settledRace: RacingSettledRaceSnapshot | null,
): RacingTicketHistoryItem {
  const resultOrder = settledRace ? buildTicketResultOrder(settledRace) : [];

  if (ticket.status === "rejected") {
    return {
      ...ticket,
      outcomeDetail: ticket.message ?? "발권 실패",
      outcomeStatus: "rejected",
      projectedReturn: null,
      resultOrder,
    };
  }

  if (ticket.status === "pending") {
    return {
      ...ticket,
      outcomeDetail: "발권 확인중",
      outcomeStatus: "issuing",
      projectedReturn: null,
      resultOrder,
    };
  }

  if (ticket.serverStatus) {
    return {
      ...ticket,
      ...getServerTicketOutcome(ticket),
      resultOrder,
    };
  }

  if (!settledRace) {
    return {
      ...ticket,
      outcomeDetail: "결과 대기중",
      outcomeStatus: "pending",
      projectedReturn: null,
      resultOrder,
    };
  }

  return {
    ...ticket,
    outcomeDetail: "서버 정산 대기중",
    outcomeStatus: "pending",
    projectedReturn: null,
    resultOrder,
  };
}

function getServerTicketOutcome(ticket: RacingTicketItem) {
  const selectionText =
    ticket.selections.map((selection) => `${selection.number}번`).join(" / ") ||
    "선택 없음";

  if (ticket.serverStatus === "WON") {
    return {
      outcomeDetail: `적중: ${selectionText}`,
      outcomeStatus: "won" as const,
      projectedReturn: ticket.payoutAmount ?? null,
    };
  }

  if (ticket.serverStatus === "LOST") {
    return {
      outcomeDetail: `미적중: ${selectionText}`,
      outcomeStatus: "lost" as const,
      projectedReturn: null,
    };
  }

  if (ticket.serverStatus === "CANCELLED") {
    return {
      outcomeDetail: "취소/환불 처리됨",
      outcomeStatus: "rejected" as const,
      projectedReturn: ticket.payoutAmount ?? null,
    };
  }

  return {
    outcomeDetail: "결과 대기중",
    outcomeStatus: "pending" as const,
    projectedReturn: null,
  };
}

function buildTicketResultOrder(
  settledRace: RacingSettledRaceSnapshot,
): RacingTicketResultEntry[] {
  return [...settledRace.entries]
    .sort((left, right) => left.finalRank - right.finalRank)
    .map((entry) => ({
      color: getHistoryHorseColor(entry.number),
      finalRank: entry.finalRank,
      number: entry.number,
      raceEntryId: entry.raceEntryId,
    }));
}

function getTicketRaceNo(
  raceId: string,
  currentRace: RacingTableViewState["race"],
  settledRaces: RacingSettledRaceSnapshot[],
) {
  if (currentRace?.raceId === raceId) {
    return currentRace.raceNo;
  }

  return settledRaces.find((race) => race.raceId === raceId)?.raceNo ?? null;
}

function getTicketTimestamp(ticket: RacingTicketItem) {
  const timestamp = new Date(ticket.createdAt).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getRacingTicketEventKey(event: RacingTableEventPayload) {
  return event.betId ?? getRacingTableEventKey(event);
}

function getRacingTableEventKey(event: RacingTableEventPayload) {
  return [
    event.type,
    event.actorUserId,
    event.raceId ?? "race",
    event.betId ?? "bet",
    event.createdAt,
    event.stateVersion,
    ...(event.raceEntryIds ?? []),
  ].join(":");
}

function getTicketHistoryClassName(status: RacingTicketOutcomeStatus) {
  if (status === "won") {
    return styles.ticketItemWon;
  }

  if (status === "lost") {
    return styles.ticketItemLost;
  }

  if (status === "rejected") {
    return styles.ticketItemRejected;
  }

  if (status === "pending") {
    return styles.ticketItemAwaiting;
  }

  return styles.ticketItemPending;
}

function getTicketHistoryStatusLabel(status: RacingTicketOutcomeStatus) {
  if (status === "won") {
    return "적중";
  }

  if (status === "lost") {
    return "미적중";
  }

  if (status === "rejected") {
    return "거절";
  }

  if (status === "pending") {
    return "대기중";
  }

  return "발권중";
}

function getTicketHistoryEmptyText(
  status: BetHistoryStatus,
  errorMessage: string | null,
) {
  if (status === "loading") {
    return "티켓 히스토리를 불러오는 중";
  }

  if (status === "error") {
    return errorMessage ?? "티켓 히스토리를 불러오지 못했습니다";
  }

  return "아직 티켓 히스토리가 없습니다";
}

function formatTicketTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  });
}

function getHistoryHorseColor(number: number): AssetHorse["color"] {
  const normalizedNumber = Math.max(1, Math.trunc(number));

  return (
    assetHorses[(normalizedNumber - 1) % assetHorses.length]?.color ?? "red"
  );
}

function buildHorseRecords(races: RacingSettledRaceSnapshot[]): HorseRecord[] {
  const recordsByNumber = new Map<
    number,
    HorseRecord & { rankTotal: number }
  >();

  for (const horse of baseHorseProfiles) {
    recordsByNumber.set(horse.number, {
      averageRank: null,
      color: horse.color,
      name: horse.name,
      number: horse.number,
      rankTotal: 0,
      recentRanks: [],
      starts: 0,
      top3: 0,
      wins: 0,
    });
  }

  for (const race of races) {
    for (const entry of race.entries) {
      const record = recordsByNumber.get(entry.number) ?? {
        averageRank: null,
        color: getHistoryHorseColor(entry.number),
        name: entry.name,
        number: entry.number,
        rankTotal: 0,
        recentRanks: [],
        starts: 0,
        top3: 0,
        wins: 0,
      };

      record.name = entry.name;
      record.starts += 1;
      record.rankTotal += entry.finalRank;

      if (entry.finalRank === 1) {
        record.wins += 1;
      }

      if (entry.finalRank <= 3) {
        record.top3 += 1;
      }

      if (record.recentRanks.length < 5) {
        record.recentRanks.push(entry.finalRank);
      }

      record.averageRank = record.rankTotal / record.starts;
      recordsByNumber.set(entry.number, record);
    }
  }

  return [...recordsByNumber.values()].sort(
    (left, right) => left.number - right.number,
  );
}

function parsePointAmountText(value: string | null | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value.trim())) {
    return null;
  }

  const amount = Number(value);

  return Number.isSafeInteger(amount) ? amount : null;
}

function parseNonNegativePointAmountText(value: string | null | undefined) {
  if (!value || !/^\d+$/.test(value.trim())) {
    return null;
  }

  const amount = Number(value);

  return Number.isSafeInteger(amount) ? amount : null;
}

function formatPointText(value: string | null | undefined) {
  const amount = parsePointAmountText(value);

  return amount === null ? "-" : formatPoints(amount);
}

function formatPoints(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatOddsMultiplier(betType: RacingBetType, fieldSize: number) {
  return `x${getEstimatedOddsMultiplier(betType, fieldSize).toFixed(1)}`;
}

function getEstimatedOddsMultiplier(betType: RacingBetType, fieldSize: number) {
  const safeFieldSize = Math.max(1, fieldSize);

  if (betType === "WIN") {
    return safeFieldSize * estimatedRacingPayoutRate;
  }

  if (betType === "PLACE") {
    return (
      (safeFieldSize / getPlaceRank(safeFieldSize)) * estimatedRacingPayoutRate
    );
  }

  if (betType === "QUINELLA") {
    return combination(safeFieldSize, 2) * estimatedRacingPayoutRate;
  }

  if (betType === "QUINELLA_PLACE") {
    return (
      (combination(safeFieldSize, 2) / combination(3, 2)) *
      estimatedRacingPayoutRate
    );
  }

  if (betType === "TRIO") {
    return combination(safeFieldSize, 3) * estimatedRacingPayoutRate;
  }

  if (betType === "TRIFECTA") {
    return permutation(safeFieldSize, 3) * estimatedRacingPayoutRate;
  }

  return safeFieldSize * (safeFieldSize - 1) * estimatedRacingPayoutRate;
}

function getSelectionSlotLabel(config: RacingBetTypeConfig, index: number) {
  if (!config.ordered) {
    return `선택 ${index + 1}`;
  }

  return `${index + 1}등`;
}

function getBettingPhaseLabel(tableState: RacingTableViewState | null) {
  if (!tableState?.race) {
    return "NO RACE";
  }

  if (tableState.phase === "BETTING") {
    return "OPEN";
  }

  if (tableState.phase === "LOCKING_BETS") {
    return "LOCKED";
  }

  return tableState.phase;
}

function createRacingCommandId(prefix: string) {
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `${prefix}:${Date.now()}:${randomPart}`;
}

function getPlaceRank(fieldSize: number) {
  return fieldSize <= 7 ? 2 : 3;
}

function combination(total: number, selected: number) {
  if (selected < 0 || selected > total) {
    return 0;
  }

  return permutation(total, selected) / factorial(selected);
}

function permutation(total: number, selected: number) {
  if (selected < 0 || selected > total) {
    return 0;
  }

  let result = 1;

  for (let offset = 0; offset < selected; offset += 1) {
    result *= total - offset;
  }

  return result;
}

function factorial(value: number) {
  let result = 1;

  for (let number = 2; number <= value; number += 1) {
    result *= number;
  }

  return result;
}

function collectRaceFinishMarks(input: {
  currentMarks: RaceFinishMark[];
  latestTick: DisplayRaceTickSnapshot | null;
  observedAtMs: number;
  race: NonNullable<RacingTableViewState["race"]>;
}) {
  const nextMarks = input.currentMarks.filter(
    (mark) => mark.raceId === input.race.raceId,
  );
  let changed = nextMarks.length !== input.currentMarks.length;
  const indexByEntryId = new Map(
    nextMarks.map((mark, index) => [mark.raceEntryId, index]),
  );
  const resultRankByEntryId = new Map(
    input.race.resultOrder.map((raceEntryId, index) => [
      raceEntryId,
      index + 1,
    ]),
  );

  const upsertFinishMark = (
    mark: RaceFinishMark,
    shouldReplaceTiming: boolean,
  ) => {
    const existingIndex = indexByEntryId.get(mark.raceEntryId);

    if (existingIndex === undefined) {
      indexByEntryId.set(mark.raceEntryId, nextMarks.length);
      nextMarks.push(mark);
      changed = true;
      return;
    }

    const existingMark = nextMarks[existingIndex];
    const nextMark = shouldReplaceTiming
      ? {
          ...existingMark,
          finishedAtMs: mark.finishedAtMs,
          rank: mark.rank,
        }
      : existingMark;

    if (
      nextMark.finishedAtMs !== existingMark.finishedAtMs ||
      nextMark.rank !== existingMark.rank
    ) {
      nextMarks[existingIndex] = nextMark;
      changed = true;
    }
  };

  if (input.latestTick?.raceId === input.race.raceId) {
    for (const position of input.latestTick.positions) {
      if (position.progress < 1) {
        continue;
      }

      upsertFinishMark(
        {
          finishedAtMs: Math.round(
            position.finishedAtMs ?? input.latestTick.elapsedMs,
          ),
          observedAtMs: input.observedAtMs,
          raceEntryId: position.raceEntryId,
          raceId: input.race.raceId,
          rank: position.rank,
        },
        false,
      );
    }
  }

  for (const entry of input.race.entries) {
    if (entry.finishedAtMs === null) {
      continue;
    }

    const rank =
      entry.finalRank ?? resultRankByEntryId.get(entry.raceEntryId) ?? null;

    if (rank === null) {
      continue;
    }

    upsertFinishMark(
      {
        finishedAtMs: entry.finishedAtMs,
        observedAtMs: input.observedAtMs,
        raceEntryId: entry.raceEntryId,
        raceId: input.race.raceId,
        rank,
      },
      true,
    );
  }

  if (!changed) {
    return input.currentMarks;
  }

  return nextMarks.sort(
    (left, right) =>
      left.finishedAtMs - right.finishedAtMs ||
      left.rank - right.rank ||
      left.raceEntryId.localeCompare(right.raceEntryId),
  );
}

function buildDisplayHorses(
  tableState: RacingTableViewState | null,
  latestTick: DisplayRaceTickSnapshot | null,
  nowMs: number,
  finishMarks: RaceFinishMark[],
): DisplayHorse[] {
  if (!tableState?.race?.entries.length) {
    return [];
  }

  const race = tableState.race;

  const positionByEntryId = new Map(
    latestTick?.raceId === race.raceId
      ? latestTick.positions.map((position) => [position.raceEntryId, position])
      : [],
  );
  const finishMarkByEntryId = new Map(
    finishMarks.map((mark) => [mark.raceEntryId, mark]),
  );
  const resultRankByEntryId = new Map(
    race.resultOrder.map((raceEntryId, index) => [raceEntryId, index + 1]),
  );
  const postFinishStartMs = getPostFinishStartMs(tableState);
  const isPostFinishPhase = tableState
    ? isRaceResultPhase(tableState.phase)
    : false;
  const postFinishProgress =
    isPostFinishPhase && postFinishStartMs !== null
      ? getPostFinishCoastProgress(postFinishStartMs, nowMs)
      : null;

  return race.entries.map((entry, index) => {
    const asset = assetHorses[index % assetHorses.length];
    const position = positionByEntryId.get(entry.raceEntryId);
    const finishMark = finishMarkByEntryId.get(entry.raceEntryId);
    const rank =
      finishMark?.rank ??
      position?.rank ??
      entry.finalRank ??
      resultRankByEntryId.get(entry.raceEntryId) ??
      null;
    const hasServerFinish = entry.finishedAtMs !== null;
    const clientPostFinishProgress = finishMark
      ? getPostFinishCoastProgress(finishMark.observedAtMs, nowMs)
      : null;
    const horsePostFinishProgress =
      clientPostFinishProgress ?? (hasServerFinish ? postFinishProgress : null);
    const progress = Math.max(
      position?.progress ?? (hasServerFinish || finishMark ? 1 : 0),
      horsePostFinishProgress ?? 0,
    );
    const isCoasting =
      horsePostFinishProgress !== null &&
      horsePostFinishProgress < maxVisualRaceProgress;
    const laneIndex = Math.max(0, entry.lane - 1);

    return {
      ...asset,
      isCoasting,
      lane: entry.lane,
      name: entry.name,
      number: entry.number,
      progress: clamp(progress, 0, maxVisualRaceProgress),
      raceEntryId: entry.raceEntryId,
      rank,
      startLaneTop:
        startLaneTops[laneIndex] ?? startLaneTops[startLaneTops.length - 1],
      startX: "10.5%",
    };
  });
}

function buildRaceResultBoard(
  tableState: RacingTableViewState | null,
  latestTick: DisplayRaceTickSnapshot | null,
  finishMarks: RaceFinishMark[],
): RaceResultBoard | null {
  const race = tableState?.race;

  if (!race?.entries.length) {
    return null;
  }

  const positionByEntryId = new Map(
    latestTick?.raceId === race.raceId
      ? latestTick.positions.map((position) => [position.raceEntryId, position])
      : [],
  );
  const finishMarkByEntryId = new Map(
    finishMarks.map((mark) => [mark.raceEntryId, mark]),
  );
  const resultRankByEntryId = new Map(
    race.resultOrder.map((raceEntryId, index) => [raceEntryId, index + 1]),
  );
  const entries = race.entries
    .map((entry, index) => {
      const position = positionByEntryId.get(entry.raceEntryId);
      const finishMark = finishMarkByEntryId.get(entry.raceEntryId);
      const asset = assetHorses[index % assetHorses.length];
      const hasTickFinish =
        position?.finishedAtMs !== null && position?.finishedAtMs !== undefined
          ? true
          : (position?.progress ?? 0) >= 1;
      const serverFinishedAtMs = entry.finishedAtMs ?? null;
      const tickRank = hasTickFinish ? (position?.rank ?? null) : null;
      const clientRank = finishMark?.rank ?? null;
      const serverRank =
        entry.finalRank ?? resultRankByEntryId.get(entry.raceEntryId) ?? null;

      return {
        color: asset.color,
        finishedAtMs: serverFinishedAtMs,
        name: entry.name,
        number: entry.number,
        raceEntryId: entry.raceEntryId,
        rank: serverRank ?? clientRank ?? tickRank,
      } satisfies RaceResultEntry;
    })
    .sort(
      (left, right) =>
        (left.rank ?? Number.MAX_SAFE_INTEGER) -
          (right.rank ?? Number.MAX_SAFE_INTEGER) ||
        (left.finishedAtMs ?? Number.MAX_SAFE_INTEGER) -
          (right.finishedAtMs ?? Number.MAX_SAFE_INTEGER) ||
        left.number - right.number,
    );
  const hasAnyResult = entries.some(
    (entry) => entry.rank !== null || entry.finishedAtMs !== null,
  );

  if (!hasAnyResult) {
    return null;
  }

  return {
    entries,
    isComplete: entries.every((entry) => entry.finishedAtMs !== null),
    raceId: race.raceId,
    raceNo: race.raceNo,
  };
}

function chooseVisibleResultBoard(
  currentResultBoard: RaceResultBoard | null,
  persistedResultBoard: RaceResultBoard | null,
) {
  return currentResultBoard ?? persistedResultBoard;
}

function choosePersistedResultBoard(
  current: RaceResultBoard | null,
  next: RaceResultBoard | null,
) {
  if (!next) {
    return current;
  }

  return next;
}

function getRaceProgressPercent(progress: number) {
  return clamp(progress, 0, 1) * 100;
}

function getPostFinishStartMs(tableState: RacingTableViewState) {
  const targetTime =
    tableState.race?.finishedAt ??
    tableState.race?.settledAt ??
    tableState.updatedAt;

  if (!targetTime) {
    return null;
  }

  const startMs = Date.parse(targetTime);

  return Number.isFinite(startMs) ? startMs : null;
}

function getPostFinishCoastProgress(startedAtMs: number, nowMs: number) {
  const ratio = clamp((nowMs - startedAtMs) / postFinishCoastDurationMs, 0, 1);
  const easedRatio = 1 - Math.pow(1 - ratio, 3);

  return 1 + postFinishTrackOvershootRatio * easedRatio;
}

function getProgressHorseStyle(progress: number, index: number) {
  const rowOffsetPx = (index - 2.5) * 9;

  return {
    "--horse-progress": `${getRaceProgressPercent(progress).toFixed(2)}%`,
    "--horse-row-y": `${rowOffsetPx}px`,
  } as CSSProperties;
}

function getRunnerLaneClassName(lane: number) {
  if (lane === 1) {
    return styles.runnerLane1;
  }

  if (lane === 2) {
    return styles.runnerLane2;
  }

  if (lane === 3) {
    return styles.runnerLane3;
  }

  if (lane === 4) {
    return styles.runnerLane4;
  }

  if (lane === 5) {
    return styles.runnerLane5;
  }

  if (lane === 6) {
    return styles.runnerLane6;
  }

  if (lane === 7) {
    return styles.runnerLane7;
  }

  return styles.runnerLane8;
}

function getLeaderHorse(horses: DisplayHorse[]) {
  return [...horses].sort(
    (left, right) =>
      right.progress - left.progress ||
      (left.rank ?? Number.MAX_SAFE_INTEGER) -
        (right.rank ?? Number.MAX_SAFE_INTEGER) ||
      left.number - right.number,
  )[0];
}

function getRunnerLeftPercent(progress: number) {
  return (
    trackStartPercent +
    clamp(progress, 0, maxVisualRaceProgress) *
      (trackFinishPercent - trackStartPercent)
  );
}

function getRunnerLeftStyle(progress: number) {
  const progressValue = clamp(progress, 0, maxVisualRaceProgress);
  const leftPercent = getRunnerLeftPercent(progressValue);
  const noseOffsetPx = runnerFinishNoseOffsetPx * progressValue;

  return `calc(${leftPercent}% - ${noseOffsetPx}px)`;
}

function getRunnerPositionStyle(progress: number, trackWidthPx: number) {
  const progressValue = clamp(progress, 0, maxVisualRaceProgress);

  if (trackWidthPx <= 0) {
    return {
      left: getRunnerLeftStyle(progressValue),
      x: "0px",
    };
  }

  const leftPercent = getRunnerLeftPercent(progressValue);
  const worldWidthPx = trackWidthPx * worldScale;
  const noseOffsetPx = runnerFinishNoseOffsetPx * progressValue;
  const xPx = worldWidthPx * (leftPercent / 100) - noseOffsetPx;

  return {
    left: "0px",
    x: `${xPx.toFixed(2)}px`,
  };
}

function getCameraTranslatePercent(leaderProgress: number) {
  const leaderTrackPercent = getRunnerLeftPercent(leaderProgress);

  return clamp(
    leaderTrackPercent - leaderViewportAnchorPercent,
    0,
    maxCameraTranslatePercent,
  );
}

function getStatusLabel(
  connectionStatus: ConnectionStatus,
  tableState: RacingTableViewState | null,
  isVisuallyRunning: boolean,
) {
  if (isVisuallyRunning) {
    return "RUNNING";
  }

  if (tableState?.phase) {
    return tableState.phase;
  }

  return connectionStatus.toUpperCase();
}

function getStatusDetail(
  tableState: RacingTableViewState | null,
  latestTick: RacingRaceTickSnapshot | null,
  isVisuallyRunning: boolean,
  prestartTick: PrestartTickView | null,
  nowMs: number,
) {
  if (!tableState?.race) {
    return "Waiting for race";
  }

  if (latestTick?.raceId === tableState.race.raceId) {
    return `${formatLiveElapsedMs(latestTick.elapsedMs)}s live`;
  }

  if (isVisuallyRunning) {
    const remainingMs = getPrestartRemainingMs(prestartTick, nowMs);

    return remainingMs !== null && remainingMs > 0
      ? "Server countdown"
      : "Starting";
  }

  return `Race ${tableState.race.raceNo}`;
}

function formatLiveElapsedMs(elapsedMs: number) {
  return (Math.floor(elapsedMs / 100) / 10).toFixed(1);
}

function getTimerText(
  tableState: RacingTableViewState | null,
  nowMs = Date.now(),
  prestartTick: PrestartTickView | null = null,
) {
  if (!tableState?.race) {
    return "00:03";
  }

  if (tableState.phase === "RUNNING") {
    return "LIVE";
  }

  if (isRaceResultPhase(tableState.phase)) {
    return "RESULT";
  }

  const targetTime = getTimerTargetTime(tableState);

  if (!targetTime) {
    return `R${tableState.race.raceNo}`;
  }

  const remainingMs =
    getCountdownRemainingMs(tableState, nowMs, prestartTick) ??
    Date.parse(targetTime) - nowMs;

  if (isRaceStartCountdownPhase(tableState) && remainingMs <= 0) {
    return "START";
  }

  if (!isRaceStartCountdownPhase(tableState) && remainingMs <= 0) {
    return `R${tableState.race.raceNo}`;
  }

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutesText = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secondsText = (seconds % 60).toString().padStart(2, "0");

  return `${minutesText}:${secondsText}`;
}

function getTimerLabel(tableState: RacingTableViewState | null) {
  if (!tableState?.race) {
    return "Ready";
  }

  if (tableState.phase === "BETTING") {
    return hasSeparateRaceStartDelay(tableState) ? "Bet closes" : "Race starts";
  }

  if (tableState.phase === "LOCKING_BETS") {
    return "Race starts";
  }

  if (tableState.phase === "RUNNING") {
    return "Track";
  }

  if (isRaceResultPhase(tableState.phase)) {
    return "Result";
  }

  return "Next race";
}

function getTimerTargetTime(tableState: RacingTableViewState) {
  if (tableState.phase === "BETTING") {
    return hasSeparateRaceStartDelay(tableState)
      ? (tableState.timers.bettingClosesAt ??
          tableState.timers.scheduledStartAt)
      : getRaceStartTargetTime(tableState);
  }

  if (tableState.phase === "LOCKING_BETS") {
    return getRaceStartTargetTime(tableState);
  }

  return (
    tableState.timers.scheduledStartAt ?? tableState.timers.bettingClosesAt
  );
}

function getStartCountdownOverlay(
  tableState: RacingTableViewState | null,
  nowMs: number,
  prestartTick: PrestartTickView | null = null,
): StartCountdownOverlay | null {
  if (!tableState?.race || !isRaceStartCountdownPhase(tableState)) {
    return null;
  }

  const targetTime = getRaceStartTargetTime(tableState);

  if (!targetTime) {
    return null;
  }

  const remainingMs =
    getCountdownRemainingMs(tableState, nowMs, prestartTick) ??
    Date.parse(targetTime) - nowMs;

  if (
    remainingMs > startCountdownWindowMs ||
    remainingMs < -startCountdownHoldMs
  ) {
    return null;
  }

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  if (seconds === 0) {
    return {
      isStartCue: true,
      label: "Race start",
      value: "START",
    };
  }

  return {
    isStartCue: false,
    label: "Race starts in",
    value: seconds.toString(),
  };
}

function shouldPlayRaceBgm(
  tableState: RacingTableViewState | null,
  nowMs: number,
  isVisuallyRunning: boolean,
) {
  if (!tableState?.race || isRaceResultPhase(tableState.phase)) {
    return false;
  }

  if (isVisuallyRunning) {
    return true;
  }

  if (tableState.phase !== "BETTING" && tableState.phase !== "LOCKING_BETS") {
    return false;
  }

  const startMs = getRaceStartTargetMs(tableState);

  if (startMs === null) {
    return false;
  }

  const remainingMs = startMs - nowMs;

  return remainingMs <= raceBgmLeadMs && remainingMs >= 0;
}

function getRaceStartTargetTime(tableState: RacingTableViewState) {
  return (
    tableState.timers.scheduledStartAt ??
    tableState.race?.scheduledStartAt ??
    tableState.timers.bettingClosesAt
  );
}

function getRaceStartTargetMs(tableState: RacingTableViewState) {
  const targetTime = getRaceStartTargetTime(tableState);

  if (!targetTime) {
    return null;
  }

  const startMs = Date.parse(targetTime);

  return Number.isFinite(startMs) ? startMs : null;
}

function getActivePrestartTick(
  prestartTick: PrestartTickView | null,
  tableState: RacingTableViewState | null,
  nowMs: number,
) {
  if (
    !prestartTick ||
    !tableState?.race ||
    !isRaceStartCountdownPhase(tableState)
  ) {
    return null;
  }

  if (prestartTick.raceId !== tableState.race.raceId) {
    return null;
  }

  const remainingMs = getPrestartRemainingMs(prestartTick, nowMs);

  if (remainingMs === null || remainingMs < -startCountdownHoldMs) {
    return null;
  }

  if (
    nowMs - prestartTick.receivedAtMs > prestartTickFreshMs &&
    remainingMs > 0
  ) {
    return null;
  }

  return prestartTick;
}

function getCountdownRemainingMs(
  tableState: RacingTableViewState,
  nowMs: number,
  prestartTick: PrestartTickView | null,
) {
  if (
    !prestartTick ||
    !tableState.race ||
    prestartTick.raceId !== tableState.race.raceId ||
    !isRaceStartCountdownPhase(tableState)
  ) {
    return null;
  }

  return getPrestartRemainingMs(prestartTick, nowMs);
}

function getPrestartRemainingMs(
  prestartTick: PrestartTickView | null,
  nowMs: number,
) {
  if (!prestartTick) {
    return null;
  }

  const elapsedSinceReceiptMs = Math.max(0, nowMs - prestartTick.receivedAtMs);

  return prestartTick.remainingMs - elapsedSinceReceiptMs;
}

function getScheduledRaceStartMs(tableState: RacingTableViewState) {
  const targetTime =
    tableState.timers.scheduledStartAt ?? tableState.race?.scheduledStartAt;

  if (!targetTime) {
    return null;
  }

  const startMs = Date.parse(targetTime);

  return Number.isFinite(startMs) ? startMs : null;
}

function isRaceVisuallyRunning(
  tableState: RacingTableViewState | null,
  nowMs: number,
  prestartTick: PrestartTickView | null = null,
) {
  if (!tableState?.race) {
    return false;
  }

  if (tableState.phase === "RUNNING") {
    return true;
  }

  if (tableState.phase !== "BETTING" && tableState.phase !== "LOCKING_BETS") {
    return false;
  }

  const prestartRemainingMs = getCountdownRemainingMs(
    tableState,
    nowMs,
    prestartTick,
  );

  if (prestartRemainingMs !== null && prestartRemainingMs <= 0) {
    return true;
  }

  const scheduledStartMs = getScheduledRaceStartMs(tableState);

  return scheduledStartMs !== null && nowMs >= scheduledStartMs;
}

function isRaceStartCountdownPhase(tableState: RacingTableViewState) {
  return (
    tableState.phase === "LOCKING_BETS" ||
    (tableState.phase === "BETTING" && !hasSeparateRaceStartDelay(tableState))
  );
}

function isRaceResultPhase(phase: RacingTableViewState["phase"]) {
  return (
    phase === "FINISHING" ||
    phase === "SETTLING" ||
    phase === "SETTLED" ||
    phase === "ROUND_END"
  );
}

function hasSeparateRaceStartDelay(tableState: RacingTableViewState) {
  if (tableState.timing.bettingCloseBeforeStartSeconds > 0) {
    return true;
  }

  const bettingClosesAt =
    tableState.timers.bettingClosesAt ?? tableState.race?.bettingClosesAt;
  const scheduledStartAt =
    tableState.timers.scheduledStartAt ?? tableState.race?.scheduledStartAt;

  if (!bettingClosesAt || !scheduledStartAt) {
    return false;
  }

  return Date.parse(scheduledStartAt) - Date.parse(bettingClosesAt) > 1_000;
}

function formatRank(rank: number | null) {
  if (rank === null) {
    return "-";
  }

  if (rank === 1) {
    return "1st";
  }

  if (rank === 2) {
    return "2nd";
  }

  if (rank === 3) {
    return "3rd";
  }

  return `${rank}th`;
}

function formatKoreanRank(rank: number | null) {
  if (rank === null) {
    return "-";
  }

  return `${rank}등`;
}

function getHorseRecordRankClassName(rank: number) {
  if (rank === 1) {
    return `${styles.horseRecordRank} ${styles.horseRecordGold}`;
  }

  if (rank === 2) {
    return `${styles.horseRecordRank} ${styles.horseRecordSilver}`;
  }

  if (rank === 3) {
    return `${styles.horseRecordRank} ${styles.horseRecordBronze}`;
  }

  return styles.horseRecordRank;
}

function formatFinishTime(finishedAtMs: number | null) {
  if (finishedAtMs === null) {
    return "--.--s";
  }

  return `${(finishedAtMs / 1000).toFixed(2)}s`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
