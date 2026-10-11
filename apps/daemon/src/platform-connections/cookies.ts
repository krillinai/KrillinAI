export type YouTubeCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expires: number;
};

export function isYouTubeDomain(domain: string): boolean {
  const host = domain.replace(/^\./, '').toLowerCase();
  return host === 'youtube.com' || host.endsWith('.youtube.com');
}

export function filterYouTubeCookies(value: unknown, now = Date.now()): YouTubeCookie[] {
  if (!Array.isArray(value)) return [];
  return value.filter((cookie): cookie is YouTubeCookie => {
    if (!cookie || typeof cookie !== 'object') return false;
    const c = cookie as Record<string, unknown>;
    return typeof c.domain === 'string' && isYouTubeDomain(c.domain)
      && typeof c.name === 'string' && !!c.name && typeof c.value === 'string'
      && typeof c.path === 'string' && c.path.startsWith('/')
      && [c.domain, c.name, c.value, c.path].every(field => !/[\t\r\n\0]/.test(field as string))
      && typeof c.secure === 'boolean' && typeof c.httpOnly === 'boolean'
      && typeof c.expires === 'number' && Number.isFinite(c.expires)
      && (c.expires <= 0 || c.expires * 1000 > now);
  }).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path,
    secure: c.secure, httpOnly: c.httpOnly, expires: c.expires }));
}

export function hasYouTubeAuthentication(cookies: YouTubeCookie[]): boolean {
  return cookies.some(c => ['SID', '__Secure-1PSID', '__Secure-3PSID'].includes(c.name) && !!c.value)
    && cookies.some(c => ['SAPISID', '__Secure-1PAPISID', '__Secure-3PAPISID'].includes(c.name) && !!c.value);
}

export function serializeYouTubeCookies(cookies: YouTubeCookie[]): string {
  return '# Netscape HTTP Cookie File\n' + filterYouTubeCookies(cookies).map(c => [
    `${c.httpOnly ? '#HttpOnly_' : ''}${c.domain}`, c.domain.startsWith('.') ? 'TRUE' : 'FALSE',
    c.path, c.secure ? 'TRUE' : 'FALSE', Math.max(0, Math.floor(c.expires)), c.name, c.value
  ].join('\t')).join('\n') + '\n';
}

export function parseYouTubeCookies(source: string): YouTubeCookie[] {
  if (Buffer.byteLength(source) > 1024 * 1024 || !/^\uFEFF?# (?:Netscape )?HTTP Cookie File/.test(source)) {
    throw new Error('Invalid Netscape cookie file');
  }
  const cookies = source.split(/\r?\n/).flatMap(line => {
    if (!line.trim() || line.startsWith('#') && !line.startsWith('#HttpOnly_')) return [];
    const fields = line.replace(/^#HttpOnly_/, '').split('\t');
    if (fields.length !== 7) return [];
    const [domain, , path, secure, expires, name, value] = fields;
    return [{ domain, path, secure: secure === 'TRUE', expires: Number(expires), name, value,
      httpOnly: line.startsWith('#HttpOnly_') }];
  });
  return filterYouTubeCookies(cookies);
}
