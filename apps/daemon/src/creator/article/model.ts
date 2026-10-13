import type { WechatArticleImagePlanItem, WechatArticleTopic } from '@opencreator/protocol';
import { z } from 'zod';
import type { CreatorServicesConfigStore } from '../../creator-services/config-store.js';
import { creatorTextCompletionConfig } from '../../creator-services/text-completion-config.js';
import {
  creatorServiceErrorInfo,
  fetchCreatorService,
  isRecord,
  openAiCompatibleEndpoint
} from '../../creator-services/upstream-fetch.js';
import { CreatorExecutorError } from '../executor.js';
import type { ExtractedArticleSource } from './source-extractor.js';
import {
  articleOutputFailure,
  type ArticleOutputDiagnostic,
  type ArticleOutputFailureCategory
} from './output-diagnostics.js';
import { resolveArticleTopicProvider } from './topic-provider.js';

const topicsSchema = (count: number) => z.object({
  topics: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    angle: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(1_000)
  }).strict()).min(1).max(10).length(count)
}).strict();

const imagePlanSchema = z.object({
  images: z.array(z.object({
    caption: z.string().min(1).max(200),
    placementHeading: z.string().min(1).max(200),
    prompt: z.string().min(1).max(2_000)
  }).strict()).min(1).max(10)
}).strict();

