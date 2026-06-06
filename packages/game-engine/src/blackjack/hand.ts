import {
  BlackjackEngineError,
  type BlackjackCard,
  type BlackjackRank,
} from "./cards.js";

export type BlackjackHandEvaluation = {
  cards: readonly BlackjackCard[];
  cardCount: number;
  total: number;
  hardTotal: number;
  softAceCount: number;
  isSoft: boolean;
  isBlackjack: boolean;
  isBust: boolean;
};

export function evaluateHand(
  cards: readonly BlackjackCard[],
): BlackjackHandEvaluation {
  if (cards.length === 0) {
    throw new BlackjackEngineError("EMPTY_HAND", "Cannot evaluate empty hand.");
  }

  let total = 0;
  let hardTotal = 0;
  let aceCount = 0;

  for (const card of cards) {
    if (card.rank === "A") {
      aceCount += 1;
      total += 11;
      hardTotal += 1;
    } else {
      const value = rankValue(card.rank);

      total += value;
      hardTotal += value;
    }
  }

  let softAceCount = aceCount;

  while (total > 21 && softAceCount > 0) {
    total -= 10;
    softAceCount -= 1;
  }

  return {
    cards,
    cardCount: cards.length,
    total,
    hardTotal,
    softAceCount,
    isSoft: softAceCount > 0,
    isBlackjack: cards.length === 2 && total === 21,
    isBust: total > 21,
  };
}

export function isPair(
  cards: readonly BlackjackCard[],
  options: { allowTenValueSplit?: boolean } = {},
) {
  if (cards.length !== 2) {
    return false;
  }

  const [left, right] = cards;

  if (!left || !right) {
    return false;
  }

  if (left.rank === right.rank) {
    return true;
  }

  return (
    options.allowTenValueSplit === true &&
    rankValue(left.rank) === 10 &&
    rankValue(right.rank) === 10
  );
}

export function rankValue(rank: BlackjackRank) {
  if (rank === "A") {
    return 11;
  }

  if (rank === "J" || rank === "Q" || rank === "K") {
    return 10;
  }

  return Number(rank);
}
