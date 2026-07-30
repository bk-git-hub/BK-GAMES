"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Coins,
  Gauge,
  History,
  PlugZap,
  RefreshCw,
  Sparkles,
  Timer,
  WalletCards,
} from "lucide-react";
import {
  type BaccaratBetType,
  type BaccaratBigRoadCell,
  type BaccaratCardSuit,
  type BaccaratCardView,
  type BaccaratHandSnapshot,
  type BaccaratBetOutcome,
  type BaccaratRevealSlot,
  type BaccaratRoadmapSnapshot,
  type BaccaratRoundOutcome,
  type BaccaratRoundResultView,
  type BaccaratRoundSettledPlayerResult,
  type BaccaratTableState,
  type BaccaratVisibleCardView,
  type BaccaratWalletUpdatedPayload,
} from "@bk-games/shared/src/socket-events";

import {
  type BaccaratConnectionStatus,
  type BaccaratTimelineEntry,
  useBaccaratTable,
} from "./use-baccarat-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BaccaratTableClientProps = {
  initialWalletBalance: string;
  userEmail: string;
  userName: string;
};

type BetChoice = {
  accentClass: string;
  betType: BaccaratBetType;
  label: string;
  odds: string;
  totalKey: "player" | "banker" | "tie";
};

type PendingBet = {
  amount: string;
  betType: BaccaratBetType;
  commandId: string;
  roundId: string | null;
};

type SelectedBet = {
  betType: BaccaratBetType;
  roundId: string | null;
};

type PersonalResultTone = "cancelled" | "lost" | "neutral" | "pending" | "push" | "won";

type PersonalResultView = {
  amountLabel: string;
  detail: string;
  kicker: string;
  title: string;
  tone: PersonalResultTone;
};

const betChoices: BetChoice[] = [
  {
    accentClass: "border-[#8fc4e8]/70 bg-[#0b3b73] text-[#eef7ff]",
    betType: "PLAYER",
    label: "Player",
    odds: "1:1",
    totalKey: "player",
  },
  {
    accentClass: "border-[#ff9aa0]/70 bg-[#7d161b] text-[#fff3f1]",
    betType: "BANKER",
    label: "Banker",
    odds: "0.95:1",
    totalKey: "banker",
  },
  {
    accentClass: "border-[#f5c95f]/75 bg-[#805f12] text-[#fff8d6]",
    betType: "TIE",
    label: "Tie",
    odds: "8:1",
    totalKey: "tie",
  },
];

const quickBetAmounts = ["100", "500", "1000", "5000"] as const;
const beadRows = 6;
const bigRoadRows = 6;
const redSuitTheme = {
  borderClass: "border-[#ff9aa0]/55",
  fillClass: "text-[#c8272e]",
  textClass: "text-[#c8272e]",
} as const;
const darkSuitTheme = {
  borderClass: "border-[#8fc4e8]/55",
  fillClass: "text-[#071c3f]",
  textClass: "text-[#071c3f]",
} as const;

