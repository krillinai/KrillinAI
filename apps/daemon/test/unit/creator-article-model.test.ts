import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWechatArticleModel } from '../../src/creator/article/model.js';
import { createWechatArticleExecutor } from '../../src/creator/article/executor.js';

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});

// The failed runtime persisted only the syntax error, not its completion body.
// This malformed but schema-shaped fixture reproduces that observed failure class safely.
const malformedMuseCompletionFixture = [
  'Here is the requested topic data:',
  '```json',
  '{"topics":[{"title":"A specific topic","angle":"A clear angle","summary":"A short summary"},{"title":"A second topic","angle":"Another angle","summary":"Another summary"},{"title":"A third topic","angle":"One more angle","summary":"One more summary",}]}',
  '```'
].join('\n');

function createModel(completion: string | string[]) {
  const config = createDefaultCreatorServicesConfig();
  config.muse2api.sparkEnabled = true;
  config.muse2api.apiKey = 'test-key';
  const completions = Array.isArray(completion) ? completion : [completion];
  let index = 0;
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
    choices: [{ message: { content: completions[Math.min(index++, completions.length - 1)] } }]
  }), { headers: { 'content-type': 'application/json' } }));
  return {
    model: createWechatArticleModel({ configStore: { read: async () => config } as never, fetchImpl }),
    fetchImpl
  };
}

function createModelWithResponse(responseBody: string | unknown, status = 200) {
  const config = createDefaultCreatorServicesConfig();
  config.muse2api.sparkEnabled = true;
  config.muse2api.apiKey = 'test-key';
  const fetchImpl = vi.fn(async () => new Response(
    typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
    { status, headers: { 'content-type': 'application/json' } }
  ));
  return {
    model: createWechatArticleModel({ configStore: { read: async () => config } as never, fetchImpl }),
    fetchImpl
  };
}

function generateTopics(model: ReturnType<typeof createWechatArticleModel>) {
  return model.generateTopics({
    sources: [], writingPrompt: 'PRIVATE_PROMPT_SENTINEL', templatePrompt: '', count: 1,
    signal: new AbortController().signal
  });
}

function generateTopicsWithCount(model: ReturnType<typeof createWechatArticleModel>, count: number) {
  return model.generateTopics({
    sources: [], writingPrompt: '', templatePrompt: '', count,
    signal: new AbortController().signal
  });
}