export function createWechatArticleModel(input: {
  configStore: Pick<CreatorServicesConfigStore, 'read'>;
  fetchImpl?: typeof fetch;
}) {
  type CompletionResult = {
    content: string;
    finishReason?: NonNullable<ArticleOutputDiagnostic['finishReason']>;
  };
  async function complete(request: {
    prompt: string;
    signal: AbortSignal;
    json?: boolean;
    dataName?: string;
    topicCount?: number;
  }): Promise<CompletionResult> {
    const config = await input.configStore.read();
    const topicProvider = request.topicCount === undefined
      ? undefined
      : resolveArticleTopicProvider(config, request.topicCount);
    if (topicProvider !== undefined && !topicProvider.ok) {
      throw new CreatorExecutorError(
        'creator_llm_config_missing',
        topicProvider.message
      );
    }
    const llm = topicProvider?.ok
      ? topicProvider.provider
      : creatorTextCompletionConfig(config);
    if (!llm.apiKey.trim() || !llm.model.trim()) {
      throw new CreatorExecutorError('creator_llm_config_missing', 'LLM configuration is incomplete');
    }
    const response = await fetchCreatorService({
      endpoint: openAiCompatibleEndpoint(llm.baseUrl, 'chat/completions'),
      method: 'POST',
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: llm.model,
        ...(topicProvider?.ok && topicProvider.responseFormat !== undefined
          ? { response_format: topicProvider.responseFormat }
          : request.json && llm.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [{ role: 'user', content: request.prompt }]
      }),
      proxy: config.proxy,
      signal: request.signal,
      maxResponseBytes: 4 * 1024 * 1024,
      fetchImpl: input.fetchImpl
    });
    if (!response.ok) {
      const failure = await creatorServiceErrorInfo(response, 'Article writing', 'llm');
      throw new CreatorExecutorError(
        'creator_llm_upstream_error',
        failure.message,
        {},
        failure.publicFacts
      );
    }
    const responseBody = await response.text();
    const responseBytes = Buffer.byteLength(responseBody, 'utf8');
    let payload: unknown;
    try {
      payload = JSON.parse(responseBody);
    } catch (error) {
      const position = syntaxErrorPosition(error);
      throw articleOutputFailure({
        category: isUnexpectedJsonEnd(error)
          ? 'TRUNCATED_OR_INCOMPLETE_OUTPUT'
          : 'INVALID_JSON_SYNTAX',
        layer: 'completion-envelope',
        responseBytes,
        ...(position === undefined ? {} : { syntaxPosition: position })
      }, request.dataName ?? 'article');
    }
    if (!isRecord(payload)) {
      throw unsupportedCompletionShape('completion-envelope', 'root-not-object', responseBytes, request.dataName ?? 'article');
    }
    if (!Array.isArray(payload.choices)) {
      throw unsupportedCompletionShape('completion-envelope', 'choices-not-array', responseBytes, request.dataName ?? 'article');
    }
    const firstChoice = payload.choices[0];
    if (!isRecord(firstChoice)) {
      throw unsupportedCompletionShape('completion-envelope', 'first-choice-not-object', responseBytes, request.dataName ?? 'article');
    }
    if (!isRecord(firstChoice.message)) {
      throw unsupportedCompletionShape('completion-envelope', 'message-not-object', responseBytes, request.dataName ?? 'article');
    }
    const raw = firstChoice.message.content;
    const finishReason = normalizeFinishReason(firstChoice.finish_reason);
    let content: string;
    if (typeof raw === 'string') {
      content = raw;
    } else if (Array.isArray(raw) && raw.every(item => isRecord(item) && typeof item.text === 'string')) {
      content = raw.map(item => (item as { text: string }).text).join('');
    } else {
      throw unsupportedCompletionShape(
        'completion-content',
        raw === undefined || raw === null ? 'content-missing' : 'content-not-text',
        responseBytes,
        request.dataName ?? 'article',
        finishReason
      );
    }
    if (!content.trim()) {
      throw articleOutputFailure({
        category: 'EMPTY_RESPONSE',
        layer: 'completion-content',
        responseBytes: Buffer.byteLength(content, 'utf8'),
        ...(finishReason === undefined ? {} : { finishReason })
      }, request.dataName ?? 'article');
    }
    return {
      content: content.trim(),
      ...(finishReason === undefined ? {} : { finishReason })
    };
  }

  return {
    async generateTopics(request: {
      sources: ExtractedArticleSource[];
      writingPrompt: string;
      templatePrompt: string;
      count: number;
      signal: AbortSignal;
    }): Promise<WechatArticleTopic[]> {
      const completion = await complete({
        dataName: 'topics',
        json: true,
        topicCount: request.count,
        signal: request.signal,
        prompt: [
          '你是一名资深微信公众号主编。请根据来源和用户要求提出可直接写作的选题。',
          `生成恰好 ${request.count} 个差异明显的选题，只输出严格 JSON：{"topics":[{"title":"标题","angle":"核心切入角度","summary":"文章内容摘要"}]}`,
          'topics 数组必须恰好包含上述数量的项目；每个项目都必须包含 title、angle、summary 三个字符串字段。',
          '不要附加说明、Markdown 代码围栏或尾随逗号；确保输出是语法有效且符合示例结构的 JSON。',
          '标题要具体、克制、有信息量，不使用虚假数据或来源没有支持的结论。',
          request.templatePrompt.trim() ? `文章模板规则：\n${request.templatePrompt}` : '',
          request.writingPrompt.trim() ? `用户写作要求：${request.writingPrompt}` : '用户没有额外写作要求。',
          sourcePrompt(request.sources)
        ].filter(Boolean).join('\n\n')
      });
      const parsed = parseStructuredResponse(completion, topicsSchema(request.count), 'topics');
      return parsed.topics.map((topic, index) => ({
        id: `topic-${index + 1}`,
        ...topic
      }));
    },
    async generateOutline(request: {
      sources: ExtractedArticleSource[];
      topic: WechatArticleTopic;
      writingPrompt: string;
      templatePrompt: string;
      signal: AbortSignal;
    }): Promise<string> {
      return (await complete({
        signal: request.signal,
        prompt: [
          '你是一名资深微信公众号主编。请为选定选题生成可编辑的文章大纲。',
          '使用 Markdown。第一行是文章标题，随后列出导语、二到五个主体章节及每节要点、结尾。',
          '大纲要形成完整论证或叙事推进，明确哪些事实来自素材，禁止虚构。不要直接写成全文。',
          `选题：${JSON.stringify(request.topic)}`,
          request.templatePrompt.trim() ? `文章模板规则：\n${request.templatePrompt}` : '',
          request.writingPrompt.trim() ? `用户写作要求：${request.writingPrompt}` : '用户没有额外写作要求。',
          sourcePrompt(request.sources)
        ].filter(Boolean).join('\n\n')
      })).content;
    },
    async generateArticle(request: {
      sources: ExtractedArticleSource[];
      topic: WechatArticleTopic;
      outline: string;
      writingPrompt: string;
      templatePrompt: string;
      layoutPrompt: string;
      signal: AbortSignal;
    }): Promise<string> {
      return (await complete({
        signal: request.signal,
        prompt: [
          '你是一名资深微信公众号作者。请按选题和大纲完成一篇可直接编辑发布的中文文章。',
          '只输出 Markdown 正文，从一级标题开始。保持事实边界，来源没有的信息不要编造；不要输出写作说明。',
          `选题：${JSON.stringify(request.topic)}`,
          `大纲：\n${request.outline}`,
          request.templatePrompt.trim() ? `文章模板要求：${request.templatePrompt}` : '',
          request.layoutPrompt.trim() ? `Markdown 排版要求：${request.layoutPrompt}` : '',
          request.writingPrompt.trim() ? `用户写作要求：${request.writingPrompt}` : '',
          sourcePrompt(request.sources)
        ].filter(Boolean).join('\n\n')
      })).content;
    },
    async generateImagePlan(request: {
      articleMarkdown: string;
      count: number;
      stylePrompt: string;
      customPrompt: string;
      signal: AbortSignal;
    }): Promise<WechatArticleImagePlanItem[]> {
      const completion = await complete({
        dataName: 'article image plan',
        json: true,
        signal: request.signal,
        prompt: [
          '你是一名资深视觉编辑。请为下面这篇微信公众号文章规划内容互不重复的配图。',
          `生成 ${request.count} 张配图，只输出严格 JSON：{"images":[{"caption":"图片说明","placementHeading":"建议放在哪个章节标题之后","prompt":"可直接用于图像生成模型的完整英文提示词"}]}`,
          '不要附加说明、Markdown 代码围栏或尾随逗号；确保输出是语法有效且符合示例结构的 JSON。',
          'placementHeading 必须原样复制文章中真实存在的 Markdown 标题，优先选择二级或三级标题。',
          '每张图必须服务于所选章节的具体内容，并覆盖不同的核心段落。prompt 要准确呈现该章节中的人物、对象、场景、动作、关系或数据含义；抽象内容可以使用贴合原意的视觉隐喻，但禁止生成与正文无关的装饰性画面。',
          '主体、场景和视觉隐喻要具体。不要把文章标题、段落文字、Logo、水印或大段可见文字放进画面。',
          `统一视觉风格：${request.stylePrompt}`,
          request.customPrompt.trim() ? `用户补充的配图要求：${request.customPrompt}` : '',
          `文章正文：\n${request.articleMarkdown.slice(0, 100_000)}`
        ].filter(Boolean).join('\n\n')
      });
      const parsed = parseStructuredResponse(completion, imagePlanSchema, 'article image plan');
      return parsed.images.slice(0, request.count).map((item, index) => ({
        id: `article-image-${index + 1}`,
        ...item
      }));
    }
  };
}

