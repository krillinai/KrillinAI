const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const { Socket } = require('node:net');
const { app } = require('electron');

let phase = 'initialization';
const report = result => writeFileSync(process.env.OPENCREATOR_DESKTOP_NETWORK_TEST_RESULT, `${JSON.stringify({ phase, ...result }, null, 2)}\n`);

report({ ok: false, pending: true });

void (async () => {
  app.setPath('userData', process.argv[4]);
  Socket.prototype.setTypeOfService = () => {
    throw Object.assign(new Error('setTypeOfService EINVAL'), { code: 'EINVAL' });
  };
  globalThis.fetch = () => {
    throw new Error('Built-in Undici fetch must not handle Desktop requests');
  };
  await app.whenReady();
  phase = 'load network module';
  const { fetchDesktopRequest } = await import(process.argv[2]);
  const origin = process.argv[3];
  phase = 'JSON request';
  const json = await fetchDesktopRequest(`${origin}/json`);
  assert.deepEqual(await json.json(), { ok: true });
  phase = 'binary request';
  const binary = await fetchDesktopRequest(`${origin}/binary`);
  assert.deepEqual([...new Uint8Array(await binary.arrayBuffer())], [0, 255, 17, 23]);
  phase = 'SSE request';
  const events = await fetchDesktopRequest(`${origin}/events`);
  assert.equal(await events.text(), 'data: first\n\ndata: second\n\n');
  phase = 'streaming upload';
  const upload = await fetchDesktopRequest(`${origin}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(4096));
        controller.enqueue(new Uint8Array(8192));
        controller.close();
      }
    }),
    duplex: 'half'
  });
  assert.deepEqual(await upload.json(), { bytes: 12288 });
  phase = 'cancellation';
  const cancellation = new AbortController();
  const pending = fetchDesktopRequest(`${origin}/wait`, { signal: cancellation.signal });
  setTimeout(() => cancellation.abort(), 50);
  await assert.rejects(pending, { name: 'AbortError' });
  phase = 'complete';
  report({ ok: true });
  console.log('DESKTOP_NETWORK_QOS_REGRESSION_PASSED');
  app.exit(0);
})().catch(error => {
  report({ ok: false, error: error?.stack ?? String(error) });
  console.error(error);
  app.exit(1);
});
