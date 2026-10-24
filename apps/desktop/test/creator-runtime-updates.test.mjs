import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveYtDlpRelease } from '../scripts/creator-runtime-releases.mjs';

const repository = 'https://github.com/yt-dlp/yt-dlp-nightly-builds';
const latestUrl = 'https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest';
const oldVersion = '2026.08.29.232711';
const newVersion = '2026.10.10.233141';
const digest = content => createHash('sha256').update(content).digest('hex');
const contents = version => `yt-dlp ${version}`;
function asset(version = newVersion) {
  return { version, fileName: 'yt-dlp', url: `${repository}/releases/download/${version}/yt-dlp`, sha256: digest(contents(version)) };
}
function metadata(version = newVersion) {
  const release = asset(version);
  return { tag_name: version, draft: false, prerelease: false, assets: [{ name: 'yt-dlp', browser_download_url: release.url, digest: `sha256:${release.sha256}` }] };
}
function cache(version = oldVersion) {
  const release = asset(version);
  return { version, path: release.fileName, source: release.url, sha256: release.sha256 };
}

describe('yt-dlp release discovery', () => {
  it('resolves a fresh version on every call even when an older release is cached', () => {
    const readText = vi.fn().mockReturnValueOnce(JSON.stringify(metadata())).mockReturnValueOnce(JSON.stringify(metadata('2026.10.11.233141')));
    expect(resolveYtDlpRelease({ readText, cached: cache() })).toEqual(asset());
    expect(resolveYtDlpRelease({ readText, cached: cache(newVersion) })).toEqual(asset('2026.10.11.233141'));
    expect(readText.mock.calls).toEqual([[latestUrl], [latestUrl]]);
  });

  it('uses the checksum list from the same release when the asset digest is absent', () => {
    const release = metadata(); release.assets[0].digest = null;
    const readText = vi.fn().mockReturnValueOnce(JSON.stringify(release))
      .mockReturnValueOnce(`${'a'.repeat(64)}  yt-dlp.exe\r\n${asset().sha256}  yt-dlp\r\n`);
    expect(resolveYtDlpRelease({ readText })).toEqual(asset());
    expect(readText).toHaveBeenLastCalledWith(`${repository}/releases/download/${newVersion}/SHA2-256SUMS`);
  });

  it.each([
    release => { release.tag_name = 'latest'; },
    release => { release.draft = true; },
    release => { release.prerelease = true; },
    release => { release.assets = []; },
    release => { release.assets[0].browser_download_url = 'https://example.test/yt-dlp'; },
    release => { release.assets[0].digest = 'sha256:invalid'; }
  ])('rejects invalid release metadata instead of falling back to the cache (%#)', mutate => {
    const release = metadata(); mutate(release);
    expect(() => resolveYtDlpRelease({ readText: () => JSON.stringify(release), cached: cache() })).toThrow(/yt-dlp/);
  });

  it('fails an online update when discovery is unavailable', () => {
    const readText = vi.fn(() => { throw new Error('network unavailable'); });
    expect(() => resolveYtDlpRelease({ readText, cached: cache() })).toThrow('network unavailable');
  });

  it('rejects a checksum list without the portable yt-dlp asset', () => {
    const release = metadata(); delete release.assets[0].digest;
    const readText = vi.fn().mockReturnValueOnce(JSON.stringify(release)).mockReturnValueOnce(`${'a'.repeat(64)}  yt-dlp.exe\n`);
    expect(() => resolveYtDlpRelease({ readText })).toThrow(/SHA-256/);
  });

  it('uses validated cached release metadata only in explicit offline mode', () => {
    const readText = vi.fn();
    expect(resolveYtDlpRelease({ readText, offline: true, cached: cache() })).toEqual(asset(oldVersion));
    expect(readText).not.toHaveBeenCalled();
  });

  it.each([undefined, { ...cache(), source: `${repository}/releases/latest/download/yt-dlp` }, { ...cache(), sha256: '' }])('rejects an incomplete offline release cache (%#)', cached => {
    const readText = vi.fn();
    expect(() => resolveYtDlpRelease({ readText, offline: true, cached })).toThrow(/yt-dlp/);
    expect(readText).not.toHaveBeenCalled();
  });
});

