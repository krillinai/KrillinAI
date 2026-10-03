import assert from 'node:assert/strict';
import { Socket } from 'node:net';
import { app } from 'electron';

app.setPath('userData', process.argv[4]);

Socket.prototype.setTypeOfService = () => {
  throw Object.assign(new Error('setTypeOfService EINVAL'), { code: 'EINVAL' });
};
globalThis.fetch = () => {
  throw new Error('Built-in Undici fetch must not handle Desktop requests');
};

void (async () => {
  await app.whenReady();
  const { fetchDesktopRequest } = await import(process.argv[2]);
  const origin = process.argv[3];
  const json = await fetchDesktopRequest(`${origin}/json`);
  assert.deepEqual(await json.json(), { ok: true });
  const binary = await fetchDesktopRequest(`${origin}/binary`);
  assert.deepEqual([...new Uint8Array(await binary.arrayBuffer())], [0, 255, 17, 23]);
  const events = await fetchDesktopRequest(`${origin}/events`);
  assert.equal(await events.text(), 'data: first\n\ndata: second\n\n');
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
  const cancellation = new AbortController();
  const pending = fetchDesktopRequest(`${origin}/wait`, { signal: cancellation.signal });
  setTimeout(() => cancellation.abort(), 50);
  await assert.rejects(pending, { name: 'AbortError' });
  console.log('DESKTOP_NETWORK_QOS_REGRESSION_PASSED');
  app.exit(0);
})().catch(error => {
  console.error(error);
  app.exit(1);
});
