import type { OpenCreatorIssue } from '@opencreator/protocol';
import { useCallback, useMemo, useState } from 'react';
import { ApiClientError } from '../../runtime/errors.js';

export type PageIssueState = {
  issues: OpenCreatorIssue[];
  captureOperationFailure(
    operationId: string,
    cause: unknown,
    fallbackMessage?: string,
    options?: { retryable?: boolean; risk?: 'normal' | 'paid' | 'overwrite' }
  ): OpenCreatorIssue;
  resolveOperation(operationId: string): void;
  dismissIssue(issueId: string): void;
  clearIssues(): void;
};

export function usePageIssueState(surface: string): PageIssueState {
  const [byOperation, setByOperation] = useState<Record<string, OpenCreatorIssue>>({});

  const captureOperationFailure = useCallback((
    operationId: string,
    cause: unknown,
    fallbackMessage = '操作未完成，请重试。',
    options: { retryable?: boolean; risk?: 'normal' | 'paid' | 'overwrite' } = {}
  ) => {
    const normalized = normalizePageIssue(surface, operationId, cause, fallbackMessage);
    const issue = options.retryable === true ? {
      ...normalized,
      retryable: true,
      repairActions: [{
        kind: 'retry-operation' as const,
        operationId,
        requiresConfirmation: options.risk !== undefined && options.risk !== 'normal',
        risk: options.risk ?? 'normal'
      }]
    } : normalized;
    setByOperation(current => ({
      ...current,
      [operationId]: mergeOccurrence(current[operationId], issue)
    }));
    return issue;
  }, [surface]);

  const resolveOperation = useCallback((operationId: string) => {
    setByOperation(current => {
      if (!(operationId in current)) return current;
      const next = { ...current };
      delete next[operationId];
      return next;
    });
  }, []);

  const dismissIssue = useCallback((issueId: string) => {
    setByOperation(current => Object.fromEntries(
      Object.entries(current).filter(([, issue]) => issue.id !== issueId)
    ));
  }, []);

  const clearIssues = useCallback(() => setByOperation({}), []);
  const issues = useMemo(
    () => Object.values(byOperation).sort((left, right) => right.lastOccurredAt.localeCompare(left.lastOccurredAt)),
    [byOperation]
  );

  return { issues, captureOperationFailure, resolveOperation, dismissIssue, clearIssues };
}

export function normalizePageIssue(
  surface: string,
  operationId: string,
  cause: unknown,
  fallbackMessage: string
): OpenCreatorIssue {
  if (cause instanceof ApiClientError && cause.issue !== undefined) {
    const issue = cause.issue;
    if (issue.scope.kind === 'creator-job') return issue;
    return {
      ...issue,
      scope: { kind: 'page', surface },
      operation: operationId,
      fallbackMessage: issue.fallbackMessage || fallbackMessage
    };
  }

  const now = new Date().toISOString();
  const key = stableKey(`${surface}:${operationId}:${readCode(cause)}`);
  return {
    id: `page:${createId()}`,
    diagnosticId: `OC-${key.slice(-8).toUpperCase()}`,
    code: readCode(cause),
    scope: { kind: 'page', surface },
    source: 'client',
    category: 'execution',
    severity: 'error',
    status: 'open',
    operation: operationId,
    summaryKey: 'issue.execution',
    summaryParams: {},
    fallbackMessage,
    retryable: false,
    repairActions: [],
    fingerprint: key,
    occurrenceCount: 1,
    occurredAt: now,
    lastOccurredAt: now
  };
}

function mergeOccurrence(previous: OpenCreatorIssue | undefined, next: OpenCreatorIssue): OpenCreatorIssue {
  if (previous === undefined || previous.fingerprint !== next.fingerprint) return next;
  return {
    ...next,
    id: previous.id,
    diagnosticId: previous.diagnosticId,
    occurredAt: previous.occurredAt,
    occurrenceCount: previous.occurrenceCount + 1
  };
}

function readCode(cause: unknown): string {
  if (cause instanceof ApiClientError) return cause.code.slice(0, 160) || 'CLIENT_OPERATION_FAILED';
  return 'CLIENT_OPERATION_FAILED';
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stableKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
