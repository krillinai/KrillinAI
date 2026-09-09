import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWechatArticleExecutor } from '../../src/creator/article/executor.js';
import { createArticleSourceExtractor } from '../../src/creator/article/source-extractor.js';
import { createDefaultCreatorTemplateRegistry } from '../../src/creator/templates/registry.js';

let workRoot = '';

afterEach(async () => {
  if (workRoot) await rm(workRoot, { recursive: true, force: true });
  workRoot = '';
});

describe('wechat article creator template', () => {
  it('registers a shared-runtime template with source parsing and writing stages', () => {
    const template = createDefaultCreatorTemplateRegistry().get('wechat-article', 1);
    expect(template.renderer).toBe('wechat-article');
    expect(template.stages.map(stage => ({ id: stage.id, executor: stage.executor }))).toEqual([
      { id: 'sources', executor: 'wechat-article' },
      { id: 'topics', executor: 'wechat-article' },
      { id: 'outline', executor: 'wechat-article' },
      { id: 'article', executor: 'wechat-article' },
      { id: 'images', executor: 'wechat-article' },
      { id: 'document', executor: 'wechat-article' }
    ]);
    expect(template.outputs).toEqual([{ kind: 'article_document', required: true }]);
    expect(template.inputSchema.parse({ layoutStyleId: 'technical' })).toEqual(expect.objectContaining({ layoutStyleId: 'technical' }));
    expect(template.inputSchema.parse({ layoutStyleId: 'podcast' })).toEqual(expect.objectContaining({ layoutStyleId: 'podcast' }));
    expect(template.inputSchema.parse({ layoutStyleId: 'newsroom' })).toEqual(expect.objectContaining({ layoutStyleId: 'newsroom' }));
    expect(template.inputSchema.parse({})).toEqual(expect.objectContaining({
      autoGenerateImages: true,
      articleImageCount: 5,
      articleImageStyleId: 'editorial'
    }));
    expect(template.inputSchema.safeParse({ articleImageCount: 11 }).success).toBe(false);
    expect(template.inputSchema.parse({}).presetId).toBe('');
    expect(template.inputSchema.parse({ presetId: 'community.sun-style-writing' })).toEqual(expect.objectContaining({ presetId: 'community.sun-style-writing' }));
    expect(template.inputSchema.parse({ presetId: 'community.khazix-writer' })).toEqual(expect.objectContaining({ presetId: 'community.khazix-writer' }));
    expect(template.inputSchema.parse({ presetId: 'community.research-paper-writing' })).toEqual(expect.objectContaining({ presetId: 'community.research-paper-writing' }));
    expect(template.inputSchema.parse({ presetId: 'community.restrained-narrative' })).toEqual(expect.objectContaining({ presetId: 'community.sun-style-writing' }));
    expect(template.inputSchema.safeParse({ presetId: 'community.unknown-template' }).success).toBe(false);
    expect(template.inputSchema.parse({ currentStep: 5, furthestStep: 5 })).toEqual(expect.objectContaining({ currentStep: 5, furthestStep: 5 }));
  });

  it('limits links and documents to 10 combined inspiration sources', () => {
    const template = createDefaultCreatorTemplateRegistry().get('wechat-article', 1);
    const sourceLinks = Array.from({ length: 6 }, (_, index) => ({
      id: `source-${index}`,
      url: `https://example.com/${index}`,
      kind: 'webpage' as const,
      label: `Source ${index}`
    }));

    expect(template.inputSchema.safeParse({
      sourceLinks,
      sourceDocumentArtifactIds: ['doc-1', 'doc-2', 'doc-3', 'doc-4']
    }).success).toBe(true);
    expect(template.inputSchema.safeParse({
      sourceLinks,
      sourceDocumentArtifactIds: ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']
    }).success).toBe(false);
  });

  it('produces editable topics, outline, and downloadable document formats in sequence', async () => {
    workRoot = await mkdtemp(join(tmpdir(), 'wechat-article-'));
    const sourceExtractor = {
      extract: vi.fn(async () => [{
        id: 'source-1',
        type: 'webpage' as const,
        title: 'AI 产品落地',
        origin: 'https://example.com/article',
        content: '材料正文'
      }])
    };
    const topics = [{ id: 'topic-1', title: 'AI 产品落地的三个误区', angle: '从失败案例切入', summary: '解释三个常见误区' }];
    const model = {
      generateTopics: vi.fn(async () => topics),
      generateOutline: vi.fn(async () => '# AI 产品落地的三个误区\n\n## 误区一\n\n- 只看模型能力'),
      generateArticle: vi.fn(async () => '# AI 产品落地的三个误区\n\n真正困难的不是接入模型。')
    };
    const executor = createWechatArticleExecutor({ sourceExtractor, model });
    await Promise.all([
      mkdir(join(workRoot, 'sources')),
      mkdir(join(workRoot, 'topics')),
      mkdir(join(workRoot, 'outline')),
      mkdir(join(workRoot, 'article')),
      mkdir(join(workRoot, 'document'))
    ]);

    const sourceState = {
      sourceLinks: [{ id: 'source-1', url: 'https://example.com/article', kind: 'webpage', label: 'example.com' }],
      sourceDocumentArtifactIds: [],
      presetId: 'insight'
    };
    const sourcesResult = await executor.run(stageInput({
      stageId: 'sources',
      workdir: join(workRoot, 'sources'),
      state: sourceState,
      inputArtifacts: []
    }));
    const sourcesOutput = sourcesResult.outputs[0]!;
    expect(sourcesOutput).toMatchObject({
      kind: 'article_sources',
      status: 'completed',
      metadata: expect.objectContaining({ sourceCount: 1, sourceSignature: expect.any(String) })
    });

    const sourceArtifact = outputArtifact('sources-artifact', sourcesOutput);
    const topicsResult = await executor.run(stageInput({
      stageId: 'topics',
      workdir: join(workRoot, 'topics'),
      state: {
        ...sourceState,
        writingPrompt: '面向产品经理',
        topicCount: 5
      },
      inputArtifacts: [sourceArtifact]
    }));
    const topicsOutput = topicsResult.outputs.find(output => output.kind === 'article_topics')!;
    expect(topicsOutput.metadata?.topics).toEqual(topics);
    expect(sourceExtractor.extract).toHaveBeenCalledTimes(1);
    expect(model.generateTopics).toHaveBeenCalledWith(expect.objectContaining({
      sources: [expect.objectContaining({ content: '材料正文' })],
      templatePrompt: expect.stringContaining('深度洞察写作规则')
    }));

    const topicArtifact = outputArtifact('topics-artifact', topicsOutput);
    const outlineResult = await executor.run(stageInput({
      stageId: 'outline',
      workdir: join(workRoot, 'outline'),
      state: { topics, selectedTopicId: 'topic-1', writingPrompt: '面向产品经理', presetId: 'insight' },
      inputArtifacts: [sourceArtifact, topicArtifact]
    }));
    const outlineOutput = outlineResult.outputs[0]!;
    expect(outlineOutput.kind).toBe('article_outline');
    expect(await readFile(outlineOutput.path!, 'utf8')).toContain('## 误区一');
    expect(model.generateOutline).toHaveBeenCalledWith(expect.objectContaining({
      templatePrompt: expect.stringContaining('深度洞察写作规则')
    }));

    const articleResult = await executor.run(stageInput({
      stageId: 'article',
      workdir: join(workRoot, 'article'),
      state: {
        topics,
        selectedTopicId: 'topic-1',
        outline: '# AI 产品落地的三个误区\n\n## 误区一',
        writingPrompt: '面向产品经理',
        presetId: 'insight',
        templatePrompt: '先给结论',
        layoutStyleId: 'business'
      },
      inputArtifacts: [sourceArtifact, topicArtifact, outputArtifact('outline-artifact', outlineOutput)]
    }));
    const articleOutput = articleResult.outputs[0]!;
    expect(articleOutput).toMatchObject({ kind: 'article_markdown', status: 'completed' });
    expect(articleOutput.metadata).toEqual(expect.objectContaining({
      writingTemplateId: 'insight',
      writingTemplateVersion: '1.0.0',
      writingTemplateHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(await readFile(articleOutput.path!, 'utf8')).toContain('真正困难的不是接入模型');
    expect(model.generateArticle).toHaveBeenCalledWith(expect.objectContaining({
      outline: expect.stringContaining('误区一'),
      templatePrompt: expect.stringMatching(/深度洞察写作规则[\s\S]*先给结论/),
      layoutPrompt: expect.stringContaining('商业报告式 Markdown 结构')
    }));

    const editedMarkdown = '# 用户修改后的标题\n\n这是用户确认后的正文。';
    const documentResult = await executor.run(stageInput({
      stageId: 'document',
      workdir: join(workRoot, 'document'),
      state: {
        articleMarkdown: editedMarkdown,
        selectedTopicId: 'topic-1',
        layoutStyleId: 'business'
      },
      inputArtifacts: [outputArtifact('article-artifact', articleOutput)]
    }));
    expect(documentResult.progress).toEqual(expect.objectContaining({ completed: 3, failed: 0, total: 3 }));
    expect(documentResult.outputs).toHaveLength(3);
    expect(documentResult.outputs.map(output => output.metadata?.documentFormat)).toEqual(['markdown', 'html', 'pdf']);
    for (const output of documentResult.outputs) {
      expect(output).toMatchObject({
        kind: 'article_document',
        status: 'completed',
        metadata: expect.objectContaining({
          title: '用户修改后的标题',
          layoutStyleId: 'business',
          bytes: expect.any(Number)
        })
      });
    }
    const [markdownDocument, htmlDocument, pdfDocument] = documentResult.outputs;
    expect(markdownDocument?.metadata?.fileName).toBe('用户修改后的标题.md');
    expect(await readFile(markdownDocument!.path!, 'utf8')).toBe(`${editedMarkdown}\n`);
    expect(htmlDocument?.metadata?.fileName).toBe('用户修改后的标题.html');
    expect(await readFile(htmlDocument!.path!, 'utf8')).toContain('<body><article data-layout="business">');
    expect(pdfDocument?.metadata?.fileName).toBe('用户修改后的标题.pdf');
    expect((await readFile(pdfDocument!.path!)).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('plans and generates distinct article image artifacts from the edited article', async () => {
    workRoot = await mkdtemp(join(tmpdir(), 'wechat-article-images-'));
    const imagesWorkdir = join(workRoot, 'images');
    await mkdir(imagesWorkdir);
    const articlePath = join(workRoot, 'article.md');
    await writeFile(articlePath, '# AI 产品落地\n\n## 真实问题\n\n正文内容。', 'utf8');
    const generateImagePlan = vi.fn(async () => [
      { id: 'article-image-1', caption: '团队讨论落地问题', placementHeading: '真实问题', prompt: 'A product team reviewing a deployment map' },
      { id: 'article-image-2', caption: '复杂系统关系', placementHeading: '解决路径', prompt: 'An editorial systems diagram without text' }
    ]);
    const generateImage = vi.fn(async () => ({
      content: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn6zkAAAAAASUVORK5CYII=', 'base64'),
      mime: 'image/png' as const,
      provider: 'openai' as const,
      model: 'gpt-image-1'
    }));
    const executor = createWechatArticleExecutor({
      sourceExtractor: { extract: vi.fn(async () => []) },
      model: {
        generateTopics: vi.fn(),
        generateOutline: vi.fn(),
        generateArticle: vi.fn(),
        generateImagePlan
      },
      imageGenerator: { generate: generateImage }
    });

    const result = await executor.run(stageInput({
      stageId: 'images',
      workdir: imagesWorkdir,
      state: {
        articleMarkdown: '# AI 产品落地\n\n## 真实问题\n\n![旧配图](./article-image-01.png)\n\n正文内容。',
        articleImageCount: 2,
        articleImageStyleId: 'three-dimensional',
        articleImagePrompt: '使用克制的蓝绿色'
      },
      inputArtifacts: [outputArtifact('article-1', {
        kind: 'article_markdown',
        status: 'completed',
        path: articlePath
      })]
    }));

    expect(generateImagePlan).toHaveBeenCalledWith(expect.objectContaining({
      articleMarkdown: '# AI 产品落地\n\n## 真实问题\n\n正文内容。',
      count: 2,
      stylePrompt: expect.stringContaining('isometric 3D illustration'),
      customPrompt: '使用克制的蓝绿色'
    }));
    expect(generateImage).toHaveBeenCalledTimes(2);
    const generatedImageRequests = generateImage.mock.calls as unknown as Array<[{ prompt: string }]>;
    const firstImagePrompt = generatedImageRequests[0]?.[0].prompt ?? '';
    expect(firstImagePrompt).toContain('Placement heading: 真实问题');
    expect(firstImagePrompt).toContain('Relevant article content:\n## 真实问题\n\n正文内容。');
    expect(firstImagePrompt).toContain('A product team reviewing a deployment map');
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[0]).toMatchObject({
      kind: 'article_image',
      status: 'completed',
      sourceArtifactIds: ['article-1'],
      metadata: expect.objectContaining({
        imageIndex: 1,
        imageStyleId: 'three-dimensional',
        caption: '团队讨论落地问题',
        placementHeading: '真实问题',
        articleContext: '## 真实问题\n\n正文内容。',
        provider: 'openai',
        model: 'gpt-image-1'
      })
    });
  });

  it('re-extracts sources before topics when the cached source signature is stale', async () => {
    workRoot = await mkdtemp(join(tmpdir(), 'wechat-article-stale-source-'));
    const cachedPath = join(workRoot, 'cached-sources.json');
    const topicsWorkdir = join(workRoot, 'topics');
    await Promise.all([
      writeFile(cachedPath, '[]\n', 'utf8'),
      mkdir(topicsWorkdir)
    ]);
    const sourceExtractor = {
      extract: vi.fn(async () => [{
        id: 'source-new',
        type: 'webpage' as const,
        title: '新来源',
        origin: 'https://example.com/new',
        content: '新来源正文'
      }])
    };
    const model = {
      generateTopics: vi.fn(async () => [{ id: 'topic-1', title: '新选题', angle: '', summary: '' }]),
      generateOutline: vi.fn(),
      generateArticle: vi.fn()
    };
    const executor = createWechatArticleExecutor({ sourceExtractor, model });
    const result = await executor.run(stageInput({
      stageId: 'topics',
      workdir: topicsWorkdir,
      state: {
        sourceLinks: [{ id: 'source-new', url: 'https://example.com/new', kind: 'webpage', label: 'example.com' }],
        sourceDocumentArtifactIds: [],
        writingPrompt: '根据新资料写作'
      },
      inputArtifacts: [{
        id: 'cached-source-artifact',
        kind: 'article_sources',
        status: 'completed',
        path: cachedPath,
        metadata: { sourceSignature: 'stale' }
      }]
    }));

    expect(sourceExtractor.extract).toHaveBeenCalledTimes(1);
    expect(result.outputs.map(output => output.kind)).toEqual(['article_sources', 'article_topics']);
    expect(model.generateTopics).toHaveBeenCalledWith(expect.objectContaining({
      sources: [expect.objectContaining({ content: '新来源正文' })],
      templatePrompt: ''
    }));
  });

  it('loads the pinned community skill rules for topic generation', async () => {
    workRoot = await mkdtemp(join(tmpdir(), 'wechat-article-community-template-'));
    const topicsWorkdir = join(workRoot, 'topics');
    await mkdir(topicsWorkdir);
    const model = {
      generateTopics: vi.fn(async (_request: { templatePrompt: string }) => [{ id: 'topic-1', title: '一个具体故事', angle: '', summary: '' }]),
      generateOutline: vi.fn(),
      generateArticle: vi.fn()
    };
    const executor = createWechatArticleExecutor({
      sourceExtractor: { extract: vi.fn(async () => []) },
      model
    });

    const result = await executor.run(stageInput({
      stageId: 'topics',
      workdir: topicsWorkdir,
      state: {
        sourceLinks: [],
        sourceDocumentArtifactIds: [],
        writingPrompt: '写一篇人物经历',
        presetId: 'community.sun-style-writing'
      },
      inputArtifacts: []
    }));

    expect(model.generateTopics).toHaveBeenCalledWith(expect.objectContaining({
      templatePrompt: expect.stringContaining('选题规则')
    }));
    expect(model.generateTopics.mock.calls[0]?.[0].templatePrompt).not.toContain('成稿检查');
    expect(result.outputs.find(output => output.kind === 'article_topics')?.metadata).toEqual(expect.objectContaining({
      writingTemplateId: 'community.sun-style-writing',
      writingTemplateRevision: 'fe970dc15113ea0c3807f19f1d3118f63f9d9079'
    }));
  });

  it('extracts selected local text documents into bounded source material', async () => {
    workRoot = await mkdtemp(join(tmpdir(), 'wechat-article-source-'));
    const path = join(workRoot, 'source.md');
    await writeFile(path, '# 原始标题\n\n这是用于写作的正文。', 'utf8');
    const extractor = createArticleSourceExtractor({
      configStore: { read: vi.fn(async () => ({ proxy: '' })) } as never
    });
    const sources = await extractor.extract({
      links: [],
      documents: [{
        id: 'document-1',
        kind: 'source_document',
        status: 'completed',
        path,
        metadata: { fileName: 'source.md' }
      } as never],
      workdir: workRoot,
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    });

    expect(sources).toEqual([expect.objectContaining({
      id: 'document-1',
      type: 'document',
      title: 'source.md',
      content: expect.stringContaining('用于写作的正文')
    })]);
  });

  it('extracts the main body from a WeChat-style webpage', async () => {
    const extractor = createArticleSourceExtractor({
      configStore: { read: vi.fn(async () => ({ proxy: '' })) } as never,
      fetchService: vi.fn(async () => new Response([
        '<html><head><title>页面标题</title></head><body>',
        '<nav>无关导航</nav>',
        '<h1>公众号文章标题</h1>',
        '<div id="js_content"><p>第一段正文。</p><p>第二段正文。</p></div>',
        '<footer>无关页脚</footer>',
        '</body></html>'
      ].join(''), { status: 200 })) as never
    });

    const sources = await extractor.extract({
      links: [{ id: 'web-1', url: 'https://mp.weixin.qq.com/s/example', kind: 'webpage', label: '微信公众平台' }],
      documents: [],
      workdir: '/tmp',
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    });

    expect(sources[0]).toEqual(expect.objectContaining({
      title: '公众号文章标题',
      content: '第一段正文。第二段正文。'
    }));
    expect(sources[0]?.content).not.toContain('无关导航');
  });

  it('prefers human subtitles over automatic captions', async () => {
    const fetchService = vi.fn(async () => new Response([
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:02.000',
      '人工字幕第一句。',
      '',
      '00:00:02.000 --> 00:00:04.000',
      '人工字幕第二句。'
    ].join('\n'), { status: 200 }));
    const extractor = createArticleSourceExtractor({
      configStore: { read: vi.fn(async () => ({ proxy: '' })) } as never,
      getYtDlpRuntime: () => ({ version: 'test', executable: '/tmp/yt-dlp', prefixArgs: [], env: {} }),
      runYtDlp: vi.fn(async () => JSON.stringify({
        title: '字幕测试视频',
        subtitles: {
          zh: [{ ext: 'vtt', url: 'https://example.com/human.vtt' }]
        },
        automatic_captions: {
          'zh-CN': [{ ext: 'json3', url: 'https://example.com/captions.json3' }]
        }
      })),
      fetchService: fetchService as never
    });

    const sources = await extractor.extract({
      links: [{ id: 'video-1', url: 'https://www.youtube.com/watch?v=test', kind: 'video', label: 'YouTube' }],
      documents: [],
      workdir: '/tmp',
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    });

    expect(sources).toEqual([expect.objectContaining({
      title: '字幕测试视频',
      content: '人工字幕第一句。\n人工字幕第二句。',
      transcriptType: 'human',
      transcriptLanguage: 'zh'
    })]);
    expect(fetchService).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: new URL('https://example.com/human.vtt')
    }));
  });

  it('uses automatic captions when no human subtitles are available', async () => {
    const extractor = createArticleSourceExtractor({
      configStore: { read: vi.fn(async () => ({ proxy: '' })) } as never,
      getYtDlpRuntime: () => ({ version: 'test', executable: '/tmp/yt-dlp', prefixArgs: [], env: {} }),
      runYtDlp: vi.fn(async () => JSON.stringify({
        title: '自动字幕测试',
        automatic_captions: {
          'zh-CN': [{ ext: 'json3', url: 'https://example.com/automatic.json3' }]
        }
      })),
      fetchService: vi.fn(async () => new Response(JSON.stringify({
        events: [{ segs: [{ utf8: '自动字幕内容。' }] }]
      }), { status: 200 })) as never
    });

    const sources = await extractor.extract({
      links: [{ id: 'video-1', url: 'https://www.youtube.com/watch?v=test', kind: 'video', label: 'YouTube' }],
      documents: [],
      workdir: '/tmp',
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    });

    expect(sources[0]).toEqual(expect.objectContaining({
      content: '自动字幕内容。',
      transcriptType: 'automatic',
      transcriptLanguage: 'zh-CN'
    }));
  });

  it('rejects a video source when the platform exposes no subtitles', async () => {
    const extractor = createArticleSourceExtractor({
      configStore: { read: vi.fn(async () => ({ proxy: '' })) } as never,
      getYtDlpRuntime: () => ({ version: 'test', executable: '/tmp/yt-dlp', prefixArgs: [], env: {} }),
      runYtDlp: vi.fn(async () => JSON.stringify({ title: '无字幕视频' }))
    });

    await expect(extractor.extract({
      links: [{ id: 'video-1', url: 'https://www.bilibili.com/video/BV1test', kind: 'video', label: 'Bilibili' }],
      documents: [],
      workdir: '/tmp',
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    })).rejects.toMatchObject({ code: 'creator_source_transcript_missing' });
  });
});

function stageInput(input: {
  stageId: string;
  workdir: string;
  state: Record<string, unknown>;
  inputArtifacts: unknown[];
}) {
  return {
    stageRun: { stageId: input.stageId },
    job: { state: input.state, artifacts: input.inputArtifacts },
    inputArtifacts: input.inputArtifacts,
    workdir: input.workdir,
    signal: new AbortController().signal,
    reportProgress: vi.fn()
  } as never;
}

function outputArtifact(id: string, output: {
  kind: string;
  status: string;
  path: string | null;
  sourceArtifactIds?: string[];
  metadata?: Record<string, unknown>;
}) {
  return {
    id,
    jobId: 'job-1',
    kind: output.kind,
    status: output.status,
    path: output.path,
    sourceArtifactIds: output.sourceArtifactIds ?? [],
    metadata: output.metadata ?? {},
    createdAt: '2026-09-07T00:00:00.000Z'
  } as never;
}
