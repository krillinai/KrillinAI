import Fastify from 'fastify';
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { join, resolve } from 'node:path';
import { stringify } from '@iarna/toml';
import { createDefaultCreatorServicesConfig, gatewayVideoSizes, type VideoGenerationSize } from '@opencreator/protocol';
import { createGatewayCreatorSource } from '../src/gateway/creator-service-source.js';
import { createDirectTransport, DIRECT_MEDIA_ADAPTER_VERSION } from '../src/gateway/direct-transport.js';
import { generateImageContents } from '../src/image-generation/provider.js';
import { createVideoGenerationService } from '../src/video-generation/service.js';
import { validateMediaFile } from '../src/creator/validators/media.js';
import { readPrivateJsonFile } from '../src/config/private-json-file.js';
import { createOfficialFetch } from '../src/gateway/official-fetch.js';
import { readVerificationNetwork, verifiedCountries } from './openrouter-verification-network.js';
import { familyRepresentatives, mediaFamily, mediaProfile, passedProfile, profileOperations, referenceDimensions, videoShapeMismatch, verificationBlockReason, type MediaCatalogItem, type MediaProfile, type VerificationFailureEvidence } from './openrouter-media-profiles.js';

const args = process.argv.slice(2);
const option = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const outputRoot = resolve(args.find(arg => !arg.startsWith('--')) ?? '.state/media-verification');
const budgetUsd = Number(option('budget') ?? 3);
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || budgetUsd > 30) throw new Error('Verification budget must be greater than zero and no more than USD 30');
const modality = option('modality') ?? 'all';
if (!['all', 'image', 'video'].includes(modality)) throw new Error('Invalid verification modality');
const concurrency = Number(option('concurrency') ?? 1);
if (concurrency !== 1) throw new Error('Family verification is sequential to stop spending immediately on a funding block');
const planOnly = args.includes('--plan');
const evidenceOnly = args.includes('--evidence-only');
const referenceTests = args.includes('--reference-tests');
const retryFailed = args.includes('--retry-failed');
const exec = promisify(execFile);
const upstream = createOfficialFetch();
await mkdir(outputRoot, { recursive: true, mode: 0o700 });
if (!planOnly && await access(join(outputRoot, 'report.json')).then(() => true, () => false)) throw new Error('Use a fresh report directory; existing paid runs must never be resubmitted');
const catalogs: Record<string, MediaCatalogItem[]> = {};
if (option('video-shape') && !option('model')) throw new Error('A video shape override requires an explicit model');
if (option('catalog')) Object.assign(catalogs, JSON.parse(await readFile(resolve(option('catalog')!), 'utf8')));
else for (const kind of ['image', 'video'] as const) {
  const response = await upstream(`https://openrouter.ai/api/v1/${kind}s/models`, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error(`The ${kind} model catalog is unavailable`);
  const { data } = await response.json() as { data?: MediaCatalogItem[] };
  if (!Array.isArray(data) || data.some(item => typeof item.id !== 'string' || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+$/.test(item.id))) throw new Error('Invalid model catalog');
  catalogs[kind] = data;
}
const inventory = Object.entries(catalogs).flatMap(([kind, items]) => items
  .filter(item => !option('model') || item.id === option('model'))
  .map(item => mediaProfile(item, kind as 'image' | 'video', kind === 'video' ? option('video-shape') : undefined)))
  .filter(profile => modality === 'all' || profile.modality === modality);
const profiles = option('model') ? inventory : familyRepresentatives(inventory);
if (!profiles.length) throw new Error('No models matched the verification selection');
const unsupported = inventory.filter(profile => !profile.model).map(({ id, unsupportedReason }) => ({ id, reason: unsupportedReason }));
const unclassified = inventory.filter(profile => profile.model && !mediaFamily(profile)).map(profile => profile.id);
const families = profiles.map(profile => ({ modality: profile.modality, family: mediaFamily(profile) ?? 'explicit selection', representative: profile.id, operations: profileOperations(profile) }));
await writeFile(join(outputRoot, 'catalog.json'), `${JSON.stringify(catalogs, null, 2)}\n`, { mode: 0o600 });
await writeFile(join(outputRoot, 'plan.json'), `${JSON.stringify({ discoveredAt: new Date().toISOString(), selection: 'family-representatives', referenceTests, budgetUsd, families, unsupported, unclassified, profiles }, null, 2)}\n`, { mode: 0o600 });
if (planOnly) {
  process.stdout.write(`${JSON.stringify({ families, eligible: profiles.filter(profile => profile.model).length, unsupported, unclassified, budgetUsd })}\n`);
  process.exit(0);
}

const ffprobe = option('ffprobe') ?? 'ffprobe';
const ffmpeg = option('ffmpeg') ?? 'ffmpeg';
if (!evidenceOnly && profiles.some(profile => profile.model?.modality === 'video')) {
  await exec(ffprobe, ['-version'], { timeout: 10_000 });
  await exec(ffmpeg, ['-version'], { timeout: 10_000 });
}
const referencePath = option('reference-image');
if (!referencePath && !evidenceOnly) throw new Error('Supply --reference-image=/path/to/a/test-image for edit and image-to-video verification');
const reference = referencePath ? await readFile(referencePath) : undefined;

// Credentials travel through stdin and never enter shell arguments or report artifacts.
const chunks: Buffer[] = [];
let credentialBytes = 0;
if (!evidenceOnly) for await (const chunk of process.stdin) {
  credentialBytes += chunk.length;
  if (credentialBytes > 16_384) throw new Error('Invalid platform credential input');
  chunks.push(Buffer.from(chunk));
}
const credential = evidenceOnly ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')) as { key?: string; costBearer?: string; name?: string; accountRemainingUsd?: number; productionReserveUsd?: number; balanceCheckedAt?: string };
const key = credential.key;
if (!evidenceOnly) {
  if (!key?.startsWith('sk-or-') || credential.costBearer !== 'platform' || !credential.name?.startsWith('OpenCreator platform media verification')) throw new Error('Use a dedicated platform verification key');
  const checkedAt = Date.parse(credential.balanceCheckedAt ?? '');
  if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > 60_000 || checkedAt > Date.now() + 5_000
    || typeof credential.accountRemainingUsd !== 'number' || !Number.isFinite(credential.accountRemainingUsd)
    || typeof credential.productionReserveUsd !== 'number' || credential.productionReserveUsd < 5
    || credential.accountRemainingUsd < budgetUsd + credential.productionReserveUsd) throw new Error('Provisioner must confirm fresh owner balance covering the test budget plus at least USD 5 production reserve');
}
async function keyInfo() {
  const response = await upstream('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error('Verification key inspection failed');
  const { data } = await response.json() as { data: { limit?: number; usage?: number; is_management_key?: boolean } };
  if (data.is_management_key || typeof data.limit !== 'number' || data.limit <= 0 || data.limit > budgetUsd) throw new Error('The platform verification key must have a cumulative limit within the verification budget');
  return { limitUsd: data.limit, usageUsd: data.usage ?? 0 };
}
const initialUsage = evidenceOnly ? { limitUsd: 0, usageUsd: 0 } : await keyInfo();
type OperationResult = { operation: string; status: 'passed' | 'failed' | 'blocked' | 'untested'; submissions: number; reportedCostUsd?: number; blockReason?: string; evidence?: VerificationFailureEvidence[]; reusedFrom?: string; [key: string]: unknown };
type ModelResult = { model: string; modality: string; status: 'pending' | 'passed' | 'partial' | 'failed' | 'blocked' | 'untested' | 'unsupported'; reason?: string; operations: OperationResult[] };
const results: ModelResult[] = profiles.map(profile => ({ model: profile.id, modality: profile.modality, status: profile.model ? 'pending' : 'unsupported', reason: profile.unsupportedReason, operations: [] }));
const approvals: Array<Record<string, unknown>> = [];
let reportWrites = Promise.resolve();
let observedUsage = initialUsage;
let fundingBlocked = false;
const priorReports = await Promise.all(args.filter(arg => arg.startsWith('--reuse-report=')).map(async arg => {
  const path = resolve(arg.slice('--reuse-report='.length));
  const report = JSON.parse(await readFile(path, 'utf8')) as { adapterVersion: number; networkTransport: string; results: ModelResult[] };
  const plan = JSON.parse(await readFile(join(resolve(path, '..'), 'plan.json'), 'utf8')) as { profiles: MediaProfile[] };
  if (report.adapterVersion !== DIRECT_MEDIA_ADAPTER_VERSION || report.networkTransport !== 'official-fetch') throw new Error('Reuse requires matching adapter version and official transport');
  return { path, report, plan };
}));
async function previousOperation(profile: MediaProfile, operation: string): Promise<OperationResult | undefined> {
  for (const { path, report, plan } of priorReports) {
    if (JSON.stringify(plan.profiles.find(item => item.id === profile.id)?.model) !== JSON.stringify(profile.model)) continue;
    const prior = report.results.find(result => result.model === profile.id)?.operations.find(result => result.operation === operation);
    if (!prior) continue;
    if (prior.status === 'passed') {
      if (prior.restartReplay !== true || typeof prior.outputPath !== 'string' || typeof prior.sha256 !== 'string') throw new Error('Incomplete previous acceptance evidence');
      const content = await readFile(prior.outputPath);
      if (createHash('sha256').update(content).digest('hex') !== prior.sha256) throw new Error('Previous media evidence hash mismatch');
      if (profile.modality === 'video') {
        if (typeof prior.width !== 'number' || typeof prior.height !== 'number') throw new Error('Previous video dimensions are missing');
        const mismatch = videoShapeMismatch(profile.model!, prior.width, prior.height);
        if (mismatch) return { ...prior, status: 'failed', error: mismatch, submissions: 0, reusedFrom: path };
      }
      return { ...prior, submissions: 0, reusedFrom: path };
    }
    const blockReason = verificationBlockReason(prior.evidence ?? []);
    const unknownOutcome = (prior.evidence as Array<{ state?: string }> | undefined)?.some(item => ['submitting', 'waiting_upstream', 'outcome_unknown'].includes(item.state ?? ''));
    if (blockReason === 'provider-access' || unknownOutcome || evidenceOnly || (!retryFailed && blockReason !== 'funding')) return { ...prior, status: blockReason || unknownOutcome ? 'blocked' : 'failed', blockReason: unknownOutcome ? 'unknown-outcome' : blockReason, submissions: 0, reusedFrom: path };
  }
  return undefined;
}
function checkpoint() {
  reportWrites = reportWrites.then(async () => {
    const reportedCostUsd = results.flatMap(result => result.operations).reduce((sum, operation) => sum + (operation.reusedFrom ? 0 : operation.reportedCostUsd ?? 0), 0);
    const report = { adapterVersion: DIRECT_MEDIA_ADAPTER_VERSION, networkTransport: 'official-fetch', updatedAt: new Date().toISOString(), selection: 'family-representatives', families, unsupported, unclassified, fundingBlocked, costBearer: 'platform', referenceSha256: reference ? createHash('sha256').update(reference).digest('hex') : undefined, catalogCounts: Object.fromEntries(Object.entries(catalogs).map(([kind, items]) => [kind, items.length])), usage: { ...observedUsage, incrementalUsageUsd: observedUsage.usageUsd - initialUsage.usageUsd, upstreamReportedCostUsd: reportedCostUsd, usageUpdatePending: observedUsage.usageUsd - initialUsage.usageUsd + 1e-9 < reportedCostUsd }, results };
    await writeFile(join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await writeFile(join(outputRoot, 'verified-media.toml'), stringify({ openrouter: { verified_media_models: approvals } } as never), { mode: 0o600 });
  });
  return reportWrites;
}
await checkpoint();

async function verifyOperation(profile: MediaProfile, operation: string): Promise<OperationResult> {
  const model = profile.model!;
  const firstFrame = await sharp(reference!).resize(referenceDimensions(model).width, referenceDimensions(model).height, { fit: 'contain', background: 'white' }).png().toBuffer();
  const root = join(outputRoot, profile.modality, profile.id.replace('/', '__'), operation);
  const receiptsRoot = join(root, 'receipts');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const networkBefore = await readVerificationNetwork(upstream);
  let submissions = 0;
  const fetcher: typeof fetch = async (url, options) => {
    if (options?.method === 'POST' && /^https:\/\/openrouter\.ai\/api\/v1\/(images|videos)$/.test(String(url))) {
      if (submissions >= 1) throw new Error('The verifier blocked a second paid submission');
      if (fundingBlocked) throw new Error('No new submissions after a funding block');
      const usage = await keyInfo();
      observedUsage = usage;
      const reported = results.flatMap(result => result.operations).reduce((sum, result) => sum + (result.reusedFrom ? 0 : result.reportedCostUsd ?? 0), 0);
      if (Math.max(usage.usageUsd, initialUsage.usageUsd + reported) >= Math.min(usage.limitUsd, budgetUsd)) { fundingBlocked = true; throw new Error('The verification budget is exhausted'); }
      submissions++;
    }
    return upstream(url, options);
  };
  const manual = createDefaultCreatorServicesConfig();
  let origin: string | undefined;
  const source = createGatewayCreatorSource({ directRequestsRoot: receiptsRoot, fetcher,
    account: {
      peekState: () => ({ source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'platform-verification', email: 'platform-verification@invalid', verified: true }, bindingVersion: 'platform-verification', models: [model], selectedModels: { [model.modality]: model.id }, activationError: null }),
      modelCredentials: async () => ({ accountId: 'platform-verification', bindingVersion: 'platform-verification', keyVersion: 'platform', modelKey: key!, baseUrl: 'https://openrouter.ai/api/v1', transport: 'openrouter-direct', models: [model], defaults: { [model.modality]: model.id } })
    },
    manual: { read: async () => structuredClone(manual), write: async value => value, reset: async () => manual },
    getLocalOrigin: () => origin
  });
  const server = Fastify();
  let requestId: string | undefined;
  let observedMedia: Record<string, unknown> | undefined;
  let deliveryVerified = false;
  let parameterError: string | undefined;
  const logicalId = `verify:${profile.id}:${operation}`;
  process.stderr.write(`${JSON.stringify({ model: profile.id, operation, phase: 'submitting' })}\n`);
  try {
    await source.register(server);
    origin = await server.listen({ host: '127.0.0.1', port: 0 });
    let content: Buffer;
    let media: Record<string, unknown>;
    const restarted = createDirectTransport(receiptsRoot, fetcher);
    if (model.modality === 'image') {
      const config = await source.store.read();
      const options = model.imageOptions!;
      const generated = await generateImageContents({ provider: 'openai', prompt: operation === 'image-edit' ? 'Change the ceramic cup to blue. Keep the white table and composition.' : 'A red ceramic cup on a white table, simple product photograph.', size: '1024x1024', quality: 'medium', count: 1, aspectRatio: options.aspectRatios?.[0], resolution: options.resolutions?.[0], officialQuality: options.qualities?.[0] }, config, { logicalId, onGatewayRequest: id => { requestId = id; }, ...(operation === 'image-edit' ? { referenceImage: { content: firstFrame, mime: 'image/png' as const } } : {}) });
      content = generated.contents[0]?.content!;
      if (generated.contents.length !== 1 || !content?.length || !requestId || submissions !== 1) throw new Error('The image was not delivered with one recoverable submission');
      const image = await sharp(content).metadata();
      await sharp(content).raw().toBuffer();
      if (!image.width || !image.height || !['png', 'jpeg', 'webp'].includes(image.format ?? '')) throw new Error('The generated raster image could not be decoded');
      if (options.aspectRatios?.[0]) {
        const [a, b] = options.aspectRatios[0].split(':').map(Number);
        if (Math.abs(image.width / image.height - a! / b!) > 0.02) parameterError = 'The image does not match the verified aspect ratio';
      }
      const outputPath = join(root, `image.${image.format === 'jpeg' ? 'jpg' : image.format}`);
      observedMedia = { width: image.width, height: image.height, format: image.format, outputPath };
      await writeFile(outputPath, content, { mode: 0o600 });
      if (!content.equals(await readFile(outputPath))) throw new Error('Image saving failed');
      const replay = await restarted.request({ account: 'platform-verification', key: key!, method: 'GET', resource: `requests/${requestId}/result`, body: undefined, contentType: 'application/json', identity: '', fingerprint: '', signal: AbortSignal.timeout(30_000) });
      const replayData = await replay.json() as { data?: Array<{ b64_json?: string }> };
      if (!content.equals(Buffer.from(replayData.data?.[0]?.b64_json ?? '', 'base64'))) throw new Error('Image restart replay failed');
      media = observedMedia;
    } else {
      const createService = () => createVideoGenerationService({ dataDir: root, configStore: source.store, gatewaySource: source });
      const size = gatewayVideoSizes(model)[0]! as VideoGenerationSize;
      const duration = model.durations![0]!;
      let task = await createService().create({ provider: 'seedance', model: model.id, prompt: operation === 'image-to-video' ? 'The camera slowly moves around the ceramic cup on the white table.' : 'A red ceramic cup on a white table. The camera slowly moves around the cup.', size, duration, ...(operation === 'image-to-video' ? { referenceImage: { mime: 'image/png' as const, data: firstFrame.toString('base64') } } : {}) }, { logicalId, onGatewayRequest: id => { requestId = id; } });
      const service = createService();
      const deadline = Date.now() + 20 * 60_000;
      while (!['completed', 'failed'].includes(task.status)) {
        if (Date.now() >= deadline) throw new Error('Video generation did not finish within the verification deadline; do not resubmit');
        await delay(5_000);
        task = await service.refresh(task.id, { signal: AbortSignal.timeout(120_000), onGatewayRequest: id => { requestId = id; } });
      }
      if (task.status !== 'completed' || !requestId || submissions !== 1) throw new Error('Video generation failed or did not produce a recoverable result');
      content = (await service.read(task.id)).content;
      const outputPath = join(root, 'video.mp4');
      await service.copyTo(task.id, outputPath);
      if (!content.equals(await readFile(outputPath))) throw new Error('Video saving failed');
      const probe = await validateMediaFile(outputPath, ffprobe);
      observedMedia = { ...probe, outputPath, resultId: task.id };
      if (!probe.hasVideo || !probe.width || !probe.height || Math.abs(probe.duration - duration) > 0.75) throw new Error('The generated video does not match the requested duration');
      parameterError = videoShapeMismatch(model, probe.width, probe.height);
      await exec(ffmpeg, ['-v', 'error', '-xerror', '-i', outputPath, '-map', '0:v:0', '-f', 'null', '-'], { timeout: 120_000, maxBuffer: 1024 * 1024 });
      await exec(ffmpeg, ['-v', 'error', '-ss', String(probe.duration / 2), '-i', outputPath, '-frames:v', '1', join(root, 'poster.jpg')], { timeout: 30_000 });
      const replay = await restarted.request({ account: 'platform-verification', key: key!, method: 'GET', resource: `requests/${requestId}`, body: undefined, contentType: 'application/json', identity: '', fingerprint: '', signal: AbortSignal.timeout(30_000) });
      if ((await replay.json() as { state?: string }).state !== 'succeeded') throw new Error('Video restart lookup failed');
      const downloaded = await restarted.request({ account: 'platform-verification', key: key!, method: 'GET', resource: `requests/${requestId}/result`, body: undefined, contentType: 'application/json', identity: '', fingerprint: '', signal: AbortSignal.timeout(120_000) });
      if (!content.equals(Buffer.from(await downloaded.arrayBuffer()))) throw new Error('Video restart download failed');
      media = observedMedia;
    }
    if (submissions !== 1) throw new Error('Recovery triggered another paid submission');
    deliveryVerified = true;
    if (parameterError) throw new Error(parameterError);
    const receipt = await readPrivateJsonFile(join(receiptsRoot, `${requestId}.json`)) as Record<string, unknown>;
    const networkAfter = await readVerificationNetwork(upstream).catch(() => undefined);
    return { operation, status: 'passed', submissions, ...media!, restartReplay: true, sha256: createHash('sha256').update(content!).digest('hex'), requestId, upstreamRequestId: receipt.upstreamRequestId, upstreamGenerationId: receipt.upstreamGenerationId, reportedCostUsd: typeof receipt.reportedCostUsd === 'number' ? receipt.reportedCostUsd : undefined,
      verifiedCountries: verifiedCountries(networkBefore, networkAfter), networkBefore, networkAfter };
  } catch (error) {
    const files = await readdir(receiptsRoot).catch(() => []);
    const evidence = await Promise.all(files.filter(name => name.endsWith('.json')).map(async name => {
      const receipt = await readPrivateJsonFile(join(receiptsRoot, name)) as Record<string, unknown> & VerificationFailureEvidence;
      return { requestId: name.replace(/\.json$/, ''), state: receipt.state, model: receipt.model, upstreamError: receipt.upstreamError, upstreamRequestId: receipt.upstreamRequestId, upstreamGenerationId: receipt.upstreamGenerationId, reportedCostUsd: typeof receipt.reportedCostUsd === 'number' ? receipt.reportedCostUsd : undefined };
    }));
    const blockReason = verificationBlockReason(evidence) ?? (fundingBlocked ? 'funding' : undefined);
    if (blockReason === 'funding') fundingBlocked = true;
    return { operation, status: blockReason ? 'blocked' : 'failed', blockReason, submissions, ...observedMedia, deliveryVerified, parametersMatched: parameterError ? false : undefined, reportedCostUsd: evidence.reduce((sum, receipt) => sum + (receipt.reportedCostUsd ?? 0), 0), error: error instanceof Error ? error.message.replaceAll(key!, '[redacted]') : 'Verification failed', evidence };
  } finally { await source.revoke(); await server.close(); }
}

// Cover each family's base generation before spending on reference operations.
for (const phase of ['generation', 'references']) {
  for (const [index, profile] of profiles.entries()) {
    if (!profile.model) continue;
    const result = results[index]!;
    const operations = profileOperations(profile);
    for (const operation of operations.filter((_, i) => phase === 'generation' ? i === 0 : i > 0)) {
      const prior = await previousOperation(profile, operation);
      const referenceUnselected = phase === 'references' && (!referenceTests || result.operations[0]?.status !== 'passed');
      const current = prior ?? (evidenceOnly || referenceUnselected ? { operation, status: 'untested' as const, submissions: 0 } : fundingBlocked ? { operation, status: 'blocked' as const, blockReason: 'funding', submissions: 0 } : await verifyOperation(profile, operation));
      result.operations.push(current);
      await checkpoint();
    }
    const passed = result.operations.filter(operation => operation.status === 'passed').map(operation => operation.operation);
    const admitted = passedProfile(profile.model, passed);
    result.status = passed.length === operations.length ? 'passed' : passed.length ? 'partial' : result.operations.some(op => op.status === 'failed') ? 'failed' : result.operations.some(op => op.status === 'blocked') ? 'blocked' : 'untested';
    const previousApproval = approvals.findIndex(item => item.id === profile.id);
    if (previousApproval >= 0) approvals.splice(previousApproval, 1);
    const regionalProfiles = result.operations.filter(operation => operation.status === 'passed').map(operation => Array.isArray(operation.verifiedCountries) ? operation.verifiedCountries as string[] : []);
    const countries = regionalProfiles[0]?.filter(country => regionalProfiles.every(profile => profile.includes(country))) ?? [];
    if (admitted) approvals.push({ id: admitted.id, modality: admitted.modality, capabilities: admitted.capabilities, adapter_version: DIRECT_MEDIA_ADAPTER_VERSION, verified_at: new Date().toISOString(), evidence: join(outputRoot, 'report.json'), verified_countries: countries, ...(admitted.imageOptions ? { image_options: { max_images: 1, max_references: admitted.imageOptions.maxReferences, aspect_ratios: admitted.imageOptions.aspectRatios, resolutions: admitted.imageOptions.resolutions, qualities: admitted.imageOptions.qualities, output_formats: admitted.imageOptions.outputFormats } } : { durations: admitted.durations, sizes: admitted.sizes ?? [], resolutions: admitted.resolutions ?? [], aspect_ratios: admitted.aspectRatios ?? [] }) });
    process.stderr.write(`${JSON.stringify({ model: profile.id, status: result.status, operations: result.operations.map(({ operation, status }) => ({ operation, status })) })}\n`);
    await checkpoint();
  }
}
if (!evidenceOnly) try { observedUsage = await keyInfo(); } catch { process.stderr.write('Final key usage is unavailable; confirm usage when disabling the platform key.\n'); }
await checkpoint();
process.stdout.write(`${JSON.stringify({ report: join(outputRoot, 'report.json'), counts: Object.fromEntries(['passed', 'partial', 'failed', 'blocked', 'untested', 'unsupported', 'pending'].map(status => [status, results.filter(result => result.status === status).length])), admittedModels: approvals.length, observedUsage })}\n`);
if (results.some(result => result.status !== 'passed')) process.exitCode = 1;
