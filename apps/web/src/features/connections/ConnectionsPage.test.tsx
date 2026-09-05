import type { CodexMcpListResponse } from '@opencreator/protocol';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionsPage } from './ConnectionsPage.js';
import type { McpSettingsService } from '../settings/McpSettingsView.js';

describe('ConnectionsPage', () => {
  it('loads and toggles native MCP without an account gate', async () => {
    const user = userEvent.setup();
    let native = nativeData();
    const mcpService = createMcpService({
      listServers: vi.fn(async () => native),
      setServerEnabled: vi.fn(async (name, enabled) => {
        native = {
          ...native,
          servers: native.servers.map(server =>
            server.name === name ? { ...server, enabled } : server
          )
        };
        return {
          server: native.servers[0]!,
          operation: operation(enabled ? 'enable' : 'disable')
        };
      })
    });
    render(
      <ConnectionsPage
        connected
        mcpService={mcpService}
        mcpCapabilities={allCapabilities()}
      />
    );

    expect(await screen.findByRole('heading', { name: 'github' }))
      .toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'github MCP' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
    expect(mcpService.setServerEnabled).toHaveBeenCalledWith(
      'github',
      false,
      false
    );
  });

  it('disables unsupported native MCP operations by capability', async () => {
    render(
      <ConnectionsPage
        connected
        mcpService={createMcpService()}
        mcpCapabilities={{
          ...allCapabilities(),
          mcpLogin: false,
          mcpLogout: false,
          mcpRemove: false
        }}
      />
    );

    expect(await screen.findByRole('button', { name: '登录 github' }))
      .toBeDisabled();
    expect(screen.getByRole('button', { name: '退出 github' }))
      .toBeDisabled();
    expect(screen.getByRole('button', { name: '删除 github' }))
      .toBeDisabled();
    expect(screen.getByRole('switch', { name: 'github MCP' }))
      .toBeEnabled();
  });
});

function createMcpService(
  overrides: Partial<McpSettingsService> = {}
): McpSettingsService {
  return {
    listServers: vi.fn(async () => nativeData()),
    getServer: vi.fn(async () => ({ server: nativeData().servers[0]! })),
    addServer: vi.fn(async () => ({ operation: operation('add') })),
    setServerEnabled: vi.fn(async (_name, enabled) => ({
      server: { ...nativeData().servers[0]!, enabled },
      operation: operation(enabled ? 'enable' : 'disable')
    })),
    removeServer: vi.fn(async () => ({ removed: true as const })),
    loginServer: vi.fn(async () => ({ operation: operation('login') })),
    logoutServer: vi.fn(async () => ({ operation: operation('logout') })),
    ...overrides
  };
}

function nativeData(): CodexMcpListResponse {
  return {
    codexHome: '/tmp/codex',
    codexHomeMode: 'isolated',
    requiresWriteConfirmation: false,
    servers: [{
      name: 'github',
      enabled: true,
      transport: 'http',
      status: 'configured',
      url: 'https://mcp.example/github',
      envKeys: ['GITHUB_TOKEN'],
      hasSecrets: true,
      codexHome: '/tmp/codex',
      codexHomeMode: 'isolated',
      diagnostics: []
    }],
    diagnostics: []
  };
}

function allCapabilities() {
  return {
    mcpAdd: true,
    mcpRemove: true,
    mcpLogin: true,
    mcpLogout: true,
    mcpAddEnv: true,
    mcpAddUrl: true,
    mcpAddBearerTokenEnvVar: true,
    mcpAddOAuth: true
  };
}

function operation(
  type: 'add' | 'enable' | 'disable' | 'login' | 'logout'
) {
  return {
    id: `operation-${type}`,
    operation: type,
    codexHome: '/tmp/codex',
    command: ['mcp', type],
    status: 'succeeded' as const,
    timedOut: false,
    createdAt: '2026-08-12T00:00:00.000Z'
  };
}
