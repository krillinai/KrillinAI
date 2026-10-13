import type { CreatorJson } from '@opencreator/protocol';
import { CreatorExecutorError } from '../executor.js';

export const articleOutputFailureCategories = [
  'EMPTY_RESPONSE',
  'INVALID_JSON_SYNTAX',
  'INVALID_JSON_WRAPPER',
  'SCHEMA_VALIDATION_FAILED',
  'TRUNCATED_OR_INCOMPLETE_OUTPUT',
  'UNSUPPORTED_RESPONSE_SHAPE',
  'PERSISTENCE_FAILED'
] as const;

export type ArticleOutputFailureCategory = typeof articleOutputFailureCategories[number];

export const articleOutputDiagnosticLayers = [
  'completion-envelope',
  'completion-content',
  'topic-data',
  'topic-artifact'
] as const;

export type ArticleOutputDiagnosticLayer = typeof articleOutputDiagnosticLayers[number];

export type ArticleOutputDiagnostic = {
  category: ArticleOutputFailureCategory;
  layer: ArticleOutputDiagnosticLayer;
  responseBytes?: number;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'function_call' | 'content_filter' | 'unknown';
  responseShape?: string;
  syntaxPosition?: number;
  schemaIssues?: Array<{ path: string; code: string }>;
  operation?: 'write-topic-file' | 'persist-topic-artifact';
};

export function articleOutputFailure(
  diagnostic: ArticleOutputDiagnostic,
  dataName: string
): CreatorExecutorError {
  const code = diagnostic.category === 'EMPTY_RESPONSE'
    ? 'creator_llm_empty_response'
    : 'creator_llm_invalid_response';
  const message = diagnostic.category === 'EMPTY_RESPONSE'
    ? 'Article writing returned no content'
    : 'The text model returned data that could not be safely read as ' + dataName
      + ' data. Adjust the instructions and retry; no ' + dataName + ' output was saved.';
  const details: Record<string, CreatorJson> = {
    articleOutputDiagnostic: diagnostic as unknown as CreatorJson
  };
  return new CreatorExecutorError(code, message, details);
}

export function withArticleOutputDiagnostic(
  error: unknown,
  diagnostic: ArticleOutputDiagnostic
): CreatorExecutorError {
  const original = error instanceof Error ? error : new Error('Article topic output could not be persisted');
  const originalCode = typeof (error as { code?: unknown } | null)?.code === 'string'
    ? (error as { code: string }).code
    : 'creator_stage_failed';
  const previousDetails = error instanceof CreatorExecutorError ? error.details : {};
  const previousFacts = error instanceof CreatorExecutorError ? error.publicFacts : undefined;
  return new CreatorExecutorError(originalCode, original.message, {
    ...previousDetails,
    articleOutputDiagnostic: diagnostic as unknown as CreatorJson
  }, previousFacts, { cause: original });
}

export function articleOutputDiagnosticFromError(error: unknown): ArticleOutputDiagnostic | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const details = (error as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return undefined;
  const value = (details as Record<string, unknown>).articleOutputDiagnostic;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const diagnostic = value as Record<string, unknown>;
  if (
    !articleOutputFailureCategories.includes(diagnostic.category as ArticleOutputFailureCategory)
    || !articleOutputDiagnosticLayers.includes(diagnostic.layer as ArticleOutputDiagnosticLayer)
  ) return undefined;

  const responseBytes = boundedInteger(diagnostic.responseBytes, 0, 4 * 1024 * 1024);
  const syntaxPosition = boundedInteger(diagnostic.syntaxPosition, 0, 4 * 1024 * 1024);
  const finishReason = isFinishReason(diagnostic.finishReason) ? diagnostic.finishReason : undefined;
  const responseShape = safeDiagnosticToken(diagnostic.responseShape);
  const operation = diagnostic.operation === 'write-topic-file' || diagnostic.operation === 'persist-topic-artifact'
    ? diagnostic.operation
    : undefined;
  const schemaIssues = Array.isArray(diagnostic.schemaIssues)
    ? diagnostic.schemaIssues.slice(0, 6).flatMap(issue => {
        if (typeof issue !== 'object' || issue === null || Array.isArray(issue)) return [];
        const record = issue as Record<string, unknown>;
        const path = safeSchemaPath(record.path);
        const code = safeDiagnosticToken(record.code);
        return path === undefined || code === undefined ? [] : [{ path, code }];
      })
    : undefined;

  return {
    category: diagnostic.category as ArticleOutputFailureCategory,
    layer: diagnostic.layer as ArticleOutputDiagnosticLayer,
    ...(responseBytes === undefined ? {} : { responseBytes }),
    ...(finishReason === undefined ? {} : { finishReason }),
    ...(responseShape === undefined ? {} : { responseShape }),
    ...(syntaxPosition === undefined ? {} : { syntaxPosition }),
    ...(schemaIssues === undefined || schemaIssues.length === 0 ? {} : { schemaIssues }),
    ...(operation === undefined ? {} : { operation })
  };
}

export function formatArticleOutputDiagnostic(diagnostic: ArticleOutputDiagnostic): string {
  return [
    'article_output=' + diagnostic.category,
    'layer=' + diagnostic.layer,
    ...(diagnostic.responseBytes === undefined ? [] : ['response_bytes=' + diagnostic.responseBytes]),
    ...(diagnostic.finishReason === undefined ? [] : ['finish_reason=' + diagnostic.finishReason]),
    ...(diagnostic.responseShape === undefined ? [] : ['response_shape=' + diagnostic.responseShape]),
    ...(diagnostic.syntaxPosition === undefined ? [] : ['syntax_position=' + diagnostic.syntaxPosition]),
    ...(diagnostic.schemaIssues === undefined
      ? []
      : ['schema_issues=' + diagnostic.schemaIssues.map(issue => issue.path + ':' + issue.code).join(',')]),
    ...(diagnostic.operation === undefined ? [] : ['operation=' + diagnostic.operation])
  ].join(' ');
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

function isFinishReason(value: unknown): value is NonNullable<ArticleOutputDiagnostic['finishReason']> {
  return value === 'stop' || value === 'length' || value === 'tool_calls'
    || value === 'function_call' || value === 'content_filter' || value === 'unknown';
}

function safeDiagnosticToken(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9_.-]{1,64}$/i.test(value) ? value : undefined;
}

function safeSchemaPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 160) return undefined;
  const segments = value.split('.');
  if (!segments.every(segment => /^[a-z0-9_-]{1,40}$/i.test(segment))) return undefined;
  const allowed = new Set(['topics', 'images', 'title', 'angle', 'summary', 'caption', 'placementHeading', 'prompt']);
  return segments.map(segment => /^\d+$/.test(segment)
    ? (Number(segment) <= 9 ? segment : 'index')
    : allowed.has(segment) ? segment : 'field').join('.');
}
