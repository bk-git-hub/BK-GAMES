export const baccaratEngineVersion = "baccarat-engine-v1";

export type BaccaratRank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export type BaccaratSuit = "clubs" | "diamonds" | "hearts" | "spades";

export type BaccaratCard = {
  rank: BaccaratRank;
  suit: BaccaratSuit;
};

export type BaccaratOutcome = "PLAYER" | "BANKER" | "TIE";

export type BaccaratBetType = BaccaratOutcome;

export type BaccaratBetResult = "WIN" | "LOSE" | "PUSH";

export type BaccaratHand = {
  cards: BaccaratCard[];
  total: number;
  isNatural: boolean;
};

export type BaccaratRoundResult = {
  player: BaccaratHand;
  banker: BaccaratHand;
  outcome: BaccaratOutcome;
  isNatural: boolean;
  totalCards: number;
  consumedCards: number;
  playerDrew: boolean;
  bankerDrew: boolean;
};

export type BaccaratPayoutResult = {
  betType: BaccaratBetType;
  outcome: BaccaratOutcome;
  result: BaccaratBetResult;
  betAmount: bigint;
  payoutAmount: bigint;
  netAmount: bigint;
};

export function getBaccaratCardValue(card: BaccaratCard): number {
  if (card.rank === "A") {
    return 1;
  }

  if (
    card.rank === "10" ||
    card.rank === "J" ||
    card.rank === "Q" ||
    card.rank === "K"
  ) {
    return 0;
  }

  return Number(card.rank);
}

export function calculateBaccaratHandTotal(
  cards: readonly BaccaratCard[],
): number {
  return (
    cards.reduce((total, card) => total + getBaccaratCardValue(card), 0) % 10
  );
}

export function isBaccaratNatural(cards: readonly BaccaratCard[]): boolean {
  if (cards.length !== 2) {
    return false;
  }

  const total = calculateBaccaratHandTotal(cards);

  return total === 8 || total === 9;
}

export function shouldBaccaratPlayerDraw(playerTotal: number): boolean {
  assertBaccaratTotal(playerTotal, "playerTotal");

  return playerTotal <= 5;
}

export function shouldBaccaratBankerDraw(input: {
  bankerTotal: number;
  playerThirdCardValue: number | null;
}): boolean {
  assertBaccaratTotal(input.bankerTotal, "bankerTotal");

  if (input.playerThirdCardValue === null) {
    return input.bankerTotal <= 5;
  }

  assertBaccaratCardValue(input.playerThirdCardValue, "playerThirdCardValue");

  if (input.bankerTotal <= 2) {
    return true;
  }

  if (input.bankerTotal === 3) {
    return input.playerThirdCardValue !== 8;
  }

  if (input.bankerTotal === 4) {
    return input.playerThirdCardValue >= 2 && input.playerThirdCardValue <= 7;
  }

  if (input.bankerTotal === 5) {
    return input.playerThirdCardValue >= 4 && input.playerThirdCardValue <= 7;
  }

  if (input.bankerTotal === 6) {
    return input.playerThirdCardValue === 6 || input.playerThirdCardValue === 7;
  }

  return false;
}

export function dealBaccaratRound(
  cards: readonly BaccaratCard[],
): BaccaratRoundResult {
  if (cards.length < 4) {
    throw new Error("At least four cards are required to deal baccarat.");
  }

  const playerCards = [cards[0], cards[2]].map(requireCard);
  const bankerCards = [cards[1], cards[3]].map(requireCard);
  let consumedCards = 4;
  const initialPlayerTotal = calculateBaccaratHandTotal(playerCards);
  const initialBankerTotal = calculateBaccaratHandTotal(bankerCards);
  const natural =
    isBaccaratNatural(playerCards) || isBaccaratNatural(bankerCards);
  let playerDrew = false;
  let bankerDrew = false;
  let playerThirdCardValue: number | null = null;

  if (!natural && shouldBaccaratPlayerDraw(initialPlayerTotal)) {
    const playerThirdCard = requireCard(cards[consumedCards]);
    consumedCards += 1;
    playerCards.push(playerThirdCard);
    playerDrew = true;
    playerThirdCardValue = getBaccaratCardValue(playerThirdCard);
  }

  if (
    !natural &&
    shouldBaccaratBankerDraw({
      bankerTotal: initialBankerTotal,
      playerThirdCardValue,
    })
  ) {
    const bankerThirdCard = requireCard(cards[consumedCards]);
    consumedCards += 1;
    bankerCards.push(bankerThirdCard);
    bankerDrew = true;
  }

  const player = evaluateBaccaratHand(playerCards);
  const banker = evaluateBaccaratHand(bankerCards);
  const outcome = getBaccaratOutcome(player.total, banker.total);

  return {
    player,
    banker,
    outcome,
    isNatural: natural,
    totalCards: player.cards.length + banker.cards.length,
    consumedCards,
    playerDrew,
    bankerDrew,
  };
}

export function evaluateBaccaratHand(
  cards: readonly BaccaratCard[],
): BaccaratHand {
  return {
    cards: [...cards],
    total: calculateBaccaratHandTotal(cards),
    isNatural: isBaccaratNatural(cards),
  };
}

export function getBaccaratOutcome(
  playerTotal: number,
  bankerTotal: number,
): BaccaratOutcome {
  assertBaccaratTotal(playerTotal, "playerTotal");
  assertBaccaratTotal(bankerTotal, "bankerTotal");

  if (playerTotal > bankerTotal) {
    return "PLAYER";
  }

  if (bankerTotal > playerTotal) {
    return "BANKER";
  }

  return "TIE";
}

export function calculateBaccaratPayout(input: {
  betType: BaccaratBetType;
  outcome: BaccaratOutcome;
  betAmount: bigint;
}): BaccaratPayoutResult {
  assertPositivePointAmount(input.betAmount);

  if (input.betType === input.outcome) {
    const netAmount = calculateWinningNetAmount(input.betType, input.betAmount);

    return {
      betType: input.betType,
      outcome: input.outcome,
      result: "WIN",
      betAmount: input.betAmount,
      payoutAmount: input.betAmount + netAmount,
      netAmount,
    };
  }

  if (input.outcome === "TIE" && input.betType !== "TIE") {
    return {
      betType: input.betType,
      outcome: input.outcome,
      result: "PUSH",
      betAmount: input.betAmount,
      payoutAmount: input.betAmount,
      netAmount: 0n,
    };
  }

  return {
    betType: input.betType,
    outcome: input.outcome,
    result: "LOSE",
    betAmount: input.betAmount,
    payoutAmount: 0n,
    netAmount: -input.betAmount,
  };
}

function calculateWinningNetAmount(
  betType: BaccaratBetType,
  betAmount: bigint,
) {
  if (betType === "PLAYER") {
    return betAmount;
  }

  if (betType === "BANKER") {
    return (betAmount * 95n) / 100n;
  }

  return betAmount * 8n;
}

function requireCard(card: BaccaratCard | undefined): BaccaratCard {
  if (!card) {
    throw new Error("Not enough cards to complete baccarat round.");
  }

  return card;
}

function assertBaccaratTotal(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new Error(`${label} must be an integer between 0 and 9.`);
  }
}

function assertBaccaratCardValue(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new Error(`${label} must be an integer between 0 and 9.`);
  }
}

function assertPositivePointAmount(value: bigint) {
  if (value <= 0n) {
    throw new Error("betAmount must be positive.");
  }
}
