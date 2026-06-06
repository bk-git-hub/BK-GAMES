export const blackjackRanks = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;

export const blackjackSuits = [
  "clubs",
  "diamonds",
  "hearts",
  "spades",
] as const;

export type BlackjackRank = (typeof blackjackRanks)[number];
export type BlackjackSuit = (typeof blackjackSuits)[number];

export type BlackjackCard = {
  rank: BlackjackRank;
  suit: BlackjackSuit;
};

export type RandomSource = () => number;

export function createDeck(deckCount = 1): BlackjackCard[] {
  if (!Number.isInteger(deckCount) || deckCount < 1 || deckCount > 8) {
    throw new BlackjackEngineError(
      "INVALID_DECK_COUNT",
      "deckCount must be an integer between 1 and 8.",
    );
  }

  const deck: BlackjackCard[] = [];

  for (let deckIndex = 0; deckIndex < deckCount; deckIndex += 1) {
    for (const suit of blackjackSuits) {
      for (const rank of blackjackRanks) {
        deck.push({ rank, suit });
      }
    }
  }

  return deck;
}

export function shuffleDeck(
  cards: readonly BlackjackCard[],
  random: RandomSource = Math.random,
): BlackjackCard[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const swap = shuffled[swapIndex];

    if (!current || !swap) {
      throw new BlackjackEngineError(
        "INVALID_SHUFFLE_STATE",
        "Deck shuffle encountered an invalid index.",
      );
    }

    shuffled[index] = swap;
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

export type BlackjackEngineErrorCode =
  | "INVALID_DECK_COUNT"
  | "INVALID_SHUFFLE_STATE"
  | "EMPTY_HAND";

export class BlackjackEngineError extends Error {
  constructor(
    readonly code: BlackjackEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BlackjackEngineError";
  }
}
