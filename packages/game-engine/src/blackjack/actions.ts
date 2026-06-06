import type { BlackjackCard } from "./cards.js";
import { evaluateHand, isPair } from "./hand.js";

export type BlackjackPlayerAction =
  | "HIT"
  | "STAND"
  | "DOUBLE"
  | "SPLIT"
  | "SURRENDER"
  | "INSURANCE"
  | "EVEN_MONEY";

export type DealerPolicy = {
  dealerHitsSoft17: boolean;
};

export type PlayerActionRules = {
  doubleAllowed: boolean;
  splitAllowed: boolean;
  surrenderAllowed: boolean;
  insuranceOffered?: boolean;
  evenMoneyOffered?: boolean;
  doubleAfterSplitAllowed?: boolean;
  allowTenValueSplit?: boolean;
  maxSplitHands?: number;
};

export type PlayerHandContext = {
  cards: readonly BlackjackCard[];
  isAfterSplit?: boolean;
  isSplitAces?: boolean;
  currentHandCount?: number;
  hitSplitAcesAllowed?: boolean;
};

export function shouldDealerHit(
  cards: readonly BlackjackCard[],
  policy: DealerPolicy,
) {
  const hand = evaluateHand(cards);

  if (hand.total < 17) {
    return true;
  }

  return hand.total === 17 && hand.isSoft && policy.dealerHitsSoft17;
}

export function getAvailablePlayerActions(
  context: PlayerHandContext,
  rules: PlayerActionRules,
): BlackjackPlayerAction[] {
  const hand = evaluateHand(context.cards);

  if (hand.isBust || hand.isBlackjack) {
    return getTerminalOfferActions(hand.isBlackjack, rules);
  }

  if (context.isSplitAces && !context.hitSplitAcesAllowed) {
    return ["STAND"];
  }

  const actions: BlackjackPlayerAction[] = ["HIT", "STAND"];
  const isOpeningDecision = context.cards.length === 2;

  if (canDouble(context, rules, isOpeningDecision)) {
    actions.push("DOUBLE");
  }

  if (canSplit(context, rules, isOpeningDecision)) {
    actions.push("SPLIT");
  }

  if (isOpeningDecision && rules.surrenderAllowed) {
    actions.push("SURRENDER");
  }

  if (rules.insuranceOffered) {
    actions.push("INSURANCE");
  }

  return actions;
}

function getTerminalOfferActions(
  isBlackjack: boolean,
  rules: PlayerActionRules,
): BlackjackPlayerAction[] {
  if (isBlackjack && rules.evenMoneyOffered) {
    return ["EVEN_MONEY"];
  }

  if (rules.insuranceOffered) {
    return ["INSURANCE"];
  }

  return [];
}

function canDouble(
  context: PlayerHandContext,
  rules: PlayerActionRules,
  isOpeningDecision: boolean,
) {
  if (!rules.doubleAllowed || !isOpeningDecision) {
    return false;
  }

  return !context.isAfterSplit || rules.doubleAfterSplitAllowed === true;
}

function canSplit(
  context: PlayerHandContext,
  rules: PlayerActionRules,
  isOpeningDecision: boolean,
) {
  if (!rules.splitAllowed || !isOpeningDecision) {
    return false;
  }

  if (
    typeof rules.maxSplitHands === "number" &&
    typeof context.currentHandCount === "number" &&
    context.currentHandCount >= rules.maxSplitHands
  ) {
    return false;
  }

  return isPair(context.cards, {
    allowTenValueSplit: rules.allowTenValueSplit,
  });
}
