import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCreatorIssueService } from '../../src/creator/issues.js';
import { createCreatorRepository } from '../../src/creator/repository.js';
import { createCreatorService } from '../../src/creator/service.js';
import { createCreatorStageRunner } from '../../src/creator/stage-runner.js';
import { createDefaultCreatorTemplateRegistry } from '../../src/creator/templates/registry.js';
import { openRuntimeDatabase } from '../../src/storage/database.js';
import { createWechatArticleExecutor } from '../../src/creator/article/executor.js';

let root = '';
let closeDb: (() => void) | undefined;
let closeRunner: (() => Promise<void>) | undefined;

afterEach(async () => {
  await closeRunner?.();
  closeRunner = undefined;
  closeDb?.();
  closeDb = undefined;
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});

describe('Article Writer output diagnostics', () => {
  it('persists a sanitized PERSISTENCE_FAILED diagnostic when topic artifact commit fails', async () => {
    root = await mkdtemp(join(tmpdir(), 'creator-article-output-diagnostics-'));
    const db = openRuntimeDatabase(join(root, 'app.sqlite'));
    closeDb = () => db.close();
    const repository = createCreatorRepository(db);
    const templates = createDefaultCreatorTemplateRegistry();
    const service = createCreatorService({ repository, templates });
    const issueService = createCreatorIssueService(repository);
    const job = service.createJob({
      projectId: 'project_article_diagnostics',
      templateId: 'wechat-article',
      state: { topicCount: 3 }
    });
    const executor = createWechatArticleExecutor({
      sourceExtractor: { extract: async () => [] },
      model: {
        generateTopics: async () => [{
          id: 'topic-1',
          title: 'A valid topic',
          angle: 'A clear angle',
          summary: 'A brief summary'
        }],
        generateOutline: async () => '',
        generateArticle: async () => ''
      }
    });
    const runner = createCreatorStageRunner({
      repository,
      issueService,
      templates,
      executors: [executor],
      workRoot: join(root, 'jobs')
    });
    closeRunner = () => runner.close();
    const insertArtifact = repository.insertArtifact.bind(repository);
    const insertArtifactSpy = vi.spyOn(repository, 'insertArtifact')
      .mockImplementationOnce(input => insertArtifact(input))
      .mockImplementationOnce(() => {
        throw new Error('simulated artifact database failure');
      });

    const stage = await runner.run(job.id, 'topics');
    const issue = issueService.list(job.id).find(item => item.stageRunId === stage.id);

    expect(stage).toMatchObject({ status: 'failed', errorCode: 'creator_stage_failed' });
    expect(issue?.technicalDetail).toContain('article_output=PERSISTENCE_FAILED');
    expect(issue?.technicalDetail).toContain('operation=persist-topic-artifact');
    expect(issue?.technicalDetail).not.toContain('A valid topic');
    expect(insertArtifactSpy).toHaveBeenCalledTimes(2);
    expect(repository.listArtifacts(job.id)).toEqual([]);
  });
});
