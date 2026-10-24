import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { creatorNlpWheels, installCreatorNlpDependencies, readCreatorNlpLock } from '../scripts/creator-nlp-runtime.mjs';

let root;
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

describe('Packaged spaCy dependencies', () => {
  it('pins Python 3.13 wheels for every supported desktop target and the tested English parser', () => {
    const lock = readCreatorNlpLock();
    expect(lock.pythonVersion).toBe('3.13');
    expect(lock.models).toMatchObject([{ language: 'en', name: 'en_core_web_md', version: '3.8.0' }]);
    for (const target of ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64']) {
      const [platform, arch] = target.split('-');
      const wheels = creatorNlpWheels(lock, platform, arch);
      expect(new Set(wheels.map(wheel => wheel.fileName)).size).toBe(wheels.length);
      expect(wheels.some(wheel => wheel.name === 'spacy' && wheel.version === lock.spacyVersion)).toBe(true);
      for (const wheel of wheels) {
        expect(wheel.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(wheel.url).toMatch(/^https:\/\/(files\.pythonhosted\.org\/|github\.com\/explosion\/spacy-models\/releases\/download\/)/);
      }
    }
    expect(() => creatorNlpWheels(lock, 'win32', 'arm64')).toThrow(/unavailable/);
  });

  it('fails missing or corrupted offline wheels without accessing the network', () => {
    root = mkdtempSync(join(tmpdir(), 'creator-nlp-'));
    const run = vi.fn();
    const input = { vendorRoot: root, platform: process.platform, arch: process.arch, offline: true, run };
    expect(() => installCreatorNlpDependencies(input)).toThrow(/offline cache/);
    const first = creatorNlpWheels(readCreatorNlpLock(), process.platform, process.arch)[0];
    writeFileSync(join(root, 'nlp-wheels', first.fileName), 'corrupt cache');
    expect(() => installCreatorNlpDependencies(input)).toThrow(/offline cache/);
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects a corrupt download and removes its partial file', () => {
    root = mkdtempSync(join(tmpdir(), 'creator-nlp-'));
    const run = vi.fn((_command, args) => writeFileSync(args[args.indexOf('--output') + 1], 'corrupt wheel'));
    expect(() => installCreatorNlpDependencies({ vendorRoot: root, platform: process.platform, arch: process.arch, run }))
      .toThrow(/SHA-256 mismatch/);
    expect(readdirSync(join(root, 'nlp-wheels'))).toEqual([]);
  });
});
