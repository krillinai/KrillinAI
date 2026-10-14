import { shouldApplyBootstrapState } from '../shared/bootstrap-state.js';
import type { DesktopBootstrapState as BootstrapState } from '../shared/types.js';

type BootstrapApi = {
  windowChrome?: {
    integratedTitleBar: boolean;
    titleBarHeight?: number;
    trafficLightInset?: number;
  };
  readBootstrapState(): Promise<BootstrapState>;
  subscribeBootstrapState(listener: (state: BootstrapState) => void): () => void;
  retryBootstrap(): Promise<unknown>;
  selectCodexPath(): Promise<unknown>;
  reloadWorkspace(): Promise<unknown>;
  restartRuntime(): Promise<unknown>;
  exportDiagnostics(): Promise<unknown>;
  quit(): Promise<void>;
  controlWindow?(action: 'close' | 'minimize' | 'zoom'): Promise<void>;
};

declare global {
  interface Window {
    opencreatorDesktop?: BootstrapApi;
  }
}

const api = window.opencreatorDesktop;
if (api === undefined) throw new Error('OpenCreator Desktop bridge is unavailable');
if (
  api.windowChrome?.integratedTitleBar === true
  && typeof api.windowChrome.titleBarHeight === 'number'
  && typeof api.windowChrome.trafficLightInset === 'number'
) {
  document.documentElement.dataset.integratedTitleBar = 'true';
  document.documentElement.style.setProperty(
    '--opencreator-titlebar-height',
    `${api.windowChrome.titleBarHeight}px`
  );
  document.documentElement.style.setProperty(
    '--opencreator-traffic-light-inset',
    `${api.windowChrome.trafficLightInset}px`
  );
  if (api.controlWindow !== undefined) {
    const controls = document.querySelector<HTMLElement>('.desktop-window-controls')!;
    controls.hidden = false;
    controls.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      const action = button?.dataset.action;
      if (action === 'close' || action === 'minimize' || action === 'zoom') {
        void api.controlWindow!(action).catch(error => console.error('Failed to control desktop window', error));
      }
    });
  }
}

const title = element('status-title');
const detail = element('status-detail');
const elapsed = element('elapsed');
const statusMark = element('status-mark');
const actions = element('failure-actions');
const workspaceActions = element('workspace-actions');
const technicalDetails = element('technical-details');
const codexPath = element('codex-path');
const codexHome = element('codex-home');
const errorCode = element('error-code');
const errorMessage = element('error-message');
const selectCodex = element('select-codex');
let currentState: BootstrapState | undefined;

const labels: Record<BootstrapState['phase'], [string, string]> = {
  idle: ['Preparing OpenCreator', 'Initializing the desktop environment'],
  resolving_codex: ['Locating Codex', 'Reading the shell environment and saved paths'],
  starting_daemon: ['Starting the local Runtime', 'Creating an isolated OpenCreator Runtime'],
  probing_codex: ['Checking Codex availability', 'Checking the local Codex process'],
  starting_runtime: ['Opening OpenCreator', 'Loading local data and Codex capabilities'],
  ready: ['Opening OpenCreator', 'The local Runtime is ready'],
  workspace_failed: ['Dashboard failed to load', 'The local Runtime is still running. Reload the Dashboard or restart the Runtime.'],
  failed: ['Codex CLI is unavailable', 'OpenCreator did not receive a valid response. Check diagnostics and try again.']
};

api.subscribeBootstrapState(render);
void api.readBootstrapState().then(render);

element('retry').addEventListener('click', () => void api.retryBootstrap());
element('select-codex').addEventListener('click', () => void api.selectCodexPath());
element('diagnostics').addEventListener('click', () => void api.exportDiagnostics());
element('quit').addEventListener('click', () => void api.quit());
element('reload-workspace').addEventListener('click', () => void api.reloadWorkspace());
element('restart-runtime').addEventListener('click', () => void api.restartRuntime());
element('workspace-diagnostics').addEventListener('click', () => void api.exportDiagnostics());
element('workspace-quit').addEventListener('click', () => void api.quit());

window.setInterval(() => {
  if (
    currentState === undefined
    || currentState.phase === 'ready'
    || currentState.phase === 'failed'
    || currentState.phase === 'workspace_failed'
  ) {
    elapsed.hidden = true;
    return;
  }
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(currentState.startedAt)) / 1000));
  elapsed.hidden = seconds < 3;
  elapsed.textContent = `Waiting for ${seconds}s`;
}, 500);

function render(state: BootstrapState): void {
  if (!shouldApplyBootstrapState(currentState, state)) return;
  currentState = state;
  const [nextTitle, nextDetail] = state.phase === 'failed'
    ? failureLabel(state)
    : labels[state.phase];
  title.textContent = nextTitle;
  detail.textContent = nextDetail;
  const failed = state.phase === 'failed';
  const workspaceFailed = state.phase === 'workspace_failed';
  statusMark.dataset.failed = failed || workspaceFailed ? 'true' : 'false';
  actions.hidden = !failed;
  selectCodex.hidden = state.error?.code === 'RUNTIME_DATA_IN_USE';
  workspaceActions.hidden = !workspaceFailed;
  technicalDetails.hidden = !failed && !workspaceFailed;
  codexPath.textContent = state.codexBin ?? '-';
  codexHome.textContent = state.codexHome ?? '-';
  errorCode.textContent = state.error?.code ?? '-';
  errorMessage.textContent = state.error?.message ?? '';
}

function failureLabel(state: BootstrapState): [string, string] {
  if (state.error?.code === 'CODEX_NOT_FOUND') {
    return [
      'Codex CLI not found',
      'Make sure codex runs in your terminal, or select the ChatGPT or Codex app.'
    ];
  }
  if (state.error?.code === 'CODEX_PATH_INVALID') {
    return ['The selected Codex path is unavailable', state.error.message];
  }
  if (state.error?.code === 'RUNTIME_DATA_IN_USE') {
    return [
      'OpenCreator Runtime is already running',
      'Another instance is using the same data directory. Close the other window for this version and try again.'
    ];
  }
  return labels.failed;
}

function element(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (value === null) throw new Error(`Missing bootstrap element: ${id}`);
  return value;
}

export {};
