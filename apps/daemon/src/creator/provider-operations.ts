import type Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';

export type ProviderOperationScope =
  | 'standalone-image'
  | 'standalone-video'
  | 'creator-image'
  | 'creator-video';
export type ProviderOperationStatus =
  | 'registered'
  | 'submitting'
  | 'waiting_remote'
  | 'unknown_remote_acceptance'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type ProviderOperation = {
  operationId: string;
  provider: string;
  scope: ProviderOperationScope;
  jobId: string | null;
  stageRunId: string | null;
  requestKey: string;
  requestFingerprint: string;
  generation: number;
  remoteTaskId: string | null;
  status: ProviderOperationStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProviderOperationRegistration = {
  operationId?: string;
  provider: string;
  scope: ProviderOperationScope;
  requestKey: string;
  requestFingerprint: string;
  jobId?: string;
  stageRunId?: string;
};

type OperationRow = {
  operation_id: string;
  provider: string;
  scope: ProviderOperationScope;
  job_id: string | null;
  stage_run_id: string | null;
  request_key: string;
  request_fingerprint: string;
  generation: number;
  remote_task_id: string | null;
  submit_owner: string | null;
  status: ProviderOperationStatus;
  created_at: string;
  updated_at: string;
};

export class ProviderOperationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ProviderOperationError';
  }
}

export type ProviderOperationLedger = ReturnType<typeof createProviderOperationLedger>;

/**
 * The single submit gate shared by standalone routes and Creator executors.
 * A failed/ambiguous POST is never invoked again for the same durable operation.
 */
export async function submitProviderOperationOnce(input: {
  ledger: ProviderOperationLedger;
  operation: ProviderOperation;
  submit(): Promise<string>;
}): Promise<ProviderOperation> {
  let operation = input.ledger.get(input.operation.operationId) ?? input.operation;
  if (operation.status === 'waiting_remote') return operation;
  if (operation.status === 'succeeded' && operation.remoteTaskId !== null) return operation;
  if (operation.status === 'unknown_remote_acceptance') {
    throw new ProviderOperationError(
      'provider_operation_resolution_required',
      'Provider acceptance is unknown; this operation cannot be submitted again'
    );
  }
  if (operation.status === 'submitting') {
    if (input.ledger.isSubmitActive(operation.operationId)) {
      throw new ProviderOperationError(
        'provider_operation_in_progress',
        'Provider operation is already being submitted'
      );
    }
    input.ledger.markUnknownRemoteAcceptance(operation.operationId);
    throw new ProviderOperationError(
      'provider_operation_resolution_required',
      'Provider acceptance may have happened before restart; this operation cannot be submitted again'
    );
  }
  if (operation.status !== 'registered') {
    throw new ProviderOperationError(
      'provider_operation_finalized',
      'Provider operation is already finalized'
    );
  }
  if (!input.ledger.claimSubmit(operation.operationId)) {
    const claimedElsewhere = input.ledger.get(operation.operationId);
    if (claimedElsewhere?.status === 'waiting_remote') return claimedElsewhere;
    if (claimedElsewhere?.status === 'submitting') {
      throw new ProviderOperationError(
        'provider_operation_in_progress',
        'Provider operation is already being submitted'
      );
    }
    if (claimedElsewhere?.status === 'unknown_remote_acceptance') {
      throw new ProviderOperationError(
        'provider_operation_resolution_required',
        'Provider acceptance is unknown; this operation cannot be submitted again'
      );
    }
    throw new ProviderOperationError('provider_operation_claim_failed', 'Provider submit claim was not acquired');
  }
  try {
    const remoteTaskId = await input.submit();
    return input.ledger.markSubmitted(operation.operationId, remoteTaskId);
  } catch (error) {
    const current = input.ledger.get(operation.operationId);
    if (current?.status === 'submitting') input.ledger.markUnknownRemoteAcceptance(operation.operationId);
    throw error;
  } finally {
    input.ledger.releaseSubmit(operation.operationId);
  }
}

