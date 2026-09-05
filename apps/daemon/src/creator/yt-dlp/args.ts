export function withYtDlpProxy(args: string[], proxy: string): string[] {
  const normalized = proxy.trim();
  return normalized ? ['--proxy', normalized, ...args] : args;
}
