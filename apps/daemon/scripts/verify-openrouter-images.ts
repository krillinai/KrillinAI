import Fastify from 'fastify';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { stringify } from '@iarna/toml';
import { createDefaultCreatorServicesConfig, type GatewayModel } from '@opencreator/protocol';
import { createGatewayCreatorSource } from '../src/gateway/creator-service-source.js';
import { createDirectTransport, DIRECT_MEDIA_ADAPTER_VERSION } from '../src/gateway/direct-transport.js';
import { generateImageContents } from '../src/image-generation/provider.js';
import { readPrivateJsonFile } from '../src/config/private-json-file.js';
import { createOfficialFetch } from '../src/gateway/official-fetch.js';
import { readVerificationNetwork, verifiedCountries } from './openrouter-verification-network.js';

// The key is supplied through stdin so it never enters shell arguments or acceptance reports.
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
  chunks.push(Buffer.from(chunk));
  if (Buffer.concat(chunks).length > 16_384) throw new Error('Invalid platform credential input');
}
if (chunks.length === 0) throw new Error('Supply a dedicated platform verification credential through stdin');
const credential = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { key?: string; costBearer?: string; name?: string };
const key = credential.key;
if (!key || !key.startsWith('sk-or-') || credential.costBearer !== 'platform' || !credential.name?.startsWith('OpenCreator platform media verification')) throw new Error('An independently provisioned platform verification key is required');
const outputRoot = resolve(process.argv[2] ?? '.state/media-verification');
await mkdir(outputRoot, { recursive: true, mode: 0o700 });
const keyInfo = async () => {
  const response = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error('Platform verification key could not be inspected');
  const { data } = await response.json() as { data: { label?: string; limit?: number; usage?: number; is_management_key?: boolean } };
  if (data.is_management_key || typeof data.limit !== 'number' || data.limit <= 0 || data.limit > 0.15) throw new Error('Use a dedicated platform verification key with a maximum USD 0.15 limit');
  return { limitUsd: data.limit, usageUsd: data.usage ?? 0 };
};
const initialUsage = await keyInfo();
const results: Array<Record<string, unknown>> = [];
const approvals: Array<Record<string, unknown>> = [];

