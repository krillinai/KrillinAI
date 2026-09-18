import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(
  process.env.OPENCREATOR_PREVIEW_SOURCE_ROOT
    ?? join(rootDir, 'assets', 'creator-preset-video-sources', 'video-generation')
);
const outputRoot = resolve(
  process.env.OPENCREATOR_PREVIEW_OUTPUT_ROOT
    ?? join(rootDir, 'template', 'video-generation')
);
const maxDuration = Number(process.env.OPENCREATOR_PREVIEW_MAX_SECONDS ?? 8);
const maxDimension = Number(process.env.OPENCREATOR_PREVIEW_MAX_DIMENSION ?? 640);
const fps = Number(process.env.OPENCREATOR_PREVIEW_FPS ?? 15);
const crf = Number(process.env.OPENCREATOR_PREVIEW_CRF ?? 29);
const dryRun = process.argv.includes('--dry-run');

if (!Number.isFinite(maxDuration) || maxDuration <= 0) {
  throw new Error('OPENCREATOR_PREVIEW_MAX_SECONDS must be a positive number');
}
if (!Number.isInteger(maxDimension) || maxDimension < 128) {
  throw new Error('OPENCREATOR_PREVIEW_MAX_DIMENSION must be an integer >= 128');
}
if (!Number.isInteger(fps) || fps < 1 || fps > 30) {
  throw new Error('OPENCREATOR_PREVIEW_FPS must be an integer between 1 and 30');
}
if (!Number.isInteger(crf) || crf < 18 || crf > 40) {
  throw new Error('OPENCREATOR_PREVIEW_CRF must be an integer between 18 and 40');
}
if (!existsSync(sourceRoot)) {
  throw new Error(`Creator preview source directory does not exist: ${sourceRoot}`);
}

const sources = findMp4Files(sourceRoot);
if (sources.length === 0) {
  throw new Error(`No MP4 source videos found under ${sourceRoot}`);
}

for (const source of sources) {
  const relativePath = relative(sourceRoot, source);
  const output = join(outputRoot, relativePath);
  mkdirSync(dirname(output), { recursive: true });
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', source,
    '-t', String(maxDuration),
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-vf', `scale=${maxDimension}:${maxDimension}:force_original_aspect_ratio=decrease,fps=${fps}`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '64k',
    '-ac', '2',
    '-shortest',
    '-map_metadata', '-1',
    '-movflags', '+faststart',
    output
  ];
  process.stdout.write(`${dryRun ? '[dry-run] ' : ''}${relativePath} -> ${relative(outputRoot, output)}\n`);
  if (dryRun) continue;
  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.error !== undefined) {
    throw new Error(`Unable to run ffmpeg: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${relativePath} with exit code ${result.status}`);
  }
  const size = statSync(output).size;
  if (size === 0) throw new Error(`ffmpeg produced an empty preview: ${output}`);
}

process.stdout.write(
  `Processed ${sources.length} creator preview video(s) with `
  + `${maxDuration}s/${maxDimension}px/${fps}fps/CRF${crf}.\n`
);

function findMp4Files(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...findMp4Files(absolute));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.mp4') {
      result.push(absolute);
    }
  }
  return result.sort((left, right) => basename(left).localeCompare(basename(right)) || left.localeCompare(right));
}