export function BaccaratTableClient({
  initialWalletBalance,
  userEmail,
  userName,
}: BaccaratTableClientProps) {
  const table = useBaccaratTable({ initialWalletBalance });
  const [betAmount, setBetAmount] = useState("100");
  const [pendingBet, setPendingBet] = useState<PendingBet | null>(null);
  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);
  const [flippingSlots, setFlippingSlots] = useState<
    ReadonlySet<BaccaratRevealSlot>
  >(() => new Set());
  const revealedSlotStateRef = useRef<Map<BaccaratRevealSlot, boolean>>(
    new Map(),
  );
  const flipAddTimeoutsRef = useRef<Set<number>>(new Set());
  const flipTimeoutsRef = useRef<Map<BaccaratRevealSlot, number>>(new Map());
  const state = table.tableState;
  const myBet = table.myBet;
  const currentRoundId = state?.round?.roundId ?? null;
  const activeReveal = getActiveReveal(state);
  const revealProgress = useRevealProgress(activeReveal);
  const isBettingOpen =
    table.connectionStatus === "connected" &&
    state?.status === "OPEN" &&
    state?.phase === "WAITING_BETS" &&
    state.betting.canPlaceBet &&
    !myBet;
  const activePendingBet = getActivePendingBet(pendingBet, {
    acceptedCommandId: table.lastBetAccepted?.commandId ?? null,
    connectionStatus: table.connectionStatus,
    currentRoundId,
    hasMyBet: Boolean(myBet),
    rejectedCommandId: table.lastBetRejected?.commandId ?? null,
  });
  const isBetSubmitting = Boolean(activePendingBet);
  const selectedBetType =
    selectedBet?.roundId === currentRoundId && isBettingOpen
      ? selectedBet.betType
      : null;
  const canSelectBet = isBettingOpen && !isBetSubmitting;
  const canConfirmBet =
    canSelectBet && Boolean(selectedBetType) && isPositivePointAmount(betAmount);

  const latestResult = useMemo(
    () => state?.recentRounds[0] ?? null,
    [state?.recentRounds],
  );

  useEffect(() => {
    const flipAddTimeouts = flipAddTimeoutsRef.current;
    const flipTimeouts = flipTimeoutsRef.current;

    return () => {
      for (const timeoutId of flipAddTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }

      for (const timeoutId of flipTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }

      flipAddTimeouts.clear();
      flipTimeouts.clear();
    };
  }, []);

  useEffect(() => {
    if (!state) {
      revealedSlotStateRef.current = new Map();
      return;
    }

    const nextVisibility = new Map<BaccaratRevealSlot, boolean>();
    const newlyVisibleSlots: BaccaratRevealSlot[] = [];
    const previousVisibility = revealedSlotStateRef.current;
    const cards = [...state.player.cards, ...state.banker.cards];

    for (const card of cards) {
      const isVisible = card.hidden !== true;
      const wasVisible = previousVisibility.get(card.slot);

      nextVisibility.set(card.slot, isVisible);

      if (wasVisible === false && isVisible) {
        newlyVisibleSlots.push(card.slot);
      }
    }

    revealedSlotStateRef.current = nextVisibility;

    if (!newlyVisibleSlots.length) {
      return;
    }

    const addTimeoutId = window.setTimeout(() => {
      flipAddTimeoutsRef.current.delete(addTimeoutId);
      setFlippingSlots((currentSlots) => {
        const nextSlots = new Set(currentSlots);

        for (const slot of newlyVisibleSlots) {
          nextSlots.add(slot);
        }

        return nextSlots;
      });
    }, 0);

    flipAddTimeoutsRef.current.add(addTimeoutId);

    for (const slot of newlyVisibleSlots) {
      const existingTimeout = flipTimeoutsRef.current.get(slot);

      if (existingTimeout !== undefined) {
        window.clearTimeout(existingTimeout);
      }

      const timeoutId = window.setTimeout(() => {
        flipTimeoutsRef.current.delete(slot);
        setFlippingSlots((currentSlots) => {
          if (!currentSlots.has(slot)) {
            return currentSlots;
          }

          const nextSlots = new Set(currentSlots);
          nextSlots.delete(slot);
          return nextSlots;
        });
      }, 850);

      flipTimeoutsRef.current.set(slot, timeoutId);
    }
  }, [state]);

  function addChip(amount: string) {
    setBetAmount((currentAmount) => addPointStrings(currentAmount, amount));
  }

  function confirmBet() {
    if (!canConfirmBet || !selectedBetType) {
      return;
    }

    const amount = betAmount.trim();
    const commandId = table.placeBet(selectedBetType, amount);

    if (!commandId) {
      return;
    }

    setPendingBet({
      amount,
      betType: selectedBetType,
      commandId,
      roundId: currentRoundId,
    });
  }

  function selectBet(betType: BaccaratBetType) {
    if (!canSelectBet) {
      return;
    }

    setSelectedBet({
      betType,
      roundId: currentRoundId,
    });
  }

  return (
    <main className="min-h-screen bg-[#f7efe2] text-white">
      <FlipRevealStyles />
      <section className="mx-auto flex min-h-screen w-full max-w-[1540px] flex-col gap-3 px-3 py-3 sm:px-4 lg:px-5">
        <BaccaratHeader
          balance={table.walletBalance}
          connectionStatus={table.connectionStatus}
          message={table.statusMessage}
          update={table.lastWalletUpdate}
          userEmail={userEmail}
          userName={userName}
        />

        {table.socketError ? (
          <div
            className="rounded-lg border border-red-300/35 bg-red-500/[0.14] px-4 py-3 text-sm text-red-50"
            role="alert"
          >
            <span className="font-semibold">{table.socketError.code}</span>:{" "}
            {table.socketError.message}
          </div>
        ) : null}

        <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <section className="relative min-h-[620px] overflow-hidden rounded-[1.25rem] border-[2px] border-[#111827] bg-[#071c3f] shadow-[10px_12px_0_#0b3b73] lg:min-h-[calc(100svh-8.6rem)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_46%_18%,rgba(245,201,95,0.2),transparent_30%),radial-gradient(circle_at_16%_78%,rgba(143,196,232,0.16),transparent_32%),radial-gradient(circle_at_84%_76%,rgba(200,39,46,0.18),transparent_32%)]" />
              <div className="absolute inset-x-[4%] bottom-[5%] top-[16%] rounded-[45%] border-[18px] border-[#111827] bg-[#0b3b73] shadow-[inset_0_0_90px_rgba(7,28,63,0.72),0_35px_90px_rgba(7,28,63,0.38)] sm:border-[24px]" />
              <div className="absolute inset-x-[10%] bottom-[12%] top-[24%] rounded-[45%] border border-[#d8ecff]/25 bg-[radial-gradient(circle_at_50%_38%,rgba(216,236,255,0.08),transparent_45%)]" />

              <div className="relative z-10 flex flex-col gap-3 p-3 sm:p-4">
                <TableStatusStrip
                  latestResult={latestResult}
                  onJoin={table.joinTable}
                  onReconnect={table.reconnect}
                  state={state}
                />

                <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.46fr)_minmax(0,1fr)] lg:items-start">
                  <div className="min-w-0">
                    <HandPanel
                      activeReveal={activeReveal}
                      flippingSlots={flippingSlots}
                      hand={state?.player ?? null}
                      label="Player"
                      revealProgress={revealProgress}
                      tone="player"
                    />
                  </div>
                  <div className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1">
                    <RevealPanel
                      activeReveal={activeReveal}
                      revealProgress={revealProgress}
                      state={state}
                    />
                  </div>
                  <div className="min-w-0">
                    <HandPanel
                      activeReveal={activeReveal}
                      flippingSlots={flippingSlots}
                      hand={state?.banker ?? null}
                      label="Banker"
                      revealProgress={revealProgress}
                      tone="banker"
                    />
                  </div>
                </div>

                <div className="mt-auto grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <BettingPanel
                    amount={betAmount}
                    canConfirmBet={canConfirmBet}
                    canSelectBet={canSelectBet}
                    isBetSubmitting={isBetSubmitting}
                    myBet={myBet}
                    onAddChip={addChip}
                    onAmountChange={setBetAmount}
                    onClear={() => setBetAmount("")}
                    onConfirmBet={confirmBet}
                    onSelectBet={selectBet}
                    pendingBet={activePendingBet}
                    selectedBetType={selectedBetType}
                    state={state}
                  />
                  <MyRoundPanel
                    lastSettlement={table.lastRoundSettled}
                    myBet={myBet}
                    playerId={table.player?.id ?? null}
                    state={state}
                    walletBalance={table.walletBalance}
                  />
                </div>
              </div>
            </section>
          </div>

          <aside className="grid min-w-0 gap-3 xl:grid-rows-[auto_auto_minmax(0,1fr)]">
            <RoadmapPanel roadmaps={state?.roadmaps ?? null} />
            <RecentRoundsPanel rounds={state?.recentRounds ?? []} />
            <TimelinePanel timeline={table.timeline} />
          </aside>
        </div>
      </section>
    </main>
  );
}

function FlipRevealStyles() {
  return (
    <style>{`
      @keyframes baccarat-card-flip {
        0% {
          transform: rotateY(88deg) scale(0.94);
          filter: brightness(0.88);
        }
        48% {
          transform: rotateY(-14deg) scale(1.04);
          filter: brightness(1.08);
        }
        72% {
          transform: rotateY(7deg) scale(1.02);
        }
        100% {
          transform: rotateY(0deg) scale(1);
          filter: brightness(1);
        }
      }
    `}</style>
  );
}

function BaccaratHeader({
  balance,
  connectionStatus,
  message,
  update,
  userEmail,
  userName,
}: {
  balance: string;
  connectionStatus: BaccaratConnectionStatus;
  message: string | null;
  update: BaccaratWalletUpdatedPayload | null;
  userEmail: string;
  userName: string;
}) {
  return (
    <header className="grid gap-3 rounded-[1rem] border-[2px] border-[#111827] bg-[#fff8ed]/95 px-3 py-2.5 text-[#111827] shadow-[6px_7px_0_#0b3b73] backdrop-blur md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/lobby"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#071c3f] bg-[#0b3b73] text-white transition hover:bg-[#c8272e]"
          aria-label="Back to lobby"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold sm:text-xl">
              BK Games Baccarat
            </h1>
            <StatusBadge status={connectionStatus} />
          </div>
          <p className="truncate text-sm text-[#4b5874]">
            {userName} · {userEmail}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 md:min-w-[390px]">
        <HeaderMetric
          icon={<Coins className="size-3.5" />}
          label="Wallet"
          value={`${formatPoints(balance)} pts`}
          detail={update ? `${update.reason} ${formatSignedPoints(update.delta)}` : ""}
        />
        <HeaderMetric
          icon={<PlugZap className="size-3.5" />}
          label="Connection"
          value={message ?? connectionStatus.replaceAll("-", " ")}
          detail=""
        />
      </div>
    </header>
  );
}