function sourcePrompt(sources: ExtractedArticleSource[]): string {
  if (sources.length === 0) return '本次没有内容来源，请基于用户要求写作，并避免捏造具体事实和数据。';
  let remaining = 120_000;
  const sections: string[] = [];
  for (const [index, source] of sources.entries()) {
    if (remaining <= 0) break;
    const header = `[来源 ${index + 1}] ${source.title}\n出处：${source.origin}\n`;
    const content = source.content.slice(0, Math.max(0, remaining - header.length));
    sections.push(`${header}${content}`);
    remaining -= header.length + content.length;
  }
  return `内容来源：\n${sections.join('\n\n')}`;
}

function parseStructuredResponse<T extends z.ZodTypeAny>(
  completion: { content: string; finishReason?: NonNullable<ArticleOutputDiagnostic['finishReason']> },
  schema: T,
  dataName: string
): z.infer<T> {
  const responseBytes = Buffer.byteLength(completion.content, 'utf8');
  let value: unknown;
  try {
    value = parseJson(completion.content, completion.finishReason);
  } catch (error) {
    const failure = error instanceof StructuredJsonFailure
      ? error
      : new StructuredJsonFailure('INVALID_JSON_SYNTAX', syntaxErrorPosition(error));
    throw articleOutputFailure({
      category: failure.category,
      layer: 'topic-data',
      responseBytes,
      ...(completion.finishReason === undefined ? {} : { finishReason: completion.finishReason }),
      ...(failure.syntaxPosition === undefined ? {} : { syntaxPosition: failure.syntaxPosition })
    }, dataName);
  }
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw articleOutputFailure({
    category: 'SCHEMA_VALIDATION_FAILED',
    layer: 'topic-data',
    responseBytes,
    ...(completion.finishReason === undefined ? {} : { finishReason: completion.finishReason }),
    schemaIssues: safeSchemaIssues(parsed.error.issues)
  }, dataName);
}

class StructuredJsonFailure extends Error {
  constructor(
    readonly category: Extract<
      ArticleOutputFailureCategory,
      'INVALID_JSON_SYNTAX' | 'INVALID_JSON_WRAPPER' | 'TRUNCATED_OR_INCOMPLETE_OUTPUT'
    >,
    readonly syntaxPosition?: number
  ) {
    super(category);
    this.name = 'StructuredJsonFailure';
  }
}

