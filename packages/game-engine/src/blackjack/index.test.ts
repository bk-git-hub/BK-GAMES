import { describe, expect, it } from 'vitest';
import { blackjackEngineVersion } from './index';

describe('blackjack engine package', () => {
  it('exposes the initial engine version', () => {
    expect(blackjackEngineVersion).toBe('initial');
  });
});
