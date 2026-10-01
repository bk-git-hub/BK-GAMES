import { isCardGamesEnabled } from './card-games';

describe('isCardGamesEnabled', () => {
  const originalValue = process.env.CARD_GAMES_ENABLED;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.CARD_GAMES_ENABLED;
    } else {
      process.env.CARD_GAMES_ENABLED = originalValue;
    }
  });

  it('is disabled when the variable is unset', () => {
    expect(isCardGamesEnabled({})).toBe(false);
  });

  it('is disabled when the variable is empty', () => {
    expect(isCardGamesEnabled({ CARD_GAMES_ENABLED: '' })).toBe(false);
  });

  it('is enabled only by the exact string true', () => {
    expect(isCardGamesEnabled({ CARD_GAMES_ENABLED: 'true' })).toBe(true);
  });

  it.each(['TRUE', 'True', '1', 'yes', 'on', ' true ', 'true\n', 'false'])(
    'is disabled for %j',
    (value) => {
      expect(isCardGamesEnabled({ CARD_GAMES_ENABLED: value })).toBe(false);
    },
  );

  it('reads process.env by default', () => {
    delete process.env.CARD_GAMES_ENABLED;

    expect(isCardGamesEnabled()).toBe(false);

    process.env.CARD_GAMES_ENABLED = 'true';

    expect(isCardGamesEnabled()).toBe(true);

    process.env.CARD_GAMES_ENABLED = 'TRUE';

    expect(isCardGamesEnabled()).toBe(false);
  });
});
