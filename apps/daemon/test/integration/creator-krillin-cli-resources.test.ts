import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { prepareCliResourceRoot } from '../../src/creator/krillin/cli-runner.js';

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});

it('prepares executable resources without requiring Windows file symlink privileges', async () => {
  root = await mkdtemp(join(tmpdir(), 'krillin-resources-'));
  const resourceRoot = join(root, 'installed runtime');
  const dependencyRoot = join(root, 'dependencies');
  const launcherRoot = join(root, 'job', '.krillin-cli');
  const suffix = process.platform === 'win32' ? '.exe' : '';
  await mkdir(join(resourceRoot, 'bin'), { recursive: true });
  await mkdir(join(dependencyRoot, 'bin'), { recursive: true });
  await mkdir(join(dependencyRoot, 'models'), { recursive: true });
  await mkdir(join(dependencyRoot, 'bin', 'whispercpp'), { recursive: true });
  await writeFile(join(dependencyRoot, 'bin', 'whispercpp', 'whispercpp.exe'), 'whisper cpp');
  await writeFile(join(dependencyRoot, 'bin', 'whispercpp', 'whisper.dll'), 'whisper library');
  await mkdir(launcherRoot, { recursive: true });
  const ffmpeg = join(resourceRoot, 'bin', `ffmpeg${suffix}`);
  const whisper = join(dependencyRoot, 'bin', `whisperkit-cli${suffix}`);
  const managedYtDlp = join(root, `managed yt-dlp${suffix}`);
  await writeFile(ffmpeg, 'packaged ffmpeg');
  await writeFile(whisper, 'managed whisper');
  await writeFile(managedYtDlp, 'managed downloader');
  await writeFile(join(resourceRoot, 'bin', `yt-dlp${suffix}`), 'old downloader');
  await writeFile(join(dependencyRoot, 'models', 'model.bin'), 'shared model');

  expect(await prepareCliResourceRoot({
    resourceRoot, dependencyRoot, launcherRoot, useOnDemandTranscription: true, useWhisperCpp: true,
    ytDlpRuntime: { executable: managedYtDlp, prefixArgs: [], env: {}, version: 'test' }
  })).toBe(launcherRoot);

  for (const [name, content] of [
    ['ffmpeg', 'packaged ffmpeg'],
    ['whisperkit-cli', 'managed whisper'],
    ['yt-dlp', 'managed downloader']
  ]) {
    const target = join(launcherRoot, 'bin', `${name}${suffix}`);
    expect(await readFile(target, 'utf8')).toBe(content);
    expect((await lstat(target)).isSymbolicLink()).toBe(process.platform !== 'win32');
  }
  expect(await realpath(join(launcherRoot, 'models'))).toBe(await realpath(join(dependencyRoot, 'models')));
  expect(await readFile(join(launcherRoot, 'bin', 'whispercpp.exe'), 'utf8')).toBe('whisper cpp');
  expect(await readFile(join(launcherRoot, 'bin', 'whisper.dll'), 'utf8')).toBe('whisper library');
  await rm(launcherRoot, { recursive: true, force: true });
  expect(await readFile(ffmpeg, 'utf8')).toBe('packaged ffmpeg');
  expect(await readFile(whisper, 'utf8')).toBe('managed whisper');
  expect(await readFile(managedYtDlp, 'utf8')).toBe('managed downloader');
  expect(await readFile(join(dependencyRoot, 'models', 'model.bin'), 'utf8')).toBe('shared model');
  if (process.platform === 'win32') {
    await mkdir(launcherRoot, { recursive: true });
    await prepareCliResourceRoot({
      resourceRoot, dependencyRoot, launcherRoot, useOnDemandTranscription: false,
      ytDlpRuntime: { executable: process.execPath, prefixArgs: [managedYtDlp], script: managedYtDlp, env: {}, version: 'test' }
    });
    await expect(lstat(join(launcherRoot, 'bin', 'yt-dlp.exe'))).rejects.toMatchObject({ code: 'ENOENT' });
  }
});
