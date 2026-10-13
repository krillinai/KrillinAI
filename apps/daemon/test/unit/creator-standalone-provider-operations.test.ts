import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../src/storage/database.js';
import { createCreatorRepository } from '../../src/creator/repository.js';
import {
  createProviderOperationLedger,
  submitProviderOperationOnce
} from '../../src/creator/provider-operations.js';

let tempDir = '';

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('standalone provider operation ledger', () => {
  it('adds the standalone ledger without changing legacy Creator request rows', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-standalone-ledger-migration-'));
    const path = join(tempDir, 'runtime.sqlite');
    const db = openRuntimeDatabase(path);
    const repository = createCreatorRepository(db);
    const job = repository.createJob({
      projectId: 'project_1', templateId: 'image-generation', templateVersion: 1,
      status: 'running', state: {}
    });
    const stage = repository.createStageRun({
      jobId: job.id, stageId: 'generate', executor: 'image', status: 'running',
      scopeKey: null, inputFingerprint: 'a'.repeat(64)
    });
    db.prepare(`
      INSERT INTO creator_provider_requests (
        id, job_id, provider, stage_run_id, scope_key, request_key, request_hash,
        remote_task_id, billing_side_effect, status, result_artifact_id,
        generation, resubmission_of, created_at, updated_at
      ) VALUES ('legacy-request', ?, 'seedance', ?, NULL,
        'legacy-key', 'a', 'legacy-task', 1, 'waiting_remote', NULL, 1, NULL,
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `).run(job.id, stage.id);
    db.close();
    const reopened = openRuntimeDatabase(path);
    const preserved = reopened.prepare(`
      SELECT job_id, stage_run_id, request_hash, remote_task_id, status
      FROM creator_provider_requests WHERE id = 'legacy-request'
    `).get();
    const standaloneTable = reopened.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='creator_provider_operations'
    `).get();
    const legacyColumns = reopened.prepare('PRAGMA table_info(creator_provider_requests)').all() as Array<{ name: string; notnull: number }>;
    const legacyForeignKeys = reopened.prepare('PRAGMA foreign_key_list(creator_provider_requests)').all() as Array<{ from: string; table: string }>;
    const operationForeignKeys = reopened.prepare('PRAGMA foreign_key_list(creator_provider_operations)').all() as Array<{ from: string; table: string }>;
    const foreignKeyViolations = reopened.pragma('foreign_key_check');
    reopened.close();

    expect(preserved).toEqual({
      job_id: job.id, stage_run_id: stage.id, request_hash: 'a',
      remote_task_id: 'legacy-task', status: 'waiting_remote'
    });
    expect(standaloneTable).toEqual({ name: 'creator_provider_operations' });
    expect(legacyColumns.find(column => column.name === 'job_id')?.notnull).toBe(1);
    expect(legacyColumns.find(column => column.name === 'stage_run_id')?.notnull).toBe(1);
    expect(legacyForeignKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'job_id', table: 'creator_jobs' }),
      expect.objectContaining({ from: 'stage_run_id', table: 'creator_stage_runs' })
    ]));
    expect(operationForeignKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'job_id', table: 'creator_jobs' }),
      expect.objectContaining({ from: 'stage_run_id', table: 'creator_stage_runs' })
    ]));
    expect(foreignKeyViolations).toEqual([]);
  });

  it('claims a registered operation once and persists unresolved acceptance across reopen', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-standalone-ledger-'));
    const path = join(tempDir, 'runtime.sqlite');
    const db = openRuntimeDatabase(path);
    const ledger = createProviderOperationLedger({ db });
    const operation = ledger.register({
      operationId: 'operation-image-001',
      provider: 'muse2api-image',
      scope: 'standalone-image',
      requestKey: 'operation-image-001',
      requestFingerprint: 'a'.repeat(64)
    });

    expect(ledger.claimSubmit(operation.operationId)).toBe(true);
    expect(ledger.claimSubmit(operation.operationId)).toBe(false);
    ledger.markUnknownRemoteAcceptance(operation.operationId);
    db.close();

    const reopened = openRuntimeDatabase(path);
    const resumed = createProviderOperationLedger({ db: reopened }).get(operation.operationId);
    expect(resumed).toMatchObject({ status: 'unknown_remote_acceptance', remoteTaskId: null });
    reopened.close();
  });

  it('keeps a concurrent duplicate from changing an active submit into unresolved state', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-provider-submit-race-'));
    const db = openRuntimeDatabase(join(tempDir, 'runtime.sqlite'));
    const ledger = createProviderOperationLedger({ db });
    const operation = ledger.register({
      operationId: 'operation-race-0001',
      provider: 'muse2api-image',
      scope: 'standalone-image',
      requestKey: 'operation-race-0001',
      requestFingerprint: '1'.repeat(64)
    });
    let resolveSubmit!: (taskId: string) => void;
    const submit = vi.fn(() => new Promise<string>(resolve => { resolveSubmit = resolve; }));

    const first = submitProviderOperationOnce({ ledger, operation, submit });
    await Promise.resolve();
    await expect(submitProviderOperationOnce({ ledger, operation, submit }))
      .rejects.toMatchObject({ code: 'provider_operation_in_progress' });
    expect(submit).toHaveBeenCalledTimes(1);

    resolveSubmit('muse_task_race');
    await expect(first).resolves.toMatchObject({ status: 'waiting_remote', remoteTaskId: 'muse_task_race' });
    expect(ledger.get(operation.operationId)).toMatchObject({ status: 'waiting_remote' });
    db.close();
  });

  it('quarantines an interrupted submitting operation after daemon restart', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-provider-submit-restart-'));
    const path = join(tempDir, 'runtime.sqlite');
    const db = openRuntimeDatabase(path);
    const ledger = createProviderOperationLedger({ db });
    const operation = ledger.register({
      operationId: 'operation-restart-0001',
      provider: 'muse2api-video',
      scope: 'standalone-video',
      requestKey: 'operation-restart-0001',
      requestFingerprint: '2'.repeat(64)
    });
    expect(ledger.claimSubmit(operation.operationId)).toBe(true);
    db.close();

    const reopened = openRuntimeDatabase(path);
    const resumedLedger = createProviderOperationLedger({ db: reopened });
    const submit = vi.fn(async () => 'must_not_submit');
    expect(resumedLedger.get(operation.operationId)).toMatchObject({
      status: 'unknown_remote_acceptance', remoteTaskId: null
    });
    await expect(submitProviderOperationOnce({
      ledger: resumedLedger,
      operation: resumedLedger.get(operation.operationId)!,
      submit
    })).rejects.toMatchObject({ code: 'provider_operation_resolution_required' });
    expect(submit).not.toHaveBeenCalled();
    reopened.close();
  });

  it('rejects reuse of an operation id with a different request fingerprint', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-standalone-ledger-conflict-'));
    const db = openRuntimeDatabase(join(tempDir, 'runtime.sqlite'));
    const ledger = createProviderOperationLedger({ db });
    ledger.register({
      operationId: 'operation-video-001',
      provider: 'muse2api-video',
      scope: 'standalone-video',
      requestKey: 'operation-video-001',
      requestFingerprint: 'b'.repeat(64)
    });
    expect(() => ledger.register({
      operationId: 'operation-video-001',
      provider: 'muse2api-video',
      scope: 'standalone-video',
      requestKey: 'operation-video-001',
      requestFingerprint: 'c'.repeat(64)
    })).toThrowError(expect.objectContaining({ code: 'provider_operation_conflict' }));
    db.close();
  });

  it('requires Creator operation job and stage references as a pair', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-standalone-ledger-scope-'));
    const db = openRuntimeDatabase(join(tempDir, 'runtime.sqlite'));
    const ledger = createProviderOperationLedger({ db });
    expect(() => ledger.register({
      operationId: 'operation-creator-001',
      provider: 'muse2api-video',
      scope: 'creator-video',
      requestKey: 'creator-request-001',
      requestFingerprint: 'f'.repeat(64),
      jobId: 'missing-job'
    })).toThrowError(expect.objectContaining({ code: 'provider_operation_scope_invalid' }));
    db.close();
  });

  it('reuses succeeded Creator work after a stage retry and requires a new key for a deliberate new generation', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-operation-stage-retry-'));
    const db = openRuntimeDatabase(join(tempDir, 'runtime.sqlite'));
    const repository = createCreatorRepository(db);
    const job = repository.createJob({
      projectId: 'project_1', templateId: 'video-generation', templateVersion: 1,
      status: 'running', state: {}
    });
    const firstStage = repository.createStageRun({
      jobId: job.id, stageId: 'generate', executor: 'video', status: 'running',
      scopeKey: null, inputFingerprint: '1'.repeat(64)
    });
    const ledger = createProviderOperationLedger({ db });
    const first = ledger.register({
      provider: 'muse2api-video', scope: 'creator-video',
      requestKey: `creator:${job.id}:video:v0`, requestFingerprint: '2'.repeat(64),
      jobId: job.id, stageRunId: firstStage.id
    });
    expect(ledger.claimSubmit(first.operationId)).toBe(true);
    ledger.markSubmitted(first.operationId, 'muse_task_original');
    ledger.markSucceeded(first.operationId);

    const retryStage = repository.createStageRun({
      jobId: job.id, stageId: 'generate', executor: 'video', status: 'running',
      scopeKey: null, inputFingerprint: '1'.repeat(64)
    });
    const resumed = ledger.register({
      provider: 'muse2api-video', scope: 'creator-video',
      requestKey: `creator:${job.id}:video:v0`, requestFingerprint: '2'.repeat(64),
      jobId: job.id, stageRunId: retryStage.id
    });
    const nextGeneration = ledger.register({
      provider: 'muse2api-video', scope: 'creator-video',
      requestKey: `creator:${job.id}:video:v1`, requestFingerprint: '2'.repeat(64),
      jobId: job.id, stageRunId: retryStage.id
    });

    expect(resumed.operationId).toBe(first.operationId);
    expect(resumed.remoteTaskId).toBe('muse_task_original');
    expect(resumed.status).toBe('succeeded');
    expect(nextGeneration.operationId).not.toBe(first.operationId);
    expect(nextGeneration.status).toBe('registered');
    db.close();
  });

  it('gives a deliberate new Creator generation a new identity after definite failure while keeping each attempt immutable', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-operation-failed-new-generation-'));
    const db = openRuntimeDatabase(join(tempDir, 'runtime.sqlite'));
    const repository = createCreatorRepository(db);
    const job = repository.createJob({
      projectId: 'project_1', templateId: 'image-generation', templateVersion: 1,
      status: 'running', state: {}
    });
    const firstStage = repository.createStageRun({
      jobId: job.id, stageId: 'generate', executor: 'image', status: 'running',
      scopeKey: null, inputFingerprint: '1'.repeat(64)
    });
    const ledger = createProviderOperationLedger({ db });
    const key = `creator:${job.id}:image:root:v0:1`;
    const first = ledger.register({
      provider: 'muse2api-image', scope: 'creator-image', requestKey: key,
      requestFingerprint: '2'.repeat(64), jobId: job.id, stageRunId: firstStage.id
    });
    ledger.markFailed(first.operationId);

    expect(() => ledger.register({
      provider: 'muse2api-image', scope: 'creator-image', requestKey: key,
      requestFingerprint: '3'.repeat(64), jobId: job.id, stageRunId: firstStage.id
    })).toThrowError(expect.objectContaining({ code: 'provider_operation_conflict' }));

    const deliberateNewStage = repository.createStageRun({
      jobId: job.id, stageId: 'generate', executor: 'image', status: 'running',
      scopeKey: null, inputFingerprint: '4'.repeat(64)
    });
    const next = ledger.register({
      provider: 'muse2api-image', scope: 'creator-image', requestKey: key,
      requestFingerprint: '3'.repeat(64), jobId: job.id, stageRunId: deliberateNewStage.id
    });

    expect(first.requestFingerprint).toBe('2'.repeat(64));
    expect(next.operationId).not.toBe(first.operationId);
    expect(next).toMatchObject({
      requestFingerprint: '3'.repeat(64), generation: first.generation + 1, status: 'registered'
    });
    db.close();
  });

  it('records the remote task id before polling and reuses it without another submit', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-standalone-ledger-remote-'));
    const db = openRuntimeDatabase(join(tempDir, 'runtime.sqlite'));
    const ledger = createProviderOperationLedger({ db });
    const operation = ledger.register({
      operationId: 'operation-video-remote',
      provider: 'muse2api-video',
      scope: 'standalone-video',
      requestKey: 'operation-video-remote',
      requestFingerprint: 'd'.repeat(64)
    });
    const submit = vi.fn(async () => 'muse_task_123');

    const first = await submitProviderOperationOnce({ ledger, operation, submit });
    const resumed = await submitProviderOperationOnce({ ledger, operation: first, submit });

    expect(first).toMatchObject({ status: 'waiting_remote', remoteTaskId: 'muse_task_123' });
    expect(resumed.remoteTaskId).toBe('muse_task_123');
    expect(submit).toHaveBeenCalledTimes(1);
    db.close();
  });

  it('permanently blocks another paid submit after a possibly accepted POST throws', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-standalone-ledger-ambiguous-'));
    const path = join(tempDir, 'runtime.sqlite');
    const db = openRuntimeDatabase(path);
    const ledger = createProviderOperationLedger({ db });
    const operation = ledger.register({
      operationId: 'operation-image-ambiguous',
      provider: 'muse2api-image',
      scope: 'standalone-image',
      requestKey: 'operation-image-ambiguous',
      requestFingerprint: 'e'.repeat(64)
    });
    const submit = vi.fn(async () => { throw new Error('response interrupted'); });

    await expect(submitProviderOperationOnce({ ledger, operation, submit })).rejects.toThrow('response interrupted');
    db.close();
    const reopened = openRuntimeDatabase(path);
    const resumedLedger = createProviderOperationLedger({ db: reopened });
    await expect(submitProviderOperationOnce({
      ledger: resumedLedger,
      operation: resumedLedger.get(operation.operationId)!,
      submit
    })).rejects.toMatchObject({ code: 'provider_operation_resolution_required' });

    expect(submit).toHaveBeenCalledTimes(1);
    reopened.close();
  });
});
