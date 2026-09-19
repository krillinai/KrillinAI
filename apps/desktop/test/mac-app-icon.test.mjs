import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertMacAppIconRenditions,
  prepareMacAppIcon
} from '../scripts/mac-app-icon.mjs';

const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('macOS adaptive app icons', () => {
  it('keeps the existing brand geometry and defines a white mark for dark mode', () => {
    const icon = JSON.parse(readFileSync(
      new URL('../resources/OpenCreator.icon/icon.json', import.meta.url), 'utf8'
    ));
    const mark = readFileSync(
      new URL('../resources/OpenCreator.icon/Assets/mark.svg', import.meta.url), 'utf8'
    );
    const legacy = readFileSync(new URL('../resources/icon.svg', import.meta.url), 'utf8');
    expect(mark.match(/<polygon[^>]+>/g)).toEqual(legacy.match(/<polygon[^>]+>/g));
    expect(mark).not.toContain('<rect');
    expect(icon.groups[0].layers[0]['fill-specializations'].find(
      fill => fill.appearance === 'dark'
    ).value.solid).toBe('srgb:1.00000,1.00000,1.00000,1.00000');
    const config = readFileSync(new URL('../electron-builder.yml', import.meta.url), 'utf8');
    expect(config).toContain('CFBundleIconName: OpenCreator');
    expect(config).toContain('icon: resources/icon.png');
  });

  it('does not invoke macOS tools for Windows or Linux', () => {
    const run = vi.fn();
    for (const platform of ['win32', 'linux']) {
      prepareMacAppIcon({ electronPlatformName: platform }, { execFileSync: run });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it.each(['16.4', 'unknown'])('blocks packaging with unsupported actool %s', version => {
    expect(() => prepareMacAppIcon(
      { electronPlatformName: 'darwin' },
      { execFileSync: () => `short-bundle-version: ${version}` }
    )).toThrow(/Xcode 26 or newer/);
  });

  it('compiles and validates the catalog before copying it, without replacing the legacy icon', () => {
    const context = createContext();
    mkdirSync(resources(context), { recursive: true });
    writeFileSync(join(resources(context), 'icon.icns'), 'legacy-icon');
    let output;
    const run = vi.fn((_command, args) => {
      if (args.includes('--version')) return 'short-bundle-version: 26.1';
      if (args[0] === 'assetutil') return JSON.stringify(catalogEntries());
      output = args[args.indexOf('--compile') + 1];
      writeFileSync(join(output, 'Assets.car'), 'adaptive-icon-catalog');
      return '';
    });
    prepareMacAppIcon(context, { execFileSync: run });
    expect(readFileSync(join(resources(context), 'Assets.car'), 'utf8')).toBe('adaptive-icon-catalog');
    expect(readFileSync(join(resources(context), 'icon.icns'), 'utf8')).toBe('legacy-icon');
    expect(run.mock.calls[1][1]).toContain(join(context.packager.projectDir, 'resources', 'OpenCreator.icon'));
    expect(run.mock.calls[1][1]).toContain('12.0');
    expect(existsSync(output)).toBe(false);
  });

  it('fails instead of silently packaging an absent catalog and cleans up temporary output', () => {
    const context = createContext();
    let output;
    const run = vi.fn((_command, args) => {
      if (args.includes('--version')) return 'short-bundle-version: 26.1';
      output = args[args.indexOf('--compile') + 1];
      return '';
    });
    expect(() => prepareMacAppIcon(context, { execFileSync: run })).toThrow(/did not generate/);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(join(resources(context), 'Assets.car'))).toBe(false);
  });

  it('rejects missing dark mode and a dark brand mark in the compiled catalog', () => {
    const entries = catalogEntries();
    expect(() => assertMacAppIconRenditions(entries)).not.toThrow();
    expect(() => assertMacAppIconRenditions(entries.filter(
      entry => entry.Appearance !== 'NSAppearanceNameDarkAqua'
    ))).toThrow(/missing/);
    entries[0]['Color components'] = [0.067, 0.067, 0.075, 1];
    expect(() => assertMacAppIconRenditions(entries)).toThrow(/opaque white/);
  });
});

function createContext() {
  const appOutDir = mkdtempSync(join(tmpdir(), 'opencreator-icon-test-'));
  temporaryDirectories.push(appOutDir);
  return {
    electronPlatformName: 'darwin',
    appOutDir,
    packager: { projectDir: appOutDir, appInfo: { productFilename: 'OpenCreator' } }
  };
}

function resources(context) {
  return join(context.appOutDir, 'OpenCreator.app', 'Contents', 'Resources');
}

function catalogEntries() {
  return [
    { AssetType: 'Color', Name: 'white', 'Color components': [1, 1, 1, 1] },
    ...['NSAppearanceNameAqua', 'NSAppearanceNameDarkAqua'].flatMap(appearance => [
      { AssetType: 'IconImageStack', Name: 'OpenCreator', Appearance: appearance },
      {
        AssetType: 'IconGroup', Name: 'OpenCreator/Group', Appearance: appearance,
        Layers: [{ LayerGradientColorName: 'white' }]
      }
    ])
  ];
}
