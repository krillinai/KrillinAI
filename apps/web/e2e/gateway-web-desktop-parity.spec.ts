import { test, expect } from './fixtures/runtime.js';

test('个人中心在 Browser/Desktop 使用同一布局与网页充值入口', async ({ browser, runtime }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const snapshots: unknown[] = [];
    for (const platform of ['browser', 'desktop']) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem('opencreator.agent-setup-confirmed.v1', '1'));
      const handoffURL = runtime.origin + '/auth?lang=zh#handoff=' + 'a'.repeat(43);
      const requests: Array<{ destination: string; locale: string }> = [];
      await context.route('**/auth?lang=zh*', route => route.fulfill({ body: '<html><body>Account portal</body></html>', contentType: 'text/html' }));
      await context.route('**/gateway/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let value: unknown;
        if (path.endsWith('/gateway/account') || path.endsWith('/gateway/auth/check')) value = { source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'account-a', email: 'creator@example.test', verified: true }, bindingVersion: null, models: [], activationError: null };
        else if (path.endsWith('/gateway/billing/summary')) value = { balance: { availableUnits: '413937000', reservedUnits: '0', periodEnd: null, asOf: '2026-10-10T01:00:00Z' }, subscription: null, billingAvailable: false, plansUrl: runtime.origin + '/pricing' };
        else if (path.endsWith('/gateway/billing/orders')) value = { items: [] };
        else if (path.endsWith('/gateway/account/web')) { const body = route.request().postDataJSON(); requests.push({ destination: body.destination, locale: body.locale }); value = { url: handoffURL }; }
        else { await route.continue(); return; }
        await route.fulfill({ json: value });
      });
      if (platform === 'desktop') await page.addInitScript(() => {
        Object.defineProperty(window, 'opencreatorDesktop', { value: {
          kind: 'desktop', readAppVersion: async () => '3.2.5', readConnectionConfig: async () => ({ baseUrl: '/.opencreator/runtime' }), subscribeConnectionConfig: () => () => {},
          readDesktopPreferences: async () => ({ closeBehavior: 'hide' }), updateDesktopPreferences: async () => ({ closeBehavior: 'hide' }), workspaceReady: () => {},
          subscribeNavigation: () => () => {}, notify: async () => {}, configureBackgroundNotifications: async () => ({ ok: true }),
          openExternal: async (url: string) => { (window as unknown as { __gatewayURL?: string }).__gatewayURL = url; }
        } });
      });
      try {
        await runtime.openApp(page);
        await page.evaluate(() => { window.location.hash = '#/account'; });
        const center = page.getByRole('main', { name: '个人中心' });
        await expect(center.locator('.account-credits__value')).toContainText('413.937');
        await expect(center.getByRole('button', { name: '充值积分' })).toBeEnabled();
        await expect(center.getByRole('tab')).toHaveCount(0);
        snapshots.push({ text: await center.innerText(), box: await center.locator('.personal-center__content').boundingBox() });
        await page.screenshot({ path: testInfo.outputPath(`account-${platform}-${viewport.width}.png`) });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (platform === 'browser') {
          const popup = page.waitForEvent('popup');
          await center.getByRole('button', { name: '充值积分' }).click();
          const portal = await popup; await expect(portal).toHaveURL(handoffURL); await portal.close();
        } else {
          await center.getByRole('button', { name: '充值积分' }).click();
          await expect.poll(() => page.evaluate(() => (window as unknown as { __gatewayURL?: string }).__gatewayURL)).toBe(handoffURL);
        }
        expect(requests).toEqual([{ destination: 'recharge', locale: 'zh' }]);
      } finally { await context.close(); }
    }
    expect(snapshots[1]).toEqual(snapshots[0]);
  }
});