function HeaderMetric({
  detail,
  icon,
  label,
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#d8c09a] bg-[#fffaf0] px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-bold text-[#4b5874]">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="truncate text-base font-black text-[#111827]">{value}</p>
        <p className="truncate text-xs font-bold text-[#c8272e]">{detail}</p>
      </div>
    </div>
  );
}

function TableStatusStrip({
  latestResult,
  onJoin,
  onReconnect,
  state,
}: {
  latestResult: BaccaratRoundResultView | null;
  onJoin: () => void;
  onReconnect: () => void;
  state: BaccaratTableState | null;
}) {
  const countdown = useCountdown(getPrimaryTimer(state));

  return (
    <div className="grid gap-2 rounded-lg border border-[#d8ecff]/20 bg-[#071c3f]/92 p-3 backdrop-blur sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <MiniBadge>{state?.status ?? "NO_STATE"}</MiniBadge>
          <MiniBadge>{formatPhaseLabel(state?.phase)}</MiniBadge>
          <MiniBadge>
            <Timer className="size-3" />
            {countdown ?? "No timer"}
          </MiniBadge>
          <MiniBadge>{state ? `${state.viewerCount} viewers` : "Syncing"}</MiniBadge>
        </div>
        {!state ? (
          <p className="mt-2 truncate text-sm text-white/65">
            Waiting for an authenticated Baccarat table snapshot.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {latestResult ? (
          <div className="rounded-lg border border-[#d8ecff]/20 bg-[#0b3b73]/90 px-3 py-2 text-sm">
            <span className={outcomeTextClass(latestResult.outcome)}>
              {formatOutcome(latestResult.outcome)}
            </span>
            <span className="text-white/65">
              {" "}
              {latestResult.playerTotal}-{latestResult.bankerTotal}
            </span>
          </div>
        ) : null}
        <Button
          className="border-[#d8ecff]/20 bg-[#0b3b73] text-white hover:bg-[#c8272e]"
          onClick={onJoin}
          size="sm"
          variant="outline"
        >
          <CheckCircle2 className="size-4" />
          Join
        </Button>
        <Button
          className="border-[#d8ecff]/20 bg-[#0b3b73] text-white hover:bg-[#c8272e]"
          onClick={onReconnect}
          size="sm"
          variant="outline"
        >
          <RefreshCw className="size-4" />
          Sync
        </Button>
      </div>
    </div>
  );
}

function HandPanel({
  activeReveal,
  flippingSlots,
  hand,
  label,
  revealProgress,
  tone,
}: {
  activeReveal: ReturnType<typeof getActiveReveal>;
  flippingSlots: ReadonlySet<BaccaratRevealSlot>;
  hand: BaccaratHandSnapshot | null;
  label: string;
  revealProgress: number;
  tone: "player" | "banker";
}) {
  const cards = hand?.cards ?? [];
  const score = formatHandScore(hand);

  return (
    <section
      className={cn(
        "h-full min-w-0 rounded-[1rem] border p-2.5 shadow-xl shadow-black/25 sm:p-3",
        tone === "player"
          ? "border-[#8fc4e8]/65 bg-[#082b55]/92"
          : "border-[#ff9aa0]/65 bg-[#67191f]/92",
      )}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold sm:text-2xl">{label}</h2>
          {hand?.isNatural ? (
            <p className="text-xs text-white/65 sm:text-sm">Natural</p>
          ) : null}
        </div>
        <div
          className={cn(
            "shrink-0 rounded-lg border px-2 py-1.5 text-center sm:px-3 sm:py-2",
            tone === "player"
              ? "border-[#d8ecff]/45 bg-[#0b3b73] text-[#eef7ff]"
              : "border-[#ffb8bd]/45 bg-[#7d161b] text-[#fff3f1]",
          )}
        >
          <p className="text-xs text-white/65">Score</p>
          <p className="text-base font-semibold sm:text-lg">{score}</p>
        </div>
      </div>

      <div className="mt-3 flex min-h-[120px] flex-wrap items-center justify-center gap-2 sm:mt-5 sm:min-h-[148px] sm:gap-3 md:min-h-[164px]">
        {cards.length ? (
          cards.map((card, index) => (
            <BaccaratCard
              activeReveal={activeReveal}
              card={card}
              flippingSlots={flippingSlots}
              index={index}
              key={`${card.slot}:${index}`}
              revealProgress={revealProgress}
            />
          ))
        ) : (
          <EmptyCardRow />
        )}
      </div>
    </section>
  );
}

function BaccaratCard({
  activeReveal,
  card,
  flippingSlots,
  index,
  revealProgress,
}: {
  activeReveal: ReturnType<typeof getActiveReveal>;
  card: BaccaratCardView;
  flippingSlots: ReadonlySet<BaccaratRevealSlot>;
  index: number;
  revealProgress: number;
}) {
  const rotationClass = index % 2 === 0 ? "rotate-[-2deg]" : "rotate-[2deg]";

  if (card.hidden === true) {
    const isActiveRevealCard =
      activeReveal?.slot === card.slot && activeReveal.status === "ACTIVE";

    return (
      <BaccaratCardBack
        isActive={isActiveRevealCard}
        progress={isActiveRevealCard ? revealProgress : 0}
        rotationClass={rotationClass}
        slot={card.slot}
      />
    );
  }

  const isFlipping = flippingSlots.has(card.slot);

  return (
    <div
      className={cn("relative shrink-0 [perspective:720px]", rotationClass)}
      data-card-slot={card.slot}
      data-reveal-state={isFlipping ? "flipping" : "visible"}
    >
      <div
        className={cn(
          "origin-center [transform-style:preserve-3d]",
          isFlipping
            ? "will-change-transform motion-safe:animate-[baccarat-card-flip_760ms_ease-out_both]"
            : "",
        )}
      >
        <BaccaratCardFace card={card} />
      </div>
    </div>
  );
}

function BaccaratCardFace({ card }: { card: BaccaratVisibleCardView }) {
  const suitTheme = getSuitTheme(card.suit);

  return (
    <div
      aria-label={`${card.rank} of ${card.suit}`}
      className={cn(
        "relative isolate aspect-[5/7] w-[56px] shrink-0 overflow-hidden rounded-lg border border-[#fff8d6] bg-[#fffaf0] text-[#111827] shadow-xl shadow-black/35 transition sm:w-[74px] md:w-[88px]",
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.95),transparent_32%),linear-gradient(145deg,#fffaf0,#f7efe2_58%,#f5c95f_135%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-[5%] rounded-md border border-[#111827]/18"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-[18%] top-[17%] h-px bg-[#111827]/12"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-[18%] bottom-[17%] h-px bg-[#111827]/12"
      />

      <CardCorner card={card} placement="top" />
      <CardCorner card={card} placement="bottom" />

      <div className="absolute inset-x-[8%] bottom-[22%] top-[24%] grid place-items-center">
        <p
          className={cn(
            "leading-none font-black tracking-normal drop-shadow-[0_2px_0_rgba(255,255,255,0.72)]",
            card.rank === "10"
              ? "text-[1.9rem] sm:text-[2.45rem] md:text-[2.8rem]"
              : "text-[2.45rem] sm:text-[3.25rem] md:text-[3.8rem]",
            suitTheme.textClass,
          )}
        >
          {card.rank}
        </p>
      </div>

      <div
        aria-hidden="true"
        className="absolute inset-x-[31%] bottom-[8%] grid h-[11%] place-items-center rounded-full border border-[#d8c09a] bg-[#fff8ed] text-[0.48rem] font-black tracking-normal text-[#0b3b73] shadow-sm sm:text-[0.58rem]"
      >
        BK
      </div>
    </div>
  );
}

function CardCorner({
  card,
  placement,
}: {
  card: BaccaratVisibleCardView;
  placement: "bottom" | "top";
}) {
  const suitTheme = getSuitTheme(card.suit);

  return (
    <div
      className={cn(
        "absolute grid w-[25%] justify-items-center gap-0.5 leading-none",
        placement === "top"
          ? "left-[8%] top-[7%]"
          : "bottom-[7%] right-[8%] rotate-180",
      )}
    >
      <span
        className={cn(
          "text-[0.86rem] font-black tracking-normal sm:text-[1.08rem] md:text-[1.22rem]",
          card.rank === "10" ? "tracking-tighter" : "",
          suitTheme.textClass,
        )}
      >
        {card.rank}
      </span>
      <SuitIcon
        className={cn("size-3.5 sm:size-4 md:size-5", suitTheme.fillClass)}
        suit={card.suit}
      />
    </div>
  );
}

function SuitIcon({
  className,
  suit,
}: {
  className?: string;
  suit: BaccaratCardSuit;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="-56 -56 112 124"
    >
      <path d={suitPath(suit)} fill="currentColor" />
    </svg>
  );
}

function suitPath(suit: BaccaratCardSuit) {
  if (suit === "clubs") {
    return "M-24 42H24C13 29 7 18 8 7C17 20 44 16 44-8C44-29 20-36 8-20C12-43-12-43-8-20C-20-36-44-29-44-8C-44 16-17 20-8 7C-7 18-13 29-24 42Z";
  }

  if (suit === "diamonds") {
    return "M0-50L42 0L0 50L-42 0Z";
  }

  if (suit === "hearts") {
    return "M0 43C-34 16-54-8-44-31C-36-51-10-51 0-28C10-51 36-51 44-31C54-8 34 16 0 43Z";
  }

  return "M0-50C-30-22-50-3-42 23C-35 45-9 44-8 19C-10 38-18 52-31 65H31C18 52 10 38 8 19C9 44 35 45 42 23C50-3 30-22 0-50Z";
}

function getSuitTheme(suit: BaccaratCardSuit) {
  if (suit === "hearts" || suit === "diamonds") {
    return redSuitTheme;
  }

  return darkSuitTheme;
}

function BaccaratCardBack({
  isActive,
  progress,
  rotationClass,
  size = "table",
  slot,
}: {
  isActive: boolean;
  progress: number;
  rotationClass?: string;
  size?: "featured" | "table";
  slot: BaccaratRevealSlot;
}) {
  const safeProgress = isActive ? clampPercent(progress) : 0;
  const coverStyle: CSSProperties = {
    width: `${100 - safeProgress}%`,
  };
  const edgeStyle: CSSProperties = {
    left: `calc(${Math.max(6, Math.min(94, safeProgress))}% - ${
      size === "featured" ? "0.6rem" : "0.45rem"
    })`,
  };
  const shineStyle: CSSProperties = {
    left: `${Math.max(10, Math.min(90, safeProgress))}%`,
  };

  return (
    <div
      aria-label={`${slotLabel(slot)} hidden${
        isActive ? ` auto reveal ${safeProgress}%` : ""
      }`}
      data-card-slot={slot}
      data-reveal-state={isActive ? "revealing" : "hidden"}
      className={cn(
        "relative isolate aspect-[5/7] shrink-0 overflow-hidden rounded-lg border border-[#fff8d6]/70 bg-[#fffaf0] shadow-xl shadow-black/35 transition",
        size === "featured"
          ? "w-[108px] sm:w-[128px]"
          : "w-[56px] sm:w-[74px] md:w-[88px]",
        rotationClass,
        isActive ? "ring-2 ring-[#f5c95f]/75 ring-offset-2 ring-offset-black/30" : "",
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(255,255,255,0.95),transparent_34%),linear-gradient(145deg,#fffaf0,#f7efe2_58%,#f5c95f_140%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-[7%] rounded-md border border-[#111827]/18"
      />
      <div
        aria-hidden="true"
        className="absolute inset-[13%] rounded-md bg-[linear-gradient(135deg,#0b3b73_0_42%,#c8272e_42%_58%,#f5c95f_58%_100%)] shadow-inner"
      />
      <div
        aria-hidden="true"
        className="absolute inset-[20%] rounded-md border border-[#fff8d6]/35 bg-[radial-gradient(circle_at_50%_50%,rgba(255,250,240,0.18),transparent_58%)]"
      />
      <div
        aria-hidden="true"
        className="absolute left-[18%] top-[18%] size-2 rounded-full bg-[#fff8d6]/70"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[18%] right-[18%] size-2 rounded-full bg-[#fff8d6]/70"
      />

      {isActive ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-y-0 w-10 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.54),transparent)] opacity-75 blur-[1px] transition-[left]"
            style={shineStyle}
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-[4%] z-20 w-4 -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,rgba(255,247,214,0),rgba(255,247,214,0.9),rgba(251,191,36,0))] opacity-90 shadow-[0_0_24px_rgba(251,191,36,0.45)] transition-[left]"
            style={edgeStyle}
          />
        </>
      ) : null}

      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 z-10 overflow-hidden rounded-r-lg border-l border-[#f5c95f]/30 bg-[linear-gradient(135deg,#071c3f,#0b3b73_48%,#c8272e)] shadow-[-10px_0_18px_rgba(0,0,0,0.24)] transition-[width]"
        style={coverStyle}
      >
        <div className="absolute inset-2 rounded-md border border-[#fff8d6]/35 bg-[radial-gradient(circle_at_50%_50%,rgba(245,201,95,0.24),transparent_55%)]" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.1)_0_1px,transparent_1px_7px)] opacity-70" />
        <div className="absolute inset-0 grid place-items-center">
          <div
            className={cn(
              "grid place-items-center rounded-full border border-[#fff8d6]/45 bg-black/25 font-black tracking-normal text-[#fff8d6]/90",
              size === "featured" ? "size-14 text-base" : "size-12 text-sm",
            )}
          >
            BK
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyCardRow() {
  return (
    <div className="flex gap-2 opacity-70 sm:gap-3">
      {[0, 1].map((slot) => (
        <div
          className="aspect-[5/7] w-[56px] rounded-lg border border-dashed border-[#d8ecff]/25 bg-[#0b3b73]/65 sm:w-[74px] md:w-[88px]"
          key={slot}
        />
      ))}
    </div>
  );
}

