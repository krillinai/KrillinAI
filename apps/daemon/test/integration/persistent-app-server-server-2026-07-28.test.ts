import type { FastifyInstance } from 'fastify';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import {
  createAgentCapabilityTokenStore,
  type AgentCapabilityTokenStore
} from '../../src/agent-tools/capability-token.js';
import { createUnknownCapabilityMatrix } from '../../src/codex/capabilities.js';
import type { CodexSessionProvider } from '../../src/codex/sessions/app-server-provider.js';

let server: FastifyInstance | undefined;
let tempDir = '';

afterEach(async () => {
  await server?.close();
  server = undefined;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('persistent app-server server integration', () => {
  it('runs Creator turns with current local credentials and follows provider changes without losing the thread', async () => {
    const fixture = await createFixture({ followLocalConfiguration: true });
    // Startup must repair the copy before the first assistant request.
    expect(readFileSync(join(tempDir, 'codex-home', 'config.toml'), 'utf8'))
      .toContain('base_url = "https://current.example/v1"');
    expect(existsSync(join(tempDir, 'codex-home', 'auth.json'))).toBe(false);
    const created = await server!.inject({
      method: 'POST', url: '/creator/jobs', headers: { authorization: 'Bearer secret' },
      payload: { projectId: 'creator-local-config', templateId: 'video-download' }
    });
    expect(created.statusCode).toBe(201);
    const jobId = created.json().job.id;
    const sendTurn = () => server!.inject({
      method: 'POST', url: `/creator/jobs/${jobId}/agent-turns`,
      headers: { authorization: 'Bearer secret' }, payload: { message: 'Reply ok without tools.' }
    });
    expect((await sendTurn()).statusCode).toBe(200);
    writeFileSync(join(tempDir, 'local-codex', 'config.toml'), localConfiguration('https://changed.example/v1'));
    expect((await sendTurn()).statusCode).toBe(200);
    const turns = fixture.readMessages().filter(message => message.method === 'turn/start');
    expect(turns).toHaveLength(2);
    expect(turns[1]!.pid).not.toBe(turns[0]!.pid);
    const spawns = turns.map(turn => fixture.readSpawns().find(spawn => spawn.pid === turn.pid)!);
    expect(spawns[0]).toMatchObject({ codexHome: join(tempDir, 'codex-home'), hasAuth: false });
    expect(spawns[0]!.configuration).toContain('base_url = "https://current.example/v1"');
    expect(spawns[1]!.configuration).toContain('base_url = "https://changed.example/v1"');
    expect(fixture.readMessages().some(message => message.pid === turns[1]!.pid && message.method === 'thread/resume')).toBe(true);
  });

  it('repairs runtime configuration after a failed Creator turn and resumes only on a new request', async () => {
    const fixture = await createFixture({ followLocalConfiguration: true });
    const created = await server!.inject({
      method: 'POST', url: '/creator/jobs', headers: { authorization: 'Bearer secret' },
      payload: { projectId: 'creator-config-recovery', templateId: 'video-download' }
    });
    expect(created.statusCode).toBe(201);
    const jobId = created.json().job.id;
    const sendTurn = (message: string) => server!.inject({
      method: 'POST', url: `/creator/jobs/${jobId}/agent-turns`,
      headers: { authorization: 'Bearer secret' }, payload: { message }
    });
    expect((await sendTurn('Reply ok without tools.')).statusCode).toBe(200);
    writeFileSync(join(tempDir, 'codex-home', 'config.toml'), localConfiguration('https://drifted.example/v1'));

    const failed = await sendTurn('simulate-config-failure');
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error.issue).toMatchObject({
      code: 'creator_codex_config_resynced',
      publicFacts: { kind: 'configuration', provider: 'codex', upstreamMessage: 'Provider rejected the test model.' }
    });
    expect(readFileSync(join(tempDir, 'codex-home', 'config.toml'), 'utf8'))
      .toContain('base_url = "https://current.example/v1"');
    expect(fixture.readMessages().filter(message => message.method === 'turn/start')).toHaveLength(2);
    expect(readFileSync(join(tempDir, 'local-codex', 'config.toml'), 'utf8'))
      .toBe(localConfiguration('https://current.example/v1'));

    expect((await sendTurn('Retry without tools.')).statusCode).toBe(200);
    const turns = fixture.readMessages().filter(message => message.method === 'turn/start');
    expect(turns).toHaveLength(3);
    expect(turns[2]!.pid).not.toBe(turns[1]!.pid);
    const threadStarts = fixture.readMessages().filter(message => message.method === 'thread/start');
    expect(threadStarts).toHaveLength(1);
    expect(fixture.readMessages()).toContainEqual(expect.objectContaining({
      pid: turns[2]!.pid, method: 'thread/resume',
      params: expect.objectContaining({ threadId: `codex-thread-${turns[0]!.pid}` })
    }));
    expect(fixture.readSpawns().find(spawn => spawn.pid === turns[2]!.pid)?.configuration)
      .toContain('base_url = "https://current.example/v1"');
  });

  it('keeps the app available and the existing runtime configuration intact when local configuration is invalid', async () => {
    await createFixture({ followLocalConfiguration: true, localConfiguration: 'invalid = [' });
    expect(readFileSync(join(tempDir, 'codex-home', 'config.toml'), 'utf8')).toContain('stale-model');
    expect(readFileSync(join(tempDir, 'codex-home', 'auth.json'), 'utf8')).toContain('stale-test-key');
    const created = await server!.inject({
      method: 'POST', url: '/creator/jobs', headers: { authorization: 'Bearer secret' },
      payload: { projectId: 'creator-invalid-config', templateId: 'video-download' }
    });
    expect(created.statusCode).toBe(201);
    expect(readFileSync(join(tempDir, 'local-codex', 'config.toml'), 'utf8')).toBe('invalid = [');
  });

  it('enables one persistent manual app-server by default', async () => {
    const fixture = await createFixture();
    const threadId = await createThread();

    const first = await createRun(threadId, 'first');
    await waitForRun(first, 'succeeded');
    const second = await createRun(threadId, 'second');
    await waitForRun(second, 'succeeded');

    expect(fixture.readSpawns()).toHaveLength(1);
    const messages = fixture.readMessages();
    expect(messages.filter(message => message.method === 'initialize')).toHaveLength(1);
    expect(messages.filter(message => message.method === 'turn/start')).toHaveLength(2);
    expect(messages.filter(message => message.method === 'thread/start')).toHaveLength(1);
    expect(messages.filter(message => message.method === 'thread/resume')).toHaveLength(1);
    const firstDiagnostics = fixture.readDiagnostics(first);
    const secondDiagnostics = fixture.readDiagnostics(second);
    expect(firstDiagnostics).toMatchObject({
      appServerReused: false,
      submittedAt: expect.any(String),
      executionStartedAt: expect.any(String),
      turnStartSentAt: expect.any(String),
      turnStartedAt: expect.any(String),
      firstModelEventAt: expect.any(String),
      turnStartWritten: true,
      appServer: {
        lifecycle: expect.arrayContaining([
          expect.objectContaining({ event: 'process_started' }),
          expect.objectContaining({ event: 'process_initialized' }),
          expect.objectContaining({ event: 'run_assigned' }),
          expect.objectContaining({ event: 'run_cleared' })
        ])
      }
    });
    expect(secondDiagnostics).toMatchObject({
      appServerPid: firstDiagnostics.appServerPid,
      appServerReused: true,
      appServer: {
        lifecycle: expect.arrayContaining([
          expect.objectContaining({ event: 'process_reused' })
        ])
      }
    });
    expect(JSON.stringify([firstDiagnostics, secondDiagnostics]))
      .not.toContain('occap_');
  });

  it('uses one-shot manual app-servers when the emergency fallback is disabled', async () => {
    const fixture = await createFixture({
      persistentAppServerEnabled: false
    });
    const threadId = await createThread();

    const first = await createRun(threadId, 'first');
    await waitForRun(first, 'succeeded');
    const second = await createRun(threadId, 'second');
    await waitForRun(second, 'succeeded');

    expect(fixture.readSpawns()).toHaveLength(2);
    expect(fixture.readMessages().filter(message =>
      message.method === 'initialize'
    )).toHaveLength(2);
  });

  it('keeps schedule runs one-shot while manual runs reuse the persistent host', async () => {
    const fixture = await createFixture();
    const threadId = await createThread();
    const firstManual = await createRun(threadId, 'manual-first');
    await waitForRun(firstManual, 'succeeded');
    const manualPid = fixture.readDiagnostics(firstManual).appServerPid;

    const scheduleResponse = await server!.inject({
      method: 'POST',
      url: '/schedules',
      headers: { authorization: 'Bearer secret' },
      payload: {
        name: '后台检查',
        cron: '0 9 * * *',
        timezone: 'Asia/Shanghai',
        prompt: '执行后台检查',
        cwd: tempDir
      }
    });
    expect(scheduleResponse.statusCode).toBe(201);
    const scheduleRun = await server!.inject({
      method: 'POST',
      url: `/schedules/${scheduleResponse.json().id}/run-now`,
      headers: { authorization: 'Bearer secret' },
      payload: {}
    });
    expect(scheduleRun.statusCode).toBe(202);
    await waitForRun(scheduleRun.json().run.id, 'succeeded');

    const secondManual = await createRun(threadId, 'manual-second');
    await waitForRun(secondManual, 'succeeded');

    const spawns = fixture.readSpawns();
    expect(spawns).toHaveLength(2);
    expect(fixture.readDiagnostics(secondManual)).toMatchObject({
      appServerPid: manualPid,
      appServerReused: true
    });
    const schedulePid = fixture.readMessages().find(message =>
      message.pid !== manualPid
      && message.method === 'turn/start'
    )?.pid;
    expect(schedulePid).toBeDefined();
    expect(schedulePid).not.toBe(manualPid);
  });

  it('starts a queued persistent run after a same-thread one-shot schedule completes', async () => {
    const fixture = await createFixture();
    const scheduleResponse = await server!.inject({
      method: 'POST',
      url: '/schedules',
      headers: { authorization: 'Bearer secret' },
      payload: {
        name: '串行唤醒检查',
        cron: '0 9 * * *',
        timezone: 'Asia/Shanghai',
        prompt: 'hold-schedule',
        cwd: tempDir
      }
    });
    expect(scheduleResponse.statusCode).toBe(201);
    const scheduleRunResponse = await server!.inject({
      method: 'POST',
      url: `/schedules/${scheduleResponse.json().id}/run-now`,
      headers: { authorization: 'Bearer secret' },
      payload: {}
    });
    expect(scheduleRunResponse.statusCode).toBe(202);
    const scheduleRunId = scheduleRunResponse.json().run.id as string;
    await waitForRun(scheduleRunId, 'running');
    const scheduleRun = await getRun(scheduleRunId);
    expect(scheduleRun.threadId).toEqual(expect.any(String));

    const manualRunId = await createRun(
      scheduleRun.threadId as string,
      'manual-after-schedule'
    );
    await waitForRun(manualRunId, 'queued');

    writeFileSync(join(tempDir, 'release-schedule'), 'release', 'utf8');
    await waitForRun(scheduleRunId, 'succeeded');
    await waitForRun(manualRunId, 'succeeded');

    expect(fixture.readSpawns()).toHaveLength(2);
    expect(fixture.readDiagnostics(manualRunId)).toMatchObject({
      appServerReused: false,
      turnStartWritten: true
    });
  });

  it('closes the persistent process before session and capability resources', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencreator-persistent-close-order-'));
    const fakeCodex = createFakeAppServer(tempDir);
    const capabilities = createUnknownCapabilityMatrix();
    capabilities.appServer = true;
    capabilities.appServerApprovals = true;
    const closeSteps: string[] = [];
    let pid: number | undefined;
    const realTokens = createAgentCapabilityTokenStore();
    const tokens: AgentCapabilityTokenStore = {
      ...realTokens,
      close() {
        closeSteps.push('tokens');
        realTokens.close();
      }
    };
    const sessionProvider: CodexSessionProvider = {
      async listTurns() {
        return { items: [], hasMore: false };
      },
      async search() {
        return { results: [], hasMore: false };
      },
      async close() {
        expect(pid).toBeDefined();
        expect(isProcessAlive(pid!)).toBe(false);
        closeSteps.push('session');
      }
    };
    server = await buildServer({
      token: 'secret',
      dataDir: tempDir,
      codexBin: fakeCodex,
      codexHome: join(tempDir, 'codex-home'),
      capabilities,
      resumeCapabilityVerified: true,
      agentToolsEnabled: true,
      agentCapabilityTokens: tokens,
      codexSessionProvider: sessionProvider
    });
    await server.listen({ host: '127.0.0.1', port: 0 });
    const threadId = await createThread();
    const runId = await createRun(threadId, 'close-order');
    await waitForRun(runId, 'succeeded');
    pid = readNdjson(join(tempDir, 'spawns.ndjson'))[0]?.pid as number;

    await server.close();
    server = undefined;

    expect(closeSteps).toEqual(['session', 'tokens']);
  });
});

