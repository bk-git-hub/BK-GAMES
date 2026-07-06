"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Image from "next/image";
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
  type BaccaratCardView,
  type BaccaratHandSnapshot,
  type BaccaratRevealSlot,
  type BaccaratRoadmapSnapshot,
  type BaccaratRoundOutcome,
  type BaccaratRoundResultView,
  type BaccaratTableState,
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

const betChoices: BetChoice[] = [
  {
    accentClass: "border-sky-300/45 bg-sky-400/[0.12] text-sky-50",
    betType: "PLAYER",
    label: "Player",
    odds: "1:1",
    totalKey: "player",
  },
  {
    accentClass: "border-rose-300/45 bg-rose-400/[0.12] text-rose-50",
    betType: "BANKER",
    label: "Banker",
    odds: "0.95:1",
    totalKey: "banker",
  },
  {
    accentClass: "border-emerald-300/45 bg-emerald-400/[0.12] text-emerald-50",
    betType: "TIE",
    label: "Tie",
    odds: "8:1",
    totalKey: "tie",
  },
];

const quickBetAmounts = ["100", "500", "1000", "5000"] as const;
const beadRows = 6;
const bigRoadRows = 6;

export function BaccaratTableClient({
  initialWalletBalance,
  userEmail,
  userName,
}: BaccaratTableClientProps) {
  const table = useBaccaratTable({ initialWalletBalance });
  const [betAmount, setBetAmount] = useState("100");
  const state = table.tableState;
  const myBet = table.myBet;
  const currentRoundId = state?.round?.roundId ?? null;
  const activeReveal = getActiveReveal(state);
  const isSqueezer =
    Boolean(activeReveal?.squeezerUserId) &&
    activeReveal?.squeezerUserId === table.player?.id &&
    state?.phase === "SQUEEZE" &&
    activeReveal?.status === "ACTIVE";
  const canPlaceBet =
    table.connectionStatus === "connected" &&
    state?.status === "OPEN" &&
    state?.phase === "WAITING_BETS" &&
    state.betting.canPlaceBet &&
    !myBet &&
    isPositivePointAmount(betAmount);

  const latestResult = useMemo(
    () => state?.recentRounds[0] ?? null,
    [state?.recentRounds],
  );

  function addChip(amount: string) {
    setBetAmount((currentAmount) => addPointStrings(currentAmount, amount));
  }

  function placeBet(betType: BaccaratBetType) {
    if (!canPlaceBet) {
      return;
    }

    table.placeBet(betType, betAmount.trim());
  }

  return (
    <main className="min-h-screen bg-[#06110e] text-white">
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
            <section className="relative min-h-[620px] overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0d241b] shadow-2xl shadow-black/35 lg:min-h-[calc(100svh-8.6rem)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_22%,rgba(245,197,95,0.18),transparent_32%),radial-gradient(circle_at_18%_78%,rgba(49,151,206,0.16),transparent_34%),radial-gradient(circle_at_82%_76%,rgba(225,29,72,0.15),transparent_34%)]" />
              <div className="absolute inset-x-[4%] bottom-[5%] top-[16%] rounded-[45%] border-[18px] border-[#2a1710] bg-[#0f6f4d] shadow-[inset_0_0_90px_rgba(0,0,0,0.38),0_35px_90px_rgba(0,0,0,0.38)] sm:border-[24px]" />
              <div className="absolute inset-x-[10%] bottom-[12%] top-[24%] rounded-[45%] border border-emerald-50/20" />

              <div className="relative z-10 flex flex-col gap-3 p-3 sm:p-4">
                <TableStatusStrip
                  latestResult={latestResult}
                  onJoin={table.joinTable}
                  onReconnect={table.reconnect}
                  state={state}
                />

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.46fr)_minmax(0,1fr)] lg:items-start">
                  <HandPanel
                    hand={state?.player ?? null}
                    label="Player"
                    tone="player"
                  />
                  <SqueezePanel
                    activeReveal={activeReveal}
                    isSqueezer={isSqueezer}
                    onComplete={(revealId) => {
                      if (!currentRoundId) {
                        return;
                      }

                      table.completeSqueeze({
                        revealId,
                        roundId: currentRoundId,
                      });
                    }}
                    onProgress={(revealId, progress) => {
                      if (!currentRoundId) {
                        return;
                      }

                      table.sendSqueezeProgress({
                        progress,
                        revealId,
                        roundId: currentRoundId,
                      });
                    }}
                    playerName={table.player?.nickname ?? userName}
                    state={state}
                  />
                  <HandPanel
                    hand={state?.banker ?? null}
                    label="Banker"
                    tone="banker"
                  />
                </div>

                <div className="mt-auto grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <BettingPanel
                    amount={betAmount}
                    canPlaceBet={canPlaceBet}
                    myBet={myBet}
                    onAddChip={addChip}
                    onAmountChange={setBetAmount}
                    onClear={() => setBetAmount("")}
                    onPlaceBet={placeBet}
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
    <header className="grid gap-3 rounded-[1rem] border border-white/10 bg-white/[0.07] px-3 py-2.5 shadow-xl shadow-black/20 backdrop-blur md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/lobby"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/10 text-white transition hover:bg-white/15"
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
          <p className="truncate text-sm text-white/55">
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
          detail="main table"
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
    <div className="rounded-lg border border-white/10 bg-black/[0.22] px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-white/45">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="truncate text-base font-semibold">{value}</p>
        <p className="truncate text-xs text-emerald-100/75">{detail}</p>
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
    <div className="grid gap-2 rounded-lg border border-white/10 bg-black/[0.22] p-3 backdrop-blur sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <MiniBadge>{state?.status ?? "NO_STATE"}</MiniBadge>
          <MiniBadge>{state?.phase ?? "CONNECTING"}</MiniBadge>
          <MiniBadge>
            <Timer className="size-3" />
            {countdown ?? "No timer"}
          </MiniBadge>
          <MiniBadge>{state ? `${state.viewerCount} viewers` : "Syncing"}</MiniBadge>
        </div>
        <p className="mt-2 truncate text-sm text-white/55">
          {state
            ? `Table ${state.tableId} · Version ${state.version} · Updated ${formatTime(
                state.updatedAt,
              )}`
            : "Waiting for an authenticated Baccarat table snapshot."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {latestResult ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.08] px-3 py-2 text-sm">
            <span className={outcomeTextClass(latestResult.outcome)}>
              {formatOutcome(latestResult.outcome)}
            </span>
            <span className="text-white/50">
              {" "}
              {latestResult.playerTotal}-{latestResult.bankerTotal}
            </span>
          </div>
        ) : null}
        <Button
          className="border-white/10 bg-white/10 text-white hover:bg-white/15"
          onClick={onJoin}
          size="sm"
          variant="outline"
        >
          <CheckCircle2 className="size-4" />
          Join
        </Button>
        <Button
          className="border-white/10 bg-white/10 text-white hover:bg-white/15"
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
  hand,
  label,
  tone,
}: {
  hand: BaccaratHandSnapshot | null;
  label: string;
  tone: "player" | "banker";
}) {
  const cards = hand?.cards ?? [];

  return (
    <section
      className={cn(
        "rounded-[1rem] border p-3 shadow-xl shadow-black/20",
        tone === "player"
          ? "border-sky-300/30 bg-sky-500/[0.12]"
          : "border-rose-300/30 bg-rose-500/[0.12]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{label}</h2>
          <p className="text-sm text-white/55">
            Total {hand?.total === null || !hand ? "Hidden" : hand.total}
            {hand?.isNatural ? " · Natural" : ""}
          </p>
        </div>
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-center",
            tone === "player"
              ? "border-sky-200/30 bg-sky-300/10 text-sky-50"
              : "border-rose-200/30 bg-rose-300/10 text-rose-50",
          )}
        >
          <p className="text-xs text-white/55">Cards</p>
          <p className="text-lg font-semibold">{cards.length}</p>
        </div>
      </div>

      <div className="mt-5 flex min-h-[164px] flex-wrap items-center justify-center gap-3">
        {cards.length ? (
          cards.map((card, index) => (
            <BaccaratCard card={card} index={index} key={`${card.slot}:${index}`} />
          ))
        ) : (
          <EmptyCardRow />
        )}
      </div>
    </section>
  );
}