function parseJson(value: string, finishReason?: ArticleOutputDiagnostic['finishReason']): unknown {
  let candidate = value.trim();
  if (!candidate) throw new StructuredJsonFailure('INVALID_JSON_WRAPPER');

  const fenceToken = String.fromCharCode(96).repeat(3);
  const initialObjectStart = candidate.indexOf('{');
  const initialObjectEnd = initialObjectStart < 0
    ? undefined
    : scanJsonObject(candidate, initialObjectStart);
  if (initialObjectEnd?.state === 'incomplete') {
    throw new StructuredJsonFailure('TRUNCATED_OR_INCOMPLETE_OUTPUT');
  }
  if (initialObjectEnd?.state === 'mismatched') {
    throw new StructuredJsonFailure(
      finishReason === 'length' ? 'TRUNCATED_OR_INCOMPLETE_OUTPUT' : 'INVALID_JSON_SYNTAX'
    );
  }
  const fencePositions: number[] = [];
  for (let position = candidate.indexOf(fenceToken); position >= 0; position = candidate.indexOf(fenceToken, position + 1)) {
    const withinJsonValue = initialObjectStart >= 0
      && initialObjectEnd?.state === 'complete'
      && position >= initialObjectStart
      && position < initialObjectEnd.end;
    if (!withinJsonValue) fencePositions.push(position);
  }
  if (fencePositions.length > 0) {
    if (fencePositions.length !== 2) {
      throw new StructuredJsonFailure(
        finishReason === 'length' ? 'TRUNCATED_OR_INCOMPLETE_OUTPUT' : 'INVALID_JSON_WRAPPER'
      );
    }
    const opening = fencePositions[0]!;
    const closing = fencePositions[1]!;
    const between = candidate.slice(opening + fenceToken.length, closing);
    const newline = between.indexOf('\n');
    const header = (newline < 0 ? between : between.slice(0, newline)).trim();
    const language = header.toLowerCase();
    if (language !== '' && language !== 'json') {
      throw new StructuredJsonFailure('INVALID_JSON_WRAPPER');
    }
    const body = newline < 0 ? between.slice(header.length) : between.slice(newline + 1);
    candidate = candidate.slice(0, opening) + body + candidate.slice(closing + fenceToken.length);
  }

  const objectStart = candidate.indexOf('{');
  if (objectStart >= 0) {
    const scan = scanJsonObject(candidate, objectStart);
    if (scan.state === 'incomplete') {
      throw new StructuredJsonFailure('TRUNCATED_OR_INCOMPLETE_OUTPUT');
    }
    if (scan.state === 'mismatched') {
      throw new StructuredJsonFailure(
        finishReason === 'length' ? 'TRUNCATED_OR_INCOMPLETE_OUTPUT' : 'INVALID_JSON_SYNTAX'
      );
    }
    if (scan.end === undefined || candidate.slice(scan.end).includes('{')) {
      throw new StructuredJsonFailure('INVALID_JSON_WRAPPER');
    }
    candidate = candidate.slice(objectStart, scan.end);
  }
  try {
    return JSON.parse(quoteUnquotedObjectKeys(removeTrailingCommas(candidate)));
  } catch (error) {
    if (finishReason === 'length' || isUnexpectedJsonEnd(error)) {
      throw new StructuredJsonFailure('TRUNCATED_OR_INCOMPLETE_OUTPUT', syntaxErrorPosition(error));
    }
    if (objectStart < 0 && !candidate.startsWith('[')) {
      throw new StructuredJsonFailure('INVALID_JSON_WRAPPER', syntaxErrorPosition(error));
    }
    throw new StructuredJsonFailure('INVALID_JSON_SYNTAX', syntaxErrorPosition(error));
  }
}

function scanJsonObject(
  value: string,
  start: number
): { state: 'complete'; end: number } | { state: 'incomplete' | 'mismatched'; end?: undefined } {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      const open = stack.pop();
      if ((open === '{' && char !== '}') || (open === '[' && char !== ']') || open === undefined) {
        return { state: 'mismatched' };
      }
      if (stack.length === 0) return { state: 'complete', end: index + 1 };
    }
  }
  return { state: 'incomplete' };
}

function unsupportedCompletionShape(
  layer: ArticleOutputDiagnostic['layer'],
  responseShape: string,
  responseBytes: number,
  dataName = 'article',
  finishReason?: ArticleOutputDiagnostic['finishReason']
): CreatorExecutorError {
  return articleOutputFailure({
    category: 'UNSUPPORTED_RESPONSE_SHAPE',
    layer,
    responseBytes,
    responseShape,
    ...(finishReason === undefined ? {} : { finishReason })
  }, dataName);
}

