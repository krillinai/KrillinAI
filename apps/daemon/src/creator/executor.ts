import type {
  CreatorArtifact,
  CreatorArtifactStatus,
  CreatorJson,
  CreatorStageRun,
  CreatorJob,
  PublicErrorFacts
} from '@opencreator/protocol';
import { publicFactsFromFailure } from './public-error-facts.js';
import { safePublicErrorMessage } from '@opencreator/protocol';

export type CreatorExecutorOutput = {
  kind: string;
  status: CreatorArtifactStatus;
  path: string | null;
  scopeKey?: string | null;
  inputFingerprint?: string | null;
  sourceArtifactIds?: string[];
  metadata?: Record<string, CreatorJson>;
};

export type CreatorExecutorResult = {
  outputs: CreatorExecutorOutput[];
  progress?: Record<string, CreatorJson>;
};

export type CreatorExecutorInput = {
  stageRun: CreatorStageRun;
  job: CreatorJob;
  inputArtifacts: CreatorArtifact[];
  workdir: string;
  signal: AbortSignal;
  reportProgress(progress: Record<string, CreatorJson>): void;
};

export interface CreatorExecutor {
  readonly id: string;
  run(input: CreatorExecutorInput): Promise<CreatorExecutorResult>;
}

export class CreatorExecutorError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, CreatorJson> = {},
    readonly publicFacts?: PublicErrorFacts,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'CreatorExecutorError';
  }

  static from(code: string, error: unknown, fallbackMessage = 'Creator stage failed'): CreatorExecutorError {
    return new CreatorExecutorError(
      code,
      error instanceof Error ? safePublicErrorMessage(error.message) ?? fallbackMessage : fallbackMessage,
      {},
      publicFactsFromFailure(error),
      { cause: error }
    );
  }
}
