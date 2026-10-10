import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import type { FastifyInstance } from 'fastify';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../src/api/server.js';

let server: FastifyInstance | undefined;
let tempDir = '';

afterEach(async () => {
  await server?.close();
  server = undefined;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = '';
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('creator image generation', () => {
  it('persists an actionable native tool refusal in stage issues without exposing credentials', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'creator-native-image-error-'));
    const home = join(tempDir, 'local-codex-home');
    await mkdir(home);
    await writeFile(join(home, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'private-oauth-secret' } }));
    vi.stubEnv('TEST_CODEX_IMAGE_MODE', 'missing-reference');
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    server = await buildServer({ token: 'secret', dataDir: tempDir, codexHome: home, codexBin: await createImageCodexBin(home) });
    const initial = (await request('POST', '/creator/jobs', { projectId: 'project_image', templateId: 'image-generation' })).json().job;
    const updated = (await request('POST', `/creator/jobs/${initial.id}/actions`, {
      action: 'update-settings', expectedRevision: initial.revision,
      input: { patch: { prompt: 'One orange cat', provider: 'codex-native', candidateCount: 1 } }
    })).json().job;
    expect((await request('POST', `/creator/jobs/${initial.id}/actions`, {
      action: 'run-stage', expectedRevision: updated.revision, input: { stageId: 'generate' }
    })).statusCode).toBe(200);
    await vi.waitFor(async () => {
      const job = (await request('GET', `/creator/jobs/${initial.id}`)).json().job;
      expect(job.stages).toContainEqual(expect.objectContaining({ status: 'failed', errorCode: 'image_generation_failed', errorMessage: expect.stringContaining('参考图') }));
    });
    const issues = (await request('GET', `/creator/jobs/${initial.id}/issues`)).json().issues;
    expect(issues).toContainEqual(expect.objectContaining({ code: 'image_generation_failed', publicFacts: {
      kind: 'validation', provider: 'codex-native', upstreamCode: 'IMAGE_REFERENCE_MISSING',
      upstreamMessage: expect.stringContaining('没有可用的已上传人物照片')
    } }));
    expect(JSON.stringify(issues)).not.toContain('private-oauth-secret');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('runs native ChatGPT generation with checked capability, visible progress and saved Creator artifacts', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'creator-native-image-api-'));
    const home = join(tempDir, 'local-codex-home');
    const agentHome = join(tempDir, 'agent-codex-home');
    await mkdir(home);
    await mkdir(agentHome);
    await writeFile(join(home, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'private-oauth-secret' } }));
    const agentAuth = JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'agent-api-secret' });
    await writeFile(join(agentHome, 'auth.json'), agentAuth);
    await writeFile(join(agentHome, 'config.toml'), 'model = "agent-model"\nopenai_base_url = "https://agent.example.test/v1"\n');
    const bin = await createImageCodexBin(home);
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    vi.stubEnv('TEST_CODEX_IMAGE_DELAY_MS', '250');
    const config = createDefaultCreatorServicesConfig();
    server = await buildServer({ token: 'secret', dataDir: tempDir, codexHome: agentHome, localCodexHome: home, codexBin: bin, creatorServicesConfigStore: {
      async read() { return structuredClone(config); }, async write(next) { return structuredClone(next); }, async reset() { return structuredClone(config); }
    } });
    const status = await request('GET', '/creator-services/image/codex/status');
    expect(status.json()).toMatchObject({ authentication: 'chatgpt', ready: true, executionMode: 'native', version: 'codex-test 0.149.0' });
    const created = await request('POST', '/creator/jobs', { projectId: 'project_image', templateId: 'image-generation', creationKey: 'native-generation-flow' });
    const initial = created.json().job;
    const updated = await request('POST', `/creator/jobs/${initial.id}/actions`, { action: 'update-settings', expectedRevision: initial.revision, input: { patch: { prompt: 'One orange cat', provider: 'codex-native', candidateCount: 1 } } });
    const started = await request('POST', `/creator/jobs/${initial.id}/actions`, { action: 'run-stage', expectedRevision: updated.json().job.revision, input: { stageId: 'generate' } });
    expect(started.statusCode).toBe(200);
    await vi.waitFor(async () => {
      const running = (await request('GET', `/creator/jobs/${initial.id}`)).json().job;
      expect(running.stages).toContainEqual(expect.objectContaining({ status: 'running', progress: expect.objectContaining({ phase: 'generating_image', message: expect.stringContaining('ChatGPT'), completed: 0, total: 1 }) }));
    });
    const completed = await waitForCompletedJob(initial.id);
    expect(completed.artifacts).toContainEqual(expect.objectContaining({ kind: 'generated_image', status: 'completed', metadata: expect.objectContaining({ provider: 'codex-native', model: 'codex-native' }) }));
    expect(completed.state.latestResultVersion).toBe(1);
    const artifact = completed.artifacts.find((item: { kind: string }) => item.kind === 'generated_image');
    const content = await request('GET', `/creator/jobs/${initial.id}/artifacts/${artifact.id}/content`);
    expect(content.statusCode).toBe(200);
    expect(content.rawPayload.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(status.rawPayload.toString()).not.toContain('private-oauth-secret');
    expect(await readFile(join(agentHome, 'auth.json'), 'utf8')).toBe(agentAuth);
    expect(await readFile(join(agentHome, 'config.toml'), 'utf8')).toContain('agent-model');
  });

  it('uses local API credentials and follows local login changes without falling back to the Agent', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'creator-local-image-auth-'));
    const home = join(tempDir, 'local-codex-home');
    const agentHome = join(tempDir, 'agent-codex-home');
    await mkdir(home);
    await mkdir(agentHome);
    await writeFile(join(home, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'local-api-secret' }));
    await writeFile(join(home, 'config.toml'), 'model = "gpt-image-2"\nopenai_base_url = "https://local.example.test/v1"\n');
    const agentAuth = JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'agent-oauth-secret' } });
    await writeFile(join(agentHome, 'auth.json'), agentAuth);
    const bin = await createImageCodexBin(home);
    const image = png('local-api-image');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: image.toString('base64') }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    server = await buildServer({ token: 'secret', dataDir: tempDir, codexHome: agentHome, localCodexHome: home, codexBin: bin });
    const payload = { prompt: 'One orange cat', provider: 'codex-native', size: '1024x1024', quality: 'medium', count: 1 };

    const apiStatus = await request('GET', '/creator-services/image/codex/status');
    expect(apiStatus.json()).toMatchObject({ authentication: 'api_key', ready: true, executionMode: 'api', model: 'gpt-image-2' });
    const apiResult = await request('POST', '/image-generation/results', payload);
    expect(apiResult.statusCode).toBe(201);
    expect(apiResult.json().result.model).toBe('gpt-image-2');
    expect(fetchImpl).toHaveBeenCalledWith(new URL('https://local.example.test/v1/images/generations'), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer local-api-secret' })
    }));

    await writeFile(join(home, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'local-oauth-secret' }, OPENAI_API_KEY: 'old-local-key' }));
    const nativeStatus = await request('GET', '/creator-services/image/codex/status');
    expect(nativeStatus.json()).toMatchObject({ authentication: 'chatgpt', ready: true, executionMode: 'native' });
    const nativeResult = await request('POST', '/image-generation/results', payload);
    expect(nativeResult.statusCode).toBe(201);
    expect(nativeResult.json().result.model).toBe('codex-native');
    expect(fetchImpl).toHaveBeenCalledOnce();

    await writeFile(join(home, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'replacement-local-key', tokens: { access_token: 'old-local-oauth' } }));
    expect((await request('GET', '/creator-services/image/codex/status')).json()).toMatchObject({ authentication: 'api_key', ready: true, executionMode: 'api' });
    expect((await request('POST', '/image-generation/results', payload)).statusCode).toBe(201);
    expect(fetchImpl).toHaveBeenLastCalledWith(new URL('https://local.example.test/v1/images/generations'), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer replacement-local-key' })
    }));

    await rm(join(home, 'auth.json'));
    expect((await request('GET', '/creator-services/image/codex/status')).json()).toMatchObject({ ready: false, executionMode: null });
    expect((await request('POST', '/image-generation/results', payload)).statusCode).toBe(409);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await readFile(join(agentHome, 'auth.json'), 'utf8')).toBe(agentAuth);
    expect(JSON.stringify([apiStatus.json(), nativeStatus.json(), apiResult.json(), nativeResult.json()])).not.toContain('secret');
  });

  it('runs image generation through Creator Job, Stage, Artifact and ResultSnapshot', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'creator-image-api-'));
    const config = createDefaultCreatorServicesConfig();
    config.image.openai.apiKey = 'image-test-key';
    config.image.openai.baseUrl = 'https://images.example.test/v1';
    const image = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('creator-runtime-image')
    ]);
    const fetchImpl = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify({
      data: [{ b64_json: image.toString('base64') }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchImpl);
    server = await buildServer({
      token: 'secret',
      dataDir: tempDir,
      codexHome: join(tempDir, 'codex-home'),
      creatorServicesConfigStore: {
        async read() { return structuredClone(config); },
        async write(next) { return structuredClone(next); },
        async reset() { return structuredClone(config); }
      },
      codexProviderCredentialStore: {
        async readApiKey() { return undefined; },
        async writeApiKey() {}
      }
    });

    const templates = await request('GET', '/creator/templates');
    expect(templates.json().templates).toContainEqual(expect.objectContaining({
      id: 'image-generation',
      outputs: [{ kind: 'generated_image', required: true }]
    }));
    const created = await request('POST', '/creator/jobs', {
      projectId: 'project_image',
      templateId: 'image-generation',
      creationKey: 'image-generation-flow'
    });
    const initial = created.json().job;
    expect(initial.templateVersion).toBe(2);
    const updated = await request('POST', `/creator/jobs/${initial.id}/actions`, {
      action: 'update-settings',
      expectedRevision: initial.revision,
      input: {
        patch: {
          prompt: '参考上传图片的主体和构图生成创意工作室画面',
          provider: 'openai',
          size: '1536x1024',
          quality: 'high',
          candidateCount: 2
        }
      }
    });
    const blocked = await request('POST', `/creator/jobs/${initial.id}/actions`, {
      action: 'run-stage', expectedRevision: updated.json().job.revision, input: { stageId: 'generate' }
    });
    expect(blocked.statusCode).toBeGreaterThanOrEqual(400);
    expect(blocked.json()).toMatchObject({ error: { code: 'creator_stage_input_missing', issue: { publicFacts: { kind: 'validation', upstreamCode: 'IMAGE_REFERENCE_MISSING' } } } });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await request('GET', `/creator/jobs/${initial.id}`)).json().job.stages).toHaveLength(0);

    const reference = png('image-reference');
    const uploaded = await server.inject({
      method: 'POST',
      url: `/creator/jobs/${initial.id}/reference-image?expectedRevision=${updated.json().job.revision}&fileName=reference.png&mime=image%2Fpng&lastModified=123`,
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/vnd.opencreator.creator-reference-image'
      },
      payload: reference
    });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json()).toMatchObject({
      job: { state: { referenceImageArtifactId: expect.any(String) } },
      artifact: { kind: 'reference_image' }
    });
    const started = await request('POST', `/creator/jobs/${initial.id}/actions`, {
      action: 'run-stage',
      expectedRevision: uploaded.json().job.revision,
      input: { stageId: 'generate' }
    });
    expect(started.statusCode).toBe(200);

    const completed = await waitForCompletedJob(initial.id);
    expect(completed).toMatchObject({
      status: 'completed',
      state: {
        latestResultVersion: 1,
        resultSnapshots: [{
          version: 1,
          artifactRefs: {
            generated_image: expect.arrayContaining([
              expect.any(String),
              expect.any(String)
            ]),
            reference_image: [uploaded.json().artifact.id]
          }
        }]
      },
      stages: [{
        stageId: 'generate',
        status: 'succeeded',
        progress: {
          status: 'succeeded',
          completed: 2,
          failed: 0
        }
      }]
    });
    const generatedImages = completed.artifacts.filter((artifact: { kind: string }) => (
      artifact.kind === 'generated_image'
    ));
    expect(generatedImages).toHaveLength(2);
    expect(generatedImages[0]).toMatchObject({
      kind: 'generated_image',
      status: 'completed',
      metadata: {
        provider: 'openai',
        model: 'gpt-image-1',
        imageSize: '1536x1024',
        quality: 'high',
        resultVersion: 1
      }
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every(call => String(call[0]).endsWith('/images/edits')))
      .toBe(true);

    const content = await request(
      'GET',
      `/creator/jobs/${initial.id}/artifacts/${generatedImages[0].id}/content`
    );
    expect(content.statusCode).toBe(200);
    expect(content.rawPayload).toEqual(image);
  });
});

