import {
  StrictMode,
  useEffect
} from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import {
  readDesktopHostBridge,
  signalDesktopWorkspaceReady,
  subscribeDesktopNavigation
} from './host/desktop-bridge.js';
import {
  applyAccentColor,
  readAccentColorPreference,
  readCustomAccentColorPreference
} from './styles/accent-color.js';
import { applyColorMode, readColorModePreference } from './styles/color-mode.js';
import {
  applyAppLanguage,
  readLanguagePreference,
  resolveAppLanguage
} from './i18n/language.js';
import { installAutoHidingScrollbars } from './styles/scrollbar-visibility.js';
import { installWindowResizeStability } from './styles/window-resize-stability.js';
import { hasLanguageCatalog, loadLanguageCatalog } from './i18n/translated-copy.js';
import './styles/app.css';

const desktopHostBridge = readDesktopHostBridge();

const initialColorMode = readColorModePreference();
applyColorMode(initialColorMode);
void desktopHostBridge?.setWindowColorMode?.(initialColorMode).catch(error => {
  console.error('Failed to synchronize native window color mode', error);
});
const initialLanguage = resolveAppLanguage(readLanguagePreference());
applyAppLanguage(initialLanguage);
applyAccentColor(
  readAccentColorPreference(),
  readCustomAccentColorPreference()
);
installAutoHidingScrollbars();
installWindowResizeStability();

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <>
        <App {...(desktopHostBridge === undefined ? {} : { hostBridge: desktopHostBridge })} />
        {desktopHostBridge === undefined ? null : <WorkspaceReadySignal />}
      </>
    </StrictMode>
  );
}

if (hasLanguageCatalog(initialLanguage)) {
  renderApp();
} else {
  void loadLanguageCatalog(initialLanguage).catch(error => {
    console.error('Failed to load initial display language', error);
  }).then(renderApp);
}

if (desktopHostBridge !== undefined) {
  subscribeDesktopNavigation(route => {
    if (route.startsWith('#/')) window.location.hash = route;
  });
}

function WorkspaceReadySignal() {
  useEffect(() => {
    signalDesktopWorkspaceReady();
  }, []);
  return null;
}