async function createFixture(
  input: { persistentAppServerEnabled?: boolean; followLocalConfiguration?: boolean; localConfiguration?: string } = {}
): Promise<{
  readSpawns(): Array<Record<string, unknown>>;
  readMessages(): Array<Record<string, unknown>>;
  readDiagnostics(runId: string): Record<string, unknown>;
}> {
  tempDir = mkdtempSync(join(tmpdir(), 'opencreator-persistent-server-'));
  const fakeCodex = createFakeAppServer(tempDir);
  if (input.followLocalConfiguration) {
    mkdirSync(join(tempDir, 'local-codex'));
    mkdirSync(join(tempDir, 'codex-home'));
    writeFileSync(join(tempDir, 'local-codex', 'config.toml'), input.localConfiguration ?? localConfiguration('https://current.example/v1'));
    writeFileSync(join(tempDir, 'codex-home', 'config.toml'), 'model = "stale-model"\n');
    writeFileSync(join(tempDir, 'codex-home', 'auth.json'), '{"OPENAI_API_KEY":"stale-test-key"}');
  }
  const capabilities = createUnknownCapabilityMatrix();
  capabilities.appServer = true;
  capabilities.appServerApprovals = true;
  server = await buildServer({
    token: 'secret',
    dataDir: tempDir,
    codexBin: fakeCodex,
    codexHome: join(tempDir, 'codex-home'),
    ...(input.followLocalConfiguration ? { localCodexHome: join(tempDir, 'local-codex') } : {}),
    capabilities,
    resumeCapabilityVerified: true,
    persistentAppServerEnabled: input.persistentAppServerEnabled,
    agentToolsEnabled: false
  });
  return {
    readSpawns: () => readNdjson(join(tempDir, 'spawns.ndjson')),
    readMessages: () => readNdjson(join(tempDir, 'messages.ndjson')),
    readDiagnostics: runId => JSON.parse(
      readFileSync(
        join(tempDir, 'runs', runId, 'diagnostics.json'),
        'utf8'
      )
    ) as Record<string, unknown>
  };
}

