import type { DesktopBootstrapState } from './types.js';

export function shouldApplyBootstrapState(
  current: DesktopBootstrapState | undefined,
  incoming: DesktopBootstrapState
): boolean {
  return current === undefined || incoming.revision >= current.revision;
}
