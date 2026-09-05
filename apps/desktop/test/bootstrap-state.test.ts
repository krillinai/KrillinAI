import { describe, expect, it } from 'vitest';
import { shouldApplyBootstrapState } from '../src/shared/bootstrap-state.js';
import type { DesktopBootstrapState } from '../src/shared/types.js';

describe('Bootstrap state ordering', () => {
  it('ignores delayed IPC state older than the current renderer state', () => {
    const current = state('workspace_failed', 5);

    expect(shouldApplyBootstrapState(current, state('starting_runtime', 4)))
      .toBe(false);
    expect(shouldApplyBootstrapState(current, state('workspace_failed', 5)))
      .toBe(true);
    expect(shouldApplyBootstrapState(current, state('ready', 6))).toBe(true);
  });
});

function state(
  phase: DesktopBootstrapState['phase'],
  revision: number
): DesktopBootstrapState {
  return {
    phase,
    revision,
    attempt: 1,
    startedAt: '2026-09-04T00:00:00.000Z',
    updatedAt: `2026-09-04T00:00:0${revision}.000Z`
  };
}