for (const id of ['black-forest-labs/flux-3-image', 'black-forest-labs/flux.2-klein-4b']) {
  const modelRoot = join(outputRoot, id.split('/').at(-1)!);
  const receiptsRoot = join(modelRoot, 'receipts');
  await mkdir(modelRoot, { recursive: true, mode: 0o700 });
  const response = await fetch(`https://openrouter.ai/api/v1/images/models/${id}/endpoints`, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error(`Endpoint metadata unavailable for ${id}`);
  const metadata = await response.json() as { endpoints?: Array<{ supported_parameters?: Record<string, { max?: number; values?: string[] }> }> };
  const parameters = metadata.endpoints?.[0]?.supported_parameters;
  if (!parameters?.aspect_ratio?.values?.includes('1:1')) throw new Error(`A square verification profile is unavailable for ${id}`);
  const model: GatewayModel = { id, modality: 'image', capabilities: [], imageOptions: {
    maxImages: 1, maxReferences: 0, aspectRatios: ['1:1'],
    ...(parameters.resolution?.values?.includes('1K') ? { resolutions: ['1K'] } : {}),
    ...(parameters.output_format?.values?.includes('png') ? { outputFormats: ['png'] } : {})
  } };
  let submissions = 0;
  const officialFetch = createOfficialFetch();
  const networkBefore = await readVerificationNetwork(officialFetch);
  const fetcher: typeof fetch = async (url, options) => {
    if (String(url) === 'https://openrouter.ai/api/v1/images' && options?.method === 'POST') submissions++;
    return officialFetch(url, options);
  };
  const manual = createDefaultCreatorServicesConfig();
  const source = createGatewayCreatorSource({ directRequestsRoot: receiptsRoot, fetcher,
    account: {
      peekState: () => ({ source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'platform-verification', email: 'platform-verification@invalid', verified: true }, bindingVersion: 'platform-verification', models: [model], selectedModels: { image: id }, activationError: null }),
      modelCredentials: async () => ({ accountId: 'platform-verification', bindingVersion: 'platform-verification', keyVersion: 'platform', modelKey: key, baseUrl: 'https://openrouter.ai/api/v1', transport: 'openrouter-direct', models: [model], defaults: { image: id } })
    },
    manual: { read: async () => structuredClone(manual), write: async value => value, reset: async () => manual },
    getLocalOrigin: () => origin
  });
  const server = Fastify();
  let origin: string | undefined;
  try {
    await source.register(server);
    origin = await server.listen({ host: '127.0.0.1', port: 0 });
    const config = await source.store.read();
    let requestId: string | undefined;
    process.stderr.write(`${JSON.stringify({ model: id, phase: 'submitting_platform_verification' })}\n`);
    const generated = await generateImageContents({ provider: 'openai', prompt: 'A red ceramic cup on a white table, simple product photograph.', size: '1024x1024', quality: 'medium', count: 1, aspectRatio: '1:1', ...(model.imageOptions?.resolutions?.length ? { resolution: '1K' } : {}) }, config,
      { logicalId: `verify:${id}`, onGatewayRequest: id => { requestId = id; } });
    const content = generated.contents[0]?.content;
    if (!content || !requestId || submissions !== 1) throw new Error('Generation did not return exactly one recoverable image');
    const image = await sharp(content).metadata();
    if (!image.width || !image.height || image.width !== image.height) throw new Error('The generated image failed square-profile validation');
    const imagePath = join(modelRoot, `image.${image.format === 'jpeg' ? 'jpg' : image.format}`);
    await writeFile(imagePath, content, { mode: 0o600 });
    if (!content.equals(await readFile(imagePath))) throw new Error('The generated image could not be saved correctly');
    const restarted = createDirectTransport(receiptsRoot, fetcher);
    const replay = await restarted.request({ account: 'platform-verification', key, method: 'GET', resource: `requests/${requestId}/result`, body: undefined, contentType: 'application/json', identity: '', fingerprint: '', signal: AbortSignal.timeout(30_000) });
    const replayData = await replay.json() as { data?: Array<{ b64_json?: string }> };
    if (!content.equals(Buffer.from(replayData.data?.[0]?.b64_json ?? '', 'base64')) || submissions !== 1) throw new Error('Restart recovery did not replay the original image');
    const receipt = await readPrivateJsonFile(join(receiptsRoot, `${requestId}.json`)) as Record<string, unknown>;
    results.push({ model: id, status: 'passed', width: image.width, height: image.height, format: image.format, submissions, restartReplay: true, sha256: createHash('sha256').update(content).digest('hex'), requestId, upstreamRequestId: receipt.upstreamRequestId, upstreamGenerationId: receipt.upstreamGenerationId, reportedCostUsd: receipt.reportedCostUsd });
    const networkAfter = await readVerificationNetwork(officialFetch).catch(() => undefined);
    const countries = verifiedCountries(networkBefore, networkAfter);
    results.at(-1)!.verifiedCountries = countries;
    approvals.push({ id, modality: 'image', capabilities: [], adapter_version: DIRECT_MEDIA_ADAPTER_VERSION, verified_at: new Date().toISOString(), evidence: join(outputRoot, 'report.json'), verified_countries: countries, image_options: { max_images: 1, max_references: 0, aspect_ratios: ['1:1'], resolutions: model.imageOptions?.resolutions ?? [], output_formats: model.imageOptions?.outputFormats ?? [] } });
  } catch (error) {
    const receipts = await readdir(receiptsRoot).catch(() => []);
    const evidence = await Promise.all(receipts.filter(name => name.endsWith('.json')).map(async name => {
      const receipt = await readPrivateJsonFile(join(receiptsRoot, name)) as Record<string, unknown>;
      return { requestId: name.replace(/\.json$/, ''), state: receipt.state, upstreamError: receipt.upstreamError, upstreamRequestId: receipt.upstreamRequestId, upstreamGenerationId: receipt.upstreamGenerationId, reportedCostUsd: typeof receipt.reportedCostUsd === 'number' ? receipt.reportedCostUsd : undefined };
    }));
    results.push({ model: id, status: 'failed', submissions, reportedCostUsd: evidence.reduce((sum, receipt) => sum + (receipt.reportedCostUsd ?? 0), 0), error: error instanceof Error ? error.message.replaceAll(key, '[redacted]') : 'Verification failed', evidence });
  } finally { await source.revoke(); await server.close(); }
}
const finalUsage = await keyInfo();
const incrementalUsageUsd = finalUsage.usageUsd - initialUsage.usageUsd;
const upstreamReportedCostUsd = results.reduce((sum, result) => sum + (typeof result.reportedCostUsd === 'number' ? result.reportedCostUsd : 0), 0);
const report = { adapterVersion: DIRECT_MEDIA_ADAPTER_VERSION, networkTransport: 'official-fetch', verifiedAt: new Date().toISOString(), costBearer: 'platform', usage: { ...finalUsage, incrementalUsageUsd, upstreamReportedCostUsd, usageUpdatePending: incrementalUsageUsd + 1e-9 < upstreamReportedCostUsd }, results };
await writeFile(join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
await writeFile(join(outputRoot, 'verified-media.toml'), stringify({ openrouter: { verified_media_models: approvals } } as never), { mode: 0o600 });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (results.some(result => result.status !== 'passed')) process.exitCode = 1;
