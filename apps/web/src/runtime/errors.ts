import { gatewayRelayIdentity, sanitizePublicErrorFacts, type OpenCreatorIssue, type PublicErrorFacts } from '@opencreator/protocol';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly publicFacts?: PublicErrorFacts;
  readonly issue?: OpenCreatorIssue;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    publicFacts?: PublicErrorFacts;
    issue?: OpenCreatorIssue;
  }) {
    super(gatewayRelayIdentity.test(input.message) ? 'Official model service could not complete the request.' : input.message);
    this.name = 'ApiClientError';
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
    this.publicFacts = input.publicFacts ? sanitizePublicErrorFacts(input.publicFacts) : undefined;
    this.issue = input.issue;
  }
}
