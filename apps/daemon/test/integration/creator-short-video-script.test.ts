import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { CreatorExecutorInput } from '../../src/creator/executor.js';
import { createShortVideoScriptExecutor } from '../../src/creator/short-video-script/executor.js';

let server: FastifyInstance | undefined;
let tempDir = '';

afterEach(async () => {
  await server?.close();
  server = undefined;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('creator short video script', () => {
  it('generates a downloadable Markdown script through Creator Runtime', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'creator-short-video-script-'));
    const config = createDefaultCreatorServicesConfig();
    config.llm.apiKey = 'text-key';
    config.llm.model = 'test-model';
    config.llm.source = 'custom';
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            title: '从一个小功能开始参与开源',
            hook: {
              narration: '第一次参与开源，别急着挑战大功能。',
              visualSuggestion: '人物面对项目列表快速浏览',
              durationSeconds: 3
            },
            segments: [
              {
                narration: '先确认需求 | 再动手\n保持边界清晰。',
                visualSuggestion: '展示需求确认和任务拆分',
                durationSeconds: 20
              },
              {
                narration: '完成实现、定向测试和一次清楚的提交。',
                visualSuggestion: '依次展示代码、测试结果和提交记录',
                durationSeconds: 30
              }
            ],
            cta: {
              narration: '从今天能闭环的小任务开始。',
              visualSuggestion: '画面定格在已合并的 PR',
              durationSeconds: 7
            }
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
      creatorExecutors: [createShortVideoScriptExecutor({
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
      id: 'short-video-script',
      outputs: [{ kind: 'short_video_script', required: true }]
    }));

    const created = await request('POST', '/creator/jobs', {
      projectId: 'project_script',
      templateId: 'short-video-script'
    });
    const initial = created.json().job;
    const updated = await request('POST', `/creator/jobs/${initial.id}/actions`, {
      action: 'update-settings',
      expectedRevision: initial.revision,
      input: {
        patch: {
          topic: '第一次参与开源项目的经验',
          audience: '准备贡献代码的开发者',
          platform: 'bilibili',
          targetDurationSeconds: 60,
          tone: 'professional',
          extraRequirements: '给出可执行的步骤'
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
          description: '生成短视频脚本',
          artifactRefs: { short_video_script: [expect.any(String)] }
        }]
      },
      stages: [{
        stageId: 'generate',
        executor: 'short-video-script',
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
    expect(requestBody.messages[0].content).toContain('第一次参与开源项目的经验');
    expect(requestBody.messages[0].content).toContain('发布平台或场景：Bilibili');
    expect(requestBody.messages[0].content).toContain('目标时长：60 秒');
    expect(requestBody.messages[0].content).toContain('不得虚构');

    const artifact = completed.artifacts.find((item: { kind: string }) => (
      item.kind === 'short_video_script'
    ));
    expect(artifact).toMatchObject({
      status: 'completed',
      metadata: {
        fileName: 'OpenCreator-short-video-script.md',
        mimeType: 'text/markdown',
        title: '从一个小功能开始参与开源',
        platform: 'bilibili',
        tone: 'professional',
        targetDurationSeconds: 60,
        actualDurationSeconds: 60,
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
      '# 从一个小功能开始参与开源',
      '',
      '> 平台：Bilibili · 目标时长：60 秒 · 语气：专业清晰',
      '',
      '## 分段脚本',
      '',
      '| 段落 | 时间 | 口播 / 对白 | 画面建议 |',
      '| --- | --- | --- | --- |',
      '| 开场钩子 | 00:00-00:03 | 第一次参与开源，别急着挑战大功能。 | 人物面对项目列表快速浏览 |',
      '| 内容 1 | 00:03-00:23 | 先确认需求 \\| 再动手<br>保持边界清晰。 | 展示需求确认和任务拆分 |',
      '| 内容 2 | 00:23-00:53 | 完成实现、定向测试和一次清楚的提交。 | 依次展示代码、测试结果和提交记录 |',
      '| 行动引导 | 00:53-01:00 | 从今天能闭环的小任务开始。 | 画面定格在已合并的 PR |',
      ''
    ].join('\n'));
  });

  it.each([
    [15, 13, false], [15, 14, true], [15, 16, true], [15, 17, false],
    [60, 53, false], [60, 54, true], [60, 66, true], [60, 67, false],
    [60, 600, false], [600, 539, false], [600, 540, true],
    [600, 660, true], [600, 661, false]
  ])('checks target %i seconds against generated %i seconds (accepted: %s)', async (target, actual, accepted) => {
    tempDir = await mkdtemp(join(tmpdir(), 'creator-script-duration-'));
    const config = createDefaultCreatorServicesConfig();
    config.llm.apiKey = 'test-key';
    const beat = (durationSeconds: number) => ({ narration: '口播', visualSuggestion: '画面', durationSeconds });
    const remaining = actual - 2;
    const segments = Array.from({ length: Math.ceil(remaining / 180) }, (_, index) => (
      beat(Math.min(180, remaining - index * 180))
    ));
    const executor = createShortVideoScriptExecutor({
      configStore: { async read() { return config; } },
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          title: '时长边界', hook: beat(1), segments, cta: beat(1)
        }) } }]
      })))
    });
    const run = executor.run({
      job: { state: { topic: '测试时长', platform: 'generic', targetDurationSeconds: target, tone: 'natural' } },
      workdir: tempDir,
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    } as unknown as CreatorExecutorInput);
    if (accepted) {
      await expect(run).resolves.toMatchObject({ outputs: [{ metadata: { actualDurationSeconds: actual } }] });
      expect(await readdir(tempDir)).toEqual(['OpenCreator-short-video-script.md']);
    } else {
      await expect(run).rejects.toMatchObject({ code: 'creator_llm_upstream_error', message: expect.stringContaining('偏离目标') });
      expect(await readdir(tempDir)).toEqual([]);
    }
  });

  it('rejects an incomplete generated script without writing an artifact', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'creator-short-video-script-invalid-'));
    const config = createDefaultCreatorServicesConfig();
    config.llm.apiKey = 'text-key';
    config.llm.model = 'test-model';
    const executor = createShortVideoScriptExecutor({
      configStore: {
        async read() { return structuredClone(config); }
      },
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          title: '缺少画面建议',
          hook: { narration: '开场', durationSeconds: 3 },
          segments: [{ narration: '正文', visualSuggestion: '正文画面', durationSeconds: 20 }],
          cta: { narration: '结尾', visualSuggestion: '结尾画面', durationSeconds: 5 }
        }) } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    });

    await expect(executor.run({
      job: {
        state: {
          topic: '测试严格脚本结构',
          audience: '',
          platform: 'generic',
          targetDurationSeconds: 30,
          tone: 'natural',
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
      throw new Error(`Short video script generation failed: ${JSON.stringify(job)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for short video script: ${JSON.stringify(lastJob)}`);
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