function BaccaratCard({
  card,
  index,
}: {
  card: BaccaratCardView;
  index: number;
}) {
  if (card.hidden === true) {
    return (
      <div
        className={cn(
          "grid aspect-[5/7] w-[74px] shrink-0 place-items-center rounded-lg border border-amber-100/20 bg-[linear-gradient(135deg,#111827,#16251e_55%,#0f5135)] shadow-xl shadow-black/30 sm:w-[88px]",
          index % 2 === 0 ? "rotate-[-2deg]" : "rotate-[2deg]",
        )}
        aria-label={`${slotLabel(card.slot)} hidden`}
      >
        <div className="grid size-12 place-items-center rounded-full border border-amber-100/30 bg-black/25 text-sm font-semibold text-amber-50/80">
          BK
        </div>
      </div>
    );
  }

  return (
    <Image
      alt={`${card.rank} of ${card.suit}`}
      className={cn(
        "h-auto w-[74px] shrink-0 rounded-lg shadow-xl shadow-black/35 sm:w-[88px]",
        index % 2 === 0 ? "rotate-[-2deg]" : "rotate-[2deg]",
      )}
      height={588}
      src={`/cards/royal-noir/${card.rank}${suitCode(card.suit)}.svg`}
      width={420}
    />
  );
}

function EmptyCardRow() {
  return (
    <div className="flex gap-3 opacity-70">
      {[0, 1].map((slot) => (
        <div
          className="aspect-[5/7] w-[74px] rounded-lg border border-dashed border-white/18 bg-white/5 sm:w-[88px]"
          key={slot}
        />
      ))}
    </div>
  );
}

