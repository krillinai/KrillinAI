import type { ApiError, OpenCreatorIssue, RuntimeErrorCode } from '@opencreator/protocol';

export function apiError(
  code: RuntimeErrorCode,
  message: string,
  details?: Record<string, unknown>,
  issue?: OpenCreatorIssue
): ApiError {
  return {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(issue !== undefined ? { issue } : {})
    }
  };
}
