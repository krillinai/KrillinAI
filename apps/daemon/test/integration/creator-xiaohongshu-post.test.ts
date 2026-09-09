import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { CreatorExecutorInput } from '../../src/creator/executor.js';
import { createXiaohongshuPostExecutor } from '../../src/creator/xiaohongshu/executor.js';

let server: FastifyInstance | undefined;
let tempDir = '';

afterEach(async () => {
  await server?.close();
  server = undefined;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('creator xiaohongshu post', () => {
  it('generates a downloadable Markdown post through Creator Runtime', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'creator-xiaohongshu-post-'));
    const config = createDefaultCreatorServicesConfig();
    config.llm.apiKey = 'text-key';
    config.llm.model = 'test-model';
    config.llm.source = 'custom';
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            title: '第一次参加开源项目，我学到了什么',
            body: '从一个边界清楚的小功能开始，先确认需求，再完成实现和验证。',
            hashtags: ['开源', '#程序员', '开源']
          })
        }
      }]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    server = await buildServer({
      token: 'secret',
      dataDir: tempDir,
      codexHome: join(tempDir, 'codex-home'),
      creatorExecutors: [createXiaohongshuPostExecutor({
        configStore: {
          async read() { return structuredClone(config); }
        },
        fetchImpl
      })],
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
      id: 'xiaohongshu-post',
      outputs: [{ kind: 'xiaohongshu_post', required: true }]
    }));

    const created = await request('POST', '/creator/jobs', {
      projectId: 'project_xiaohongshu',
      templateId: 'xiaohongshu-post'
    });
    const initial = created.json().job;
    const updated = await request('POST', `/creator/jobs/${initial.id}/actions`, {
      action: 'update-settings',
      expectedRevision: initial.revision,
      input: {
        patch: {
          topic: '分享第一次参与开源项目的过程',
          audience: '准备参与开源项目的程序员',
          style: 'experience',
          length: 'short',
          extraRequirements: '语气真诚，不夸大'
        }
      }
    });
    await request('POST', `/creator/jobs/${initial.id}/actions`, {
      action: 'run-stage',
      expectedRevision: updated.json().job.revision,
      input: { stageId: 'generate' }
    });

    const completed = await waitForCompletedJob(initial.id);
    expect(completed).toMatchObject({
      status: 'completed',
      state: {
        latestResultVersion: 1,
        resultSnapshots: [{
          version: 1,
          stageId: 'generate',
          description: '生成小红书帖子',
          artifactRefs: { xiaohongshu_post: [expect.any(String)] }
        }]
      },
      stages: [{
        stageId: 'generate',
        executor: 'xiaohongshu-post',
        status: 'succeeded',
        progress: {
          phase: 'completed',
          percent: 100,
          completed: 1,
          failed: 0,
          total: 1
        }
      }]
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({
      model: 'test-model',
      response_format: { type: 'json_object' }
    });
    expect(requestBody.messages[0].content).toContain('分享第一次参与开源项目的过程');
    expect(requestBody.messages[0].content).toContain('不得虚构');
    expect(requestBody.messages[0].content).toContain('标题不超过 20 个字符');
    expect(requestBody.messages[0].content).toContain('正文不超过 1000 个字符');

    const artifact = completed.artifacts.find((item: { kind: string }) => (
      item.kind === 'xiaohongshu_post'
    ));
    expect(artifact).toMatchObject({
      status: 'completed',
      metadata: {
        fileName: 'OpenCreator-xiaohongshu-post.md',
        mimeType: 'text/markdown',
        title: '第一次参加开源项目，我学到了什么',
        hashtags: ['开源', '程序员'],
        model: 'test-model',
        resultVersion: 1
      }
    });
    const content = await request(
      'GET',
      `/creator/jobs/${initial.id}/artifacts/${artifact.id}/content`
    );
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toContain('text/markdown');
    expect(content.rawPayload.toString('utf8')).toBe([
      '# 第一次参加开源项目，我学到了什么',
      '',
      '从一个边界清楚的小功能开始，先确认需求，再完成实现和验证。',
      '',
      '#开源 #程序员',
      ''
    ].join('\n'));
  });

  it.each([
    ['title', '超'.repeat(21), '有效正文'],
    ['body', '有效标题', '超'.repeat(1_001)]
  ])('rejects generated %s beyond the Xiaohongshu publishing limit', async (_field, title, body) => {
    tempDir = await mkdtemp(join(tmpdir(), 'creator-xiaohongshu-post-limit-'));
    const config = createDefaultCreatorServicesConfig();
    config.llm.apiKey = 'text-key';
    config.llm.model = 'test-model';
    const executor = createXiaohongshuPostExecutor({
      configStore: {
        async read() { return structuredClone(config); }
      },
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ title, body, hashtags: [] }) } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    });

    await expect(executor.run({
      job: {
        state: {
          topic: '测试发布长度限制',
          audience: '',
          style: 'experience',
          length: 'short',
          extraRequirements: ''
        }
      },
      workdir: tempDir,
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    } as unknown as CreatorExecutorInput)).rejects.toMatchObject({
      code: 'creator_llm_upstream_error'
    });
    expect(await readdir(tempDir)).toEqual([]);
  });
});

async function waitForCompletedJob(jobId: string) {
  const deadline = Date.now() + 10_000;
  let lastJob: unknown;
  while (Date.now() < deadline) {
    const response = await request('GET', `/creator/jobs/${jobId}`);
    const job = response.json().job;
    lastJob = job;
    if (job.status === 'completed') return job;
    if (job.status === 'failed' || job.status === 'needs_input') {
      throw new Error(`Xiaohongshu post generation failed: ${JSON.stringify(job)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for Xiaohongshu post: ${JSON.stringify(lastJob)}`);
}

async function request(
  method: 'GET' | 'POST',
  url: string,
  payload?: object
): Promise<{ statusCode: number; headers: Record<string, string>; json(): any; rawPayload: Buffer }> {
  return await server!.inject({
    method,
    url,
    headers: { authorization: 'Bearer secret' },
    ...(payload === undefined ? {} : { payload })
  }) as never;
}
