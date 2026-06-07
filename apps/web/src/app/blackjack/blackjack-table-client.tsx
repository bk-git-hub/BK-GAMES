"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CircleDot,
  Coins,
  PlugZap,
  RefreshCw,
  Send,
} from "lucide-react";
import {
  type BlackjackCardSnapshot,
  type BlackjackHandSnapshot,
  type BlackjackPlayerAction,
  type BlackjackSeatSnapshot,
  type BlackjackTableEventPayload,
  type BlackjackTableState,
  type BlackjackWalletUpdatedPayload,
} from "@bk-games/shared/src/socket-events";

import { useBlackjackTable } from "./use-blackjack-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type BlackjackTableClientProps = {
  initialWalletBalance: string;
  userEmail: string;
  userName: string;
};

const pointFormatter = new Intl.NumberFormat("en-US");

export function BlackjackTableClient({
  initialWalletBalance,
  userEmail,
  userName,
}: BlackjackTableClientProps) {
  const table = useBlackjackTable({ initialWalletBalance });
  const [betAmount, setBetAmount] = useState("");
  const [seatNoInput, setSeatNoInput] = useState("");
  const mySeats = useMemo(
    () =>
      table.tableState?.seats.filter(
        (seat) => seat.userId === table.player?.id,
      ) ?? [],
    [table.player?.id, table.tableState?.seats],
  );
  const selectedSeatNo =
    parsePositiveInteger(seatNoInput) ?? mySeats[0]?.seatNo ?? null;
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
    betAmount.trim() || table.tableState?.bettingLimits.minInitialBet || "";
  const canSendSeatCommand =
    table.connectionStatus === "connected" && selectedSeatNo !== null;
  const canBet =
    canSendSeatCommand &&
    Boolean(bettingAmount) &&
    mySeats.some((seat) => seat.seatNo === selectedSeatNo);

  return (
    <main className="bg-background text-foreground min-h-screen">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              href="/lobby"
              className="text-muted-foreground flex w-fit items-center gap-2 text-sm font-medium"
            >
              <ArrowLeft />
              Lobby
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-normal">
                Blackjack table
              </h1>
              <StatusBadge status={table.connectionStatus} />
            </div>
            <p className="text-muted-foreground text-sm">
              {userName} · {userEmail}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[360px]">
            <WalletPanel
              balance={table.walletBalance}
              update={table.lastWalletUpdate}
            />
            <ConnectionPanel
              message={table.statusMessage}
              onJoin={table.joinTable}
              onReconnect={table.reconnect}
              status={table.connectionStatus}
            />
          </div>
        </header>

        {table.socketError ? (
          <div
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
            role="alert"
          >
            {table.socketError.code}: {table.socketError.message}
          </div>
        ) : null}

        {table.roundNotice ? (
          <div className="bg-muted text-muted-foreground rounded-lg border px-3 py-2 text-sm">
            {table.roundNotice}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-4">
            <TableStatus state={table.tableState} />
            <DealerPanel state={table.tableState} />
            <SeatGrid
              myUserId={table.player?.id ?? null}
              onLeaveSeat={table.leaveSeat}
              seats={table.tableState?.seats ?? []}
            />
          </div>

          <aside className="flex flex-col gap-4">
            <SeatControls
              betAmount={betAmount}
              canBet={canBet}
              canSendSeatCommand={canSendSeatCommand}
              onBetAmountChange={setBetAmount}
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
              onSeatNoChange={setSeatNoInput}
              onTakeSeat={() => {
                if (selectedSeatNo !== null) {
                  table.takeSeat(selectedSeatNo);
                }
              }}
              seatNoInput={seatNoInput}
              selectedSeatNo={selectedSeatNo}
              state={table.tableState}
            />
            <ActionControls
              activeHand={activeHand}
              activeSeat={activeSeat}
              actions={availableActions}
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
            />
            <EventStream events={table.events} />
          </aside>
        </div>
      </section>
    </main>
  );
}

function WalletPanel({
  balance,
  update,
}: {
  balance: string;
  update: BlackjackWalletUpdatedPayload | null;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Coins />
          <CardTitle>Wallet</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-lg font-semibold">{formatPoints(balance)} pts</p>
        <p className="text-muted-foreground text-xs">
          {update
            ? `${update.reason} ${formatSignedPoints(update.delta)}`
            : "Waiting for private wallet updates."}
        </p>
      </CardContent>
    </Card>
  );
}

function ConnectionPanel({
  message,
  onJoin,
  onReconnect,
  status,
}: {
  message: string | null;
  onJoin: () => void;
  onReconnect: () => void;
  status: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <PlugZap />
          <CardTitle>Connection</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          {message ?? status.replaceAll("-", " ")}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onJoin}
            disabled={status !== "connected"}
          >
            <Send />
            Join main
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onReconnect}>
            <RefreshCw />
            Reconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TableStatus({ state }: { state: BlackjackTableState | null }) {
  const countdown = useCountdown(state?.timers.phaseEndsAt ?? null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Table main</CardTitle>
          <CardDescription>
            Version {state?.version ?? "-"} · Updated{" "}
            {state ? formatTime(state.updatedAt) : "-"}
          </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{state?.status ?? "NO_STATE"}</Badge>
            <Badge variant="outline">{state?.phase ?? "CONNECTING"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border px-3 py-2">
          <p className="text-sm font-medium">Betting timer</p>
          <p className="text-muted-foreground text-sm">
            {countdown ?? "No active betting window"}
          </p>
        </div>
        <div className="rounded-lg border px-3 py-2">
          <p className="text-sm font-medium">Betting limits</p>
          <p className="text-muted-foreground text-sm">
            {state
              ? `${formatPoints(state.bettingLimits.minInitialBet)} - ${formatPoints(
                  state.bettingLimits.maxInitialBet,
                )} pts`
              : "Waiting for table state"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DealerPanel({ state }: { state: BlackjackTableState | null }) {
  const dealer = state?.dealer;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Dealer</CardTitle>
            <CardDescription>
              Visible score {dealer?.visibleScore ?? "-"} · Final score{" "}
              {dealer?.score ?? "-"}
            </CardDescription>
          </div>
          <Badge variant="outline">{dealer?.cards.length ?? 0} cards</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <CardRow cards={dealer?.cards ?? []} emptyLabel="Dealer has no cards" />
      </CardContent>
    </Card>
  );
}

function SeatGrid({
  myUserId,
  onLeaveSeat,
  seats,
}: {
  myUserId: string | null;
  onLeaveSeat: (seatNo: number) => void;
  seats: BlackjackSeatSnapshot[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Seats</CardTitle>
            <CardDescription>Current players at this table</CardDescription>
          </div>
          <Badge variant="secondary">{seats.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {seats.length ? (
          seats.map((seat) => (
            <SeatCard
              key={seat.seatNo}
              isMine={seat.userId === myUserId}
              onLeaveSeat={onLeaveSeat}
              seat={seat}
            />
          ))
        ) : (
          <p className="text-muted-foreground rounded-lg border px-3 py-4 text-sm md:col-span-2">
            No occupied seats yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SeatCard({
  isMine,
  onLeaveSeat,
  seat,
}: {
  isMine: boolean;
  onLeaveSeat: (seatNo: number) => void;
  seat: BlackjackSeatSnapshot;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3",
        seat.isCurrentTurn && "ring-ring ring-2",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">Seat {seat.seatNo}</h2>
            {isMine ? <Badge variant="default">You</Badge> : null}
            {seat.isCurrentTurn ? <Badge variant="secondary">Turn</Badge> : null}
          </div>
          <p className="text-muted-foreground truncate text-sm">
            {seat.nickname}
          </p>
        </div>
        <Badge variant={seat.connected ? "outline" : "destructive"}>
          {seat.connected ? "Connected" : "Offline"}
        </Badge>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <Metric label="Status" value={seat.handStatus} />
        <Metric label="Bet" value={formatNullablePoints(seat.betAmount)} />
        <Metric
          label="Active hand"
          value={seat.activeHandNo ? `#${seat.activeHandNo}` : "-"}
        />
        <Metric
          label="Score"
          value={seat.score ? `${seat.score}${seat.isSoft ? " soft" : ""}` : "-"}
        />
      </div>

      <CardRow cards={seat.cards} emptyLabel="No cards" />
      <HandList hands={seat.hands} />

      {isMine ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => onLeaveSeat(seat.seatNo)}
        >
          Leave seat
        </Button>
      ) : null}
    </article>
  );
}

function HandList({ hands }: { hands: BlackjackHandSnapshot[] }) {
  if (!hands.length) {
    return (
      <p className="text-muted-foreground rounded-lg border px-3 py-2 text-sm">
        No active hands.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {hands.map((hand) => (
        <div
          key={hand.handNo}
          className={cn(
            "flex flex-col gap-2 rounded-lg border px-3 py-2",
            hand.isCurrentTurn && "bg-muted",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Hand {hand.handNo}</span>
              <Badge variant="outline">{hand.handStatus}</Badge>
              {hand.isCurrentTurn ? <Badge variant="secondary">Active</Badge> : null}
            </div>
            <span className="text-muted-foreground text-xs">
              {formatPoints(hand.betAmount)} pts
            </span>
          </div>
          <CardRow cards={hand.cards} emptyLabel="No cards" />
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <Metric
              label="Score"
              value={
                hand.score ? `${hand.score}${hand.isSoft ? " soft" : ""}` : "-"
              }
            />
            <Metric label="Outcome" value={hand.outcome ?? "-"} />
            <Metric label="Payout" value={formatNullablePoints(hand.payoutAmount)} />
            <Metric label="Net" value={formatNullablePoints(hand.netAmount)} />
          </div>
          {hand.availableActions.length ? (
            <div className="flex flex-wrap gap-1">
              {hand.availableActions.map((action) => (
                <Badge key={action} variant="secondary">
                  {formatActionLabel(action)}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SeatControls({
  betAmount,
  canBet,
  canSendSeatCommand,
  onBetAmountChange,
  onLeaveSeat,
  onPlaceBet,
  onSeatNoChange,
  onTakeSeat,
  seatNoInput,
  selectedSeatNo,
  state,
}: {
  betAmount: string;
  canBet: boolean;
  canSendSeatCommand: boolean;
  onBetAmountChange: (value: string) => void;
  onLeaveSeat: () => void;
  onPlaceBet: () => void;
  onSeatNoChange: (value: string) => void;
  onTakeSeat: () => void;
  seatNoInput: string;
  selectedSeatNo: number | null;
  state: BlackjackTableState | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Seat and bet</CardTitle>
        <CardDescription>Seat selection and initial wager</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Seat number
          <Input
            inputMode="numeric"
            min={1}
            pattern="[0-9]*"
            placeholder={selectedSeatNo ? String(selectedSeatNo) : "Seat"}
            type="number"
            value={seatNoInput}
            onChange={(event) => onSeatNoChange(event.target.value)}
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canSendSeatCommand}
            onClick={onTakeSeat}
          >
            Take seat
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canSendSeatCommand}
            onClick={onLeaveSeat}
          >
            Leave seat
          </Button>
        </div>
        <Separator />
        <label className="flex flex-col gap-1 text-sm">
          Bet amount
          <Input
            inputMode="numeric"
            min={1}
            pattern="[0-9]*"
            placeholder={state?.bettingLimits.minInitialBet ?? "Amount"}
            type="number"
            value={betAmount}
            onChange={(event) => onBetAmountChange(event.target.value)}
          />
        </label>
        <Button type="button" disabled={!canBet} onClick={onPlaceBet}>
          Place bet
        </Button>
      </CardContent>
    </Card>
  );
}

function ActionControls({
  activeHand,
  activeSeat,
  actions,
  onAction,
}: {
  activeHand: BlackjackHandSnapshot | null;
  activeSeat: BlackjackSeatSnapshot | null;
  actions: BlackjackPlayerAction[];
  onAction: (action: BlackjackPlayerAction) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
        <CardDescription>
          {activeSeat
            ? `Seat ${activeSeat.seatNo}, hand ${activeHand?.handNo ?? "-"}`
            : "No owned active seat"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {actions.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {actions.map((action) => (
              <Button
                key={action}
                type="button"
                variant={moneyChangingActions.has(action) ? "default" : "outline"}
                onClick={() => onAction(action)}
              >
                {formatActionLabel(action)}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground rounded-lg border px-3 py-3 text-sm">
            No actions available.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EventStream({ events }: { events: BlackjackTableEventPayload[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Events</CardTitle>
        <CardDescription>Latest table events</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {events.length ? (
          events.map((event) => <EventRow event={event} key={eventKey(event)} />)
        ) : (
          <p className="text-muted-foreground rounded-lg border px-3 py-3 text-sm">
            No table events yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EventRow({ event }: { event: BlackjackTableEventPayload }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge
          variant={
            event.type === "ROUND_SETTLED" || event.type === "ROUND_RESET"
              ? "default"
              : "secondary"
          }
        >
          {event.type}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {formatTime(event.createdAt)}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        Seat {event.seatNo ?? "-"} · v{event.stateVersion}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isConnected = status === "connected";

  return (
    <Badge variant={isConnected ? "default" : "outline"}>
      <CircleDot />
      {status.replaceAll("-", " ")}
    </Badge>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2 py-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function CardRow({
  cards,
  emptyLabel,
}: {
  cards: BlackjackCardSnapshot[];
  emptyLabel: string;
}) {
  if (!cards.length) {
    return (
      <p className="text-muted-foreground rounded-lg border px-3 py-2 text-sm">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex min-h-24 flex-wrap items-center gap-2">
      {cards.map((card, index) => (
        <PlayingCard card={card} index={index} key={`${cardKey(card)}:${index}`} />
      ))}
    </div>
  );
}

function PlayingCard({
  card,
  index,
}: {
  card: BlackjackCardSnapshot;
  index: number;
}) {
  if (card.hidden) {
    return (
      <div
        aria-label="Hidden card"
        className="bg-muted flex h-[88px] w-[63px] shrink-0 items-center justify-center rounded-md border text-xs font-medium"
      >
        Hidden
      </div>
    );
  }

  return (
    <Image
      alt={`${card.rank} of ${card.suit}`}
      className={cn(
        "h-[88px] w-auto shrink-0 rounded-md",
        index % 2 === 0 ? "rotate-[-2deg]" : "rotate-[2deg]",
      )}
      height={588}
      src={`/cards/royal-noir/${card.rank}${suitCode(card.suit)}.svg`}
      width={420}
    />
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

function suitCode(suit: BlackjackCardSnapshot["suit"]) {
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
