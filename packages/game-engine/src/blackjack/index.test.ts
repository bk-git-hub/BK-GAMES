import { describe, expect, it } from "vitest";
import {
  blackjackEngineVersion,
  createDeck,
  evaluateHand,
  getAvailablePlayerActions,
  isPair,
  shouldDealerHit,
  shuffleDeck,
  type BlackjackCard,
} from "./index";

describe("blackjack engine package", () => {
  it("exposes the engine version", () => {
    expect(blackjackEngineVersion).toBe("blackjack-engine-v1");
  });

  it("creates ordered multi-deck shoes", () => {
    const deck = createDeck(2);

    expect(deck).toHaveLength(104);
    expect(deck[0]).toEqual(card("A", "clubs"));
    expect(deck[51]).toEqual(card("K", "spades"));
    expect(deck[52]).toEqual(card("A", "clubs"));
  });

  it("shuffles without mutating the original deck", () => {
    const deck = createDeck(1);
    const shuffled = shuffleDeck(deck, () => 0);

    expect(shuffled).toHaveLength(52);
    expect(deck[0]).toEqual(card("A", "clubs"));
    expect(shuffled).not.toBe(deck);
    expect(shuffled[0]).toEqual(card("2", "clubs"));
  });

  it("evaluates aces as soft or hard to produce the best score", () => {
    expect(evaluateHand([card("A"), card("6")])).toMatchObject({
      total: 17,
      hardTotal: 7,
      softAceCount: 1,
      isSoft: true,
      isBust: false,
    });
    expect(evaluateHand([card("A"), card("6"), card("K")])).toMatchObject({
      total: 17,
      hardTotal: 17,
      softAceCount: 0,
      isSoft: false,
      isBust: false,
    });
  });

  it("detects natural blackjack and busts", () => {
    expect(evaluateHand([card("A"), card("K")])).toMatchObject({
      total: 21,
      isBlackjack: true,
      isBust: false,
    });
    expect(evaluateHand([card("K"), card("Q"), card("2")])).toMatchObject({
      total: 22,
      isBlackjack: false,
      isBust: true,
    });
  });

  it("applies dealer soft 17 policy", () => {
    const soft17 = [card("A"), card("6")];
    const hard17 = [card("10"), card("7")];

    expect(shouldDealerHit(soft17, { dealerHitsSoft17: false })).toBe(false);
    expect(shouldDealerHit(soft17, { dealerHitsSoft17: true })).toBe(true);
    expect(shouldDealerHit(hard17, { dealerHitsSoft17: true })).toBe(false);
    expect(
      shouldDealerHit([card("9"), card("7")], { dealerHitsSoft17: false }),
    ).toBe(true);
  });

  it("calculates player actions for opening decisions", () => {
    expect(
      getAvailablePlayerActions(
        { cards: [card("8"), card("8")], currentHandCount: 1 },
        {
          doubleAllowed: true,
          splitAllowed: true,
          surrenderAllowed: true,
          maxSplitHands: 4,
        },
      ),
    ).toEqual(["HIT", "STAND", "DOUBLE", "SPLIT", "SURRENDER"]);
  });

  it("removes actions that are not legal after split aces or terminal hands", () => {
    expect(
      getAvailablePlayerActions(
        {
          cards: [card("A"), card("4")],
          isSplitAces: true,
          hitSplitAcesAllowed: false,
        },
        {
          doubleAllowed: true,
          splitAllowed: true,
          surrenderAllowed: true,
        },
      ),
    ).toEqual(["STAND"]);
    expect(
      getAvailablePlayerActions(
        { cards: [card("A"), card("K")] },
        {
          doubleAllowed: true,
          splitAllowed: true,
          surrenderAllowed: true,
          evenMoneyOffered: true,
        },
      ),
    ).toEqual(["EVEN_MONEY"]);
  });

  it("supports strict pair and ten-value split policies", () => {
    expect(isPair([card("K"), card("Q")])).toBe(false);
    expect(isPair([card("K"), card("Q")], { allowTenValueSplit: true })).toBe(
      true,
    );
  });
});

function card(
  rank: BlackjackCard["rank"],
  suit: BlackjackCard["suit"] = "clubs",
): BlackjackCard {
  return { rank, suit };
}
