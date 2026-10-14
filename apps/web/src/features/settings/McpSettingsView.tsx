import type {
  AddCodexMcpRequest,
  CodexMcpAddResponse,
  CodexMcpAuthResponse,
  CodexMcpEnableResponse,
  CodexMcpListResponse,
  CodexMcpRemoveResponse,
  CodexMcpServerDetailResponse,
  CodexMcpServerResponse
} from '@opencreator/protocol';
import {
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  Plus,
  Server,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useConfirmDialog } from '../../components/dialogs/ConfirmDialogProvider.js';
import { IssueList } from '../issues/IssuePresenter.js';
import { usePageIssueState } from '../issues/page-issue-state.js';

export type McpSettingsService = {
  listServers(): Promise<CodexMcpListResponse>;
  getServer(name: string): Promise<CodexMcpServerDetailResponse>;
  addServer(input: AddCodexMcpRequest): Promise<CodexMcpAddResponse>;
  setServerEnabled(
    name: string,
    enabled: boolean,
    confirmWriteToCodexHome?: boolean
  ): Promise<CodexMcpEnableResponse>;
  removeServer(name: string, confirmWriteToCodexHome?: boolean): Promise<CodexMcpRemoveResponse>;
  loginServer(name: string, confirmWriteToCodexHome?: boolean): Promise<CodexMcpAuthResponse>;
  logoutServer(name: string, confirmWriteToCodexHome?: boolean): Promise<CodexMcpAuthResponse>;
};

export type McpCapabilities = Partial<{
  mcpAdd: boolean;
  mcpRemove: boolean;
  mcpLogin: boolean;
  mcpLogout: boolean;
  mcpAddEnv: boolean;
  mcpAddUrl: boolean;
  mcpAddBearerTokenEnvVar: boolean;
  mcpAddOAuth: boolean;
}>;

type EnvEntry = { id: number; key: string; value: string };

