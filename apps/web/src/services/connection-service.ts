import type {
  CodexAccountReadResponse,
  CodexLoginCancelResponse,
  CodexLoginStartRequest,
  CodexLoginStartResponse,
  CodexModelListResponse,
  CodexLogoutResponse,
  CodexProviderConfig,
  CodexProviderConfigUpdateRequest,
  CodexRuntimeReadiness,
  CodexStatusResponse
} from '@opencreator/protocol';
import { ApiClientError, type RuntimeClient } from '../runtime/client.js';
import { createRequestDeadline } from '../runtime/request-deadline.js';

export type ConnectionState =
  | { status: 'disconnected'; message: string }
  | { status: 'connected'; codexStatus?: CodexStatusResponse; codexStatusError?: string }
  | { status: 'invalid_token'; message: string };

type ClientLike = Pick<RuntimeClient, 'get' | 'post' | 'patch'>;

export function createConnectionService(client: ClientLike) {
  return {
    async check(options: { signal?: AbortSignal } = {}): Promise<ConnectionState> {
      const read = async <T,>(path: string): Promise<T> => {
        const deadline = createRequestDeadline(4_000, options.signal);
        try {
          return await client.get<T>(path, { signal: deadline.signal });
        } finally {
          deadline.dispose();
        }
      };
      try {
        await read('/healthz');
      } catch (error) {
        const message = errorMessage(error);
        if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
          return { status: 'invalid_token', message };
        }
        return { status: 'disconnected', message };
      }
      try {
        const codexStatus = await read<CodexStatusResponse>('/codex/status');
        return { status: 'connected', codexStatus };
      } catch (error) {
        const message = errorMessage(error);
        if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
          return { status: 'invalid_token', message };
        }
        return { status: 'connected', codexStatusError: message };
      }
    },
    getCodexReadiness(): Promise<CodexRuntimeReadiness> {
      return client.get<CodexRuntimeReadiness>('/codex/readiness');
    },
    getCodexProvider(): Promise<CodexProviderConfig> {
      return client.get<CodexProviderConfig>('/codex/provider');
    },
    getCodexModels(): Promise<CodexModelListResponse> {
      return client.get<CodexModelListResponse>('/codex/models');
    },
    updateCodexProvider(
      request: CodexProviderConfigUpdateRequest
    ): Promise<CodexProviderConfig> {
      return client.patch<CodexProviderConfig>('/codex/provider', request);
    },
    readCodexAccount(): Promise<CodexAccountReadResponse> {
      return client.get<CodexAccountReadResponse>('/codex/account');
    },
    startCodexLogin(request: CodexLoginStartRequest): Promise<CodexLoginStartResponse> {
      return client.post<CodexLoginStartResponse>('/codex/account/login/start', request);
    },
    cancelCodexLogin(loginId: string): Promise<CodexLoginCancelResponse> {
      return client.post<CodexLoginCancelResponse>('/codex/account/login/cancel', { loginId });
    },
    logoutCodex(): Promise<CodexLogoutResponse> {
      return client.post<CodexLogoutResponse>('/codex/account/logout');
    }
  };
}

export type ConnectionService = ReturnType<typeof createConnectionService>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Runtime connection failed';
}