async function createImageCodexBin(expectedHome: string): Promise<string> {
  const fixture = fileURLToPath(new URL('../fixtures/fake-codex-image.mjs', import.meta.url));
  const bin = join(tempDir, 'fake-codex-image.mjs');
  await writeFile(bin, `#!/usr/bin/env node\nif (process.argv[2] === 'exec' && process.env.CODEX_HOME !== ${JSON.stringify(expectedHome)}) throw new Error('Image generation used the wrong Codex home');\nawait import(${JSON.stringify(fixture)});\n`);
  await chmod(bin, 0o755);
  return bin;
}

async function waitForCompletedJob(jobId: string) {
  const deadline = Date.now() + 10_000;
  let lastJob: unknown;
  while (Date.now() < deadline) {
    const response = await request('GET', `/creator/jobs/${jobId}`);
    const job = response.json().job;
    lastJob = job;
    if (job.status === 'completed') return job;
    if (job.status === 'failed' || job.status === 'needs_input') {
      throw new Error(`Image generation failed: ${JSON.stringify(job)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for image generation: ${JSON.stringify(lastJob)}`);
}

function png(label: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(label.padEnd(24, '.'))
  ]);
}

async function request(
  method: 'GET' | 'POST',
  url: string,
  payload?: object
): Promise<{ statusCode: number; json(): any; rawPayload: Buffer }> {
  return await server!.inject({
    method,
    url,
    headers: { authorization: 'Bearer secret' },
    ...(payload === undefined ? {} : { payload })
  }) as never;
}