async function createThread(): Promise<string> {
  const project = await server!.inject({
    method: 'POST',
    url: '/projects',
    headers: { authorization: 'Bearer secret' },
    payload: {
      cwd: tempDir,
      profile: 'default',
      sandbox: 'workspace-write'
    }
  });
  expect(project.statusCode).toBe(201);
  const thread = await server!.inject({
    method: 'POST',
    url: '/threads',
    headers: { authorization: 'Bearer secret' },
    payload: {
      projectId: project.json().project.id
    }
  });
  expect(thread.statusCode).toBe(201);
  return thread.json().thread.id as string;
}

async function createRun(threadId: string, prompt: string): Promise<string> {
  const response = await server!.inject({
    method: 'POST',
    url: '/runs',
    headers: { authorization: 'Bearer secret' },
    payload: { threadId, prompt }
  });
  expect(response.statusCode).toBe(202);
  return response.json().id as string;
}

async function waitForRun(
  runId: string,
  status: string
): Promise<void> {
  await expect.poll(async () => {
    const response = await server!.inject({
      method: 'GET',
      url: `/runs/${runId}`,
      headers: { authorization: 'Bearer secret' }
    });
    return response.json().status as string;
  }, { timeout: 10_000, interval: 20 }).toBe(status);
}

async function getRun(runId: string): Promise<Record<string, unknown>> {
  const response = await server!.inject({
    method: 'GET',
    url: `/runs/${runId}`,
    headers: { authorization: 'Bearer secret' }
  });
  expect(response.statusCode).toBe(200);
  return response.json() as Record<string, unknown>;
}