export function McpSettingsView(props: {
  connected: boolean;
  service: McpSettingsService | null;
  data?: CodexMcpListResponse;
  capabilities?: McpCapabilities;
  onDataChange?(data: CodexMcpListResponse): void;
  confirmWrite?(): boolean;
  confirmRemove?(server: CodexMcpServerResponse): boolean;
}) {
  const confirm = useConfirmDialog();
  const [data, setData] = useState(props.data);
  const [loading, setLoading] = useState(
    props.data === undefined && props.connected && props.service !== null
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [busyName, setBusyName] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);
  const pageIssues = usePageIssueState('settings-mcp');

  useEffect(() => {
    setData(props.data);
  }, [props.data]);

  useEffect(() => {
    if (props.data !== undefined || !props.connected || props.service === null) return;
    let canceled = false;
    setLoading(true);
    props.service.listServers()
      .then(response => {
        if (!canceled) {
          updateData(response);
          pageIssues.resolveOperation('settings.mcp.load');
        }
      })
      .catch(reason => {
        if (!canceled) pageIssues.captureOperationFailure(
          'settings.mcp.load',
          reason,
          'Could not load MCP servers. Try again.',
          { retryable: true }
        );
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [
    pageIssues.captureOperationFailure,
    pageIssues.resolveOperation,
    props.connected,
    props.data,
    props.service,
    reloadToken
  ]);

  function updateData(next: CodexMcpListResponse) {
    setData(next);
    props.onDataChange?.(next);
  }

  async function runServerAction(
    server: CodexMcpServerResponse,
    action: 'login' | 'logout' | 'remove'
  ) {
    if (props.service === null) return;
    const removeConfirmed = action !== 'remove'
      || (props.confirmRemove?.(server) ?? await confirm({
        title: 'Remove MCP',
        description: `Delete "${server.name}"? Its connections will be disabled immediately.`,
        confirmLabel: 'Remove',
        destructive: true
      }));
    if (!removeConfirmed) return;
    const confirmed = !data?.requiresWriteConfirmation
      || (props.confirmWrite?.() ?? (action === 'remove' ? true : await confirm({
        title: 'Confirm global configuration change',
        description: 'This changes the global CODEX_HOME and may affect other sessions using it.',
        confirmLabel: 'Continue'
      })));
    if (!confirmed) return;

    setBusyName(server.name);
    const operationId = `settings.mcp.${action}:${server.name}`;
    try {
      if (action === 'login') await props.service.loginServer(server.name, data?.requiresWriteConfirmation);
      if (action === 'logout') await props.service.logoutServer(server.name, data?.requiresWriteConfirmation);
      if (action === 'remove') {
        await props.service.removeServer(server.name, data?.requiresWriteConfirmation);
        if (data !== undefined) {
          updateData({ ...data, servers: data.servers.filter(item => item.name !== server.name) });
        }
      }
      pageIssues.resolveOperation(operationId);
    } catch (reason) {
      pageIssues.captureOperationFailure(
        operationId,
        reason,
        `MCP ${action === 'login' ? 'sign-in' : action === 'logout' ? 'sign-out' : 'removal'} did not complete. Check diagnostics and try again.`
      );
    } finally {
      setBusyName(undefined);
    }
  }

  const canAdd = props.connected && props.service !== null && props.capabilities?.mcpAdd === true;

  return (
    <section className="settings-section settings-management" aria-labelledby="settings-mcp-title">
      <header className="settings-management__header">
        <div>
          <h1 id="settings-mcp-title">MCP servers</h1>
          <p>Manage local commands and remote MCP servers available to Codex.</p>
        </div>
        <button
          className="settings-primary-button"
          type="button"
          disabled={!canAdd}
          onClick={() => setEditorOpen(true)}
        >
          <Plus size={16} />
          Add MCP server
        </button>
      </header>

      {!props.connected || props.service === null ? (
        <p className="settings-notice">Connect the local Runtime to manage MCP servers.</p>
      ) : null}
      {props.connected && props.service !== null && props.capabilities?.mcpAdd !== true ? (
        <p className="settings-notice">This Codex version does not support adding MCP servers</p>
      ) : null}
      {data?.requiresWriteConfirmation ? (
        <p className="settings-notice">Write operations change the global CODEX_HOME and require confirmation each time.</p>
      ) : null}
      <IssueList
        issues={pageIssues.issues}
        actions={{ retryOperations: {
          'settings.mcp.load': () => setReloadToken(value => value + 1)
        } }}
        onDismiss={pageIssues.dismissIssue}
      />

      {editorOpen ? (
        <McpEditor
          capabilities={props.capabilities}
          requiresWriteConfirmation={data?.requiresWriteConfirmation === true}
          onCancel={() => setEditorOpen(false)}
          onSubmit={async input => {
            if (props.service === null) return;
            const confirmed = !data?.requiresWriteConfirmation
              || (props.confirmWrite?.() ?? await confirm({
                title: 'Confirm global configuration change',
                description: 'This changes the global CODEX_HOME and may affect other sessions using it.',
                confirmLabel: 'Continue'
              }));
            if (!confirmed) return;
            try {
              const result = await props.service.addServer({
                ...input,
                ...(data?.requiresWriteConfirmation ? { confirmWriteToCodexHome: true as const } : {})
              });
              const next = result.server;
              if (next !== undefined && data !== undefined) {
                updateData({
                  ...data,
                  servers: [...data.servers.filter(server => server.name !== next.name), next]
                    .sort((left, right) => left.name.localeCompare(right.name))
                });
              } else {
                updateData(await props.service.listServers());
              }
              setEditorOpen(false);
              pageIssues.resolveOperation('settings.mcp.add');
            } catch (reason) {
              pageIssues.captureOperationFailure(
                'settings.mcp.add',
                reason,
                'Could not add the MCP server. Check the settings and try again.'
              );
            }
          }}
        />
      ) : null}

      {loading ? (
        <div className="settings-state" role="status">
          <LoaderCircle size={20} className="settings-spin" />
          Loading MCP servers
        </div>
      ) : data !== undefined && data.servers.length === 0 ? (
        <div className="settings-state">
          <Server size={22} />
          No MCP servers
        </div>
      ) : (
        <ul className="settings-item-list" aria-label="MCP server list">
          {data?.servers.map(server => {
            const busy = busyName === server.name;
            return (
              <li className="settings-item" key={server.name}>
                <div className="settings-item__main">
                  <div className="settings-item__title">
                    <Server size={16} />
                    <h2>{server.name}</h2>
                    <span data-status={server.status}>{server.status === 'configured' ? 'Configured' : server.status}</span>
                  </div>
                  <p>{mcpEndpoint(server)}</p>
                  {server.envKeys.length > 0 ? (
                    <div className="settings-tags" aria-label={`${server.name} environment variables`}>
                      <KeyRound size={14} />
                      {server.envKeys.map(key => <code key={key}>{key}</code>)}
                    </div>
                  ) : null}
                  {server.diagnostics.map(diagnostic => (
                    <p className="settings-inline-warning" key={diagnostic}>{diagnostic}</p>
                  ))}
                </div>
                <div className="settings-item__actions">
                  <button
                    type="button"
                    aria-label={`Sign in to ${server.name}`}
                    title="Sign in"
                    disabled={busy || props.capabilities?.mcpLogin !== true}
                    onClick={() => void runServerAction(server, 'login')}
                  >
                    <LogIn size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Sign out of ${server.name}`}
                    title="Sign out"
                    disabled={busy || props.capabilities?.mcpLogout !== true}
                    onClick={() => void runServerAction(server, 'logout')}
                  >
                    <LogOut size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${server.name}`}
                    title="Remove"
                    disabled={busy || props.capabilities?.mcpRemove !== true}
                    onClick={() => void runServerAction(server, 'remove')}
                  >
                    {busy ? <LoaderCircle size={16} className="settings-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function McpEditor(props: {
  capabilities?: McpCapabilities;
  requiresWriteConfirmation: boolean;
  onCancel(): void;
  onSubmit(input: AddCodexMcpRequest): Promise<void>;
}) {
  const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>('stdio');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [bearerTokenEnvVar, setBearerTokenEnvVar] = useState('');
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthResource, setOauthResource] = useState('');
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([{ id: 1, key: '', value: '' }]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length === 0) return setFormError('Enter an MCP server name');
    const env = Object.fromEntries(
      envEntries
        .map(entry => [entry.key.trim(), entry.value] as const)
        .filter(([key]) => key.length > 0)
    );
    let input: AddCodexMcpRequest;
    if (transport === 'stdio') {
      if (command.trim().length === 0) return setFormError('Enter a launch command');
      input = {
        name: trimmedName,
        transport,
        command: command.trim(),
        args: args.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
        ...(Object.keys(env).length > 0 ? { env } : {})
      };
    } else {
      if (url.trim().length === 0) return setFormError('Enter an MCP URL');
      input = {
        name: trimmedName,
        transport,
        url: url.trim(),
        ...(Object.keys(env).length > 0 ? { env } : {}),
        ...(bearerTokenEnvVar.trim() ? { bearerTokenEnvVar: bearerTokenEnvVar.trim() } : {}),
        ...(oauthClientId.trim() ? { oauthClientId: oauthClientId.trim() } : {}),
        ...(oauthResource.trim() ? { oauthResource: oauthResource.trim() } : {})
      };
    }
    setSaving(true);
    setFormError(undefined);
    try {
      await props.onSubmit(input);
      setEnvEntries([{ id: 1, key: '', value: '' }]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-editor" aria-label="Add MCP server" onSubmit={submit}>
      <header>
        <div>
          <p>Add connection</p>
          <h2>Configure MCP server</h2>
        </div>
        <button type="button" aria-label="Close MCP editor" title="Close" onClick={props.onCancel}>
          <X size={17} />
        </button>
      </header>
      {formError ? <p className="settings-error" role="alert">{formError}</p> : null}
      <div className="settings-form-grid">
        <label>
          <span>Name</span>
          <input aria-label="Name" value={name} onChange={event => setName(event.target.value)} />
        </label>
        <label>
          <span>Transport</span>
          <select
            aria-label="Transport"
            value={transport}
            onChange={event => setTransport(event.target.value as typeof transport)}
          >
            <option value="stdio">stdio</option>
            <option value="http" disabled={props.capabilities?.mcpAddUrl !== true}>HTTP</option>
            <option value="sse" disabled={props.capabilities?.mcpAddUrl !== true}>SSE</option>
          </select>
        </label>
        {transport === 'stdio' ? (
          <>
            <label>
              <span>Command</span>
              <input aria-label="Command" value={command} onChange={event => setCommand(event.target.value)} />
            </label>
            <label>
              <span>Arguments (one per line)</span>
              <textarea aria-label="Arguments" rows={3} value={args} onChange={event => setArgs(event.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label className="settings-form-wide">
              <span>URL</span>
              <input aria-label="MCP URL" value={url} onChange={event => setUrl(event.target.value)} />
            </label>
            <label>
              <span>Bearer token environment variable</span>
              <input
                aria-label="Bearer token environment variable"
                disabled={props.capabilities?.mcpAddBearerTokenEnvVar !== true}
                value={bearerTokenEnvVar}
                onChange={event => setBearerTokenEnvVar(event.target.value)}
              />
            </label>
            <label>
              <span>OAuth Client ID</span>
              <input
                aria-label="OAuth Client ID"
                disabled={props.capabilities?.mcpAddOAuth !== true}
                value={oauthClientId}
                onChange={event => setOauthClientId(event.target.value)}
              />
            </label>
            <label>
              <span>OAuth Resource</span>
              <input
                aria-label="OAuth Resource"
                disabled={props.capabilities?.mcpAddOAuth !== true}
                value={oauthResource}
                onChange={event => setOauthResource(event.target.value)}
              />
            </label>
          </>
        )}
      </div>
      <fieldset className="settings-env-editor" disabled={props.capabilities?.mcpAddEnv !== true}>
        <legend>Environment variables</legend>
        {envEntries.map((entry, index) => (
          <div key={entry.id}>
            <input
              aria-label={index === 0 ? 'Environment variable name' : `Environment variable name ${index + 1}`}
              placeholder="Variable name"
              value={entry.key}
              onChange={event => setEnvEntries(current => current.map(item => (
                item.id === entry.id ? { ...item, key: event.target.value } : item
              )))}
            />
            <input
              aria-label={index === 0 ? 'Environment variable value' : `Environment variable value ${index + 1}`}
              type="password"
              autoComplete="off"
              placeholder="Used only for this save"
              value={entry.value}
              onChange={event => setEnvEntries(current => current.map(item => (
                item.id === entry.id ? { ...item, value: event.target.value } : item
              )))}
            />
            {envEntries.length > 1 ? (
              <button
                type="button"
                aria-label={`Remove environment variable ${index + 1}`}
                onClick={() => setEnvEntries(current => current.filter(item => item.id !== entry.id))}
              >
                <Trash2 size={15} />
              </button>
            ) : null}
          </div>
        ))}
        <button
          className="settings-text-button"
          type="button"
          onClick={() => setEnvEntries(current => [
            ...current,
            { id: Math.max(...current.map(entry => entry.id)) + 1, key: '', value: '' }
          ])}
        >
          <Plus size={15} />
          Add variable
        </button>
      </fieldset>
      {props.requiresWriteConfirmation ? <p className="settings-notice">Saving requires another confirmation of the global configuration change.</p> : null}
      <footer>
        <button className="settings-secondary-button" type="button" onClick={props.onCancel}>Cancel</button>
        <button className="settings-primary-button" type="submit" disabled={saving}>
          {saving ? <LoaderCircle size={16} className="settings-spin" /> : <Server size={16} />}
          Save MCP server
        </button>
      </footer>
    </form>
  );
}

function mcpEndpoint(server: CodexMcpServerResponse): string {
  if (server.transport === 'stdio') {
    return [server.command, ...(server.args ?? [])].filter(Boolean).join(' ') || 'stdio';
  }
  return server.url ?? server.transport;
}
