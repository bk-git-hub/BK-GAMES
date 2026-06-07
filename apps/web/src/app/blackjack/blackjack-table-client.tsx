"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CircleDot,
  Coins,
  LogOut,
  PlugZap,
  RefreshCw,
  Send,
  Timer,
} from "lucide-react";
import {
  type BlackjackCardSnapshot,
  type BlackjackHandSnapshot,
  type BlackjackPlayerAction,
  type BlackjackSeatSnapshot,
  type BlackjackTableEventPayload,
  type BlackjackTablePhase,
  type BlackjackTableState,
  type BlackjackWalletUpdatedPayload,
} from "@bk-games/shared/src/socket-events";

import { useBlackjackTable } from "./use-blackjack-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type BlackjackTableClientProps = {
  initialWalletBalance: string;
  userEmail: string;
  userName: string;
};

type ActionPrompt = {
  detail: string;
  tone: "active" | "neutral" | "waiting" | "warning";
  title: string;
};

const pointFormatter = new Intl.NumberFormat("en-US");
const cardEventAnimationMs = 1400;

export function BlackjackTableClient({
  initialWalletBalance,
  userEmail,
  userName,
}: BlackjackTableClientProps) {
  const table = useBlackjackTable({ initialWalletBalance });
  const [betAmount, setBetAmount] = useState("");
  const [seatNoInput, setSeatNoInput] = useState("1");
  const visibleState = table.tableState;
  const cardAnimationKeys = useCardEventAnimations(table.events);
  const mySeats = useMemo(
    () =>
      visibleState?.seats.filter((seat) => seat.userId === table.player?.id) ??
      [],
    [table.player?.id, visibleState?.seats],
  );
  const selectedSeatNo =
    parsePositiveInteger(seatNoInput) ?? mySeats[0]?.seatNo ?? null;
  const selectedSeat = mySeats.find((seat) => seat.seatNo === selectedSeatNo);
  const activeSeat =
    mySeats.find((seat) => seat.isCurrentTurn || seat.activeHandNo !== null) ??
    mySeats[0] ??
    null;
  const activeHand = activeSeat
    ? findActiveHand(activeSeat) ?? activeSeat.hands[0] ?? null
    : null;
  const availableActions =
    activeHand?.availableActions ?? activeSeat?.availableActions ?? [];
  const bettingAmount =
    betAmount.trim() || visibleState?.bettingLimits.minInitialBet || "";
  const isReviewingRoundResult = Boolean(table.roundResultReview);
  const isCommandLockedPhase = isTableCommandLockedPhase(visibleState?.phase);
  const canUseTable =
    table.connectionStatus === "connected" && visibleState?.status === "OPEN";
  const canSendSeatCommand =
    canUseTable &&
    selectedSeatNo !== null &&
    !isCommandLockedPhase &&
    !isReviewingRoundResult;
  const canBet =
    canSendSeatCommand &&
    !isReviewingRoundResult &&
    Boolean(bettingAmount) &&
    visibleState?.phase === "WAITING_BETS" &&
    selectedSeat?.handStatus === "WAITING_BET";
  const canSendPlayerAction =
    canUseTable &&
    !isCommandLockedPhase &&
    !isReviewingRoundResult &&
    availableActions.length > 0;
  const canJoinTable =
    table.connectionStatus === "connected" &&
    !isCommandLockedPhase &&
    !isReviewingRoundResult;
  const prompt = getActionPrompt({
    activeSeat,
    actions: availableActions,
    connectionStatus: table.connectionStatus,
    isReviewingRoundResult,
    selectedSeatNo,
    state: visibleState,
  });

  return (
    <main className="min-h-screen bg-[#07130f] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <TableHeader
          balance={table.walletBalance}
          connectionStatus={table.connectionStatus}
          message={table.statusMessage}
          update={table.lastWalletUpdate}
          userEmail={userEmail}
          userName={userName}
        />

        {table.socketError ? (
          <div
            className="rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm text-red-100"
            role="alert"
          >
            <span className="font-semibold">{table.socketError.code}</span>:{" "}
            {table.socketError.message}
          </div>
        ) : null}

        {table.roundNotice ? (
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-50">
            {table.roundNotice}
          </div>
        ) : null}

        {table.roundResultReview ? (
          <RoundResultReviewBanner
            endsAt={table.roundResultReview.endsAt}
            myUserId={table.player?.id ?? null}
            state={table.roundResultReview.state}
          />
        ) : null}

        <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="order-2 xl:order-1">
            <CasinoTable
              cardAnimationKeys={cardAnimationKeys}
              myUserId={table.player?.id ?? null}
              selectedSeatNo={selectedSeatNo}
              state={visibleState}
            />
          </div>

          <aside className="order-1 flex flex-col gap-4 xl:order-2">
            <ActionRail
              activeHand={activeHand}
              activeSeat={activeSeat}
              actions={availableActions}
              betAmount={betAmount}
              canBet={canBet}
              canJoinTable={canJoinTable}
              canSendPlayerAction={canSendPlayerAction}
              canSendSeatCommand={canSendSeatCommand}
              onAction={(action) => {
                if (!activeSeat) {
                  return;
                }

                table.sendPlayerAction({
                  action,
                  handNo: activeHand?.handNo,
                  seatNo: activeSeat.seatNo,
                });
              }}
              onBetAmountChange={setBetAmount}
              onJoin={table.joinTable}
              onLeaveSeat={() => {
                if (selectedSeatNo !== null) {
                  table.leaveSeat(selectedSeatNo);
                }
              }}
              onPlaceBet={() => {
                if (selectedSeatNo !== null && bettingAmount) {
                  table.placeBet(selectedSeatNo, bettingAmount);
                }
              }}
              onReconnect={table.reconnect}
              onSeatNoChange={setSeatNoInput}
              onTakeSeat={() => {
                if (selectedSeatNo !== null) {
                  table.takeSeat(selectedSeatNo);
                }
              }}
              prompt={prompt}
              seatNoInput={seatNoInput}
              selectedSeatNo={selectedSeatNo}
              state={visibleState}
            />
            <EventStream events={table.events} />
          </aside>
        </div>
      </section>
    </main>
  );
}