describe('Creator Runtime dependency updates', () => {
  let root;
  let run;
  let fixed;
  let platform;
  let currentVersion;
  let downloadContents;
  let discoveryError;

  beforeEach(async () => {
    vi.resetModules();
    root = mkdtempSync(join(tmpdir(), 'creator-runtime-updates-'));
    platform = process.platform === 'linux' ? 'darwin' : 'linux';
    currentVersion = newVersion;
    downloadContents = undefined;
    discoveryError = undefined;
    fixed = Object.fromEntries([
      ['ffmpeg', 'ffmpeg'], ['ffprobe', 'ffprobe'], ['pythonRuntime', 'python-runtime.tar.gz'],
      ['nodeRuntime', 'node-runtime.tar.gz'], ['certificateBundle', 'cacert.pem']
    ].map(([name, fileName]) => {
      writeFileSync(join(root, fileName), name);
      return [name, { version: 'test', fileName, url: `https://example.test/${fileName}`, sha256: digest(name) }];
    }));
    writeFileSync(join(root, 'yt-dlp'), contents(oldVersion));
    writeFileSync(join(root, 'versions.json'), JSON.stringify({ version: 1, platform, arch: 'x64', dependencies: { ytDlp: cache() } }));
    vi.stubEnv('OPENCREATOR_CREATOR_RUNTIME_VENDOR', root);
    vi.stubEnv('OPENCREATOR_CREATOR_RUNTIME_PLATFORM', platform);
    vi.stubEnv('OPENCREATOR_CREATOR_RUNTIME_ARCH', 'x64');
    vi.stubEnv('OPENCREATOR_DESKTOP_TARGET_PLATFORM', platform);
    vi.stubEnv('OPENCREATOR_DESKTOP_TARGET_ARCH', 'x64');
    vi.stubEnv('OPENCREATOR_DESKTOP_OFFLINE', '0');
    vi.stubEnv('OPENCREATOR_DOWNLOAD_PROXY', '');
    vi.stubEnv('OPENCREATOR_YT_DLP_PATH', '');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    run = vi.fn((command, args) => {
      expect(command).toBe('curl');
      const url = args.at(-1);
      if (url === latestUrl) {
        if (discoveryError) throw discoveryError;
        return JSON.stringify(metadata(currentVersion));
      }
      expect(url).toBe(asset(currentVersion).url);
      const output = args[args.indexOf('--output') + 1];
      writeFileSync(output, downloadContents ?? contents(currentVersion));
      return '';
    });
    vi.doMock('node:child_process', async importOriginal => ({ ...await importOriginal(), execFileSync: run }));
    vi.doMock('../scripts/creator-runtime-releases.mjs', async importOriginal => ({
      ...await importOriginal(), creatorRuntimeReleases: () => ({ [`${platform}-x64`]: structuredClone(fixed) })
    }));
    vi.doMock('../scripts/creator-nlp-runtime.mjs', () => ({ installCreatorNlpDependencies: vi.fn(() => ({ version: 'test' })) }));
  });

  afterEach(() => {
    vi.doUnmock('node:child_process');
    vi.doUnmock('../scripts/creator-runtime-releases.mjs');
    vi.doUnmock('../scripts/creator-nlp-runtime.mjs');
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const install = () => import('../scripts/install-creator-runtime-dependencies.mjs');

  it('updates a populated cache and records the verified release for each invocation', async () => {
    for (const version of [newVersion, '2026.10.11.233141']) {
      currentVersion = version;
      vi.resetModules();
      await install();
      expect(readFileSync(join(root, 'yt-dlp'), 'utf8')).toBe(contents(version));
      expect(JSON.parse(readFileSync(join(root, 'versions.json'), 'utf8')).dependencies.ytDlp).toEqual(cache(version));
    }
    expect(run.mock.calls.map(([, args]) => args.at(-1))).toEqual([latestUrl, asset().url, latestUrl, asset(currentVersion).url]);
  });

  it('checks the latest release again while reusing an already verified current download', async () => {
    await install();
    run.mockClear(); vi.resetModules();
    await install();
    expect(run.mock.calls.map(([, args]) => args.at(-1))).toEqual([latestUrl]);
  });

  it.each(['discovery', 'checksum'])('stops on an update %s failure and preserves the previous cache', async failure => {
    const previous = readFileSync(join(root, 'versions.json'), 'utf8');
    if (failure === 'discovery') discoveryError = new Error('network unavailable');
    else downloadContents = 'corrupt download';
    await expect(install()).rejects.toThrow(failure === 'discovery' ? /network unavailable/ : /SHA-256 mismatch/);
    expect(readFileSync(join(root, 'yt-dlp'), 'utf8')).toBe(contents(oldVersion));
    expect(readFileSync(join(root, 'versions.json'), 'utf8')).toBe(previous);
    expect(readdirSync(root).some(name => name.endsWith('.partial'))).toBe(false);
  });

  it('validates the offline cache without requesting a release or downloading files', async () => {
    vi.stubEnv('OPENCREATOR_DESKTOP_OFFLINE', '1');
    await install();
    expect(run).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(join(root, 'versions.json'), 'utf8')).dependencies.ytDlp).toEqual(cache());
  });

  it('rejects a corrupted offline download without accessing the network', async () => {
    vi.stubEnv('OPENCREATOR_DESKTOP_OFFLINE', '1');
    writeFileSync(join(root, 'yt-dlp'), 'corrupt cache');
    await expect(install()).rejects.toThrow(/offline cache/);
    expect(run).not.toHaveBeenCalled();
  });

  it.each(['0', '1'])('refreshes dependencies from the prepare entry point even with a complete cache (offline=%s)', async offline => {
    vi.stubEnv('OPENCREATOR_DESKTOP_OFFLINE', offline);
    const stopped = new Error('dependency updater reached');
    run.mockImplementation((command, args) => {
      expect(command).toBe(process.execPath);
      if (args[0].endsWith('install-creator-runtime-dependencies.mjs')) throw stopped;
      expect(args[0].endsWith('build-krillinai.mjs')).toBe(true);
      return '';
    });
    await expect(import('../scripts/prepare-creator-runtime.mjs')).rejects.toBe(stopped);
    expect(run).toHaveBeenLastCalledWith(process.execPath,
      [expect.stringContaining('install-creator-runtime-dependencies.mjs')],
      expect.objectContaining({ env: expect.objectContaining({ OPENCREATOR_CREATOR_RUNTIME_VENDOR: root, OPENCREATOR_CREATOR_RUNTIME_PLATFORM: platform, OPENCREATOR_CREATOR_RUNTIME_ARCH: 'x64' }) }));
  });
});
