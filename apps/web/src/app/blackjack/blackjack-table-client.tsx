"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  CircleDot,
  Coins,
  LogOut,
  PlugZap,
  RefreshCw,
  Sparkles,
  Timer,
  Undo2,
} from "lucide-react";
import {
  BLACKJACK_CLIENT_EVENTS,
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

type ChipHistoryEntry = {
  amount: string;
  bettingWindowKey: string;
  seatNo: number;
};

type TableCelebration = {
  detail: string;
  key: string;
  title: string;
  tone: "blackjack" | "twenty-one";
};

type DeckRemainingInfo = {
  deckCount: number | null;
  percentRemaining: number | null;
  remaining: number | null;
  total: number | null;
};

const pointFormatter = new Intl.NumberFormat("en-US");
const cardEventAnimationMs = 1400;
const tableCelebrationVisibleMs = 3000;
const quickBetAmounts = ["100", "500", "1000"] as const;
const tableSeatNumbers = [1, 2, 3, 4, 5, 6, 7] as const;
const celebrationParticles = [
  "left-[6%] top-[20%] bg-amber-200",
  "left-[18%] top-[70%] bg-emerald-200",
  "left-[32%] top-[10%] bg-white",
  "left-[72%] top-[18%] bg-amber-300",
  "left-[86%] top-[62%] bg-emerald-100",
  "left-[58%] top-[80%] bg-white",
] as const;

export function BlackjackTableClient({
  initialWalletBalance,
  userEmail,
  userName,
}: BlackjackTableClientProps) {
  const table = useBlackjackTable({ initialWalletBalance });
  const [seatBetDraftsByWindow, setSeatBetDraftsByWindow] = useState<
    Record<string, Record<number, string>>
  >({});
  const [chipHistory, setChipHistory] = useState<ChipHistoryEntry[]>([]);
  const [pendingSeatBets, setPendingSeatBets] = useState<
    Record<number, string>
  >({});
  const [selectedSeatNoOverride, setSelectedSeatNoOverride] = useState<
    number | null
  >(null);
  const visibleState = table.tableState;
  const bettingWindowKey = getBettingWindowKey(visibleState);
  const seatBetDrafts = bettingWindowKey
    ? seatBetDraftsByWindow[bettingWindowKey] ?? {}
    : {};
  const cardAnimationKeys = useCardEventAnimations(table.events);
  const mySeats = useMemo(
    () =>
      visibleState?.seats.filter((seat) => seat.userId === table.player?.id) ??
      [],
    [table.player?.id, visibleState?.seats],
  );
  const selectedSeatNo = selectedSeatNoOverride ?? mySeats[0]?.seatNo ?? null;
  const selectedSeat = mySeats.find((seat) => seat.seatNo === selectedSeatNo);
  const activeSeat =
    mySeats.find(
      (seat) =>
        seat.isCurrentTurn ||
        seat.activeHandNo !== null ||
        seat.hands.some((hand) => hand.isCurrentTurn),
    ) ??
    mySeats[0] ??
    null;
  const activeHand = activeSeat
    ? findActiveHand(activeSeat) ?? activeSeat.hands[0] ?? null
    : null;
  const availableActions =
    activeHand?.availableActions ?? activeSeat?.availableActions ?? [];
  const selectedBetDraft =
    selectedSeatNo !== null ? seatBetDrafts[selectedSeatNo] ?? "" : "";
  const bettingAmount = selectedBetDraft.trim();
  const isReviewingRoundResult = Boolean(table.roundResultReview);
  const isCommandLockedPhase = isTableCommandLockedPhase(visibleState?.phase);
  const canUseTable =
    table.connectionStatus === "connected" && visibleState?.status === "OPEN";
  const canUseSeatCommands =
    canUseTable && !isCommandLockedPhase && !isReviewingRoundResult;
  const canSendSeatCommand =
    canUseSeatCommands && selectedSeatNo !== null;
  const canSendPlayerAction =
    canUseTable &&
    !isCommandLockedPhase &&
    !isReviewingRoundResult &&
    availableActions.length > 0;
  const canJoinTable =
    table.connectionStatus === "connected" &&
    !isCommandLockedPhase &&
    !isReviewingRoundResult;
  const canStackChips =
    canSendSeatCommand &&
    visibleState?.phase === "WAITING_BETS" &&
    selectedSeat?.handStatus === "WAITING_BET" &&
    (selectedSeatNo === null || !pendingSeatBets[selectedSeatNo]);
  const canUndoChip =
    selectedSeatNo !== null &&
    !pendingSeatBets[selectedSeatNo] &&
    bettingWindowKey !== null &&
    chipHistory.some(
      (entry) =>
        entry.seatNo === selectedSeatNo &&
        entry.bettingWindowKey === bettingWindowKey,
    );
  const prompt = getActionPrompt({
    activeSeat,
    actions: availableActions,
    connectionStatus: table.connectionStatus,
    isReviewingRoundResult,
    selectedSeatNo,
    state: visibleState,
  });

  useEffect(() => {
    if (visibleState?.phase === "WAITING_BETS") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSeatBetDraftsByWindow((currentDraftsByWindow) =>
        Object.keys(currentDraftsByWindow).length ? {} : currentDraftsByWindow,
      );
      setChipHistory((currentHistory) =>
        currentHistory.length ? [] : currentHistory,
      );
      setPendingSeatBets((currentPendingBets) =>
        Object.keys(currentPendingBets).length ? {} : currentPendingBets,
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [visibleState?.phase]);

  useEffect(() => {
    if (!visibleState || !bettingWindowKey) {
      return;
    }

    const confirmedSeatNos = Object.keys(pendingSeatBets)
      .map(Number)
      .filter((seatNo) => {
        const seat = visibleState.seats.find((entry) => entry.seatNo === seatNo);

        return seat?.betAmount !== null && seat?.betAmount !== undefined;
      });

    if (confirmedSeatNos.length === 0) {
      return;
    }

    const confirmedSeatNoSet = new Set(confirmedSeatNos);
    const timeoutId = window.setTimeout(() => {
      setPendingSeatBets((currentPendingBets) => {
        const nextPendingBets = { ...currentPendingBets };

        confirmedSeatNos.forEach((seatNo) => {
          delete nextPendingBets[seatNo];
        });

        return nextPendingBets;
      });
      setSeatBetDraftsByWindow((currentDraftsByWindow) => {
        const currentDrafts = currentDraftsByWindow[bettingWindowKey];

        if (!currentDrafts) {
          return currentDraftsByWindow;
        }

        const nextDrafts = { ...currentDrafts };

        confirmedSeatNos.forEach((seatNo) => {
          delete nextDrafts[seatNo];
        });

        const nextDraftsByWindow = { ...currentDraftsByWindow };

        if (Object.keys(nextDrafts).length === 0) {
          delete nextDraftsByWindow[bettingWindowKey];
        } else {
          nextDraftsByWindow[bettingWindowKey] = nextDrafts;
        }

        return nextDraftsByWindow;
      });
      setChipHistory((currentHistory) =>
        currentHistory.filter(
          (entry) =>
            entry.bettingWindowKey !== bettingWindowKey ||
            !confirmedSeatNoSet.has(entry.seatNo),
        ),
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [bettingWindowKey, pendingSeatBets, visibleState]);

  useEffect(() => {
    if (
      table.connectionStatus === "connected" &&
      table.socketError?.event !== BLACKJACK_CLIENT_EVENTS.BET_PLACE
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPendingSeatBets((currentPendingBets) =>
        Object.keys(currentPendingBets).length ? {} : currentPendingBets,
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [table.connectionStatus, table.socketError]);

  function updateSeatBetDraft(seatNo: number | null, value: string) {
    if (seatNo === null || !bettingWindowKey) {
      return;
    }

    setSeatBetDraftsByWindow((currentDraftsByWindow) => {
      const currentDrafts = currentDraftsByWindow[bettingWindowKey] ?? {};
      const trimmedValue = value.trim();

      if (!trimmedValue) {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[seatNo];

        if (Object.keys(nextDrafts).length === 0) {
          const nextDraftsByWindow = { ...currentDraftsByWindow };
          delete nextDraftsByWindow[bettingWindowKey];
          return nextDraftsByWindow;
        }

        return {
          ...currentDraftsByWindow,
          [bettingWindowKey]: nextDrafts,
        };
      }

      return {
        ...currentDraftsByWindow,
        [bettingWindowKey]: {
          ...currentDrafts,
          [seatNo]: trimmedValue,
        },
      };
    });
  }

  function placeBetForSeat(seatNo: number, amount: string) {
    if (pendingSeatBets[seatNo]) {
      return;
    }

    setPendingSeatBets((currentPendingBets) => ({
      ...currentPendingBets,
      [seatNo]: amount,
    }));
    table.placeBet(seatNo, amount);
  }

  function addChipToSelectedSeat(amount: (typeof quickBetAmounts)[number]) {
    if (
      selectedSeatNo === null ||
      !visibleState ||
      !bettingWindowKey ||
      !canStackChips
    ) {
      return;
    }

    const nextAmount = addPointStrings(selectedBetDraft, amount);

    if (!canAddChipToStack(selectedBetDraft, amount, visibleState.bettingLimits)) {
      return;
    }

    updateSeatBetDraft(selectedSeatNo, nextAmount);
    setChipHistory((currentHistory) => [
      ...currentHistory,
      { amount, bettingWindowKey, seatNo: selectedSeatNo },
    ]);
  }

  function undoLastChipForSelectedSeat() {
    if (selectedSeatNo === null || !bettingWindowKey) {
      return;
    }

    const historyIndex = findLastChipHistoryIndex(
      chipHistory,
      selectedSeatNo,
      bettingWindowKey,
    );

    if (historyIndex === -1) {
      return;
    }

    const chipEntry = chipHistory[historyIndex];
    const nextAmount = subtractPointStrings(selectedBetDraft, chipEntry.amount);

    updateSeatBetDraft(selectedSeatNo, nextAmount === "0" ? "" : nextAmount);
    setChipHistory((currentHistory) => [
      ...currentHistory.slice(0, historyIndex),
      ...currentHistory.slice(historyIndex + 1),
    ]);
  }

  return (
    <main className="min-h-screen bg-[#07130f] pb-3 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-3 px-3 py-3 sm:px-4 lg:px-6">
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

        <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <CasinoTable
              cardAnimationKeys={cardAnimationKeys}
              canUseSeatCommands={canUseSeatCommands}
              myUserId={table.player?.id ?? null}
              onLeaveSeat={table.leaveSeat}
              onSeatClick={(seatNo, seat) => {
                setSelectedSeatNoOverride(seatNo);

                if (!canUseSeatCommands || !visibleState) {
                  return;
                }

                if (!seat) {
                  if (
                    visibleState.phase === "WAITING" ||
                    visibleState.phase === "WAITING_BETS"
                  ) {
                    table.takeSeat(seatNo);
                  }

                  return;
                }

                const seatBetAmount = (seatBetDrafts[seatNo] ?? "").trim();
                const isSeatBetAmountWithinLimits = isBetWithinLimits(
                  seatBetAmount,
                  visibleState.bettingLimits,
                );

                if (
                  seat.userId === table.player?.id &&
                  visibleState.phase === "WAITING_BETS" &&
                  seat.handStatus === "WAITING_BET" &&
                  !pendingSeatBets[seatNo] &&
                  seatBetAmount &&
                  isSeatBetAmountWithinLimits
                ) {
                  placeBetForSeat(seatNo, seatBetAmount);
                }
              }}
              roundResultReview={table.roundResultReview}
              selectedSeatNo={selectedSeatNo}
              pendingSeatBets={pendingSeatBets}
              seatBetDrafts={seatBetDrafts}
              state={visibleState}
            />
            <div className="sticky bottom-2 z-40 mt-2 rounded-[1.35rem] border border-white/10 bg-[#07130f]/94 p-2 shadow-2xl shadow-black/45 backdrop-blur-xl">
              <div className="grid gap-2 xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1fr)]">
                <ChipBox
                  canAddChips={canStackChips}
                  canUndo={canUndoChip}
                  selectedAmount={bettingAmount}
                  selectedSeatNo={selectedSeatNo}
                  limits={visibleState?.bettingLimits ?? null}
                  onAddChip={addChipToSelectedSeat}
                  onUndo={undoLastChipForSelectedSeat}
                />
                <TableActionBar
                  activeHand={activeHand}
                  activeSeat={activeSeat}
                  actions={availableActions}
                  canJoinTable={canJoinTable}
                  canSendPlayerAction={canSendPlayerAction}
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
                  onJoin={table.joinTable}
                  onReconnect={table.reconnect}
                  prompt={prompt}
                  state={visibleState}
                />
              </div>
            </div>
          </div>

          <aside className="min-w-0">
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
    <header className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5 shadow-2xl shadow-black/20 backdrop-blur md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
          aria-label="Back to home"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-normal sm:text-xl">
              BK Games Blackjack
            </h1>
            <StatusBadge status={connectionStatus} />
          </div>
          <p className="truncate text-sm text-white/55">
            {userName} · {userEmail}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 md:min-w-[370px]">
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5">
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
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5">
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

function CasinoTable({
  cardAnimationKeys,
  canUseSeatCommands,
  myUserId,
  onLeaveSeat,
  onSeatClick,
  pendingSeatBets,
  roundResultReview,
  selectedSeatNo,
  seatBetDrafts,
  state,
}: {
  cardAnimationKeys: ReadonlySet<string>;
  canUseSeatCommands: boolean;
  myUserId: string | null;
  onLeaveSeat: (seatNo: number) => void;
  onSeatClick: (seatNo: number, seat: BlackjackSeatSnapshot | null) => void;
  pendingSeatBets: Record<number, string>;
  roundResultReview: { endsAt: string; state: BlackjackTableState } | null;
  selectedSeatNo: number | null;
  seatBetDrafts: Record<number, string>;
  state: BlackjackTableState | null;
}) {
  const countdown = useCountdown(
    state?.timers.phaseEndsAt ?? null,
    state?.updatedAt ?? null,
  );
  const resultCountdown = useCountdown(roundResultReview?.endsAt ?? null);
  const seatsByNo = new Map(state?.seats.map((seat) => [seat.seatNo, seat]));
  const showBettingTimer = state?.phase === "WAITING_BETS";
  const celebration = getTableCelebration(state, myUserId);
  const [dismissedCelebrationKeys, setDismissedCelebrationKeys] = useState<
    string[]
  >([]);
  const celebrationKey = celebration?.key ?? null;
  const visibleCelebration =
    celebration && !dismissedCelebrationKeys.includes(celebration.key)
      ? celebration
      : null;
  const deckRemainingInfo = getDeckRemainingInfo(state);

  useEffect(() => {
    if (!celebrationKey || dismissedCelebrationKeys.includes(celebrationKey)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDismissedCelebrationKeys((currentKeys) =>
        currentKeys.includes(celebrationKey)
          ? currentKeys
          : [...currentKeys, celebrationKey].slice(-24),
      );
    }, tableCelebrationVisibleMs);

    return () => window.clearTimeout(timeoutId);
  }, [celebrationKey, dismissedCelebrationKeys]);

  return (
    <section className="relative h-[calc(100svh-19rem)] min-h-[390px] max-h-[660px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#10251d] p-3 shadow-2xl shadow-black/30 sm:h-[calc(100svh-18rem)] sm:min-h-[460px] sm:rounded-[2rem] sm:p-4 lg:h-[calc(100svh-16rem)] lg:min-h-[470px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(46,181,126,0.24),rgba(10,42,31,0)_42%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0))]" />
      <div className="absolute inset-x-5 bottom-5 top-12 rounded-[48%] border-[12px] border-[#2a1710] bg-[#0f6a4b] shadow-[inset_0_0_80px_rgba(0,0,0,0.35),0_30px_80px_rgba(0,0,0,0.35)] sm:inset-x-8 sm:bottom-7 sm:top-14 sm:border-[18px] lg:border-[22px]" />
      <div className="absolute inset-x-10 bottom-10 top-[5.5rem] rounded-[48%] border border-emerald-100/20 sm:inset-x-16 sm:bottom-14 sm:top-24" />

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

      <div className="absolute left-1/2 top-[15%] z-10 flex w-[min(76%,500px)] -translate-x-1/2 flex-col items-center gap-2 text-center sm:top-[16%]">
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

      <DeckRemainingMeter info={deckRemainingInfo} />

      {roundResultReview ? (
        <RoundResultTableOverlay
          countdown={resultCountdown}
          myUserId={myUserId}
          state={roundResultReview.state}
        />
      ) : (
        <div className="absolute left-1/2 top-[43%] z-10 -translate-x-1/2 text-center sm:top-[45%]">
          {showBettingTimer ? <BettingTimer countdown={countdown} /> : null}
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
      )}

      {!roundResultReview && visibleCelebration ? (
        <TableCelebrationOverlay
          celebration={visibleCelebration}
          key={visibleCelebration.key}
        />
      ) : null}

      <div className="absolute inset-x-3 bottom-3 z-20 overflow-x-auto pb-1 sm:inset-x-4 sm:bottom-4">
        <div className="grid min-w-[1120px] grid-cols-7 items-end gap-2 sm:min-w-[1260px] lg:min-w-[1365px]">
          {tableSeatNumbers.map((seatNo) => {
            const seat = seatsByNo.get(seatNo) ?? null;
            const draftBetAmount = seatBetDrafts[seatNo] ?? "";
            const pendingBetAmount = pendingSeatBets[seatNo] ?? "";
            const hasPendingBet = pendingBetAmount !== "";
            const isMine = seat?.userId === myUserId;
            const isSeatBettable =
              isMine &&
              state?.phase === "WAITING_BETS" &&
              seat?.handStatus === "WAITING_BET" &&
              !hasPendingBet &&
              draftBetAmount !== "" &&
              (state ? isBetWithinLimits(draftBetAmount, state.bettingLimits) : false);
            const canClickSeat =
              canUseSeatCommands &&
              !hasPendingBet &&
              Boolean(state) &&
              (seat
                ? isMine
                : state?.phase === "WAITING" || state?.phase === "WAITING_BETS");
            const actionLabel = seat
              ? isSeatBettable
                ? `Place ${formatBetAmountLabel(draftBetAmount)}`
                : null
              : "Take seat";

            return seat ? (
              <SeatSpot
                cardAnimationKeys={cardAnimationKeys}
                canLeaveSeat={canClickSeat && Boolean(isMine)}
                isClickEnabled={canClickSeat}
                isMine={isMine}
                isSelected={selectedSeatNo === seatNo}
                key={seat.seatNo}
                onClick={() => onSeatClick(seatNo, seat)}
                onLeaveSeat={() => onLeaveSeat(seatNo)}
                pendingBetAmount={pendingBetAmount}
                quickActionLabel={
                  hasPendingBet
                    ? "Processing bet"
                    : canClickSeat
                      ? actionLabel
                      : null
                }
                draftBetAmount={draftBetAmount}
                seat={seat}
              />
            ) : (
              <EmptySeatSpot
                isClickEnabled={canClickSeat}
                isSelected={selectedSeatNo === seatNo}
                key={seatNo}
                onClick={() => onSeatClick(seatNo, null)}
                seatNo={seatNo}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BettingTimer({ countdown }: { countdown: string | null }) {
  return (
    <div
      className="mx-auto mb-3 inline-flex min-w-40 flex-col items-center rounded-2xl border border-amber-200/55 bg-[#07130f]/78 px-4 py-3 text-amber-50 shadow-2xl shadow-black/35 backdrop-blur-md sm:min-w-48 sm:px-6 sm:py-4"
      role={countdown ? "timer" : "status"}
      aria-label={
        countdown ? `Betting closes in ${countdown}` : "Betting window open"
      }
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-100/75">
        <Timer className="size-4" />
        {countdown ? "Betting closes" : "Betting open"}
      </div>
      <div className="mt-1 font-mono text-4xl font-semibold leading-none tracking-normal text-amber-100 sm:text-6xl">
        {countdown ?? "Open"}
      </div>
    </div>
  );
}

function DeckRemainingMeter({ info }: { info: DeckRemainingInfo }) {
  const remaining = info.remaining;
  const percentRemaining = info.percentRemaining;
  const hasPercent = percentRemaining !== null;
  const deckLabel =
    info.deckCount !== null
      ? `${info.deckCount} deck${info.deckCount === 1 ? "" : "s"}`
      : info.total !== null
        ? `${pointFormatter.format(info.total)} card shoe`
        : null;
  const percentLabel = hasPercent
    ? `${Math.round(percentRemaining)}% left`
    : "Count unavailable";
  const cardLabel =
    remaining !== null && info.total !== null
      ? `${pointFormatter.format(remaining)} / ${pointFormatter.format(
          info.total,
        )} cards`
      : remaining !== null
        ? `${pointFormatter.format(remaining)} cards left`
        : null;
  const detailLabel =
    deckLabel && cardLabel
      ? `${deckLabel} · ${cardLabel}`
      : deckLabel ?? cardLabel;

  return (
    <div className="absolute right-4 top-20 z-20 hidden w-52 rounded-2xl border border-white/10 bg-[#06150f]/82 p-4 text-emerald-50 shadow-2xl shadow-black/30 backdrop-blur-md sm:right-8 sm:top-24 sm:block">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-100/55">
        Shoe
      </p>
      <p
        className={cn(
          "mt-1 font-semibold leading-none tracking-normal",
          hasPercent
            ? "font-mono text-3xl text-amber-100"
            : "text-sm text-emerald-50/70",
        )}
      >
        {percentLabel}
      </p>
      <div
        aria-label={
          hasPercent
            ? `${Math.round(percentRemaining)} percent of the shoe remaining`
            : "Shoe remaining percent waiting for server count"
        }
        className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={hasPercent ? Math.round(percentRemaining) : undefined}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            hasPercent
              ? "bg-gradient-to-r from-emerald-300 to-amber-200"
              : "w-1/3 bg-white/25",
          )}
          style={
            hasPercent
              ? {
                  width: `${percentRemaining}%`,
                }
              : undefined
          }
        />
      </div>
      {detailLabel ? (
        <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-white/45">
          {detailLabel}
        </p>
      ) : null}
    </div>
  );
}

function TableCelebrationOverlay({
  celebration,
}: {
  celebration: TableCelebration;
}) {
  const isBlackjack = celebration.tone === "blackjack";

  return (
    <div className="pointer-events-none absolute left-1/2 top-[38%] z-30 w-[min(92%,520px)] -translate-x-1/2 text-center">
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl border px-6 py-5 shadow-2xl shadow-black/40 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-500",
          isBlackjack
            ? "border-amber-200/80 bg-amber-200/[0.16] text-amber-50"
            : "border-emerald-100/75 bg-emerald-200/[0.14] text-emerald-50",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 opacity-35",
            isBlackjack
              ? "bg-[radial-gradient(circle_at_50%_20%,rgba(253,230,138,0.75),rgba(253,230,138,0)_42%)]"
              : "bg-[radial-gradient(circle_at_50%_20%,rgba(167,243,208,0.75),rgba(167,243,208,0)_42%)]",
          )}
        />
        <div className="absolute inset-0">
          {celebrationParticles.map((particleClass, index) => (
            <span
              aria-hidden="true"
              className={cn(
                "absolute size-2 rounded-full shadow-[0_0_18px_currentColor] motion-safe:animate-ping",
                particleClass,
              )}
              key={`${celebration.key}:${index}`}
              style={{
                animationDelay: `${index * 110}ms`,
                animationDuration: `${900 + index * 90}ms`,
              }}
            />
          ))}
        </div>
        <div className="relative flex flex-col items-center">
          <div
            className={cn(
              "mb-2 grid size-12 place-items-center rounded-full border motion-safe:animate-bounce",
              isBlackjack
                ? "border-amber-100/70 bg-amber-200 text-zinc-950"
                : "border-emerald-100/70 bg-emerald-200 text-zinc-950",
            )}
          >
            <Sparkles className="size-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
            {isBlackjack ? "Natural hit" : "Clean hand"}
          </p>
          <h2 className="mt-1 text-4xl font-semibold tracking-normal sm:text-5xl">
            {celebration.title}
          </h2>
          <p className="mt-2 text-sm font-medium text-white/75">
            {celebration.detail}
          </p>
        </div>
      </div>
    </div>
  );
}

function RoundResultTableOverlay({
  countdown,
  myUserId,
  state,
}: {
  countdown: string | null;
  myUserId: string | null;
  state: BlackjackTableState;
}) {
  const results = getRoundResults(state);
  const myResults = results.filter((result) => result.userId === myUserId);
  const headlineResults = myResults.length ? myResults : results.slice(0, 4);
  const dealerScore = state.dealer.score ?? state.dealer.visibleScore;

  return (
    <div
      className="absolute left-1/2 top-[39%] z-30 w-[min(90%,680px)] -translate-x-1/2 rounded-2xl border border-amber-200/50 bg-[#07130f]/92 p-4 text-amber-50 shadow-2xl shadow-black/45 backdrop-blur-md"
      role="status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-100/70">
            Round result
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal">
            Review the outcome
          </h2>
          <p className="mt-1 text-sm text-amber-50/70">
            Next round in {countdown ?? "a moment"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FeltBadge>Dealer {dealerScore ?? "-"}</FeltBadge>
          <FeltBadge>{state.phase}</FeltBadge>
        </div>
      </div>

      <div className="mt-4 grid max-h-[240px] gap-2 overflow-auto pr-1 sm:grid-cols-2">
        {headlineResults.length ? (
          headlineResults.map((result) => (
            <div
              className={cn(
                "rounded-xl border px-3 py-2",
                result.userId === myUserId
                  ? "border-amber-200/70 bg-amber-200/10"
                  : "border-white/10 bg-black/25",
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
              <p className="mt-1 text-xs text-amber-50/55">
                Score {formatScore(result.score, result.isSoft)}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-4 text-sm text-amber-50/70 sm:col-span-2">
            Settlement received. Check the cards before the next round.
          </div>
        )}
      </div>
    </div>
  );
}

function SeatSpot({
  cardAnimationKeys,
  canLeaveSeat,
  draftBetAmount,
  isClickEnabled,
  isMine,
  isSelected,
  onClick,
  onLeaveSeat,
  pendingBetAmount,
  quickActionLabel,
  seat,
}: {
  cardAnimationKeys: ReadonlySet<string>;
  canLeaveSeat: boolean;
  draftBetAmount: string;
  isClickEnabled: boolean;
  isMine: boolean;
  isSelected: boolean;
  onClick: () => void;
  onLeaveSeat: () => void;
  pendingBetAmount: string;
  quickActionLabel: string | null;
  seat: BlackjackSeatSnapshot;
}) {
  const activeHand = findActiveHand(seat) ?? seat.hands[0] ?? null;
  const hasSplitHands = seat.hands.length > 1;
  const hasPendingBet =
    pendingBetAmount.trim() !== "" && seat.betAmount === null;
  const hasDraftBet =
    !hasPendingBet &&
    draftBetAmount.trim() !== "" &&
    seat.betAmount === null;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-2xl border bg-[#06150f]/85 p-3 text-left text-white shadow-2xl backdrop-blur-md transition sm:gap-3",
        isMine ? "border-amber-300/80" : "border-white/15",
        isSelected && "ring-2 ring-emerald-200/80",
        seat.isCurrentTurn && "ring-2 ring-amber-200",
        isClickEnabled && "hover:border-amber-200 hover:bg-[#092116]/95",
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
        <MiniMetric
          label={hasPendingBet ? "Pending" : hasDraftBet ? "Stack" : "Bet"}
          value={
            hasPendingBet
              ? `${formatBetAmountLabel(pendingBetAmount)} pts`
              : hasDraftBet
              ? `${formatBetAmountLabel(draftBetAmount)} pts`
              : formatNullablePoints(seat.betAmount)
          }
        />
        <MiniMetric
          label={hasSplitHands ? "Active" : "Score"}
          value={formatHandScore(activeHand)}
        />
      </div>

      <SeatHands
        animationKeys={cardAnimationKeys}
        fallbackCards={seat.cards}
        seat={seat}
      />

      <div className="flex flex-wrap gap-1">
        <FeltBadge>{seat.handStatus}</FeltBadge>
        {hasSplitHands ? <FeltBadge>{seat.hands.length} hands</FeltBadge> : null}
        {seat.activeHandNo ? <FeltBadge>Hand {seat.activeHandNo}</FeltBadge> : null}
        {seat.outcome ? <FeltBadge>{seat.outcome}</FeltBadge> : null}
        {hasPendingBet ? <FeltBadge>Bet processing</FeltBadge> : null}
        {hasDraftBet ? (
          <FeltBadge>Stack {formatBetAmountLabel(draftBetAmount)}</FeltBadge>
        ) : null}
        {quickActionLabel ? <FeltBadge>{quickActionLabel}</FeltBadge> : null}
      </div>

      {isMine ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Button
            type="button"
            className={cn(
              "h-9 text-sm font-semibold text-zinc-950 sm:h-10",
              quickActionLabel
                ? "bg-amber-300 hover:bg-amber-200"
                : "bg-white hover:bg-emerald-50",
            )}
            disabled={!isClickEnabled}
            onClick={onClick}
          >
            {hasPendingBet ? (
              <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <CheckCircle className="size-4" />
            )}
            {quickActionLabel ?? "Select"}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 border-white/15 bg-white/10 text-white hover:bg-white/15 sm:h-10 sm:w-10"
            disabled={!canLeaveSeat}
            onClick={onLeaveSeat}
            aria-label={`Leave seat ${seat.seatNo}`}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SeatHands({
  animationKeys,
  fallbackCards,
  seat,
}: {
  animationKeys: ReadonlySet<string>;
  fallbackCards: BlackjackCardSnapshot[];
  seat: BlackjackSeatSnapshot;
}) {
  if (seat.hands.length > 1) {
    return (
      <div className="grid gap-2">
        {seat.hands.map((hand) => (
          <SeatHandPanel
            animationKeys={animationKeys}
            hand={hand}
            isActive={isSeatHandActive(seat, hand)}
            key={hand.handNo}
            seatNo={seat.seatNo}
          />
        ))}
      </div>
    );
  }

  const hand = seat.hands[0] ?? null;
  const cards = hand?.cards.length ? hand.cards : fallbackCards;
  const ownerKeys = [`seat:${seat.seatNo}`, "table"];

  if (hand) {
    ownerKeys.push(`seat:${seat.seatNo}:hand:${hand.handNo}`);
  }

  return (
    <CardFan
      animationKeys={animationKeys}
      cards={cards}
      emptyLabel="No cards"
      ownerKeys={ownerKeys}
      size="sm"
    />
  );
}

function SeatHandPanel({
  animationKeys,
  hand,
  isActive,
  seatNo,
}: {
  animationKeys: ReadonlySet<string>;
  hand: BlackjackHandSnapshot;
  isActive: boolean;
  seatNo: number;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-black/20 p-2 transition",
        isActive
          ? "border-amber-300/80 bg-amber-300/10 ring-1 ring-amber-200/50"
          : "border-white/10",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-white">Hand {hand.handNo}</span>
        <span className={isActive ? "text-amber-100" : "text-white/55"}>
          {isActive ? "Active" : formatEnumLabel(hand.handStatus)}
        </span>
      </div>
      <div className="overflow-x-auto pb-1">
        <CardFan
          animationKeys={animationKeys}
          cards={hand.cards}
          emptyLabel="No cards"
          ownerKeys={[
            `seat:${seatNo}`,
            `seat:${seatNo}:hand:${hand.handNo}`,
            "table",
          ]}
          size="sm"
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-white/55">
        <span>{formatHandScore(hand)}</span>
        <span>{formatNullablePoints(hand.betAmount)}</span>
      </div>
      {hand.outcome ? (
        <div className="mt-1 text-[11px] font-semibold text-amber-100">
          {formatEnumLabel(hand.outcome)}
        </div>
      ) : null}
    </div>
  );
}

function EmptySeatSpot({
  isClickEnabled,
  isSelected,
  onClick,
  seatNo,
}: {
  isClickEnabled: boolean;
  isSelected: boolean;
  onClick: () => void;
  seatNo: number;
}) {
  return (
    <button
      type="button"
      disabled={!isClickEnabled}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col items-center gap-2 rounded-full border border-dashed border-emerald-100/35 bg-emerald-950/30 px-3 py-4 text-center text-emerald-50/75 transition",
        isSelected && "border-emerald-100 bg-emerald-200/10 text-emerald-50",
        isClickEnabled
          ? "cursor-pointer hover:border-amber-200 hover:bg-amber-200/10 hover:text-amber-50"
          : "cursor-default disabled:opacity-70",
      )}
    >
      <p className="text-sm font-semibold">Seat {seatNo}</p>
      <p className="text-xs">Open</p>
      {isClickEnabled ? (
        <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-semibold text-zinc-950">
          Take seat
        </span>
      ) : null}
    </button>
  );
}

function ChipBox({
  canAddChips,
  canUndo,
  limits,
  onAddChip,
  onUndo,
  selectedAmount,
  selectedSeatNo,
}: {
  canAddChips: boolean;
  canUndo: boolean;
  limits: BlackjackTableState["bettingLimits"] | null;
  onAddChip: (value: (typeof quickBetAmounts)[number]) => void;
  onUndo: () => void;
  selectedAmount: string;
  selectedSeatNo: number | null;
}) {
  const stackAmount = selectedAmount.trim() || "0";

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2.5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Chip box</p>
          <p className="text-xs text-white/50">
            Seat {selectedSeatNo ?? "-"} · Stack {formatBetAmountLabel(stackAmount)} pts
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {quickBetAmounts.map((amount) => {
            const isDisabled =
              !canAddChips ||
              !limits ||
              !canAddChipToStack(stackAmount, amount, limits);

            return (
              <button
                type="button"
                disabled={isDisabled}
                key={amount}
                onClick={() => onAddChip(amount)}
                className={cn(
                  "grid size-12 place-items-center rounded-full border-[3px] text-xs font-bold shadow-xl transition sm:size-14 sm:text-sm",
                  chipColorClass(amount),
                  !isDisabled && "hover:-translate-y-0.5 hover:scale-105",
                  isDisabled && "cursor-not-allowed opacity-40 hover:translate-y-0",
                )}
              >
                {amount}
              </button>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="h-10 border-white/15 bg-white/10 text-white hover:bg-white/15"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 />
            Undo
          </Button>
        </div>
      </div>
    </section>
  );
}

function TableActionBar({
  activeHand,
  activeSeat,
  actions,
  canJoinTable,
  canSendPlayerAction,
  onAction,
  onJoin,
  onReconnect,
  prompt,
  state,
}: {
  activeHand: BlackjackHandSnapshot | null;
  activeSeat: BlackjackSeatSnapshot | null;
  actions: BlackjackPlayerAction[];
  canJoinTable: boolean;
  canSendPlayerAction: boolean;
  onAction: (action: BlackjackPlayerAction) => void;
  onJoin: () => void;
  onReconnect: () => void;
  prompt: ActionPrompt;
  state: BlackjackTableState | null;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 shadow-2xl shadow-black/25 backdrop-blur">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-[0.18em]",
              prompt.tone === "active" && "text-amber-200",
              prompt.tone === "waiting" && "text-emerald-200",
              prompt.tone === "warning" && "text-red-200",
              prompt.tone === "neutral" && "text-white/60",
            )}
          >
            Next move
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-normal sm:text-xl">
            {prompt.title}
          </h2>
          <p className="mt-1 hidden text-sm leading-5 text-white/62 sm:block">
            {prompt.detail}
          </p>
          {activeSeat && activeSeat.hands.length > 1 ? (
            <div className="mt-3 max-w-2xl">
              <ActionHandSummary activeSeat={activeSeat} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <FeltBadge>
              {activeSeat
                ? `Seat ${activeSeat.seatNo} · Hand ${activeHand?.handNo ?? "-"}`
                : "No active seat"}
          </FeltBadge>
          {actions.length ? (
            <>
              {actions.map((action) => (
                <Button
                  key={action}
                  type="button"
                  className={cn(
                    "h-10 min-w-20 px-3 font-semibold sm:h-11 sm:min-w-24",
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
            </>
          ) : (
            <div className="rounded-full border border-dashed border-white/15 px-3 py-2 text-sm text-white/55">
              {state ? phaseLabel(state.phase) : "Waiting for table state"}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-10 border-white/15 bg-white/10 text-white hover:bg-white/15 sm:h-11"
            disabled={!canJoinTable}
            onClick={onJoin}
          >
            <PlugZap className="size-4" />
            Join
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-10 w-10 border-white/15 bg-white/10 text-white hover:bg-white/15 sm:h-11 sm:w-11"
            onClick={onReconnect}
            aria-label="Reconnect"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function ActionHandSummary({
  activeSeat,
}: {
  activeSeat: BlackjackSeatSnapshot;
}) {
  return (
    <div className="mb-3 grid gap-2">
      {activeSeat.hands.map((hand) => {
        const isActive = isSeatHandActive(activeSeat, hand);

        return (
          <div
            className={cn(
              "rounded-xl border px-3 py-2 text-xs",
              isActive
                ? "border-amber-300/70 bg-amber-300/10 text-amber-50"
                : "border-white/10 bg-white/[0.04] text-white/60",
            )}
            key={hand.handNo}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Hand {hand.handNo}</span>
              <span>
                {isActive ? "Current turn" : formatEnumLabel(hand.handStatus)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{formatHandScore(hand)}</span>
              <span>{formatNullablePoints(hand.betAmount)}</span>
              {hand.outcome ? <span>{formatEnumLabel(hand.outcome)}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventStream({ events }: { events: BlackjackTableEventPayload[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Table events</h2>
        <FeltBadge>{events.length}</FeltBadge>
      </div>
      <div className="flex max-h-[180px] flex-col gap-2 overflow-auto pr-1 xl:max-h-[calc(100svh-11rem)]">
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
          size === "lg"
            ? "h-20 w-40 text-sm sm:h-24 sm:w-48"
            : "h-14 w-full text-xs sm:h-16",
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
        size === "lg" ? "min-h-24 gap-2 sm:min-h-28 sm:gap-3" : "min-h-12 gap-1.5 sm:min-h-14",
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

function dealtCardAnimationClass(size: "lg" | "sm") {
  return cn(
    "will-change-transform motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:ease-out motion-safe:[animation-fill-mode:both]",
    size === "lg" ? "motion-safe:duration-300" : "motion-safe:duration-[250ms]",
  );
}

function dealtCardAnimationStyle(index: number) {
  return {
    animationDelay: `${Math.min(index * 85, 255)}ms`,
  };
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
      ? "h-[86px] w-[62px] rounded-lg sm:h-[104px] sm:w-[74px]"
      : "h-[50px] w-[36px] rounded-md sm:h-[58px] sm:w-[42px]";

  if (card.hidden) {
    return (
      <div
        aria-label="Hidden card"
        className={cn(
          "flex shrink-0 items-center justify-center border border-amber-200/40 bg-zinc-950 text-[10px] font-semibold text-amber-200 shadow-xl",
          isFresh && dealtCardAnimationClass(size),
          cardClass,
          index % 2 === 0 ? "rotate-[-3deg]" : "rotate-[3deg]",
        )}
        style={isFresh ? dealtCardAnimationStyle(index) : undefined}
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
        isFresh && dealtCardAnimationClass(size),
        cardClass,
        index % 2 === 0 ? "rotate-[-3deg]" : "rotate-[3deg]",
      )}
      height={588}
      src={`/cards/royal-noir/${card.rank}${suitCode(card.suit)}.svg`}
      style={isFresh ? dealtCardAnimationStyle(index) : undefined}
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

function useCountdown(endsAt: string | null, initialNow?: string | null) {
  const [clock, setClock] = useState(() => ({
    endsAt,
    nowMs: Date.now(),
  }));

  useEffect(() => {
    if (!endsAt) {
      return;
    }

    const syncTimeout = window.setTimeout(() => {
      setClock({
        endsAt,
        nowMs: Date.now(),
      });
    }, 0);
    const interval = window.setInterval(() => {
      setClock({
        endsAt,
        nowMs: Date.now(),
      });
    }, 500);

    return () => {
      window.clearTimeout(syncTimeout);
      window.clearInterval(interval);
    };
  }, [endsAt]);

  if (!endsAt) {
    return null;
  }

  const initialNowMs = readTimestamp(initialNow);
  const nowMs =
    clock.endsAt === endsAt ? clock.nowMs : (initialNowMs ?? clock.nowMs);
  const remainingMs = Math.max(0, new Date(endsAt).getTime() - nowMs);
  const seconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const secondRemainder = seconds % 60;

  return `${minutes}:${String(secondRemainder).padStart(2, "0")}`;
}

function readTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
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
      detail: selectedSeatNo
        ? `Seat ${selectedSeatNo} is selected for this table.`
        : "No seat selected.",
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
  isSoft: boolean;
  netAmount: string | null;
  nickname: string;
  outcome: BlackjackSeatSnapshot["outcome"];
  reason: BlackjackSeatSnapshot["outcomeReason"];
  score: number | null;
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
        isSoft: hand.isSoft,
        netAmount: hand.netAmount,
        nickname: seat.nickname,
        outcome: hand.outcome,
        reason: hand.outcomeReason,
        score: hand.score,
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
          isSoft: seat.isSoft,
          netAmount: seat.netAmount,
          nickname: seat.nickname,
          outcome: seat.outcome,
          reason: seat.outcomeReason,
          score: seat.score,
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

function isSeatHandActive(
  seat: BlackjackSeatSnapshot,
  hand: BlackjackHandSnapshot,
) {
  return hand.handNo === seat.activeHandNo || hand.isCurrentTurn;
}

function formatPoints(value: string) {
  return pointFormatter.format(Number(value));
}

function formatBetAmountLabel(value: string) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value.trim() || "-";
  }

  return pointFormatter.format(numericValue);
}

function formatNullablePoints(value: string | null) {
  return value ? `${formatPoints(value)} pts` : "-";
}

function formatHandScore(hand: BlackjackHandSnapshot | null) {
  return hand ? formatScore(hand.score, hand.isSoft) : "-";
}

function formatScore(score: number | null, isSoft: boolean) {
  if (score === null) {
    return "-";
  }

  return `${score}${isSoft ? " soft" : ""}`;
}

function formatSignedPoints(value: string) {
  const numericValue = Number(value);
  const sign = numericValue > 0 ? "+" : "";

  return `${sign}${formatPoints(value)} pts`;
}

function formatActionLabel(action: BlackjackPlayerAction) {
  return formatEnumLabel(action);
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function isBetWithinLimits(
  amount: string,
  limits: BlackjackTableState["bettingLimits"],
) {
  const numericAmount = Number(amount);
  const minBet = Number(limits.minInitialBet);
  const maxBet = Number(limits.maxInitialBet);

  return (
    Number.isInteger(numericAmount) &&
    numericAmount >= minBet &&
    numericAmount <= maxBet
  );
}

function canAddChipToStack(
  currentAmount: string,
  chipAmount: string,
  limits: BlackjackTableState["bettingLimits"],
) {
  const nextAmount = Number(addPointStrings(currentAmount, chipAmount));
  const maxBet = Number(limits.maxInitialBet);

  return Number.isInteger(nextAmount) && nextAmount > 0 && nextAmount <= maxBet;
}

function addPointStrings(currentAmount: string, amountToAdd: string) {
  const currentValue = Number(currentAmount || "0");
  const addedValue = Number(amountToAdd);

  if (!Number.isFinite(currentValue) || !Number.isFinite(addedValue)) {
    return currentAmount || "0";
  }

  return String(currentValue + addedValue);
}

function subtractPointStrings(currentAmount: string, amountToSubtract: string) {
  const currentValue = Number(currentAmount || "0");
  const subtractedValue = Number(amountToSubtract);

  if (!Number.isFinite(currentValue) || !Number.isFinite(subtractedValue)) {
    return currentAmount || "0";
  }

  return String(Math.max(0, currentValue - subtractedValue));
}

function findLastChipHistoryIndex(
  history: ChipHistoryEntry[],
  seatNo: number,
  bettingWindowKey: string,
) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];

    if (entry?.seatNo === seatNo && entry.bettingWindowKey === bettingWindowKey) {
      return index;
    }
  }

  return -1;
}

function getBettingWindowKey(state: BlackjackTableState | null) {
  if (!state || state.phase !== "WAITING_BETS") {
    return null;
  }

  return [
    state.tableId,
    state.round?.roundId ?? "pending-round",
  ].join(":");
}

function getDeckRemainingInfo(
  state: BlackjackTableState | null,
): DeckRemainingInfo {
  if (!state) {
    return {
      deckCount: null,
      percentRemaining: null,
      remaining: null,
      total: null,
    };
  }

  const record = state as Record<string, unknown>;
  const shoe = isRecord(record.shoe) ? record.shoe : null;
  const deck = isRecord(record.deck) ? record.deck : null;
  const remaining =
    readNumber(record.shoeRemaining) ??
    readNumber(record.cardsRemaining) ??
    readNumber(record.remainingCards) ??
    readNumber(record.deckRemaining) ??
    readNumber(shoe?.remaining) ??
    readNumber(shoe?.cardsRemaining) ??
    readNumber(deck?.remaining) ??
    null;
  const total =
    readNumber(record.shoeSize) ??
    readNumber(record.totalCards) ??
    readNumber(record.deckSize) ??
    readNumber(shoe?.total) ??
    readNumber(shoe?.size) ??
    readNumber(deck?.total) ??
    null;
  const deckCount =
    readNumber(record.deckCount) ??
    readNumber(record.shoeDeckCount) ??
    readNumber(record.shoeDecks) ??
    readNumber(record.decks) ??
    readNumber(shoe?.deckCount) ??
    readNumber(shoe?.decks) ??
    readNumber(deck?.deckCount) ??
    inferDeckCount(total);
  const rawPercent =
    readFiniteNumber(record.shoeRemainingPercent) ??
    readFiniteNumber(record.remainingPercent) ??
    readFiniteNumber(record.deckRemainingPercent) ??
    readFiniteNumber(shoe?.remainingPercent) ??
    readFiniteNumber(shoe?.percentRemaining) ??
    readFiniteNumber(deck?.remainingPercent) ??
    null;
  const percentRemaining =
    remaining !== null && total
      ? clampPercent((remaining / total) * 100)
      : normalizePercent(rawPercent);

  return {
    deckCount,
    percentRemaining,
    remaining,
    total,
  };
}

function inferDeckCount(total: number | null) {
  const cardsPerDeck = 52;

  if (!total || total % cardsPerDeck !== 0) {
    return null;
  }

  return total / cardsPerDeck;
}

function normalizePercent(value: number | null) {
  if (value === null) {
    return null;
  }

  return clampPercent(value <= 1 ? value * 100 : value);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function getTableCelebration(
  state: BlackjackTableState | null,
  myUserId: string | null,
): TableCelebration | null {
  if (!state || !myUserId || state.phase === "WAITING_BETS") {
    return null;
  }

  let twentyOneCelebration: TableCelebration | null = null;

  for (const seat of state.seats) {
    if (seat.userId !== myUserId) {
      continue;
    }

    for (const hand of seat.hands) {
      const celebration = getHandCelebration(state, seat, hand);

      if (!celebration) {
        continue;
      }

      if (celebration.tone === "blackjack") {
        return celebration;
      }

      twentyOneCelebration ??= celebration;
    }
  }

  return twentyOneCelebration;
}

function getHandCelebration(
  state: BlackjackTableState,
  seat: BlackjackSeatSnapshot,
  hand: BlackjackHandSnapshot,
): TableCelebration | null {
  if (hand.score !== 21 || hand.cards.length === 0) {
    return null;
  }

  const handLabel = `Seat ${seat.seatNo} · Hand ${hand.handNo}`;
  const betLabel = formatNullablePoints(hand.betAmount);
  const cardSignature = hand.cards.map(cardKey).join("-");
  const baseKey = [
    state.tableId,
    state.round?.roundId ?? "no-round",
    seat.seatNo,
    hand.handNo,
    cardSignature,
  ].join(":");
  const isNaturalBlackjack =
    hand.outcomeReason === "NATURAL_BLACKJACK" ||
    (seat.hands.length === 1 && hand.cards.length === 2);

  if (isNaturalBlackjack) {
    return {
      detail: `${handLabel} · ${betLabel}`,
      key: `${baseKey}:blackjack`,
      title: "Blackjack!",
      tone: "blackjack",
    };
  }

  return {
    detail: `${handLabel} · ${betLabel}`,
    key: `${baseKey}:twenty-one`,
    title: "Nice 21",
    tone: "twenty-one",
  };
}

function chipColorClass(amount: (typeof quickBetAmounts)[number]) {
  const colors: Record<(typeof quickBetAmounts)[number], string> = {
    "100": "border-emerald-100 bg-emerald-700 text-white",
    "500": "border-amber-100 bg-amber-400 text-zinc-950",
    "1000": "border-sky-100 bg-sky-700 text-white",
  };

  return colors[amount];
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

function readFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue)) {
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

const moneyChangingActions = new Set<BlackjackPlayerAction>([
  "DOUBLE",
  "SPLIT",
  "INSURANCE",
  "EVEN_MONEY",
]);