function SqueezePanel({
  activeReveal,
  isSqueezer,
  onComplete,
  onProgress,
  playerName,
  state,
}: {
  activeReveal: ReturnType<typeof getActiveReveal>;
  isSqueezer: boolean;
  onComplete: (revealId: string) => void;
  onProgress: (revealId: string, progress: number) => void;
  playerName: string;
  state: BaccaratTableState | null;
}) {
  const progress = activeReveal?.progress ?? 0;
  const countdown = useCountdown(activeReveal?.endsAt);

  if (!state || !activeReveal) {
    return (
      <section className="rounded-[1rem] border border-white/10 bg-black/25 p-3 text-center shadow-xl shadow-black/20">
        <div className="mx-auto grid size-12 place-items-center rounded-lg border border-white/10 bg-white/[0.08] text-amber-100">
          <Sparkles className="size-5" />
        </div>
        <h2 className="mt-3 text-lg font-semibold">Squeeze</h2>
        <p className="mt-1 text-sm text-white/55">
          {state?.phase === "WAITING_BETS"
            ? "Betting window is open."
            : "Reveal state will appear here."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[1rem] border border-amber-200/25 bg-black/[0.28] p-3 text-center shadow-xl shadow-black/20">
      <div className="mx-auto grid size-12 place-items-center rounded-lg border border-amber-100/20 bg-amber-200/10 text-amber-100">
        <Gauge className="size-5" />
      </div>
      <h2 className="mt-3 text-lg font-semibold">{slotLabel(activeReveal.slot)}</h2>
      <p className="mt-1 text-sm text-white/55">
        {activeReveal.isAutoReveal
          ? "System auto reveal"
          : isSqueezer
            ? `${playerName} is squeezing`
            : "Squeeze in progress"}
      </p>

      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.08] p-3">
        <div className="flex items-center justify-between text-xs text-white/55">
          <span>{activeReveal.status}</span>
          <span>{countdown ?? "No timer"}</span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/35">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#facc15,#fb7185)] transition-[width]"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
        <p className="mt-2 text-sm font-semibold">{progress}%</p>
      </div>

      {isSqueezer ? (
        <div className="mt-4 space-y-3">
          <input
            aria-label="Squeeze progress"
            className="w-full accent-amber-300"
            max={100}
            min={0}
            onChange={(event) => {
              const nextProgress = Number(event.target.value);
              onProgress(activeReveal.revealId, nextProgress);
            }}
            type="range"
            value={progress}
          />
          <Button
            className="w-full bg-amber-300 text-zinc-950 hover:bg-amber-200"
            onClick={() => onComplete(activeReveal.revealId)}
          >
            Complete Reveal
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function BettingPanel({
  amount,
  canPlaceBet,
  myBet,
  onAddChip,
  onAmountChange,
  onClear,
  onPlaceBet,
  state,
}: {
  amount: string;
  canPlaceBet: boolean;
  myBet: BaccaratTableState["betting"]["myBet"];
  onAddChip: (amount: string) => void;
  onAmountChange: (amount: string) => void;
  onClear: () => void;
  onPlaceBet: (betType: BaccaratBetType) => void;
  state: BaccaratTableState | null;
}) {
  const totals = state?.betting.totals;
  const betTypes = state?.betting.betTypes.length
    ? state.betting.betTypes
    : betChoices.map((choice) => choice.betType);

  return (
    <section className="rounded-[1rem] border border-white/10 bg-black/[0.24] p-3 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Main Bet</h2>
          <p className="mt-1 text-sm text-white/55">
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
              className="border-white/10 bg-white/10 text-white hover:bg-white/15"
              disabled={Boolean(myBet)}
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
          className="h-10 min-w-0 rounded-lg border border-white/12 bg-white/[0.09] px-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/35 focus:border-amber-200/55"
          disabled={Boolean(myBet)}
          inputMode="numeric"
          onChange={(event) => onAmountChange(normalizePointInput(event.target.value))}
          placeholder="Bet amount"
          value={amount}
        />
        <Button
          className="border-white/10 bg-white/10 text-white hover:bg-white/15"
          disabled={Boolean(myBet) || !amount}
          onClick={onClear}
          variant="outline"
        >
          Clear
        </Button>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {betChoices.map((choice) => {
          const isEnabled = betTypes.includes(choice.betType);
          const total = totals?.[choice.totalKey] ?? "0";

          return (
            <button
              className={cn(
                "min-h-[122px] rounded-[0.9rem] border p-3 text-left transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45",
                choice.accentClass,
                myBet?.betType === choice.betType
                  ? "ring-2 ring-amber-200/80"
                  : "ring-0",
              )}
              disabled={!canPlaceBet || !isEnabled}
              key={choice.betType}
              onClick={() => onPlaceBet(choice.betType)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xl font-semibold">{choice.label}</span>
                <span className="rounded-md border border-white/10 bg-black/[0.22] px-2 py-1 text-xs">
                  {choice.odds}
                </span>
              </div>
              <p className="mt-7 text-sm text-white/55">Table total</p>
              <p className="text-lg font-semibold">{formatPoints(total)} pts</p>
            </button>
          );
        })}
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

  return (
    <section className="rounded-[1rem] border border-white/10 bg-black/[0.24] p-3 shadow-xl shadow-black/20">
      <div className="flex items-center gap-2">
        <WalletCards className="size-4 text-amber-100" />
        <h2 className="text-lg font-semibold">My Round</h2>
      </div>

      <div className="mt-3 grid gap-2">
        <InfoRow label="Wallet" value={`${formatPoints(walletBalance)} pts`} />
        <InfoRow label="Phase" value={state?.phase ?? "Connecting"} />
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
          label="Settlement"
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

function RoadmapPanel({
  roadmaps,
}: {
  roadmaps: BaccaratRoadmapSnapshot | null;
}) {
  return (
    <section className="rounded-[1rem] border border-white/10 bg-white/[0.07] p-3 shadow-xl shadow-black/20">
      <div className="flex items-center gap-2">
        <CircleDot className="size-4 text-amber-100" />
        <h2 className="text-lg font-semibold">Roadmaps</h2>
      </div>
      <div className="mt-3 grid gap-3">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-white/55">
            <span>Bead Plate</span>
            <span>{roadmaps?.beadPlate.length ?? 0}</span>
          </div>
          <BeadPlateGrid cells={roadmaps?.beadPlate ?? []} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-white/55">
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
      className="grid overflow-hidden rounded-lg border border-white/10 bg-black/[0.24]"
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
        <p className="mb-2 text-xs text-emerald-100/75">
          Leading ties: {leadingTies}
        </p>
      ) : null}
      <div
        className="grid overflow-hidden rounded-lg border border-white/10 bg-black/[0.24]"
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
    <div className="relative grid aspect-square min-h-6 place-items-center border-r border-b border-white/[0.08] text-[11px] font-semibold">
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
        <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-emerald-300 text-[9px] font-bold text-zinc-950">
          {tieCount}
        </span>
      ) : null}
    </div>
  );
}

function RecentRoundsPanel({ rounds }: { rounds: BaccaratRoundResultView[] }) {
  return (
    <section className="rounded-[1rem] border border-white/10 bg-white/[0.07] p-3 shadow-xl shadow-black/20">
      <div className="flex items-center gap-2">
        <History className="size-4 text-amber-100" />
        <h2 className="text-lg font-semibold">Recent</h2>
      </div>
      <div className="mt-3 grid max-h-[214px] gap-2 overflow-auto pr-1">
        {rounds.length ? (
          rounds.slice(0, 8).map((round) => (
            <div
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border border-white/10 bg-black/[0.22] px-3 py-2 text-sm"
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
                <p className="text-xs text-white/50">
                  {round.isNatural ? "Natural" : `${round.totalCards} cards`}
                </p>
              </div>
              <p className="font-semibold">
                {round.playerTotal}-{round.bankerTotal}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-white/10 bg-black/[0.22] px-3 py-5 text-center text-sm text-white/55">
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
    <section className="min-h-0 rounded-[1rem] border border-white/10 bg-white/[0.07] p-3 shadow-xl shadow-black/20">
      <div className="flex items-center gap-2">
        <PlugZap className="size-4 text-amber-100" />
        <h2 className="text-lg font-semibold">Live Events</h2>
      </div>
      <div className="mt-3 grid max-h-[360px] gap-2 overflow-auto pr-1 xl:max-h-none">
        {timeline.length ? (
          timeline.map((event) => (
            <div
              className="rounded-lg border border-white/10 bg-black/[0.22] px-3 py-2 text-sm"
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
              <p className="mt-1 text-xs text-white/55">{event.detail}</p>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-white/10 bg-black/[0.22] px-3 py-5 text-center text-sm text-white/55">
            Waiting for table events.
          </p>
        )}
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 text-sm">
      <span className="text-white/50">{label}</span>
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
          ? "bg-emerald-300 text-zinc-950"
          : "border border-white/15 bg-white/10 text-white/65",
      )}
    >
      <CircleDot className="size-3" />
      {status.replaceAll("-", " ")}
    </span>
  );
}

function MiniBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/25 px-2.5 py-1 text-xs font-medium text-white/75">
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

function formatOutcome(value: BaccaratBetType | BaccaratRoundOutcome) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
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
    return "border-sky-200/60 bg-sky-400/20 text-sky-50";
  }

  if (outcome === "BANKER") {
    return "border-rose-200/60 bg-rose-400/20 text-rose-50";
  }

  return "border-emerald-200/60 bg-emerald-400/20 text-emerald-50";
}

function outcomeTextClass(outcome: BaccaratRoundOutcome) {
  if (outcome === "PLAYER") {
    return "text-sky-200";
  }

  if (outcome === "BANKER") {
    return "text-rose-200";
  }

  return "text-emerald-200";
}

function timelineToneClass(tone: BaccaratTimelineEntry["tone"]) {
  if (tone === "success") {
    return "text-emerald-100";
  }

  if (tone === "warning") {
    return "text-amber-100";
  }

  if (tone === "danger") {
    return "text-red-100";
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

function suitCode(suit: "clubs" | "diamonds" | "hearts" | "spades") {
  if (suit === "clubs") {
    return "C";
  }

  if (suit === "diamonds") {
    return "D";
  }

  if (suit === "hearts") {
    return "H";
  }

  return "S";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
