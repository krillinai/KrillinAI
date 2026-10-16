import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stringify } from '@iarna/toml';
import { verifiedAudioProfiles } from './openrouter-audio-profiles.js';

const [reportArgument, outputArgument] = process.argv.slice(2);
if (!reportArgument || !outputArgument) throw new Error('Expected a report JSON path and output TOML path');
const reportPath = resolve(reportArgument);
const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
  verifiedAt?: string; updatedAt?: string; results: Record<string, unknown>[];
  chinese?: { speech?: Record<string, unknown>[]; transcription?: Record<string, unknown>[] }
};
const results = [...report.results, ...(report.chinese?.speech ?? []), ...(report.chinese?.transcription ?? [])];
for (const result of results.filter(result => result.status === 'passed')) {
  if (typeof result.outputPath !== 'string' || typeof result.sha256 !== 'string') throw new Error('Incomplete audio evidence');
  const content = await readFile(result.outputPath);
  if (createHash('sha256').update(content).digest('hex') !== result.sha256) throw new Error('Audio evidence hash mismatch');
}
const verifiedAt = report.verifiedAt ?? report.updatedAt;
if (!verifiedAt || !Number.isFinite(Date.parse(verifiedAt))) throw new Error('Missing audio verification date');
const profiles = verifiedAudioProfiles(results, reportPath, verifiedAt);
await writeFile(resolve(outputArgument), stringify({ openrouter: { verified_media_models: profiles } } as never), { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ profiles: profiles.length, speech: profiles.filter(profile => profile.modality === 'speech').length,
  transcription: profiles.filter(profile => profile.modality === 'transcription').length,
  withRegionalEvidence: profiles.filter(profile => profile.verified_countries.length).length, paidSubmissions: 0 })}\n`);