function localConfiguration(baseUrl: string): string {
  return [
    'model = "local-model"',
    'model_provider = "custom"',
    '[model_providers.custom]',
    `base_url = "${baseUrl}"`,
    'requires_openai_auth = false',
    'experimental_bearer_token = "local-test-key"',
    ''
  ].join('\n');
}

function createFakeAppServer(dir: string): string {
  const bin = join(dir, 'fake-server-codex.js');
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
const spawnLog = ${JSON.stringify(join(dir, 'spawns.ndjson'))};
const messageLog = ${JSON.stringify(join(dir, 'messages.ndjson'))};
const releaseSchedule = ${JSON.stringify(join(dir, 'release-schedule'))};
const configPath = process.env.CODEX_HOME + '/config.toml';
const configuration = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8').split('\\n').filter(line => line.startsWith('model =') || line.startsWith('base_url =')).join('\\n') : '';
fs.appendFileSync(spawnLog, JSON.stringify({ pid: process.pid, args: process.argv.slice(2), codexHome: process.env.CODEX_HOME, configuration, hasAuth: fs.existsSync(process.env.CODEX_HOME + '/auth.json') }) + '\\n');
const rl = readline.createInterface({ input: process.stdin });
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
let sequence = 0;
let currentThreadId;
rl.on('line', line => {
  const message = JSON.parse(line);
  fs.appendFileSync(messageLog, JSON.stringify({ pid: process.pid, ...message }) + '\\n');
  if (message.method === 'initialize') {
    send({ id: message.id, result: { userAgent: 'fake' } });
    return;
  }
  if (message.method === 'skills/extraRoots/set') {
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === 'skills/list') {
    send({ id: message.id, result: { data: [{ skills: [{ name: 'opencreator-runtime' }] }] } });
    return;
  }
  if (message.method === 'thread/read') {
    send({ id: message.id, result: { thread: { id: message.params.threadId, turns: [] } } });
    return;
  }
  if (message.method === 'thread/start' || message.method === 'thread/resume') {
    currentThreadId = message.params.threadId || ('codex-thread-' + process.pid);
    send({ id: message.id, result: { thread: { id: currentThreadId } } });
    return;
  }
  if (message.method === 'config/mcpServer/reload') {
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === 'turn/start') {
    const turnId = 'turn-' + process.pid + '-' + (++sequence);
    send({ id: message.id, result: { turn: { id: turnId, status: 'inProgress' } } });
    send({ method: 'turn/started', params: { threadId: currentThreadId, turn: { id: turnId, status: 'inProgress' } } });
    const complete = () => {
      send({ method: 'item/completed', params: { threadId: currentThreadId, turnId, item: { id: 'item-' + turnId, type: 'agentMessage', text: 'ok' } } });
      send({ method: 'turn/completed', params: { threadId: currentThreadId, turn: { id: turnId, status: 'completed' } } });
    };
    const prompt = message.params.input?.[0]?.text || '';
    if (prompt.includes('simulate-config-failure')) {
      send({ method: 'turn/completed', params: { threadId: currentThreadId, turn: { id: turnId, status: 'failed', error: { message: 'Provider rejected the test model.' } } } });
      return;
    }
    if (prompt.includes('hold-schedule')) {
      const timer = setInterval(() => {
        if (!fs.existsSync(releaseSchedule)) return;
        clearInterval(timer);
        complete();
      }, 10);
      return;
    }
    complete();
  }
});
`, 'utf8');
  chmodSync(bin, 0o755);
  return bin;
}

function readNdjson(path: string): Array<Record<string, unknown>> {
  try {
    const content = readFileSync(path, 'utf8').trim();
    if (content.length === 0) return [];
    return content.split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
  } catch {
    return [];
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
