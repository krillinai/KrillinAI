import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

export function assertMacAppIconRenditions(entries) {
  const images = [];
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
    const background = stack?.Layers?.find(layer => layer.AssetType === 'Color');
    const image = group?.Layers?.find(layer => layer.AssetType === 'Image');
    if (background?.['Color components']?.length !== 4
      || background['Color components'].some(component => component !== 1)
      || !image?.SHA1Digest) {
      throw new Error(`macOS app icon is missing the white backing and image for ${appearance}.`);
    }
    images.push(image.SHA1Digest);
  }
  if (images[0] !== images[1]) {
    throw new Error('macOS light and dark app icons must use the same image.');
  }
}

export function verifyMacAppIconCatalog(path, options = {}) {
  const run = options.execFileSync ?? execFileSync;
  const entries = JSON.parse(run('xcrun', ['assetutil', '--info', path], {
    encoding: 'utf8', timeout: 30_000
  }));
  assertMacAppIconRenditions(entries);
}

export async function prepareMacAppIcon(context, options = {}) {
  if (context.electronPlatformName !== 'darwin') return;

  const run = options.execFileSync ?? execFileSync;
  const version = run('xcrun', [
    'actool', '--version', '--output-format', 'human-readable-text'
  ], { encoding: 'utf8', timeout: 30_000 });
  const majorVersion = Number(version.match(/short-bundle-version:\s*(\d+)/)?.[1]);
  if (!Number.isInteger(majorVersion) || majorVersion < 26) {
    throw new Error('macOS app icon appearances require Xcode 26 or newer (actool >= 26).');
  }

  const iconName = 'OpenCreator';
  const resources = join(context.packager.projectDir, 'resources');
  const appResources = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents', 'Resources'
  );
  const temporary = mkdtempSync(join(tmpdir(), 'opencreator-app-icon-'));
  try {
    const source = join(temporary, `${iconName}.icon`);
    const output = join(temporary, 'compiled');
    mkdirSync(join(source, 'Assets'), { recursive: true });
    mkdirSync(output);
    copyFileSync(join(resources, `${iconName}.icon`, 'icon.json'), join(source, 'icon.json'));
    await createMacAppIconMark(
      join(resources, 'icon.png'), join(source, 'Assets', 'mark.png')
    );
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
      throw new Error('actool did not generate the macOS app icon catalog.');
    }
    verifyMacAppIconCatalog(catalog, { execFileSync: run });
    mkdirSync(appResources, { recursive: true });
    copyFileSync(catalog, join(appResources, 'Assets.car'));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export async function createMacAppIconMark(source, destination) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const index = (y * info.width + x) * 4;
      const alpha = data[index + 3];
      if (alpha > 0) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
      const darkness = 255 - (data[index] + data[index + 1] + data[index + 2]) / 3;
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = Math.round(alpha * darkness / 255);
    }
  }
  if (right < left || bottom < top) {
    throw new Error('macOS app icon source PNG is empty.');
  }
  const size = Math.max(right - left + 1, bottom - top + 1);
  const cropLeft = Math.max(0, Math.round((left + right - size + 1) / 2));
  const cropTop = Math.max(0, Math.round((top + bottom - size + 1) / 2));
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: cropLeft, top: cropTop, width: size, height: size })
    .resize(1024, 1024)
    .png()
    .toFile(destination);
}
