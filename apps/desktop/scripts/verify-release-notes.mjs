import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyEnglishReleaseNotes(notes, label = 'Release notes') {
  if (typeof notes !== 'string' || notes.trim().length === 0) {
    throw new Error(`${label} must include English feature updates; empty notes are not allowed`);
  }
  if (/\p{Script=Han}/u.test(notes)) {
    throw new Error(`${label} must be written entirely in English; Chinese or mixed-language text is not allowed`);
  }
  if (!/^\s*[-*]\s+.*[A-Za-z]/m.test(notes)) {
    throw new Error(`${label} must include English feature update bullets, not only a title or download instructions`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const paths = process.argv.slice(2);
    if (paths.length === 0) throw new Error('Usage: node verify-release-notes.mjs <notes-file> [notes-file ...]');
    for (const path of paths) {
      verifyEnglishReleaseNotes(readFileSync(path, 'utf8'), path);
      console.log(`Verified English release notes: ${path}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
