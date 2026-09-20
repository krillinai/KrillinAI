import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function assertMacAppIconRenditions(entries) {
  for (const appearance of ['NSAppearanceNameAqua', 'NSAppearanceNameDarkAqua']) {
    const stack = entries.find(entry => (
      entry.AssetType === 'IconImageStack'
      && entry.Name === 'OpenCreator'
      && entry.Appearance === appearance
    ));
    const group = entries.find(entry => (
      entry.AssetType === 'IconGroup'
      && entry.Name === 'OpenCreator/Group'
      && entry.Appearance === appearance
    ));
    if (stack === undefined || group?.Layers?.length !== 1) {
      throw new Error(`macOS app icon catalog is missing the ${appearance} rendition.`);
    }
    if (appearance === 'NSAppearanceNameDarkAqua') {
      const color = entries.find(entry => (
        entry.AssetType === 'Color'
        && entry.Name === group.Layers[0].LayerGradientColorName
      ));
      if (color?.['Color components']?.some(component => component !== 1)
        || color?.['Color components']?.length !== 4) {
        throw new Error('macOS dark app icon must use an opaque white brand mark.');
      }
    }
  }
}

export function verifyMacAppIconCatalog(path, options = {}) {
  const run = options.execFileSync ?? execFileSync;
  const entries = JSON.parse(run('xcrun', ['assetutil', '--info', path], {
    encoding: 'utf8', timeout: 30_000
  }));
  assertMacAppIconRenditions(entries);
}

export function prepareMacAppIcon(context, options = {}) {
  if (context.electronPlatformName !== 'darwin') return;

  const run = options.execFileSync ?? execFileSync;
  const version = run('xcrun', [
    'actool', '--version', '--output-format', 'human-readable-text'
  ], { encoding: 'utf8', timeout: 30_000 });
  const majorVersion = Number(version.match(/short-bundle-version:\s*(\d+)/)?.[1]);
  if (!Number.isInteger(majorVersion) || majorVersion < 26) {
    throw new Error('macOS adaptive app icons require Xcode 26 or newer (actool >= 26).');
  }

  const iconName = 'OpenCreator';
  const source = join(context.packager.projectDir, 'resources', `${iconName}.icon`);
  const resources = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources'
  );
  const output = mkdtempSync(join(tmpdir(), 'opencreator-app-icon-'));
  try {
    run('xcrun', [
      'actool', source,
      '--compile', output,
      '--output-format', 'human-readable-text',
      '--output-partial-info-plist', join(output, 'icon-info.plist'),
      '--app-icon', iconName,
      '--include-all-app-icons',
      '--enable-on-demand-resources', 'NO',
      '--target-device', 'mac',
      '--minimum-deployment-target', '12.0',
      '--platform', 'macosx'
    ], { encoding: 'utf8', timeout: 120_000 });
    const catalog = join(output, 'Assets.car');
    if (!existsSync(catalog)) {
      throw new Error('actool did not generate the macOS adaptive icon catalog.');
    }
    verifyMacAppIconCatalog(catalog, { execFileSync: run });
    mkdirSync(resources, { recursive: true });
    // Keep icon.icns as the fallback on macOS versions without adaptive icons.
    copyFileSync(catalog, join(resources, 'Assets.car'));
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}
