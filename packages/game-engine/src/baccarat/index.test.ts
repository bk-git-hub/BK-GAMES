import { describe, expect, it } from "vitest";
import {
  baccaratEngineVersion,
  calculateBaccaratHandTotal,
  calculateBaccaratPayout,
  dealBaccaratRound,
  getBaccaratCardValue,
  isBaccaratNatural,
  shouldBaccaratBankerDraw,
  shouldBaccaratPlayerDraw,
  type BaccaratCard,
} from "./index";

describe("baccarat engine package", () => {
  it("exposes the engine version", () => {
    expect(baccaratEngineVersion).toBe("baccarat-engine-v1");
  });

  it("calculates card values, hand totals, and naturals", () => {
    expect(getBaccaratCardValue(card("A"))).toBe(1);
    expect(getBaccaratCardValue(card("9"))).toBe(9);
    expect(getBaccaratCardValue(card("10"))).toBe(0);
    expect(getBaccaratCardValue(card("K"))).toBe(0);
    expect(calculateBaccaratHandTotal([card("7"), card("8")])).toBe(5);
    expect(calculateBaccaratHandTotal([card("4"), card("6"), card("9")])).toBe(
      9,
    );
    expect(isBaccaratNatural([card("K"), card("9")])).toBe(true);
    expect(isBaccaratNatural([card("4"), card("4"), card("A")])).toBe(false);
  });

  it("applies the Player draw rule", () => {
    expect([0, 1, 2, 3, 4, 5].map(shouldBaccaratPlayerDraw)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect([6, 7, 8, 9].map(shouldBaccaratPlayerDraw)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("applies the Banker draw rule when Player stands", () => {
    expect(
      [0, 1, 2, 3, 4, 5, 6, 7].map((bankerTotal) =>
        shouldBaccaratBankerDraw({
          bankerTotal,
          playerThirdCardValue: null,
        }),
      ),
    ).toEqual([true, true, true, true, true, true, false, false]);
  });

  it("applies the Banker draw matrix when Player draws", () => {
    expect(
      Array.from({ length: 10 }, (_, value) =>
        shouldBaccaratBankerDraw({
          bankerTotal: 2,
          playerThirdCardValue: value,
        }),
      ),
    ).toEqual(Array.from({ length: 10 }, () => true));
    expect(
      Array.from({ length: 10 }, (_, value) =>
        shouldBaccaratBankerDraw({
          bankerTotal: 3,
          playerThirdCardValue: value,
        }),
      ),
    ).toEqual([true, true, true, true, true, true, true, true, false, true]);
    expect(
      Array.from({ length: 10 }, (_, value) =>
        shouldBaccaratBankerDraw({
          bankerTotal: 4,
          playerThirdCardValue: value,
        }),
      ),
    ).toEqual([false, false, true, true, true, true, true, true, false, false]);
    expect(
      Array.from({ length: 10 }, (_, value) =>
        shouldBaccaratBankerDraw({
          bankerTotal: 5,
          playerThirdCardValue: value,
        }),
      ),
    ).toEqual([false, false, false, false, true, true, true, true, false, false]);
    expect(
      Array.from({ length: 10 }, (_, value) =>
        shouldBaccaratBankerDraw({
          bankerTotal: 6,
          playerThirdCardValue: value,
        }),
      ),
    ).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
    ]);
    expect(
      Array.from({ length: 10 }, (_, value) =>
        shouldBaccaratBankerDraw({
          bankerTotal: 7,
          playerThirdCardValue: value,
        }),
      ),
    ).toEqual(Array.from({ length: 10 }, () => false));
  });

  it("deals a natural round without drawing additional cards", () => {
    const round = dealBaccaratRound([
      card("9"),
      card("5"),
      card("K"),
      card("2"),
      card("3"),
      card("4"),
    ]);

    expect(round).toMatchObject({
      outcome: "PLAYER",
      isNatural: true,
      consumedCards: 4,
      totalCards: 4,
      playerDrew: false,
      bankerDrew: false,
    });
    expect(round.player.total).toBe(9);
    expect(round.banker.total).toBe(7);
  });

  it("deals Player and Banker third cards using the standard sequence", () => {
    const round = dealBaccaratRound([
      card("2"),
      card("4"),
      card("3"),
      card("Q"),
      card("7"),
      card("7"),
    ]);

    expect(round.player.cards.map((drawnCard) => drawnCard.rank)).toEqual([
      "2",
      "3",
      "7",
    ]);
    expect(round.banker.cards.map((drawnCard) => drawnCard.rank)).toEqual([
      "4",
      "Q",
      "7",
    ]);
    expect(round).toMatchObject({
      outcome: "PLAYER",
      isNatural: false,
      consumedCards: 6,
      totalCards: 6,
      playerDrew: true,
      bankerDrew: true,
    });
    expect(round.player.total).toBe(2);
    expect(round.banker.total).toBe(1);
  });

  it("deals Banker only when Player stands and Banker must draw", () => {
    const round = dealBaccaratRound([
      card("3"),
      card("2"),
      card("3"),
      card("3"),
      card("4"),
    ]);

    expect(round).toMatchObject({
      outcome: "BANKER",
      consumedCards: 5,
      totalCards: 5,
      playerDrew: false,
      bankerDrew: true,
    });
    expect(round.player.total).toBe(6);
    expect(round.banker.total).toBe(9);
  });

  it("calculates integer payouts for wins, pushes, and losses", () => {
    expect(
      calculateBaccaratPayout({
        betType: "PLAYER",
        outcome: "PLAYER",
        betAmount: 100n,
      }),
    ).toMatchObject({
      result: "WIN",
      payoutAmount: 200n,
      netAmount: 100n,
    });
    expect(
      calculateBaccaratPayout({
        betType: "BANKER",
        outcome: "BANKER",
        betAmount: 101n,
      }),
    ).toMatchObject({
      result: "WIN",
      payoutAmount: 196n,
      netAmount: 95n,
    });
    expect(
      calculateBaccaratPayout({
        betType: "TIE",
        outcome: "TIE",
        betAmount: 100n,
      }),
    ).toMatchObject({
      result: "WIN",
      payoutAmount: 900n,
      netAmount: 800n,
    });
    expect(
      calculateBaccaratPayout({
        betType: "PLAYER",
        outcome: "TIE",
        betAmount: 100n,
      }),
    ).toMatchObject({
      result: "PUSH",
      payoutAmount: 100n,
      netAmount: 0n,
    });
    expect(
      calculateBaccaratPayout({
        betType: "TIE",
        outcome: "BANKER",
        betAmount: 100n,
      }),
    ).toMatchObject({
      result: "LOSE",
      payoutAmount: 0n,
      netAmount: -100n,
    });
  });
});

function card(
  rank: BaccaratCard["rank"],
  suit: BaccaratCard["suit"] = "clubs",
): BaccaratCard {
  return { rank, suit };
}