function TableHeader({
  balance,
  connectionStatus,
  message,
  update,
  userEmail,
  userName,
}: {
  balance: string;
  connectionStatus: string;
  message: string | null;
  update: BlackjackWalletUpdatedPayload | null;
  userEmail: string;
  userName: string;
}) {
  return (
    <header className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/lobby"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
          aria-label="Back to lobby"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-normal">
              BK Games Blackjack
            </h1>
            <StatusBadge status={connectionStatus} />
          </div>
          <p className="truncate text-sm text-white/55">
            {userName} · {userEmail}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 md:min-w-[390px]">
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/45">
            <Coins className="size-3.5" />
            Wallet
          </div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="text-lg font-semibold">{formatPoints(balance)} pts</p>
            <p className="truncate text-xs text-emerald-200/80">
              {update ? `${update.reason} ${formatSignedPoints(update.delta)}` : ""}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/45">
            <PlugZap className="size-3.5" />
            Connection
          </div>
          <p className="mt-1 truncate text-sm text-white/75">
            {message ?? connectionStatus.replaceAll("-", " ")}
          </p>
        </div>
      </div>
    </header>
  );
}

function RoundResultReviewBanner({
  endsAt,
  myUserId,
  state,
}: {
  endsAt: string;
  myUserId: string | null;
  state: BlackjackTableState;
}) {
  const countdown = useCountdown(endsAt);
  const results = getRoundResults(state);
  const myResults = results.filter((result) => result.userId === myUserId);
  const headlineResults = myResults.length ? myResults : results.slice(0, 3);

  return (
    <section className="rounded-2xl border border-amber-200/40 bg-amber-200/12 px-4 py-3 text-amber-50 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-100/70">
            Round result
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal">
            Review the outcome
          </h2>
          <p className="mt-1 text-sm text-amber-50/70">
            Next round appears in {countdown ?? "a moment"}.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[520px]">
          {headlineResults.length ? (
            headlineResults.map((result) => (
              <div
                className={cn(
                  "rounded-xl border px-3 py-2",
                  result.userId === myUserId
                    ? "border-amber-200/70 bg-black/30"
                    : "border-white/10 bg-black/20",
                )}
                key={`${result.seatNo}:${result.handNo ?? "seat"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold">
                    {result.userId === myUserId ? "You" : result.nickname}
                  </p>
                  <span className="text-xs text-amber-100/65">
                    Seat {result.seatNo}
                    {result.handNo ? ` · Hand ${result.handNo}` : ""}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                  <span>{formatOutcome(result.outcome, result.reason)}</span>
                  <span
                    className={cn(
                      "font-semibold",
                      result.netAmount && Number(result.netAmount) > 0
                        ? "text-emerald-200"
                        : "text-amber-50",
                    )}
                  >
                    {result.netAmount
                      ? formatSignedPoints(result.netAmount)
                      : "Settled"}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-4 text-sm text-amber-50/70 sm:col-span-2">
              Settlement received. Check the table cards before the next round.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CasinoTable({
  cardAnimationKeys,
  myUserId,
  selectedSeatNo,
  state,
}: {
  cardAnimationKeys: ReadonlySet<string>;
  myUserId: string | null;
  selectedSeatNo: number | null;
  state: BlackjackTableState | null;
}) {
  const countdown = useCountdown(state?.timers.phaseEndsAt ?? null);

  return (
    <section className="relative min-h-[620px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#10251d] p-4 shadow-2xl shadow-black/30 sm:p-6 lg:min-h-[760px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(46,181,126,0.24),rgba(10,42,31,0)_42%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0))]" />
      <div className="absolute inset-x-8 bottom-8 top-16 rounded-[48%] border-[18px] border-[#2a1710] bg-[#0f6a4b] shadow-[inset_0_0_80px_rgba(0,0,0,0.35),0_30px_80px_rgba(0,0,0,0.35)] sm:border-[24px]" />
      <div className="absolute inset-x-16 bottom-16 top-28 rounded-[48%] border border-emerald-100/20" />

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Table main</p>
          <p className="text-xs text-white/50">
            Version {state?.version ?? "-"} · Updated{" "}
            {state ? formatTime(state.updatedAt) : "-"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FeltBadge>{state?.status ?? "NO_STATE"}</FeltBadge>
          <FeltBadge>{state?.phase ?? "CONNECTING"}</FeltBadge>
          <FeltBadge>
            <Timer className="size-3" />
            {countdown ?? "No timer"}
          </FeltBadge>
        </div>
      </div>

      <div className="absolute left-1/2 top-[18%] z-10 flex w-[min(76%,520px)] -translate-x-1/2 flex-col items-center gap-3 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-emerald-100/75">
          Dealer
        </div>
        <CardFan
          animationKeys={cardAnimationKeys}
          cards={state?.dealer.cards ?? []}
          emptyLabel="Waiting for deal"
          ownerKeys={["dealer", "table"]}
          size="lg"
        />
        <p className="text-xs text-emerald-50/70">
          Visible {state?.dealer.visibleScore ?? "-"} · Final{" "}
          {state?.dealer.score ?? "-"}
        </p>
      </div>

      <div className="absolute left-1/2 top-[47%] z-10 -translate-x-1/2 text-center">
        <p className="text-3xl font-semibold uppercase tracking-[0.3em] text-emerald-50/20 sm:text-5xl">
          Blackjack
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.26em] text-emerald-50/35">
          {state
            ? `${formatPoints(state.bettingLimits.minInitialBet)} - ${formatPoints(
                state.bettingLimits.maxInitialBet,
              )} pts`
            : "Table limits loading"}
        </p>
      </div>

      <div className="absolute inset-x-4 bottom-10 top-[42%] z-20">
        {state?.seats.length ? (
          state.seats.map((seat, index) => (
            <SeatSpot
              cardAnimationKeys={cardAnimationKeys}
              index={index}
              isMine={seat.userId === myUserId}
              key={seat.seatNo}
              seat={seat}
            />
          ))
        ) : (
          <EmptySeatSpot selectedSeatNo={selectedSeatNo} />
        )}
      </div>
    </section>
  );
}

function SeatSpot({
  cardAnimationKeys,
  index,
  isMine,
  seat,
}: {
  cardAnimationKeys: ReadonlySet<string>;
  index: number;
  isMine: boolean;
  seat: BlackjackSeatSnapshot;
}) {
  const activeHand = findActiveHand(seat) ?? seat.hands[0] ?? null;
  const cards = activeHand?.cards.length ? activeHand.cards : seat.cards;
  const ownerKeys = [`seat:${seat.seatNo}`, "table"];

  if (activeHand) {
    ownerKeys.push(`seat:${seat.seatNo}:hand:${activeHand.handNo}`);
  }

  return (
    <article
      className={cn(
        "absolute flex w-[210px] flex-col gap-2 rounded-2xl border bg-[#06150f]/85 p-3 text-white shadow-2xl backdrop-blur-md",
        seatPositionClass(index),
        isMine ? "border-amber-300/80" : "border-white/15",
        seat.isCurrentTurn && "ring-2 ring-amber-200",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold">Seat {seat.seatNo}</p>
            {isMine ? (
              <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-semibold text-zinc-950">
                You
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-white/55">{seat.nickname}</p>
        </div>
        <span
          className={cn(
            "size-2.5 rounded-full",
            seat.connected ? "bg-emerald-300" : "bg-red-300",
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <MiniMetric label="Bet" value={formatNullablePoints(seat.betAmount)} />
        <MiniMetric
          label="Score"
          value={seat.score ? `${seat.score}${seat.isSoft ? " soft" : ""}` : "-"}
        />
      </div>

      <CardFan
        animationKeys={cardAnimationKeys}
        cards={cards}
        emptyLabel="No cards"
        ownerKeys={ownerKeys}
        size="sm"
      />

      <div className="flex flex-wrap gap-1">
        <FeltBadge>{seat.handStatus}</FeltBadge>
        {seat.activeHandNo ? <FeltBadge>Hand {seat.activeHandNo}</FeltBadge> : null}
        {seat.outcome ? <FeltBadge>{seat.outcome}</FeltBadge> : null}
      </div>
    </article>
  );
}

function EmptySeatSpot({ selectedSeatNo }: { selectedSeatNo: number | null }) {
  return (
    <div className="absolute bottom-[3%] left-1/2 flex w-[190px] -translate-x-1/2 flex-col items-center gap-2 rounded-full border border-dashed border-emerald-100/35 bg-emerald-950/30 px-5 py-4 text-center text-emerald-50/75">
      <p className="text-sm font-semibold">Seat {selectedSeatNo ?? 1}</p>
      <p className="text-xs">Open</p>
    </div>
  );
}

function ActionRail({
  activeHand,
  activeSeat,
  actions,
  betAmount,
  canBet,
  canJoinTable,
  canSendPlayerAction,
  canSendSeatCommand,
  onAction,
  onBetAmountChange,
  onJoin,
  onLeaveSeat,
  onPlaceBet,
  onReconnect,
  onSeatNoChange,
  onTakeSeat,
  prompt,
  seatNoInput,
  selectedSeatNo,
  state,
}: {
  activeHand: BlackjackHandSnapshot | null;
  activeSeat: BlackjackSeatSnapshot | null;
  actions: BlackjackPlayerAction[];
  betAmount: string;
  canBet: boolean;
  canJoinTable: boolean;
  canSendPlayerAction: boolean;
  canSendSeatCommand: boolean;
  onAction: (action: BlackjackPlayerAction) => void;
  onBetAmountChange: (value: string) => void;
  onJoin: () => void;
  onLeaveSeat: () => void;
  onPlaceBet: () => void;
  onReconnect: () => void;
  onSeatNoChange: (value: string) => void;
  onTakeSeat: () => void;
  prompt: ActionPrompt;
  seatNoInput: string;
  selectedSeatNo: number | null;
  state: BlackjackTableState | null;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl shadow-black/25 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={cn(
              "text-sm font-semibold uppercase tracking-[0.18em]",
              prompt.tone === "active" && "text-amber-200",
              prompt.tone === "waiting" && "text-emerald-200",
              prompt.tone === "warning" && "text-red-200",
              prompt.tone === "neutral" && "text-white/60",
            )}
          >
            Next move
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">
            {prompt.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/62">{prompt.detail}</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="border-white/15 bg-white/10 text-white hover:bg-white/15"
          onClick={onReconnect}
          aria-label="Reconnect"
        >
          <RefreshCw />
        </Button>
      </div>

      <div className="mt-5 grid gap-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Seat</p>
            <FeltBadge>{selectedSeatNo ? `Seat ${selectedSeatNo}` : "No seat"}</FeltBadge>
          </div>
          <label className="flex flex-col gap-2 text-sm text-white/70">
            Seat number
            <Input
              className="border-white/15 bg-white/10 text-white placeholder:text-white/35"
              inputMode="numeric"
              min={1}
              pattern="[0-9]*"
              type="number"
              value={seatNoInput}
              disabled={!canSendSeatCommand}
              onChange={(event) => onSeatNoChange(event.target.value)}
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              className="bg-emerald-300 text-zinc-950 hover:bg-emerald-200"
              disabled={!canSendSeatCommand}
              onClick={onTakeSeat}
            >
              Take seat
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/15 bg-white/10 text-white hover:bg-white/15"
              disabled={!canSendSeatCommand}
              onClick={onLeaveSeat}
            >
              <LogOut />
              Leave
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Bet</p>
            <FeltBadge>
              {state
                ? `${formatPoints(state.bettingLimits.minInitialBet)} - ${formatPoints(
                    state.bettingLimits.maxInitialBet,
                  )}`
                : "Loading"}
            </FeltBadge>
          </div>
          <label className="flex flex-col gap-2 text-sm text-white/70">
            Bet amount
            <Input
              className="border-white/15 bg-white/10 text-white placeholder:text-white/35"
              inputMode="numeric"
              min={1}
              pattern="[0-9]*"
              placeholder={state?.bettingLimits.minInitialBet ?? "Amount"}
              type="number"
              value={betAmount}
              disabled={!canBet}
              onChange={(event) => onBetAmountChange(event.target.value)}
            />
          </label>
          <Button
            type="button"
            className="mt-3 h-11 w-full bg-amber-300 text-base font-semibold text-zinc-950 hover:bg-amber-200"
            disabled={!canBet}
            onClick={onPlaceBet}
          >
            Place bet
          </Button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Actions</p>
            <FeltBadge>
              {activeSeat
                ? `Seat ${activeSeat.seatNo} · Hand ${activeHand?.handNo ?? "-"}`
                : "No active seat"}
            </FeltBadge>
          </div>
          {actions.length ? (
            <div className="grid grid-cols-2 gap-2">
              {actions.map((action) => (
                <Button
                  key={action}
                  type="button"
                  className={cn(
                    "h-11 font-semibold",
                    moneyChangingActions.has(action)
                      ? "bg-amber-300 text-zinc-950 hover:bg-amber-200"
                      : "bg-white text-zinc-950 hover:bg-emerald-50",
                  )}
                  disabled={!canSendPlayerAction}
                  onClick={() => onAction(action)}
                >
                  {formatActionLabel(action)}
                </Button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-sm text-white/55">
              {state ? phaseLabel(state.phase) : "Waiting for table state"}
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          className="border-white/15 bg-white/10 text-white hover:bg-white/15"
          disabled={!canJoinTable}
          onClick={onJoin}
        >
          <Send />
          Join main table
        </Button>
      </div>
    </section>
  );
}

function EventStream({ events }: { events: BlackjackTableEventPayload[] }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Table events</h2>
        <FeltBadge>{events.length}</FeltBadge>
      </div>
      <div className="flex max-h-[280px] flex-col gap-2 overflow-auto pr-1">
        {events.length ? (
          events.map((event) => <EventRow event={event} key={eventKey(event)} />)
        ) : (
          <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-sm text-white/55">
            No events yet.
          </p>
        )}
      </div>
    </section>
  );
}

function EventRow({ event }: { event: BlackjackTableEventPayload }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            event.type === "ROUND_SETTLED" || event.type === "ROUND_RESET"
              ? "bg-amber-300 text-zinc-950"
              : "bg-emerald-300/15 text-emerald-100",
          )}
        >
          {event.type}
        </span>
        <span className="text-xs text-white/45">{formatTime(event.createdAt)}</span>
      </div>
      <p className="mt-1 text-xs text-white/45">
        Seat {event.seatNo ?? "-"} · v{event.stateVersion}
      </p>
    </div>
  );
}

function useCardEventAnimations(events: BlackjackTableEventPayload[]) {
  const [animationKeys, setAnimationKeys] = useState<string[]>([]);
  const lastEventKeyRef = useRef<string | null>(null);
  const timeoutRefs = useRef<number[]>([]);
  const latestEvent = events[0] ?? null;
  const latestEventKey = latestEvent ? eventKey(latestEvent) : null;

  useEffect(() => {
    if (!latestEvent || !latestEventKey) {
      return;
    }

    if (lastEventKeyRef.current === latestEventKey) {
      return;
    }

    lastEventKeyRef.current = latestEventKey;

    const nextKeys = extractCardAnimationKeys(latestEvent);

    if (!nextKeys.length) {
      return;
    }

    const addTimeoutId = window.setTimeout(() => {
      setAnimationKeys((currentKeys) => [
        ...new Set([...currentKeys, ...nextKeys]),
      ]);
    }, 0);
    const removeTimeoutId = window.setTimeout(() => {
      setAnimationKeys((currentKeys) =>
        currentKeys.filter((key) => !nextKeys.includes(key)),
      );
    }, cardEventAnimationMs);

    timeoutRefs.current.push(addTimeoutId, removeTimeoutId);
  }, [latestEvent, latestEventKey]);

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
      timeoutRefs.current = [];
    };
  }, []);

  return useMemo(() => new Set(animationKeys), [animationKeys]);
}

function CardFan({
  animationKeys,
  cards,
  emptyLabel,
  ownerKeys,
  size,
}: {
  animationKeys: ReadonlySet<string>;
  cards: BlackjackCardSnapshot[];
  emptyLabel: string;
  ownerKeys: string[];
  size: "lg" | "sm";
}) {
  if (!cards.length) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border border-dashed border-emerald-50/25 bg-emerald-950/25 text-emerald-50/55",
          size === "lg" ? "h-24 w-48 text-sm" : "h-16 w-full text-xs",
        )}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        size === "lg" ? "min-h-28 gap-3" : "min-h-14 gap-1.5",
      )}
    >
      {cards.map((card, index) => (
        <PlayingCard
          card={card}
          isFresh={isFreshCard(animationKeys, ownerKeys, card, index)}
          index={index}
          key={`${cardKey(card)}:${index}`}
          size={size}
        />
      ))}
    </div>
  );
}

function PlayingCard({
  card,
  index,
  isFresh,
  size,
}: {
  card: BlackjackCardSnapshot;
  index: number;
  isFresh: boolean;
  size: "lg" | "sm";
}) {
  const cardClass =
    size === "lg"
      ? "h-[104px] w-[74px] rounded-lg"
      : "h-[58px] w-[42px] rounded-md";

  if (card.hidden) {
    return (
      <div
        aria-label="Hidden card"
        className={cn(
          "flex shrink-0 items-center justify-center border border-amber-200/40 bg-zinc-950 text-[10px] font-semibold text-amber-200 shadow-xl",
          isFresh &&
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-500",
          cardClass,
          index % 2 === 0 ? "rotate-[-3deg]" : "rotate-[3deg]",
        )}
      >
        BK
      </div>
    );
  }

  return (
    <Image
      alt={`${card.rank} of ${card.suit}`}
      className={cn(
        "h-auto shrink-0 shadow-xl",
        isFresh &&
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-500",
        cardClass,
        index % 2 === 0 ? "rotate-[-3deg]" : "rotate-[3deg]",
      )}
      height={588}
      src={`/cards/royal-noir/${card.rank}${suitCode(card.suit)}.svg`}
      width={420}
    />
  );
}

function FeltBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-xs font-medium text-white/75">
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isConnected = status === "connected";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold",
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
      <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="truncate text-xs font-semibold text-white">{value}</p>
    </div>
  );
}

function useCountdown(endsAt: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 500);

    return () => window.clearInterval(interval);
  }, [endsAt]);

  if (!endsAt) {
    return null;
  }

  const remainingMs = Math.max(0, new Date(endsAt).getTime() - now);
  const seconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const secondRemainder = seconds % 60;

  return `${minutes}:${String(secondRemainder).padStart(2, "0")}`;
}

function getActionPrompt({
  activeSeat,
  actions,
  connectionStatus,
  isReviewingRoundResult,
  selectedSeatNo,
  state,
}: {
  activeSeat: BlackjackSeatSnapshot | null;
  actions: BlackjackPlayerAction[];
  connectionStatus: string;
  isReviewingRoundResult: boolean;
  selectedSeatNo: number | null;
  state: BlackjackTableState | null;
}): ActionPrompt {
  if (connectionStatus !== "connected") {
    return {
      detail: "The table is opening a secure game socket.",
      title: "Connecting",
      tone: "neutral",
    };
  }

  if (!state) {
    return {
      detail: "Join the main table if state does not arrive automatically.",
      title: "Join table",
      tone: "neutral",
    };
  }

  if (isReviewingRoundResult) {
    return {
      detail: "Results are held briefly so you can check the dealer cards and payout.",
      title: "Review result",
      tone: "waiting",
    };
  }

  if (!activeSeat) {
    return {
      detail: `Seat ${selectedSeatNo ?? 1} is selected for this table.`,
      title: "Choose a seat",
      tone: "active",
    };
  }

  if (actions.length) {
    return {
      detail: `Seat ${activeSeat.seatNo} is waiting on a hand decision.`,
      title: "Your turn",
      tone: "active",
    };
  }

  if (activeSeat.handStatus === "WAITING_BET") {
    return {
      detail: `Limits are ${formatPoints(
        state.bettingLimits.minInitialBet,
      )} to ${formatPoints(state.bettingLimits.maxInitialBet)} points.`,
      title: "Place your bet",
      tone: "active",
    };
  }

  if (state.phase === "WAITING_BETS") {
    return {
      detail: "Your seat is in the betting window.",
      title: "Bet locked",
      tone: "waiting",
    };
  }

  if (state.phase === "SETTLED") {
    return {
      detail: "Settlement is complete and the table will reset for the next bet.",
      title: "Round settled",
      tone: "waiting",
    };
  }

  return {
    detail: phaseLabel(state.phase),
    title: "Table running",
    tone: "waiting",
  };
}

function phaseLabel(phase: BlackjackTablePhase) {
  const labels: Record<BlackjackTablePhase, string> = {
    CANCELLED: "Round cancelled.",
    DEALER_TURN: "Dealer is playing.",
    DEALING: "Cards are being dealt.",
    INSURANCE_DECISION: "Insurance decision window.",
    PLAYER_TURNS: "Waiting for the active player.",
    SETTLED: "Round settled.",
    SETTLING: "Round is settling.",
    WAITING: "Table is waiting.",
    WAITING_BETS: "Betting window is open.",
  };

  return labels[phase];
}

function isTableCommandLockedPhase(phase: BlackjackTablePhase | undefined) {
  return phase === "DEALING" || phase === "DEALER_TURN" || phase === "SETTLING";
}

type RoundResultRow = {
  handNo: number | null;
  netAmount: string | null;
  nickname: string;
  outcome: BlackjackSeatSnapshot["outcome"];
  reason: BlackjackSeatSnapshot["outcomeReason"];
  seatNo: number;
  userId: string;
};

function getRoundResults(state: BlackjackTableState): RoundResultRow[] {
  return state.seats.flatMap((seat) => {
    const handResults: RoundResultRow[] = seat.hands
      .filter(
        (hand) =>
          hand.outcome !== null ||
          hand.netAmount !== null ||
          hand.payoutAmount !== null,
      )
      .map((hand) => ({
        handNo: hand.handNo,
        netAmount: hand.netAmount,
        nickname: seat.nickname,
        outcome: hand.outcome,
        reason: hand.outcomeReason,
        seatNo: seat.seatNo,
        userId: seat.userId,
      }));

    if (handResults.length) {
      return handResults;
    }

    if (
      seat.outcome !== null ||
      seat.netAmount !== null ||
      seat.payoutAmount !== null
    ) {
      return [
        {
          handNo: null,
          netAmount: seat.netAmount,
          nickname: seat.nickname,
          outcome: seat.outcome,
          reason: seat.outcomeReason,
          seatNo: seat.seatNo,
          userId: seat.userId,
        },
      ];
    }

    return [];
  });
}

function formatOutcome(
  outcome: BlackjackSeatSnapshot["outcome"],
  reason: BlackjackSeatSnapshot["outcomeReason"],
) {
  const outcomeLabel = outcome
    ? outcome
        .toLowerCase()
        .split("_")
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ")
    : "Settled";

  if (!reason) {
    return outcomeLabel;
  }

  const reasonLabel = reason
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");

  return `${outcomeLabel} · ${reasonLabel}`;
}

function findActiveHand(seat: BlackjackSeatSnapshot) {
  return (
    seat.hands.find((hand) => hand.handNo === seat.activeHandNo) ??
    seat.hands.find((hand) => hand.isCurrentTurn)
  );
}

function parsePositiveInteger(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function formatPoints(value: string) {
  return pointFormatter.format(Number(value));
}

function formatNullablePoints(value: string | null) {
  return value ? `${formatPoints(value)} pts` : "-";
}

function formatSignedPoints(value: string) {
  const numericValue = Number(value);
  const sign = numericValue > 0 ? "+" : "";

  return `${sign}${formatPoints(value)} pts`;
}

function formatActionLabel(action: BlackjackPlayerAction) {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function cardKey(card: BlackjackCardSnapshot) {
  return card.hidden ? "hidden" : `${card.rank}${card.suit}`;
}

function isFreshCard(
  animationKeys: ReadonlySet<string>,
  ownerKeys: string[],
  card: BlackjackCardSnapshot,
  index: number,
) {
  const identity = cardKey(card);

  return ownerKeys.some(
    (ownerKey) =>
      animationKeys.has(`${ownerKey}:card`) ||
      animationKeys.has(`${ownerKey}:card:${identity}`) ||
      animationKeys.has(`${ownerKey}:card-index:${index}`),
  );
}

function extractCardAnimationKeys(event: BlackjackTableEventPayload) {
  const record = event as Record<string, unknown>;
  const type = String(record.type ?? "");

  if (!isCardRelatedEvent(type, record)) {
    return [];
  }

  const ownerKeys = extractCardOwnerKeys(record);
  const cards = extractCards(record);
  const cardIndex = readNumber(
    record.cardIndex ?? record.cardNo ?? record.position ?? record.index,
  );
  const keys = new Set<string>();

  for (const ownerKey of ownerKeys) {
    keys.add(`${ownerKey}:card`);

    if (cardIndex !== null) {
      keys.add(`${ownerKey}:card-index:${cardIndex}`);

      if (cardIndex > 0) {
        keys.add(`${ownerKey}:card-index:${cardIndex - 1}`);
      }
    }

    for (const card of cards) {
      keys.add(`${ownerKey}:card:${cardKey(card)}`);
    }
  }

  return [...keys];
}

function isCardRelatedEvent(type: string, record: Record<string, unknown>) {
  const normalizedType = type.toUpperCase();

  return (
    normalizedType.includes("CARD") ||
    normalizedType.includes("REVEAL") ||
    normalizedType.includes("HOLE") ||
    isRecord(record.card) ||
    Array.isArray(record.cards)
  );
}

function extractCardOwnerKeys(record: Record<string, unknown>) {
  const ownerKeys = new Set<string>();
  const type = String(record.type ?? "").toUpperCase();
  const target = String(
    record.target ?? record.targetType ?? record.owner ?? record.cardOwner ?? "",
  ).toUpperCase();
  const seatNo = readNumber(record.seatNo);
  const handNo = readNumber(record.handNo);

  if (
    type.includes("DEALER") ||
    type.includes("HOLE") ||
    target === "DEALER" ||
    isRecord(record.dealer)
  ) {
    ownerKeys.add("dealer");
  }

  if (seatNo !== null) {
    ownerKeys.add(`seat:${seatNo}`);

    if (handNo !== null) {
      ownerKeys.add(`seat:${seatNo}:hand:${handNo}`);
    }
  }

  if (!ownerKeys.size) {
    ownerKeys.add("table");
  }

  return [...ownerKeys];
}

function extractCards(record: Record<string, unknown>) {
  const cards: BlackjackCardSnapshot[] = [];

  if (isCardSnapshot(record.card)) {
    cards.push(record.card);
  }

  if (Array.isArray(record.cards)) {
    for (const card of record.cards) {
      if (isCardSnapshot(card)) {
        cards.push(card);
      }
    }
  }

  return cards;
}

function isCardSnapshot(value: unknown): value is BlackjackCardSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  if (value.hidden === true) {
    return true;
  }

  return typeof value.rank === "string" && typeof value.suit === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number(value);

    if (Number.isInteger(parsedValue)) {
      return parsedValue;
    }
  }

  return null;
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

function eventKey(event: BlackjackTableEventPayload) {
  return `${event.type}:${event.stateVersion}:${event.createdAt}:${event.seatNo ?? "table"}`;
}

function seatPositionClass(index: number) {
  const positions = [
    "left-1/2 bottom-[2%] -translate-x-1/2",
    "left-[6%] bottom-[13%]",
    "right-[6%] bottom-[13%]",
    "left-[16%] bottom-[38%]",
    "right-[16%] bottom-[38%]",
    "left-[34%] bottom-[0%]",
    "right-[34%] bottom-[0%]",
  ];

  return positions[index % positions.length];
}

const moneyChangingActions = new Set<BlackjackPlayerAction>([
  "DOUBLE",
  "SPLIT",
  "INSURANCE",
  "EVEN_MONEY",
]);
