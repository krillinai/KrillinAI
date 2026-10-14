import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createOfficialFetch } from '../src/gateway/official-fetch.js';

const root = resolve(process.argv[2] ?? '.state/openrouter-contract');
const source = 'https://openrouter.ai/openapi.json';
const response = await createOfficialFetch()(source, { signal: AbortSignal.timeout(45_000), redirect: 'error' });
if (!response.ok) throw new Error(`Official OpenAPI schema unavailable (${response.status})`);
const contract = await response.json() as { paths: Record<string, unknown>; components: { schemas: Record<string, unknown> } };
await mkdir(root, { recursive: true, mode: 0o700 });
await writeFile(join(root, 'openapi.json'), JSON.stringify(contract, null, 2), { mode: 0o600 });
for (const [name, schema] of Object.entries(contract.components.schemas)) {
  if (/image.*(request|response)|video.*(request|response|frame)/i.test(name)) process.stdout.write(`${JSON.stringify({ name, schema }, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify({ source, mediaPaths: Object.keys(contract.paths).filter(path => /^\/(images|videos)/.test(path)), savedContract: join(root, 'openapi.json') })}\n`);