function normalizeFinishReason(value: unknown): ArticleOutputDiagnostic['finishReason'] {
  if (value === undefined || value === null) return undefined;
  return value === 'stop' || value === 'length' || value === 'tool_calls'
    || value === 'function_call' || value === 'content_filter'
    ? value
    : 'unknown';
}

function isUnexpectedJsonEnd(error: unknown): boolean {
  return error instanceof SyntaxError && /unexpected end|unterminated/i.test(error.message);
}

function syntaxErrorPosition(error: unknown): number | undefined {
  if (!(error instanceof SyntaxError)) return undefined;
  const match = /(?:position|column)\s+(\d+)/i.exec(error.message);
  if (!match) return undefined;
  const position = Number(match[1]);
  return Number.isSafeInteger(position) && position >= 0 && position <= 4 * 1024 * 1024
    ? position
    : undefined;
}

function safeSchemaIssues(issues: z.ZodIssue[]): Array<{ path: string; code: string }> {
  const allowedSegments = new Set([
    'topics', 'images', 'title', 'angle', 'summary', 'caption', 'placementHeading', 'prompt'
  ]);
  return issues.slice(0, 6).map(issue => ({
    path: issue.path.map(part => {
      if (typeof part === 'number') return part >= 0 && part <= 9 ? String(part) : 'index';
      return typeof part === 'string' && allowedSegments.has(part) ? part : 'field';
    }).join('.').slice(0, 160) || 'root',
    code: /^[a-z0-9_.-]{1,64}$/i.test(issue.code) ? issue.code : 'invalid'
  }));
}

function removeTrailingCommas(value: string): string {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    if (char === ',') {
      let next = index + 1;
      while (/\s/.test(value[next] ?? '')) next += 1;
      if (value[next] === '}' || value[next] === ']') continue;
    }
    output += char;
  }
  return output;
}

function quoteUnquotedObjectKeys(value: string): string {
  type Frame = { kind: 'object' | 'array'; state: 'key' | 'colon' | 'value' | 'separator' };
  const stack: Frame[] = [];
  let output = '';
  let index = 0;
  while (index < value.length) {
    const char = value[index]!;
    const frame = stack.at(-1);
    if (/\s/.test(char)) {
      output += char;
      index += 1;
      continue;
    }
    if (frame?.kind === 'object' && frame.state === 'key' && isIdentifierStart(char)) {
      let end = index + 1;
      while (isIdentifierPart(value[end] ?? '')) end += 1;
      let next = end;
      while (/\s/.test(value[next] ?? '')) next += 1;
      if (value[next] === ':') {
        output += `"${value.slice(index, end)}"`;
        frame.state = 'colon';
        index = end;
        continue;
      }
    }
    if (char === '"') {
      let end = index + 1;
      let escaped = false;
      for (; end < value.length; end += 1) {
        const current = value[end]!;
        if (escaped) escaped = false;
        else if (current === '\\') escaped = true;
        else if (current === '"') {
          end += 1;
          break;
        }
      }
      output += value.slice(index, end);
      if (frame?.kind === 'object') frame.state = frame.state === 'key' ? 'colon' : 'separator';
      else if (frame?.kind === 'array' && frame.state === 'value') frame.state = 'separator';
      index = end;
      continue;
    }
    if (char === '{' || char === '[') {
      if (frame?.state === 'value') frame.state = 'separator';
      output += char;
      stack.push({ kind: char === '{' ? 'object' : 'array', state: char === '{' ? 'key' : 'value' });
    } else if (char === ':' && frame?.kind === 'object' && frame.state === 'colon') {
      frame.state = 'value';
      output += char;
    } else if (char === ',' && frame?.state === 'separator') {
      frame.state = frame.kind === 'object' ? 'key' : 'value';
      output += char;
    } else if ((char === '}' && frame?.kind === 'object') || (char === ']' && frame?.kind === 'array')) {
      stack.pop();
      output += char;
    } else {
      if (frame?.state === 'value') frame.state = 'separator';
      output += char;
    }
    index += 1;
  }
  return output;
}

function isIdentifierStart(value: string): boolean {
  return /^[A-Za-z_$]$/.test(value);
}

function isIdentifierPart(value: string): boolean {
  return /^[A-Za-z0-9_$]$/.test(value);
}
