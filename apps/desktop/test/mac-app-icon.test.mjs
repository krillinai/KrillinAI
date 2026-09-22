import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  assertMacAppIconRenditions,
  createMacAppIconMark,
  prepareMacAppIcon
} from '../scripts/mac-app-icon.mjs';

const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('macOS app icon appearances', () => {
  it('preserves the PNG white background and black mark in both appearances', () => {
    const icon = JSON.parse(readFileSync(
      new URL('../resources/OpenCreator.icon/icon.json', import.meta.url), 'utf8'
    ));
    expect(icon['fill-specializations']).toEqual([
      { value: { solid: 'srgb:1.00000,1.00000,1.00000,1.00000' } },
      { appearance: 'dark', value: { solid: 'srgb:1.00000,1.00000,1.00000,1.00000' } }
    ]);
    expect(icon.groups[0].layers[0]['image-name']).toBe('mark.png');
    const config = readFileSync(new URL('../electron-builder.yml', import.meta.url), 'utf8');
    expect(config).toContain('CFBundleIconName: OpenCreator');
    expect(config).toContain('icon: resources/icon.png');
  });

  it('extracts the original black mark without the PNG white rounded background', async () => {
    const output = mkdtempSync(join(tmpdir(), 'opencreator-mark-test-'));
    temporaryDirectories.push(output);
    const destination = join(output, 'mark.png');
    await createMacAppIconMark(new URL('../resources/icon.png', import.meta.url).pathname, destination);
    const { data, info } = await sharp(destination).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1024, 1024]);
    expect(data[3]).toBe(0);
    let opaque = 0;
    let nonBlack = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] !== 0 || data[index + 1] !== 0 || data[index + 2] !== 0) nonBlack++;
      if (data[index + 3] > 200) opaque++;
    }
    expect(nonBlack).toBe(0);
    expect(opaque).toBeGreaterThan(80_000);
  });

  it('does not invoke macOS tools on other platforms', async () => {
    const run = vi.fn();
    for (const platform of ['win32', 'linux']) {
      await prepareMacAppIcon({ electronPlatformName: platform }, { execFileSync: run });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it.each(['16.4', 'unknown'])('requires a supported actool version (%s)', async version => {
    await expect(prepareMacAppIcon(
      { electronPlatformName: 'darwin' },
      { execFileSync: () => `short-bundle-version: ${version}` }
    )).rejects.toThrow(/Xcode 26 or newer/);
  });

  it('derives from the source PNG and verifies the catalog before installing it', async () => {
    const context = createContext();
    let source;
    const run = vi.fn((_command, args) => {
      if (args.includes('--version')) return 'short-bundle-version: 27.0';
      if (args[0] === 'assetutil') return JSON.stringify(catalogEntries());
      source = args[1];
      expect(existsSync(join(source, 'Assets', 'mark.png'))).toBe(true);
      writeFileSync(join(args[args.indexOf('--compile') + 1], 'Assets.car'), 'icon-catalog');
      return '';
    });

    await prepareMacAppIcon(context, { execFileSync: run });
    expect(readFileSync(join(resources(context), 'Assets.car'), 'utf8')).toBe('icon-catalog');
    expect(run.mock.calls[1][1]).toContain('12.0');
    expect(existsSync(source)).toBe(false);
  });

  it('rejects incomplete or different appearances', () => {
    const entries = catalogEntries();
    expect(() => assertMacAppIconRenditions(entries)).not.toThrow();
    expect(() => assertMacAppIconRenditions(entries.filter(
      entry => entry.Appearance !== 'NSAppearanceNameDarkAqua'
    ))).toThrow(/white backing/);
    entries[2].Layers[0]['Color components'] = [0.1, 0.1, 0.1, 1];
    expect(() => assertMacAppIconRenditions(entries)).toThrow(/white backing/);
    entries[2].Layers[0]['Color components'] = [1, 1, 1, 1];
    entries[3].Layers[0].SHA1Digest = 'different';
    expect(() => assertMacAppIconRenditions(entries)).toThrow(/same image/);
  });

  it('does not install an absent catalog', async () => {
    const context = createContext();
    await expect(prepareMacAppIcon(context, {
      execFileSync: (_command, args) => (
        args.includes('--version') ? 'short-bundle-version: 27.0' : ''
      )
    })).rejects.toThrow(/did not generate/);
    expect(existsSync(join(resources(context), 'Assets.car'))).toBe(false);
  });
});

function createContext() {
  const appOutDir = mkdtempSync(join(tmpdir(), 'opencreator-icon-test-'));
  temporaryDirectories.push(appOutDir);
  return {
    electronPlatformName: 'darwin',
    appOutDir,
    packager: {
      projectDir: new URL('..', import.meta.url).pathname,
      appInfo: { productFilename: 'OpenCreator' }
    }
  };
}

function resources(context) {
  return join(context.appOutDir, 'OpenCreator.app', 'Contents', 'Resources');
}

function catalogEntries() {
  return ['NSAppearanceNameAqua', 'NSAppearanceNameDarkAqua'].flatMap(appearance => [
    {
      AssetType: 'IconImageStack', Name: 'OpenCreator', Appearance: appearance,
      Layers: [{ AssetType: 'Color', 'Color components': [1, 1, 1, 1] }]
    },
    {
      AssetType: 'IconGroup', Name: 'OpenCreator/Group', Appearance: appearance,
      Layers: [{ AssetType: 'Image', SHA1Digest: 'same-image' }]
    }
  ]);
}
