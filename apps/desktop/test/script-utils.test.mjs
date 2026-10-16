import { describe, expect, it } from 'vitest';
import { runParallelStages } from '../scripts/script-utils.mjs';

describe('parallel package stages', () => {
  it('starts independent work before waiting and preserves result order', async () => {
    const signing = Promise.withResolvers();
    const notarization = Promise.withResolvers();
    const started = [];
    const result = runParallelStages([
      () => { started.push('signing'); return signing.promise; },
      () => { started.push('notarization'); return notarization.promise; }
    ]);
    await Promise.resolve();
    expect(started).toEqual(['signing', 'notarization']);
    notarization.resolve('accepted');
    signing.resolve('signed');
    await expect(result).resolves.toEqual(['signed', 'accepted']);
  });

  it.each([0, 1])('waits for cleanup before rejecting a failure in stage %i', async failedIndex => {
    const sibling = Promise.withResolvers();
    const failure = new Error('notarization failed');
    let cleanedUp = false;
    let settled = false;
    const stages = [
      () => { throw failure; },
      async () => {
        await sibling.promise;
        cleanedUp = true;
      }
    ];
    if (failedIndex === 1) stages.reverse();
    const result = runParallelStages(stages);
    const checked = expect(result).rejects.toBe(failure);
    void result.catch(() => { settled = true; });
    await new Promise(setImmediate);
    expect(settled).toBe(false);
    sibling.resolve();
    await checked;
    expect(cleanedUp).toBe(true);
  });

  it('preserves errors from every failed stage', async () => {
    const errors = [new Error('signing failed'), new Error('notarization failed')];
    const result = runParallelStages(errors.map(error => async () => { throw error; }));
    await expect(result).rejects.toMatchObject({ errors });
  });
});
