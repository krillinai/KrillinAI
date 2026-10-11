import { describe, expect, it } from 'vitest';
import { deepLinkToRoute } from '../src/main/deep-link-manager.js';

describe('Desktop deep-link validation', () => {
  it('returns to the account page with an order ID but never trusts payment claims', () => {
    expect(deepLinkToRoute('opencreator://billing/return')).toBe('#/account?billing=return');
    expect(deepLinkToRoute('opencreator://billing/return?orderId=order-1')).toBe('#/account?billing=return&orderId=order-1');
    for (const value of ['opencreator://billing/return?orderId=', 'opencreator://billing/return?orderId=order%2F1', 'opencreator://billing/return?paid=true', 'opencreator://billing/return#paid', 'opencreator://billing/return/extra']) expect(deepLinkToRoute(value), value).toBeUndefined();
  });
  it('opens the account page for the fixed authorization callback without accepting credentials', () => {
    expect(deepLinkToRoute('opencreator://auth/complete')).toBe('#/account?login=complete');
    for (const value of [
      'opencreator://auth/complete?token=secret',
      'opencreator://auth/complete#secret',
      'opencreator://user@auth/complete',
      'opencreator://auth:80/complete',
      'opencreator://auth/complete/extra'
    ]) expect(deepLinkToRoute(value), value).toBeUndefined();
  });
  it('rejects any malformed path or query encoding as one invalid link', () => {
    for (const value of [
      'opencreator://thread/%',
      'opencreator://thread/%E0%A4%A',
      'opencreator://thread/ok?runId=%',
      'opencreator://thread/ok?unused=%E0%A4%A',
      'opencreator://thread/%00hidden',
      'opencreator://thread/%EF%BF%BD'
    ]) {
      expect(deepLinkToRoute(value), value).toBeUndefined();
    }
  });

  it('accepts valid Unicode, spaces, and encoded slashes', () => {
    expect(deepLinkToRoute(
      'opencreator://thread/thread%2F%E4%B8%AD%E6%96%87?runId=run+one'
    )).toBe(
      '#/thread/thread%2F%E4%B8%AD%E6%96%87?runId=run+one'
    );
  });

  it('rejects empty and overlong UTF-8 identifiers', () => {
    expect(deepLinkToRoute('opencreator://thread/ok?runId=')).toBeUndefined();
    expect(deepLinkToRoute(
      `opencreator://thread/${encodeURIComponent('中'.repeat(200))}`
    )).toBeUndefined();
  });
});
