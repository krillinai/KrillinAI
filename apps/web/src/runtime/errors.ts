import type { OpenCreatorIssue } from '@opencreator/protocol';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly issue?: OpenCreatorIssue;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    issue?: OpenCreatorIssue;
  }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
    this.issue = input.issue;
  }
}