export function createProviderOperationLedger(input: {
  db: Database.Database;
  now?: () => Date;
  createId?: () => string;
}) {
  const now = input.now ?? (() => new Date());
  const createId = input.createId ?? (() => randomBytes(18).toString('base64url'));
  const submitOwner = randomBytes(18).toString('base64url');
  const activeSubmits = new Set<string>();

  // A process restart cannot know whether an interrupted POST was accepted.
  // Quarantine those operations before exposing the ledger to request handlers.
  input.db.prepare(`
    UPDATE creator_provider_operations
    SET status = 'unknown_remote_acceptance', submit_owner = NULL, updated_at = ?
    WHERE status = 'submitting'
  `).run(now().toISOString());

  function get(operationId: string): ProviderOperation | undefined {
    const row = input.db.prepare(`
      SELECT operation_id, provider, scope, job_id, stage_run_id,
             request_key, request_fingerprint, generation, remote_task_id,
             submit_owner, status, created_at, updated_at
      FROM creator_provider_operations WHERE operation_id = ?
    `).get(operationId) as OperationRow | undefined;
    return row === undefined ? undefined : hydrate(row);
  }

  return {
    get,
    register(request: {
      operationId?: string;
      provider: string;
      scope: ProviderOperationScope;
      requestKey: string;
      requestFingerprint: string;
      jobId?: string;
      stageRunId?: string;
    }): ProviderOperation {
      validateRequest(request);
      return input.db.transaction(() => {
        const latest = input.db.prepare(`
          SELECT operation_id, provider, scope, job_id, stage_run_id,
                 request_key, request_fingerprint, generation, remote_task_id,
                 submit_owner, status, created_at, updated_at
          FROM creator_provider_operations
          WHERE provider = ? AND request_key = ?
          ORDER BY generation DESC LIMIT 1
        `).get(request.provider, request.requestKey) as OperationRow | undefined;
        if (latest !== undefined) {
          // A new stage run after a terminal provider failure is an explicit user retry,
          // and must get a new immutable operation even when its inputs changed.
          const explicitNewAttemptAfterFailure = latest.status === 'failed'
            && request.stageRunId !== undefined
            && latest.stage_run_id !== request.stageRunId;
          if (
            latest.scope !== request.scope
            || (latest.request_fingerprint !== request.requestFingerprint && !explicitNewAttemptAfterFailure)
          ) {
            throw new ProviderOperationError(
              'provider_operation_conflict',
              'Provider operation key is already bound to a different request'
            );
          }
          if (isPending(latest.status)) return hydrate(latest);
          if (latest.status === 'succeeded') return hydrate(latest);
          if (request.stageRunId === undefined || latest.stage_run_id === request.stageRunId) {
            return hydrate(latest);
          }
        }
        const timestamp = now().toISOString();
        const operationId = request.operationId ?? createId();
        const generation = (latest?.generation ?? 0) + 1;
        input.db.prepare(`
          INSERT INTO creator_provider_operations (
            operation_id, provider, scope, job_id, stage_run_id, request_key,
            request_fingerprint, generation, remote_task_id, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'registered', ?, ?)
        `).run(
          operationId,
          request.provider,
          request.scope,
          request.jobId ?? null,
          request.stageRunId ?? null,
          request.requestKey,
          request.requestFingerprint,
          generation,
          timestamp,
          timestamp
        );
        return get(operationId)!;
      })();
    },
    /** Compare-and-set claim: only one daemon execution can cross into POST. */
    claimSubmit(operationId: string): boolean {
      const result = input.db.prepare(`
        UPDATE creator_provider_operations
        SET status = 'submitting', submit_owner = ?, updated_at = ?
        WHERE operation_id = ? AND status = 'registered'
      `).run(submitOwner, now().toISOString(), operationId);
      const claimed = result.changes === 1;
      if (claimed) activeSubmits.add(operationId);
      return claimed;
    },
    isSubmitActive(operationId: string): boolean {
      return activeSubmits.has(operationId);
    },
    releaseSubmit(operationId: string): void {
      activeSubmits.delete(operationId);
    },
    markSubmitted(operationId: string, remoteTaskId: string): ProviderOperation {
      if (!remoteTaskId.trim()) {
        throw new ProviderOperationError('provider_remote_id_invalid', 'Provider task id is empty');
      }
      const timestamp = now().toISOString();
      input.db.prepare(`
        UPDATE creator_provider_operations
        SET status = 'waiting_remote', remote_task_id = ?, submit_owner = NULL, updated_at = ?
        WHERE operation_id = ? AND status = 'submitting' AND submit_owner = ? AND remote_task_id IS NULL
      `).run(remoteTaskId, timestamp, operationId, submitOwner);
      activeSubmits.delete(operationId);
      const current = get(operationId);
      if (current?.status === 'waiting_remote' && current.remoteTaskId === remoteTaskId) return current;
      throw new ProviderOperationError('provider_operation_transition_invalid', 'Provider operation cannot accept a remote task id');
    },
    markUnknownRemoteAcceptance(operationId: string): ProviderOperation {
      input.db.prepare(`
        UPDATE creator_provider_operations
        SET status = 'unknown_remote_acceptance', submit_owner = NULL, updated_at = ?
        WHERE operation_id = ? AND status = 'submitting' AND submit_owner = ? AND remote_task_id IS NULL
      `).run(now().toISOString(), operationId, submitOwner);
      activeSubmits.delete(operationId);
      const current = get(operationId);
      if (current?.status === 'unknown_remote_acceptance') return current;
      throw new ProviderOperationError('provider_operation_transition_invalid', 'Provider operation cannot be marked unresolved');
    },
    markSucceeded(operationId: string): ProviderOperation {
      input.db.prepare(`
        UPDATE creator_provider_operations
        SET status = 'succeeded', updated_at = ?
        WHERE operation_id = ? AND status = 'waiting_remote' AND remote_task_id IS NOT NULL
      `).run(now().toISOString(), operationId);
      const current = get(operationId);
      if (current?.status === 'succeeded') return current;
      throw new ProviderOperationError('provider_operation_transition_invalid', 'Provider operation cannot be finalized');
    },
    markFailed(operationId: string): ProviderOperation {
      input.db.prepare(`
        UPDATE creator_provider_operations
        SET status = 'failed', submit_owner = NULL, updated_at = ?
        WHERE operation_id = ? AND status IN ('registered', 'submitting', 'waiting_remote')
      `).run(now().toISOString(), operationId);
      activeSubmits.delete(operationId);
      const current = get(operationId);
      if (current?.status === 'failed') return current;
      throw new ProviderOperationError('provider_operation_transition_invalid', 'Provider operation cannot be failed');
    }
  };
}

