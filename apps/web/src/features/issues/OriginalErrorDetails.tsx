import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';

export function OriginalErrorDetails({ detail }: { detail?: string }) {
  const localize = useLocalizedCopy();
  return detail ? <details className="creator-original-error">
    <summary>{localize('查看原始诊断信息', 'View original diagnostics')}</summary>
    <p>{detail}</p>
  </details> : null;
}
