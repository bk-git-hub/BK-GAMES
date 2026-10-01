import 'reflect-metadata';

// Every feature module is stubbed: the real ones pull in workspace packages the
// unit jest config cannot load. The card game factories also record that they
// ran, which is how the tests see whether those files were loaded at all.
const mockCardModuleLoads: string[] = [];

jest.mock('./auth/auth.module', () => ({
  AuthModule: class AuthModule {},
}));

jest.mock('./health/health.module', () => ({
  HealthModule: class HealthModule {},
}));

jest.mock('./racing/racing.module', () => ({
  RacingModule: class RacingModule {},
}));

jest.mock('./wallet/wallet.module', () => ({
  WalletModule: class WalletModule {},
}));

jest.mock('./baccarat/baccarat.module', () => {
  mockCardModuleLoads.push('baccarat');

  return { BaccaratModule: class BaccaratModule {} };
});

jest.mock('./blackjack/blackjack.module', () => {
  mockCardModuleLoads.push('blackjack');

  return { BlackjackModule: class BlackjackModule {} };
});

describe('AppModule', () => {
  const originalValue = process.env.CARD_GAMES_ENABLED;

  beforeEach(() => {
    // A fresh registry per test, so app.module and the stubs are evaluated
    // again and a load in one test cannot hide or fake a load in another.
    jest.resetModules();
    mockCardModuleLoads.length = 0;
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.CARD_GAMES_ENABLED;
    } else {
      process.env.CARD_GAMES_ENABLED = originalValue;
    }
  });

  it('statically imports only the always-on modules', () => {
    const AppModule = loadAppModule();
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[];

    expect(mockCardModuleLoads).toEqual([]);
    expect(imports).toHaveLength(4);
    expect(imports).toEqual(expect.arrayContaining(alwaysOnModules()));

    for (const cardGameModule of cardGameModules()) {
      expect(imports).not.toContain(cardGameModule);
    }
  });

  it('adds nothing and loads no card game file when disabled', () => {
    const AppModule = loadAppModule();

    expect(AppModule.register(false)).toStrictEqual({ module: AppModule });
    expect(mockCardModuleLoads).toEqual([]);
  });

  it('registers blackjack and baccarat when enabled', () => {
    const AppModule = loadAppModule();
    const dynamicModule = AppModule.register(true);

    expect([...mockCardModuleLoads].sort()).toEqual(['baccarat', 'blackjack']);
    expect(dynamicModule.module).toBe(AppModule);
    expect(dynamicModule.imports).toHaveLength(2);
    expect(dynamicModule.imports).toEqual(
      expect.arrayContaining(cardGameModules()),
    );
  });

  it('follows CARD_GAMES_ENABLED when called without an argument', () => {
    const AppModule = loadAppModule();

    delete process.env.CARD_GAMES_ENABLED;

    expect(AppModule.register()).toStrictEqual({ module: AppModule });

    process.env.CARD_GAMES_ENABLED = 'TRUE';

    expect(AppModule.register()).toStrictEqual({ module: AppModule });
    expect(mockCardModuleLoads).toEqual([]);

    process.env.CARD_GAMES_ENABLED = 'true';

    expect(AppModule.register().imports).toEqual(
      expect.arrayContaining(cardGameModules()),
    );
  });
});

function loadAppModule() {
  return jest.requireActual<typeof import('./app.module')>('./app.module')
    .AppModule;
}

function alwaysOnModules(): unknown[] {
  return [
    jest.requireMock<typeof import('./auth/auth.module')>('./auth/auth.module')
      .AuthModule,
    jest.requireMock<typeof import('./health/health.module')>(
      './health/health.module',
    ).HealthModule,
    jest.requireMock<typeof import('./racing/racing.module')>(
      './racing/racing.module',
    ).RacingModule,
    jest.requireMock<typeof import('./wallet/wallet.module')>(
      './wallet/wallet.module',
    ).WalletModule,
  ];
}

// Call only after the load assertions: asking for a stub evaluates it.
function cardGameModules(): unknown[] {
  return [
    jest.requireMock<typeof import('./baccarat/baccarat.module')>(
      './baccarat/baccarat.module',
    ).BaccaratModule,
    jest.requireMock<typeof import('./blackjack/blackjack.module')>(
      './blackjack/blackjack.module',
    ).BlackjackModule,
  ];
}