function validateRequest(request: {
  operationId?: string;
  provider: string;
  scope: ProviderOperationScope;
  requestKey: string;
  requestFingerprint: string;
  jobId?: string;
  stageRunId?: string;
}) {
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(request.operationId ?? 'provider_op_default')) {
    throw new ProviderOperationError('provider_operation_id_invalid', 'Provider operation id is invalid');
  }
  if (request.provider.length === 0 || request.provider.length > 128) {
    throw new ProviderOperationError('provider_operation_provider_invalid', 'Provider id is invalid');
  }
  const expectedProvider = request.scope.endsWith('image') ? 'muse2api-image' : 'muse2api-video';
  if (request.provider !== expectedProvider) {
    throw new ProviderOperationError('provider_operation_scope_invalid', 'Provider id does not match the operation scope');
  }
  if (request.requestKey.length === 0 || request.requestKey.length > 512) {
    throw new ProviderOperationError('provider_operation_key_invalid', 'Provider operation key is invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(request.requestFingerprint)) {
    throw new ProviderOperationError('provider_operation_fingerprint_invalid', 'Provider operation fingerprint is invalid');
  }
  if ((request.jobId === undefined) !== (request.stageRunId === undefined)) {
    throw new ProviderOperationError('provider_operation_scope_invalid', 'Creator job and stage ids must be provided together');
  }
  if (
    (request.scope === 'standalone-image' || request.scope === 'standalone-video')
    && request.jobId !== undefined
  ) {
    throw new ProviderOperationError('provider_operation_scope_invalid', 'Standalone operation cannot reference a Creator stage');
  }
  if (
    (request.scope === 'creator-image' || request.scope === 'creator-video')
    && request.jobId === undefined
  ) {
    throw new ProviderOperationError('provider_operation_scope_invalid', 'Creator operation requires a job and stage');
  }
}

function hydrate(row: OperationRow): ProviderOperation {
  return {
    operationId: row.operation_id,
    provider: row.provider,
    scope: row.scope,
    jobId: row.job_id,
    stageRunId: row.stage_run_id,
    requestKey: row.request_key,
    requestFingerprint: row.request_fingerprint,
    generation: row.generation,
    remoteTaskId: row.remote_task_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isPending(status: ProviderOperationStatus): boolean {
  return ['registered', 'submitting', 'waiting_remote', 'unknown_remote_acceptance'].includes(status);
}