function RevealPanel({
  activeReveal,
  revealProgress,
  state,
}: {
  activeReveal: ReturnType<typeof getActiveReveal>;
  revealProgress: number;
  state: BaccaratTableState | null;
}) {
  const progress = revealProgress;
  const countdown = useCountdown(activeReveal?.endsAt);

  if (!state || !activeReveal) {
    return (
      <section className="rounded-[1rem] border border-[#d8ecff]/20 bg-[#071c3f]/92 p-3 text-center shadow-xl shadow-black/25">
        <div className="mx-auto grid size-12 place-items-center rounded-lg border border-[#d8ecff]/25 bg-[#0b3b73] text-[#f5c95f]">
          <Sparkles className="size-5" />
        </div>
        <h2 className="mt-3 text-lg font-semibold">Card Reveal</h2>
        <p className="mt-1 text-sm text-white/65">
          {state?.phase === "WAITING_BETS"
            ? "Betting window is open."
            : "Waiting for the next server reveal."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[1rem] border border-[#f5c95f]/45 bg-[#071c3f]/95 p-3 text-center shadow-xl shadow-black/25">
      <div className="mx-auto grid size-12 place-items-center rounded-lg border border-[#f5c95f]/35 bg-[#805f12] text-[#fff8d6]">
        <Gauge className="size-5" />
      </div>
      <h2 className="mt-3 text-lg font-semibold">{slotLabel(activeReveal.slot)}</h2>
      <p className="mt-1 text-sm text-white/65">
        {activeReveal.isAutoReveal
          ? "Automatic server reveal"
          : "Server reveal in progress"}
      </p>

      <div className="mt-4 flex justify-center">
        <BaccaratCardBack
          isActive={activeReveal.status === "ACTIVE"}
          progress={progress}
          size="featured"
          slot={activeReveal.slot}
        />
      </div>

      <div className="mt-4 rounded-lg border border-[#d8ecff]/20 bg-[#0b3b73]/90 p-3">
        <div className="flex items-center justify-between text-xs text-white/65">
          <span>{activeReveal.status}</span>
          <span>{countdown ?? "No timer"}</span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/35">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#8fc4e8,#f5c95f,#c8272e)] transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-sm font-semibold">{progress}%</p>
      </div>
    </section>
  );
}

function BettingPanel({
  amount,
  canConfirmBet,
  canSelectBet,
  isBetSubmitting,
  myBet,
  onAddChip,
  onAmountChange,
  onClear,
  onConfirmBet,
  onSelectBet,
  pendingBet,
  selectedBetType,
  state,
}: {
  amount: string;
  canConfirmBet: boolean;
  canSelectBet: boolean;
  isBetSubmitting: boolean;
  myBet: BaccaratTableState["betting"]["myBet"];
  onAddChip: (amount: string) => void;
  onAmountChange: (amount: string) => void;
  onClear: () => void;
  onConfirmBet: () => void;
  onSelectBet: (betType: BaccaratBetType) => void;
  pendingBet: PendingBet | null;
  selectedBetType: BaccaratBetType | null;
  state: BaccaratTableState | null;
}) {
  const totals = state?.betting.totals;
  const betTypes = state?.betting.betTypes.length
    ? state.betting.betTypes
    : betChoices.map((choice) => choice.betType);
  const selectedChoice = selectedBetType
    ? betChoices.find((choice) => choice.betType === selectedBetType) ?? null
    : null;
  const confirmLabel = isBetSubmitting
    ? "Submitting..."
    : selectedChoice
      ? `Place ${selectedChoice.label} Bet`
      : "Select Bet";
  const confirmDetail = myBet
    ? `${formatOutcome(myBet.betType)} ${formatPoints(myBet.amount)} pts placed`
    : pendingBet
      ? `${formatOutcome(pendingBet.betType)} ${formatPoints(
          pendingBet.amount,
        )} pts pending`
      : selectedChoice
        ? `${selectedChoice.label} ${formatPoints(amount || "0")} pts`
        : state?.phase === "WAITING_BETS"
          ? "No bet selected"
          : "Betting closed";

  return (
    <section className="rounded-[1rem] border border-[#d8ecff]/20 bg-[#071c3f]/95 p-3 shadow-xl shadow-black/25">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Main Bet</h2>
          <p className="mt-1 text-sm text-white/65">
            {state
              ? `${formatPoints(state.betting.minBet)} - ${formatPoints(
                  state.betting.maxMainBet,
                )} pts`
              : "Limits loading"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickBetAmounts.map((chip) => (
            <Button
              className="border-[#d8ecff]/20 bg-[#0b3b73] text-white hover:bg-[#c8272e]"
              disabled={Boolean(myBet) || isBetSubmitting}
              key={chip}
              onClick={() => onAddChip(chip)}
              size="sm"
              variant="outline"
            >
              +{formatPoints(chip)}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          className="h-10 min-w-0 rounded-lg border border-[#d8ecff]/20 bg-[#061833] px-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/40 focus:border-[#f5c95f]/80"
          disabled={Boolean(myBet) || isBetSubmitting}
          inputMode="numeric"
          onChange={(event) => onAmountChange(normalizePointInput(event.target.value))}
          placeholder="Bet amount"
          value={amount}
        />
        <Button
          className="border-[#d8ecff]/20 bg-[#0b3b73] text-white hover:bg-[#c8272e]"
          disabled={Boolean(myBet) || isBetSubmitting || !amount}
          onClick={onClear}
          variant="outline"
        >
          Clear
        </Button>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {betChoices.map((choice) => {
          const isEnabled = betTypes.includes(choice.betType);
          const isPending = pendingBet?.betType === choice.betType;
          const isSelected = selectedBetType === choice.betType;
          const isSubmitted = myBet?.betType === choice.betType;
          const total = totals?.[choice.totalKey] ?? "0";

          return (
            <button
              aria-pressed={isSelected}
              className={cn(
                "min-h-[122px] rounded-[0.9rem] border p-3 text-left transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45",
                choice.accentClass,
                isSubmitted
                  ? "ring-2 ring-[#d8ecff]/90"
                  : isPending
                    ? "ring-2 ring-[#f5c95f]/90"
                    : isSelected
                      ? "ring-2 ring-white/85"
                      : "ring-0",
                isSelected || isPending || isSubmitted
                  ? "shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_16px_28px_rgba(0,0,0,0.22)]"
                  : "ring-0",
              )}
              disabled={!canSelectBet || !isEnabled}
              key={choice.betType}
              onClick={() => onSelectBet(choice.betType)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xl font-semibold">{choice.label}</span>
                <span className="rounded-md border border-[#d8ecff]/20 bg-[#061833]/90 px-2 py-1 text-xs">
                  {choice.odds}
                </span>
              </div>
              <p className="mt-7 text-sm text-white/65">Table total</p>
              <p className="text-lg font-semibold">{formatPoints(total)} pts</p>
              <p className="mt-2 text-xs font-semibold text-white/75">
                {isSubmitted
                  ? "Placed"
                  : isPending
                    ? "Pending"
                    : isSelected
                      ? "Selected"
                      : "Available"}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 rounded-lg border border-[#d8ecff]/20 bg-[#061833]/90 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-white/45">
            Bet confirmation
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {confirmDetail}
          </p>
        </div>
        <Button
          className="bg-[#f5c95f] text-[#111827] hover:bg-[#ffe08a] disabled:opacity-45"
          disabled={!canConfirmBet}
          onClick={onConfirmBet}
        >
          {confirmLabel}
        </Button>
      </div>
    </section>
  );
}

function MyRoundPanel({
  lastSettlement,
  myBet,
  playerId,
  state,
  walletBalance,
}: {
  lastSettlement: ReturnType<typeof useBaccaratTable>["lastRoundSettled"];
  myBet: BaccaratTableState["betting"]["myBet"];
  playerId: string | null;
  state: BaccaratTableState | null;
  walletBalance: string;
}) {
  const mySettlement = playerId
    ? lastSettlement?.results.find((result) => result.playerId === playerId)
    : null;
  const personalResult = getPersonalResultView({ myBet, mySettlement });

  return (
    <section className="rounded-[1rem] border border-[#d8ecff]/20 bg-[#071c3f]/95 p-3 shadow-xl shadow-black/25">
      <div className="flex items-center gap-2">
        <WalletCards className="size-4 text-[#f5c95f]" />
        <h2 className="text-lg font-semibold">My Round</h2>
      </div>

      {personalResult ? (
        <PersonalResultBanner result={personalResult} />
      ) : null}

      <div className="mt-3 grid gap-2">
        <InfoRow label="Wallet" value={`${formatPoints(walletBalance)} pts`} />
        <InfoRow label="Phase" value={formatPhaseLabel(state?.phase)} />
        <InfoRow
          label="My bet"
          value={
            myBet
              ? `${formatOutcome(myBet.betType)} ${formatPoints(myBet.amount)} pts`
              : "None"
          }
        />
        <InfoRow label="Bet status" value={myBet?.status ?? "-"} />
        <InfoRow
          label="Personal result"
          value={
            mySettlement
              ? `${mySettlement.outcome} ${formatSignedPoints(
                  mySettlement.netAmount,
                )}`
              : "-"
          }
        />
      </div>
    </section>
  );
}

function PersonalResultBanner({ result }: { result: PersonalResultView }) {
  const toneClass = personalResultToneClass(result.tone);

  return (
    <div
      className={cn(
        "mt-3 overflow-hidden rounded-xl border p-3 shadow-lg sm:p-4",
        toneClass.container,
      )}
      data-testid="baccarat-personal-result-banner"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className={cn("text-xs font-black uppercase tracking-normal", toneClass.kicker)}>
            Personal result
          </p>
          <p className={cn("mt-1 text-2xl font-black leading-none sm:text-3xl", toneClass.title)}>
            {result.title}
          </p>
          <p className="mt-2 text-sm font-semibold text-white/78">{result.kicker}</p>
          <p className="mt-1 text-xs text-white/62 sm:text-sm">{result.detail}</p>
        </div>
        <div
          className={cn(
            "shrink-0 rounded-lg border px-3 py-2 text-center text-sm font-black sm:min-w-28",
            toneClass.amount,
          )}
        >
          {result.amountLabel}
        </div>
      </div>
    </div>
  );
}

function getPersonalResultView({
  myBet,
  mySettlement,
}: {
  myBet: BaccaratTableState["betting"]["myBet"];
  mySettlement: BaccaratRoundSettledPlayerResult | null | undefined;
}): PersonalResultView | null {
  if (mySettlement) {
    return {
      amountLabel: formatSignedPoints(mySettlement.netAmount),
      detail: `Payout ${formatPoints(mySettlement.payoutAmount)} pts`,
      kicker: `${formatOutcome(mySettlement.betType)} ${formatPoints(
        mySettlement.betAmount,
      )} pts`,
      title: personalOutcomeTitle(mySettlement.outcome),
      tone: personalOutcomeTone(mySettlement.outcome),
    };
  }

  if (!myBet) {
    return null;
  }

  if (myBet.status === "CANCELLED") {
    return {
      amountLabel: "Cancelled",
      detail: myBet.payoutAmount
        ? `Refund ${formatPoints(myBet.payoutAmount)} pts`
        : "Server marked this bet cancelled.",
      kicker: `${formatOutcome(myBet.betType)} ${formatPoints(myBet.amount)} pts`,
      title: "Bet cancelled",
      tone: "cancelled",
    };
  }

  if (myBet.status === "SETTLED") {
    return {
      amountLabel: myBet.netAmount ? formatSignedPoints(myBet.netAmount) : "Settled",
      detail: myBet.payoutAmount
        ? `Payout ${formatPoints(myBet.payoutAmount)} pts`
        : "Server marked this bet settled.",
      kicker: `${formatOutcome(myBet.betType)} ${formatPoints(myBet.amount)} pts`,
      title: "Settled",
      tone: "neutral",
    };
  }

  return {
    amountLabel: "Placed",
    detail: "Waiting for the server-settled personal result.",
    kicker: `${formatOutcome(myBet.betType)} ${formatPoints(myBet.amount)} pts`,
    title: "Bet placed",
    tone: "pending",
  };
}

function personalOutcomeTitle(outcome: BaccaratBetOutcome) {
  if (outcome === "WIN") {
    return "You won";
  }

  if (outcome === "LOSE") {
    return "You lost";
  }

  return "Push";
}

function personalOutcomeTone(outcome: BaccaratBetOutcome): PersonalResultTone {
  if (outcome === "WIN") {
    return "won";
  }

  if (outcome === "LOSE") {
    return "lost";
  }

  return "push";
}

function personalResultToneClass(tone: PersonalResultTone) {
  if (tone === "won") {
    return {
      amount: "border-[#111827] bg-[#f5c95f] text-[#111827]",
      container:
        "border-[#f5c95f]/80 bg-[linear-gradient(135deg,rgba(128,95,18,0.92),rgba(7,28,63,0.94))] shadow-[#f5c95f]/15",
      kicker: "text-[#fff8d6]",
      title: "text-[#fff8d6]",
    };
  }

  if (tone === "lost") {
    return {
      amount: "border-[#ffb8bd]/60 bg-[#7d161b] text-[#fff3f1]",
      container:
        "border-[#ff9aa0]/70 bg-[linear-gradient(135deg,rgba(125,22,27,0.94),rgba(7,28,63,0.94))] shadow-[#c8272e]/15",
      kicker: "text-[#ffb8bd]",
      title: "text-[#fff3f1]",
    };
  }

  if (tone === "push" || tone === "cancelled") {
    return {
      amount: "border-[#d8ecff]/45 bg-[#0b3b73] text-[#eef7ff]",
      container:
        "border-[#8fc4e8]/60 bg-[linear-gradient(135deg,rgba(11,59,115,0.95),rgba(7,28,63,0.94))] shadow-[#8fc4e8]/15",
      kicker: "text-[#d8ecff]",
      title: "text-[#eef7ff]",
    };
  }

  return {
    amount: "border-[#d8c09a] bg-[#fffaf0] text-[#111827]",
    container:
      "border-[#d8ecff]/24 bg-[linear-gradient(135deg,rgba(6,24,51,0.94),rgba(11,59,115,0.82))]",
    kicker: "text-[#d8ecff]",
    title: "text-white",
  };
}

function RoadmapPanel({
  roadmaps,
}: {
  roadmaps: BaccaratRoadmapSnapshot | null;
}) {
  return (
    <section className="rounded-[1rem] border border-[#d8ecff]/20 bg-[#071c3f]/95 p-3 shadow-xl shadow-black/25">
      <div className="flex items-center gap-2">
        <CircleDot className="size-4 text-[#f5c95f]" />
        <h2 className="text-lg font-semibold">Roadmaps</h2>
      </div>
      <div className="mt-3 grid gap-3">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-white/65">
            <span>Bead Plate</span>
            <span>{roadmaps?.beadPlate.length ?? 0}</span>
          </div>
          <BeadPlateGrid cells={roadmaps?.beadPlate ?? []} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-white/65">
            <span>Big Road</span>
            <span>{roadmaps?.bigRoad.length ?? 0}</span>
          </div>
          <BigRoadGrid
            cells={roadmaps?.bigRoad ?? []}
            leadingTies={roadmaps?.leadingTies.length ?? 0}
          />
        </div>
      </div>
    </section>
  );
}

function BeadPlateGrid({
  cells,
}: {
  cells: BaccaratRoadmapSnapshot["beadPlate"];
}) {
  const maxCol = Math.max(11, ...cells.map((cell) => cell.col));
  const cellsByPosition = new Map(
    cells.map((cell) => [`${cell.row}:${cell.col}`, cell]),
  );

  return (
    <div
      className="grid overflow-hidden rounded-lg border border-[#d8ecff]/20 bg-[#061833]/90"
      style={{
        gridTemplateColumns: `repeat(${maxCol + 1}, minmax(22px, 1fr))`,
      }}
    >
      {Array.from({ length: (maxCol + 1) * beadRows }, (_, index) => {
        const row = Math.floor(index / (maxCol + 1));
        const col = index % (maxCol + 1);
        const cell = cellsByPosition.get(`${row}:${col}`);

        return (
          <RoadCell
            cell={cell}
            key={`${row}:${col}`}
            label={cell ? outcomeInitial(cell.outcome) : ""}
          />
        );
      })}
    </div>
  );
}

function BigRoadGrid({
  cells,
  leadingTies,
}: {
  cells: BaccaratBigRoadCell[];
  leadingTies: number;
}) {
  const maxCol = Math.max(11, ...cells.map((cell) => cell.col));
  const cellsByPosition = new Map(
    cells.map((cell) => [`${cell.row}:${cell.col}`, cell]),
  );

  return (
    <div>
      {leadingTies ? (
        <p className="mb-2 text-xs text-[#d8ecff]/75">
          Leading ties: {leadingTies}
        </p>
      ) : null}
      <div
        className="grid overflow-hidden rounded-lg border border-[#d8ecff]/20 bg-[#061833]/90"
        style={{
          gridTemplateColumns: `repeat(${maxCol + 1}, minmax(22px, 1fr))`,
        }}
      >
        {Array.from({ length: (maxCol + 1) * bigRoadRows }, (_, index) => {
          const row = Math.floor(index / (maxCol + 1));
          const col = index % (maxCol + 1);
          const cell = cellsByPosition.get(`${row}:${col}`);

          return (
            <RoadCell
              cell={cell}
              key={`${row}:${col}`}
              label={cell ? outcomeInitial(cell.outcome) : ""}
              tieCount={cell?.tieCount ?? 0}
            />
          );
        })}
      </div>
    </div>
  );
}

function RoadCell({
  cell,
  label,
  tieCount,
}: {
  cell: { outcome: BaccaratRoundOutcome } | undefined;
  label: string;
  tieCount?: number;
}) {
  return (
    <div className="relative grid aspect-square min-h-6 place-items-center border-r border-b border-[#d8ecff]/[0.12] text-[11px] font-semibold">
      {cell ? (
        <span
          className={cn(
            "grid size-5 place-items-center rounded-full border text-[10px]",
            outcomeCellClass(cell.outcome),
          )}
        >
          {label}
        </span>
      ) : null}
      {tieCount ? (
        <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-[#f5c95f] text-[9px] font-bold text-[#111827]">
          {tieCount}
        </span>
      ) : null}
    </div>
  );
}

function RecentRoundsPanel({ rounds }: { rounds: BaccaratRoundResultView[] }) {
  return (
    <section className="rounded-[1rem] border border-[#d8ecff]/20 bg-[#071c3f]/95 p-3 shadow-xl shadow-black/25">
      <div className="flex items-center gap-2">
        <History className="size-4 text-[#f5c95f]" />
        <h2 className="text-lg font-semibold">Recent</h2>
      </div>
      <div className="mt-3 grid max-h-[214px] gap-2 overflow-auto pr-1">
        {rounds.length ? (
          rounds.slice(0, 8).map((round) => (
            <div
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border border-[#d8ecff]/20 bg-[#061833]/90 px-3 py-2 text-sm"
              key={round.roundId}
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full border text-xs font-semibold",
                  outcomeCellClass(round.outcome),
                )}
              >
                {outcomeInitial(round.outcome)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  Round {round.roundNo} · {formatOutcome(round.outcome)}
                </p>
                <p className="text-xs text-white/65">
                  {round.isNatural ? "Natural" : "Settled"}
                </p>
              </div>
              <p className="font-semibold">
                {round.playerTotal}-{round.bankerTotal}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-[#d8ecff]/20 bg-[#061833]/90 px-3 py-5 text-center text-sm text-white/65">
            No settled rounds yet.
          </p>
        )}
      </div>
    </section>
  );
}

function TimelinePanel({
  timeline,
}: {
  timeline: BaccaratTimelineEntry[];
}) {
  return (
    <section className="min-h-0 rounded-[1rem] border border-[#d8ecff]/20 bg-[#071c3f]/95 p-3 shadow-xl shadow-black/25">
      <div className="flex items-center gap-2">
        <PlugZap className="size-4 text-[#f5c95f]" />
        <h2 className="text-lg font-semibold">Live Events</h2>
      </div>
      <div className="mt-3 grid max-h-[360px] gap-2 overflow-auto pr-1 xl:max-h-none">
        {timeline.length ? (
          timeline.map((event) => (
            <div
              className="rounded-lg border border-[#d8ecff]/20 bg-[#061833]/90 px-3 py-2 text-sm"
              key={event.id}
            >
              <div className="flex items-center justify-between gap-3">
                <p className={cn("font-semibold", timelineToneClass(event.tone))}>
                  {event.title}
                </p>
                <span className="shrink-0 text-xs text-white/40">
                  {formatTime(event.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/65">{event.detail}</p>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-[#d8ecff]/20 bg-[#061833]/90 px-3 py-5 text-center text-sm text-white/65">
            Waiting for table events.
          </p>
        )}
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#d8ecff]/20 bg-[#0b3b73]/80 px-3 py-2 text-sm">
      <span className="text-white/65">{label}</span>
      <span className="truncate font-semibold">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: BaccaratConnectionStatus }) {
  const isConnected = status === "connected";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold",
        isConnected
          ? "bg-[#f5c95f] text-[#111827]"
          : "border border-[#0b3b73] bg-[#d8ecff] text-[#0b3b73]",
      )}
    >
      <CircleDot className="size-3" />
      {status.replaceAll("-", " ")}
    </span>
  );
}

function MiniBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#d8ecff]/20 bg-[#061833]/90 px-2.5 py-1 text-xs font-medium text-white/80">
      {children}
    </span>
  );
}

function getActiveReveal(state: BaccaratTableState | null) {
  if (!state) {
    return null;
  }

  if (state.squeeze) {
    return state.squeeze;
  }

  return state.reveal;
}

function getPrimaryTimer(state: BaccaratTableState | null) {
  if (!state) {
    return null;
  }

  if (state.phase === "WAITING_BETS") {
    return state.timers.bettingEndsAt;
  }

  if (state.phase === "SQUEEZE") {
    return state.timers.revealEndsAt;
  }

  if (state.phase === "SETTLED" || state.phase === "ROUND_END") {
    return state.timers.roundEndsAt;
  }

  return null;
}

function useCountdown(endsAt: string | null | undefined) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) {
      return;
    }

    const interval = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  if (!endsAt) {
    return null;
  }

  const remainingMs = Math.max(0, new Date(endsAt).getTime() - nowMs);
  const seconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const secondRemainder = seconds % 60;

  return `${minutes}:${String(secondRemainder).padStart(2, "0")}`;
}

function useRevealProgress(activeReveal: ReturnType<typeof getActiveReveal>) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!activeReveal?.endsAt || activeReveal.status !== "ACTIVE") {
      return;
    }

    const interval = window.setInterval(() => setNowMs(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [activeReveal?.endsAt, activeReveal?.revealId, activeReveal?.status]);

  const serverProgress = clampPercent(activeReveal?.progress ?? 0);

  if (
    !activeReveal ||
    activeReveal.status !== "ACTIVE" ||
    !activeReveal.startedAt ||
    !activeReveal.endsAt
  ) {
    return serverProgress;
  }

  const startedAtMs = new Date(activeReveal.startedAt).getTime();
  const endsAtMs = new Date(activeReveal.endsAt).getTime();
  const durationMs = endsAtMs - startedAtMs;

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return serverProgress;
  }

  const timerProgress = ((nowMs - startedAtMs) / durationMs) * 100;

  return Math.max(serverProgress, clampPercent(timerProgress));
}

function isPositivePointAmount(value: string) {
  const normalizedValue = value.trim();

  if (!/^\d+$/.test(normalizedValue)) {
    return false;
  }

  return BigInt(normalizedValue) > BigInt(0);
}

function normalizePointInput(value: string) {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function addPointStrings(currentAmount: string, amountToAdd: string) {
  const currentValue = currentAmount.trim() ? BigInt(currentAmount) : BigInt(0);
  const addedValue = BigInt(amountToAdd);

  return (currentValue + addedValue).toString();
}

function formatPoints(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "0";
  }

  const isNegative = trimmedValue.startsWith("-");
  const digits = isNegative ? trimmedValue.slice(1) : trimmedValue;
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return isNegative ? `-${formatted}` : formatted;
}

function formatSignedPoints(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue || trimmedValue === "0") {
    return "0 pts";
  }

  return `${trimmedValue.startsWith("-") ? "" : "+"}${formatPoints(
    trimmedValue,
  )} pts`;
}

function formatHandScore(hand: BaccaratHandSnapshot | null) {
  if (!hand || hand.total === null) {
    return "Hidden";
  }

  return String(hand.total);
}

function formatOutcome(value: BaccaratBetType | BaccaratRoundOutcome) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPhaseLabel(
  phase: BaccaratTableState["phase"] | null | undefined,
) {
  if (!phase) {
    return "Connecting";
  }

  if (phase === "SQUEEZE") {
    return "REVEAL";
  }

  if (phase === "WAITING_BETS") {
    return "BETTING";
  }

  return phase.replaceAll("_", " ");
}

function outcomeInitial(outcome: BaccaratRoundOutcome) {
  if (outcome === "PLAYER") {
    return "P";
  }

  if (outcome === "BANKER") {
    return "B";
  }

  return "T";
}

function outcomeCellClass(outcome: BaccaratRoundOutcome) {
  if (outcome === "PLAYER") {
    return "border-[#8fc4e8]/70 bg-[#0b3b73]/65 text-[#d8ecff]";
  }

  if (outcome === "BANKER") {
    return "border-[#ff9aa0]/70 bg-[#c8272e]/45 text-[#fff3f1]";
  }

  return "border-[#f5c95f]/75 bg-[#f5c95f]/25 text-[#fff8d6]";
}

function outcomeTextClass(outcome: BaccaratRoundOutcome) {
  if (outcome === "PLAYER") {
    return "text-[#d8ecff]";
  }

  if (outcome === "BANKER") {
    return "text-[#ffb8bd]";
  }

  return "text-[#f5c95f]";
}

function timelineToneClass(tone: BaccaratTimelineEntry["tone"]) {
  if (tone === "success") {
    return "text-[#d8ecff]";
  }

  if (tone === "warning") {
    return "text-[#f5c95f]";
  }

  if (tone === "danger") {
    return "text-[#ffb8bd]";
  }

  return "text-white";
}

function slotLabel(slot: BaccaratRevealSlot) {
  return slot
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function getActivePendingBet(
  pendingBet: PendingBet | null,
  input: {
    acceptedCommandId: string | null;
    connectionStatus: BaccaratConnectionStatus;
    currentRoundId: string | null;
    hasMyBet: boolean;
    rejectedCommandId: string | null;
  },
) {
  if (!pendingBet) {
    return null;
  }

  if (
    input.connectionStatus !== "connected" ||
    input.hasMyBet ||
    pendingBet.roundId !== input.currentRoundId ||
    pendingBet.commandId === input.acceptedCommandId ||
    pendingBet.commandId === input.rejectedCommandId
  ) {
    return null;
  }

  return pendingBet;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