describe('WeChat article model structured output', () => {
  it('uses the selected custom structured provider for topics only and preserves Muse routing for outline', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.muse2api.sparkEnabled = true;
    config.muse2api.apiKey = 'muse-secret';
    config.llm = {
      baseUrl: 'https://custom-structured.example.test/v1',
      apiKey: 'custom-secret',
      model: 'structured-model',
      jsonMode: false,
      source: 'custom'
    };
    (config as unknown as { articleWriter: unknown }).articleWriter = {
      topicProvider: 'custom',
      topicResponseFormat: 'json_schema'
    };
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>
      });
      const content = [
        '{"topics":[{"title":"Topic","angle":"Angle","summary":"Summary"}]}',
        'Outline from the inherited Muse provider',
        'Article from the inherited Muse provider',
        '{"images":[{"caption":"Caption","placementHeading":"Heading","prompt":"Image prompt"}]}'
      ][requests.length - 1];
      return new Response(JSON.stringify({
        choices: [{ message: { content }, finish_reason: 'stop' }]
      }), { headers: { 'content-type': 'application/json' } });
    });
    const model = createWechatArticleModel({
      configStore: { read: async () => config } as never,
      fetchImpl
    });

    await expect(model.generateTopics({
      sources: [], writingPrompt: '', templatePrompt: '', count: 1,
      signal: new AbortController().signal
    })).resolves.toHaveLength(1);
    await expect(model.generateOutline({
      sources: [], topic: { id: 'topic-1', title: 'Topic', angle: 'Angle', summary: 'Summary' },
      writingPrompt: '', templatePrompt: '', signal: new AbortController().signal
    })).resolves.toBe('Outline from the inherited Muse provider');
    await expect(model.generateArticle({
      sources: [], topic: { id: 'topic-1', title: 'Topic', angle: 'Angle', summary: 'Summary' },
      outline: 'Outline', writingPrompt: '', templatePrompt: '', layoutPrompt: '',
      signal: new AbortController().signal
    })).resolves.toBe('Article from the inherited Muse provider');
    await expect(model.generateImagePlan({
      articleMarkdown: '# Heading\nArticle', count: 1, stylePrompt: '', customPrompt: '',
      signal: new AbortController().signal
    })).resolves.toMatchObject([{ caption: 'Caption', placementHeading: 'Heading', prompt: 'Image prompt' }]);

    expect(requests).toHaveLength(4);
    expect(requests[0]?.url).toBe('https://custom-structured.example.test/v1/chat/completions');
    expect(requests[0]?.body).toMatchObject({
      model: 'structured-model',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'article_topics',
          strict: true,
          schema: expect.objectContaining({
            type: 'object',
            required: ['topics'],
            additionalProperties: false,
            properties: {
              topics: expect.objectContaining({
                type: 'array', minItems: 1, maxItems: 1,
                items: expect.objectContaining({
                  required: ['title', 'angle', 'summary'],
                  additionalProperties: false
                })
              })
            }
          })
        }
      }
    });
    expect(requests[1]?.url).toBe('http://127.0.0.1:18610/v1/chat/completions');
    expect(requests[1]?.body).toMatchObject({ model: 'muse-spark' });
    expect(requests[1]?.body).not.toHaveProperty('response_format');
    expect(requests[2]?.url).toBe('http://127.0.0.1:18610/v1/chat/completions');
    expect(requests[3]?.url).toBe('http://127.0.0.1:18610/v1/chat/completions');
    expect(requests[3]?.body).not.toHaveProperty('response_format');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('rejects a custom topic override with no declared compatible response format before sending a request', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.llm.source = 'custom';
    config.llm.baseUrl = 'https://custom.example.test/v1';
    config.llm.apiKey = 'custom-secret';
    (config as unknown as { articleWriter: unknown }).articleWriter = {
      topicProvider: 'custom',
      topicResponseFormat: 'none'
    };
    const fetchImpl = vi.fn();
    const model = createWechatArticleModel({
      configStore: { read: async () => config } as never,
      fetchImpl
    });

    await expect(generateTopics(model)).rejects.toMatchObject({
      code: 'creator_llm_config_missing'
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the explicitly selected JSON object format for a compatible custom endpoint', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.llm.source = 'custom';
    config.llm.baseUrl = 'https://custom.example.test/v1';
    config.llm.apiKey = 'custom-secret';
    config.llm.model = 'custom-model';
    (config as unknown as { articleWriter: unknown }).articleWriter = {
      topicProvider: 'custom',
      topicResponseFormat: 'json_object'
    };
    let requestBody = '';
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"topics":[{"title":"Topic","angle":"Angle","summary":"Summary"}]}' } }]
      }), { headers: { 'content-type': 'application/json' } });
    });
    const model = createWechatArticleModel({
      configStore: { read: async () => config } as never,
      fetchImpl
    });

    await expect(generateTopics(model)).resolves.toHaveLength(1);
    expect(JSON.parse(requestBody)).toMatchObject({
      response_format: { type: 'json_object' }
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not fall back to Muse when a custom topic override is selected but the custom provider is unavailable', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.muse2api.sparkEnabled = true;
    config.muse2api.apiKey = 'muse-secret';
    (config as unknown as { articleWriter: unknown }).articleWriter = {
      topicProvider: 'custom',
      topicResponseFormat: 'json_object'
    };
    const fetchImpl = vi.fn();
    const model = createWechatArticleModel({
      configStore: { read: async () => config } as never,
      fetchImpl
    });

    await expect(generateTopics(model)).rejects.toMatchObject({ code: 'creator_llm_config_missing' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces a custom endpoint format rejection after one request without falling back to Muse', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.muse2api.sparkEnabled = true;
    config.muse2api.apiKey = 'muse-secret';
    config.llm.source = 'custom';
    config.llm.baseUrl = 'https://custom.example.test/v1';
    config.llm.apiKey = 'custom-secret';
    config.llm.model = 'custom-model';
    (config as unknown as { articleWriter: unknown }).articleWriter = {
      topicProvider: 'custom',
      topicResponseFormat: 'json_schema'
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'unsupported response_format' }
    }), { status: 400, headers: { 'content-type': 'application/json' } }));
    const model = createWechatArticleModel({
      configStore: { read: async () => config } as never,
      fetchImpl
    });

    const failure = await generateTopics(model).then(
      () => { throw new Error('Expected unsupported format to fail'); },
      error => error as { code?: string; details?: unknown; message?: string }
    );

    expect(failure.code).toBe('creator_llm_upstream_error');
    expect(JSON.stringify(failure)).not.toContain('custom-secret');
    expect(JSON.stringify(failure)).not.toContain('muse-secret');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('accepts canonical topic JSON only when it contains the requested number of complete topics', async () => {
    const { model, fetchImpl } = createModel(JSON.stringify({
      topics: [
        { title: 'First topic', angle: 'First angle', summary: 'First summary' },
        { title: 'Second topic', angle: 'Second angle', summary: 'Second summary' }
      ]
    }));

    await expect(generateTopicsWithCount(model, 2)).resolves.toEqual([
      { id: 'topic-1', title: 'First topic', angle: 'First angle', summary: 'First summary' },
      { id: 'topic-2', title: 'Second topic', angle: 'Second angle', summary: 'Second summary' }
    ]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: 'fewer topics than requested',
      content: '{"topics":[{"title":"One topic","angle":"One angle","summary":"One summary"}]}',
      count: 2
    },
    {
      name: 'missing required topic fields',
      content: '{"topics":[{"title":"One topic"}]}',
      count: 1
    }
  ])('classifies $name as a schema failure without manufacturing topic data', async ({ content, count }) => {
    const { model } = createModel(content);

    const failure = await generateTopicsWithCount(model, count).then(
      () => { throw new Error('Expected Article Writer generation to fail'); },
      error => error as { code?: string; message?: string; details?: Record<string, unknown> }
    );

    expect(failure).toMatchObject({
      code: 'creator_llm_invalid_response',
      details: { articleOutputDiagnostic: { category: 'SCHEMA_VALIDATION_FAILED' } }
    });
    expect(JSON.stringify(failure.details)).not.toContain('PRIVATE_PROMPT_SENTINEL');
    expect(JSON.stringify(failure.details)).not.toContain('test-key');
  });

  it('normalizes a fenced, prose-wrapped Muse response with the observed JSON syntax failure class and persists topics', async () => {
    root = await mkdtemp(join(tmpdir(), 'creator-article-model-'));
    const { model, fetchImpl } = createModel(malformedMuseCompletionFixture);
    const executor = createWechatArticleExecutor({
      sourceExtractor: { extract: async () => [] },
      model: {
        generateTopics: request => model.generateTopics(request),
        generateOutline: async () => '',
        generateArticle: async () => ''
      }
    });

    const result = await executor.run({
      stageRun: { stageId: 'topics' },
      job: { state: { topicCount: 3 }, artifacts: [] },
      inputArtifacts: [],
      workdir: root,
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    } as never);
    const topicsOutput = result.outputs.find(output => output.kind === 'article_topics');

    expect(topicsOutput?.path).toBe(join(root, 'article-topics.json'));
    expect(JSON.parse(await readFile(topicsOutput!.path!, 'utf8'))).toEqual([
      { id: 'topic-1', title: 'A specific topic', angle: 'A clear angle', summary: 'A short summary' },
      { id: 'topic-2', title: 'A second topic', angle: 'Another angle', summary: 'Another summary' },
      { id: 'topic-3', title: 'A third topic', angle: 'One more angle', summary: 'One more summary' }
    ]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('quotes only unambiguous identifier keys before validating the required topic schema', async () => {
    const { model, fetchImpl } = createModel(
      '{"topics":[{"title":"A specific topic",angle:"A clear angle",summary:"Keep {angle: text} untouched"}]}'
    );

    await expect(model.generateTopics({
      sources: [], writingPrompt: '', templatePrompt: '', count: 1,
      signal: new AbortController().signal
    })).resolves.toEqual([{
      id: 'topic-1', title: 'A specific topic', angle: 'A clear angle', summary: 'Keep {angle: text} untouched'
    }]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not mistake Markdown fence characters inside topic text for an output wrapper', async () => {
    const fence = String.fromCharCode(96).repeat(3);
    const { model, fetchImpl } = createModel(
      '{"topics":[{"title":"A specific topic","angle":"A clear angle","summary":"Literal ' + fence + 'json text"}]}'
    );

    await expect(generateTopics(model)).resolves.toEqual([{
      id: 'topic-1',
      title: 'A specific topic',
      angle: 'A clear angle',
      summary: 'Literal ' + fence + 'json text'
    }]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns a recoverable error for malformed data and does not persist topic output or use another provider', async () => {
    root = await mkdtemp(join(tmpdir(), 'creator-article-model-invalid-'));
    const { model, fetchImpl } = createModel([
      '{"topics":[{"title":123}]}',
      '{"topics":[{"title":"A corrected topic","angle":"A safe retry","summary":"Persisted after explicit retry"},{"title":"A second corrected topic","angle":"A second angle","summary":"Another persisted topic"},{"title":"A third corrected topic","angle":"A third angle","summary":"Final persisted topic"}]}'
    ]);
    const executor = createWechatArticleExecutor({
      sourceExtractor: { extract: async () => [] },
      model: {
        generateTopics: request => model.generateTopics(request),
        generateOutline: async () => '',
        generateArticle: async () => ''
      }
    });

    await expect(executor.run({
      stageRun: { stageId: 'topics' },
      job: { state: { topicCount: 3 }, artifacts: [] },
      inputArtifacts: [],
      workdir: root,
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    } as never)).rejects.toMatchObject({
      code: 'creator_llm_invalid_response',
      message: expect.stringMatching(/retry|adjust/i)
    });

    expect(await readdir(root)).not.toContain('article-topics.json');
    expect(fetchImpl).toHaveBeenCalledOnce();

    const retried = await executor.run({
      stageRun: { stageId: 'topics' },
      job: { state: { topicCount: 3 }, artifacts: [] },
      inputArtifacts: [],
      workdir: root,
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    } as never);
    const topicsOutput = retried.outputs.find(output => output.kind === 'article_topics');

    expect(JSON.parse(await readFile(topicsOutput!.path!, 'utf8'))).toEqual([
      { id: 'topic-1', title: 'A corrected topic', angle: 'A safe retry', summary: 'Persisted after explicit retry' },
      { id: 'topic-2', title: 'A second corrected topic', angle: 'A second angle', summary: 'Another persisted topic' },
      { id: 'topic-3', title: 'A third corrected topic', angle: 'A third angle', summary: 'Final persisted topic' }
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: 'empty response',
      body: { choices: [{ message: { content: '   ' }, finish_reason: 'stop' }] },
      code: 'creator_llm_empty_response',
      diagnostic: { category: 'EMPTY_RESPONSE', layer: 'completion-content' }
    },
    {
      name: 'invalid JSON syntax',
      body: { choices: [{ message: { content: '{"topics":[{"title": nope}]}' }, finish_reason: 'stop' }] },
      code: 'creator_llm_invalid_response',
      diagnostic: { category: 'INVALID_JSON_SYNTAX', layer: 'topic-data' }
    },
    {
      name: 'invalid JSON wrapper',
      body: { choices: [{ message: { content: 'No JSON was returned.' }, finish_reason: 'stop' }] },
      code: 'creator_llm_invalid_response',
      diagnostic: { category: 'INVALID_JSON_WRAPPER', layer: 'topic-data' }
    },
    {
      name: 'truncated output',
      body: { choices: [{ message: { content: '{"topics":[{"title":"unfinished' }, finish_reason: 'length' }] },
      code: 'creator_llm_invalid_response',
      diagnostic: { category: 'TRUNCATED_OR_INCOMPLETE_OUTPUT', layer: 'topic-data', finishReason: 'length' }
    },
    {
      name: 'schema mismatch',
      body: { choices: [{ message: { content: '{"topics":[{"title":42,"summary":"PRIVATE_OUTPUT_SENTINEL"}]}' }, finish_reason: 'stop' }] },
      code: 'creator_llm_invalid_response',
      diagnostic: { category: 'SCHEMA_VALIDATION_FAILED', layer: 'topic-data' }
    },
    {
      name: 'unsupported Chat Completions shape',
      body: { choices: [{ message: { content: { text: '{"topics":[]}' } }, finish_reason: 'stop' }] },
      code: 'creator_llm_invalid_response',
      diagnostic: { category: 'UNSUPPORTED_RESPONSE_SHAPE', layer: 'completion-content' }
    }
  ])('records safe diagnostics for $name while preserving public errors', async ({ body, code, diagnostic }) => {
    const { model, fetchImpl } = createModelWithResponse(body);

    const failure = await generateTopics(model).then(
      () => { throw new Error('Expected Article Writer generation to fail'); },
      error => error as { code?: string; message?: string; details?: Record<string, unknown> }
    );

    expect(failure).toMatchObject({
      code,
      details: { articleOutputDiagnostic: expect.objectContaining(diagnostic) }
    });
    expect(failure.message).toMatch(code === 'creator_llm_empty_response' ? /no content/i : /retry|adjust/i);
    expect(JSON.stringify(failure.details)).not.toContain('PRIVATE_PROMPT_SENTINEL');
    expect(JSON.stringify(failure.details)).not.toContain('PRIVATE_OUTPUT_SENTINEL');
    expect(JSON.stringify(failure.details)).not.toContain('test-key');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('classifies malformed Chat Completion envelope JSON without persisting response text', async () => {
    const { model } = createModelWithResponse('{"choices":');

    const failure = await generateTopics(model).then(
      () => { throw new Error('Expected malformed envelope to fail'); },
      error => error as { code?: string; details?: Record<string, unknown> }
    );

    expect(failure).toMatchObject({
      code: 'creator_llm_invalid_response',
      details: {
        articleOutputDiagnostic: expect.objectContaining({
          category: 'TRUNCATED_OR_INCOMPLETE_OUTPUT',
          layer: 'completion-envelope'
        })
      }
    });
    expect(JSON.stringify(failure.details)).not.toContain('{"choices":');
  });

  it('classifies topic file write failures as persistence diagnostics', async () => {
    root = await mkdtemp(join(tmpdir(), 'creator-article-topic-write-failed-'));
    await mkdir(join(root, 'article-topics.json'));
    const { model } = createModel('{"topics":[{"title":"A valid topic","angle":"A clear angle","summary":"A summary"},{"title":"A second valid topic","angle":"Another angle","summary":"Another summary"},{"title":"A third valid topic","angle":"One more angle","summary":"One more summary"}]}');
    const executor = createWechatArticleExecutor({
      sourceExtractor: { extract: async () => [] },
      model: {
        generateTopics: request => model.generateTopics(request),
        generateOutline: async () => '',
        generateArticle: async () => ''
      }
    });

    await expect(executor.run({
      stageRun: { stageId: 'topics' },
      job: { state: { topicCount: 3 }, artifacts: [] },
      inputArtifacts: [],
      workdir: root,
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    } as never)).rejects.toMatchObject({
      details: {
        articleOutputDiagnostic: {
          category: 'PERSISTENCE_FAILED',
          layer: 'topic-artifact',
          operation: 'write-topic-file'
        }
      }
    });
  });
});
