import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createOfficialFetch } from '../src/gateway/official-fetch.js';

const root = resolve(process.argv[2]!);
await mkdir(root, { recursive: true, mode: 0o700 });
const chunks: Buffer[] = []; let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length; assert(size <= 16_384); chunks.push(Buffer.from(chunk));
}
const credential = JSON.parse(Buffer.concat(chunks).toString()) as { key: string; name: string; costBearer: string; accountRemainingUsd: number; productionReserveUsd: number; balanceCheckedAt: string };
assert(credential.key.startsWith('sk-or-') && credential.costBearer === 'platform' && credential.name.startsWith('OpenCreator platform audio verification'));
assert(Date.now() - Date.parse(credential.balanceCheckedAt) < 60_000 && credential.accountRemainingUsd >= 0.6 + credential.productionReserveUsd);
const upstream = createOfficialFetch();
const auth = { Authorization: `Bearer ${credential.key}` };
const keyInfo = await upstream('https://openrouter.ai/api/v1/key', { headers: auth, signal: AbortSignal.timeout(30_000), redirect: 'error' });
const { data: info } = await keyInfo.json();
assert(keyInfo.ok && !info.is_management_key && info.limit <= 0.6 && info.usage < 0.01);
const body = { model: 'heygen/heygen-voice-1-turbo', input: 'The red cup is on the table.', voice: 'f34178ba32584bfb98434bf6d07f1253', response_format: 'pcm' };
const response = await upstream('https://openrouter.ai/api/v1/audio/speech', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(120_000) });
const headers = Object.fromEntries([...response.headers].filter(([name]) => /^(content-type|x-generation-id|x-request-id)$/.test(name) || /sample|channel|audio.*rate|rate.*audio/.test(name)));
const content = Buffer.from(await response.arrayBuffer());
const result = { request: body, httpStatus: response.status, headers, bytes: content.length, headerNames: [...response.headers.keys()], error: response.ok ? undefined : content.toString().replaceAll(credential.key, '[redacted]'), outputPath: join(root, 'speech.pcm'), submissions: 1 };
if (response.ok) await writeFile(result.outputPath, content, { mode: 0o600 });
await writeFile(join(root, 'report.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
