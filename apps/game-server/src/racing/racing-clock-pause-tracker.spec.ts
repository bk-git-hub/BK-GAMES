import { RacingClockPauseTracker } from './racing-clock-pause-tracker';

describe('RacingClockPauseTracker', () => {
  it('reuses a confirmed pause while no race change has run', async () => {
    const tracker = new RacingClockPauseTracker();
    const pausedClock = { raceId: 'race-1', pausedAt: new Date(0) };
    const pauseClock = jest.fn(() => Promise.resolve(pausedClock));

    await expect(tracker.pause('main', pauseClock)).resolves.toBe(pausedClock);
    await expect(tracker.pause('main', pauseClock)).resolves.toBe(pausedClock);

    expect(pauseClock).toHaveBeenCalledTimes(1);
  });

  it('queries the pause again after a race change', async () => {
    const tracker = new RacingClockPauseTracker();
    const pauseClock = jest.fn(() => Promise.resolve(null));

    await tracker.pause('main', pauseClock);
    await tracker.trackRaceChange('main', () => Promise.resolve());
    await tracker.pause('main', pauseClock);

    expect(pauseClock).toHaveBeenCalledTimes(2);
  });

  it('does not confirm a pause that a race change overlapped', async () => {
    const tracker = new RacingClockPauseTracker();
    let resolvePause!: (value: null) => void;
    const pausePromise = new Promise<null>((resolve) => {
      resolvePause = resolve;
    });
    const pauseClock = jest
      .fn(() => Promise.resolve(null))
      .mockImplementationOnce(() => pausePromise);

    const firstPause = tracker.pause('main', pauseClock);
    await tracker.trackRaceChange('main', () => Promise.resolve());
    resolvePause(null);
    await firstPause;
    await tracker.pause('main', pauseClock);

    expect(pauseClock).toHaveBeenCalledTimes(2);
  });

  it('drops a confirmed pause when an earlier race change finishes', async () => {
    const tracker = new RacingClockPauseTracker();
    let resolveChange!: () => void;
    const changePromise = new Promise<void>((resolve) => {
      resolveChange = resolve;
    });
    const pauseClock = jest.fn(() => Promise.resolve(null));

    const change = tracker.trackRaceChange('main', () => changePromise);
    await tracker.pause('main', pauseClock);
    resolveChange();
    await change;
    await tracker.pause('main', pauseClock);

    expect(pauseClock).toHaveBeenCalledTimes(2);
  });

  it('retries a pause that failed', async () => {
    const tracker = new RacingClockPauseTracker();
    const pauseClock = jest
      .fn(() => Promise.resolve(null))
      .mockImplementationOnce(() => Promise.reject(new Error('db down')));

    await expect(tracker.pause('main', pauseClock)).rejects.toThrow('db down');
    await tracker.pause('main', pauseClock);

    expect(pauseClock).toHaveBeenCalledTimes(2);
  });

  it('drops a confirmed pause when a race change fails', async () => {
    const tracker = new RacingClockPauseTracker();
    const pauseClock = jest.fn(() => Promise.resolve(null));

    await tracker.pause('main', pauseClock);
    await expect(
      tracker.trackRaceChange('main', () =>
        Promise.reject(new Error('db down')),
      ),
    ).rejects.toThrow('db down');
    await tracker.pause('main', pauseClock);

    expect(pauseClock).toHaveBeenCalledTimes(2);
  });

  it('tracks each table separately', async () => {
    const tracker = new RacingClockPauseTracker();
    const pauseClock = jest.fn(() => Promise.resolve(null));

    await tracker.pause('main', pauseClock);
    await tracker.trackRaceChange('other', () => Promise.resolve());
    await tracker.pause('main', pauseClock);

    expect(pauseClock).toHaveBeenCalledTimes(1);
  });
});
