type ConfirmedClockPause = {
  generation: number;
  result: unknown;
};

// An idle table re-pauses its race clock on every schedule sync. Reusing a
// confirmed pause keeps those syncs off the database so it can scale to zero.
// Race changes bump the table generation when they start and when they finish,
// so a pause is trusted only while nothing that could create or resume a race
// has started or finished since the pause began.
export class RacingClockPauseTracker {
  private readonly generations = new Map<string, number>();
  private readonly confirmedPauses = new Map<string, ConfirmedClockPause>();

  async trackRaceChange<T>(tableId: string, change: () => Promise<T>) {
    this.bumpGeneration(tableId);

    try {
      return await change();
    } finally {
      this.bumpGeneration(tableId);
    }
  }

  async pause(tableId: string, pauseClock: () => Promise<unknown>) {
    const generation = this.getGeneration(tableId);
    const confirmed = this.confirmedPauses.get(tableId);

    if (confirmed?.generation === generation) {
      return confirmed.result;
    }

    const result = await pauseClock();

    if (this.getGeneration(tableId) === generation) {
      this.confirmedPauses.set(tableId, { generation, result });
    }

    return result;
  }

  private getGeneration(tableId: string) {
    return this.generations.get(tableId) ?? 0;
  }

  private bumpGeneration(tableId: string) {
    this.generations.set(tableId, this.getGeneration(tableId) + 1);
  }
}
