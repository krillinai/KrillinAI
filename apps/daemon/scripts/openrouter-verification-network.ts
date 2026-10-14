import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export type VerificationNetwork = { country: string; exitHash: string };

export async function readVerificationNetwork(fetcher: typeof fetch): Promise<VerificationNetwork> {
  const response = await fetcher('https://openrouter.ai/cdn-cgi/trace', { redirect: 'error', signal: AbortSignal.timeout(8000) });
  const fields = new URLSearchParams((await response.text()).replace(/\r?\n/g, '&'));
  const ip = fields.get('ip') ?? ''; const country = fields.get('loc') ?? '';
  if (!response.ok || !isIP(ip) || !/^[A-Z]{2}$/.test(country)) throw new Error('Verification requires a known OpenRouter exit country');
  return { country, exitHash: createHash('sha256').update(JSON.stringify([ip, country])).digest('hex') };
}

export function verifiedCountries(before: VerificationNetwork, after?: VerificationNetwork): string[] {
  return before.country === after?.country && before.exitHash === after.exitHash ? [before.country] : [];
}
