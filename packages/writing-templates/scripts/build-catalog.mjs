import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatesRoot = join(packageRoot, 'templates');
const outputPath = join(packageRoot, 'src', 'generated', 'catalog.json');
const templateKinds = ['official', 'community'];
const stages = ['topics', 'outline', 'article', 'review'];
const categories = new Set(['analysis', 'story', 'practical', 'news']);
const domains = new Set(['technology', 'finance', 'emotion', 'workplace', 'education', 'research', 'lifestyle']);
const statuses = new Set(['submitted', 'verified', 'featured', 'deprecated']);
const locales = ['zh-CN', 'en-US'];
const allowedNames = new Set(['template.json', 'LICENSE', 'NOTICE', 'README.md']);
const allowedExtensions = new Set(['.md', '.txt', '.json']);
const idPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;
const commitPattern = /^[a-f0-9]{40}$/;
const maxFiles = 32;
const maxPackageBytes = 256 * 1024;
const maxResourceBytes = 64 * 1024;

const entries = [];
const ids = new Set();

for (const kind of templateKinds) {
  const kindRoot = join(templatesRoot, kind);
  for (const directoryName of await sortedDirectories(kindRoot)) {
    const templateRoot = join(kindRoot, directoryName);
    await assertSafePackage(templateRoot);
    if (kind === 'community') await assertRegularFile(join(templateRoot, 'LICENSE'), templateRoot, 'LICENSE is required');
    const manifest = JSON.parse(await readFile(join(templateRoot, 'template.json'), 'utf8'));
    validateManifest(manifest, kind, directoryName);
    if (ids.has(manifest.id)) fail(templateRoot, `duplicate template id: ${manifest.id}`);
    ids.add(manifest.id);

    const stagePrompts = {};
    const hashedResources = [];
    for (const stage of stages) {
      const resources = manifest.skill.stageResources[stage] ?? [];
      if (!Array.isArray(resources)) fail(templateRoot, `skill.stageResources.${stage} must be an array`);
      const contents = [];
      for (const resource of resources) {
        const resourcePath = safeResourcePath(templateRoot, resource);
        const content = await readFile(resourcePath, 'utf8');
        if (Buffer.byteLength(content) > maxResourceBytes) {
          fail(templateRoot, `${resource} exceeds ${maxResourceBytes} bytes`);
        }
        assertSafePrompt(content, templateRoot, resource);
        contents.push(content.trim());
        hashedResources.push([resource, content]);
      }
      if (contents.length > 0) stagePrompts[stage] = contents.join('\n\n');
    }

    const source = normalizeSource(manifest.source);
    const publicManifest = {
      schemaVersion: 1,
      id: manifest.id,
      version: manifest.version,
      name: manifest.name,
      description: manifest.description,
      localizations: manifest.localizations,
      categoryId: manifest.categoryId,
      domains: manifest.domains,
      tags: manifest.tags,
      structure: manifest.structure,
      instructions: manifest.instructions,
      author: manifest.author,
      status: manifest.status,
      sortOrder: manifest.sortOrder,
      source
    };
    const contentHash = createHash('sha256')
      .update(JSON.stringify(publicManifest))
      .update(JSON.stringify(hashedResources))
      .digest('hex');

    if (manifest.status === 'verified' || manifest.status === 'featured') {
      entries.push({ ...publicManifest, contentHash, stagePrompts });
    }
  }
}

entries.sort((left, right) => (
  templateSourceRank(left) - templateSourceRank(right)
  || left.sortOrder - right.sortOrder
  || left.id.localeCompare(right.id)
));
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
process.stdout.write(`Validated ${ids.size} writing templates; published ${entries.length}.\n`);

async function sortedDirectories(root) {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function assertSafePackage(root) {
  let fileCount = 0;
  let totalBytes = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    const currentStat = await lstat(current);
    if (currentStat.isSymbolicLink()) fail(root, `symbolic links are not allowed: ${relative(root, current)}`);
    if (currentStat.isDirectory()) {
      for (const entry of await readdir(current)) pending.push(join(current, entry));
      continue;
    }
    fileCount += 1;
    totalBytes += currentStat.size;
    const name = current.slice(current.lastIndexOf(sep) + 1);
    if (!allowedNames.has(name) && !allowedExtensions.has(extname(name).toLowerCase())) {
      fail(root, `unsupported file type: ${relative(root, current)}`);
    }
    if ((currentStat.mode & 0o111) !== 0) fail(root, `executable files are not allowed: ${relative(root, current)}`);
  }
  if (fileCount > maxFiles) fail(root, `package contains more than ${maxFiles} files`);
  if (totalBytes > maxPackageBytes) fail(root, `package exceeds ${maxPackageBytes} bytes`);
}

function validateManifest(value, kind, directoryName) {
  if (!isRecord(value)) fail(directoryName, 'template.json must contain an object');
  const allowedKeys = new Set([
    'schemaVersion', 'id', 'version', 'name', 'description', 'localizations', 'categoryId', 'tags',
    'domains', 'structure', 'instructions', 'author', 'status', 'sortOrder', 'source', 'skill'
  ]);
  for (const key of Object.keys(value)) if (!allowedKeys.has(key)) fail(directoryName, `unknown manifest field: ${key}`);
  if (value.schemaVersion !== 1) fail(directoryName, 'schemaVersion must be 1');
  if (typeof value.id !== 'string' || !idPattern.test(value.id) || value.id.length > 96) fail(directoryName, 'id is invalid');
  if (kind === 'community' && !value.id.startsWith('community.')) fail(directoryName, 'community ids must start with community.');
  if (kind === 'official' && value.id.includes('.')) fail(directoryName, 'official ids must not use a namespace');
  if (typeof value.version !== 'string' || !semverPattern.test(value.version)) fail(directoryName, 'version must be semantic x.y.z');
  assertString(value.name, directoryName, 'name', 64);
  assertString(value.description, directoryName, 'description', 240);
  validateLocalizations(value.localizations, directoryName);
  assertString(value.author, directoryName, 'author', 80);
  if (typeof value.instructions !== 'string' || value.instructions.length > 8_000) fail(directoryName, 'instructions is invalid');
  if (!categories.has(value.categoryId)) fail(directoryName, 'categoryId is invalid');
  assertStringArray(value.domains, directoryName, 'domains', 1, 6, 24);
  if (new Set(value.domains).size !== value.domains.length || value.domains.some(domain => !domains.has(domain))) {
    fail(directoryName, 'domains is invalid');
  }
  if (!statuses.has(value.status)) fail(directoryName, 'status is invalid');
  if (!Number.isInteger(value.sortOrder) || value.sortOrder < 0 || value.sortOrder > 10_000) fail(directoryName, 'sortOrder is invalid');
  assertStringArray(value.tags, directoryName, 'tags', 1, 8, 24);
  assertStringArray(value.structure, directoryName, 'structure', 2, 12, 80);
  if (!isRecord(value.source) || !isRecord(value.skill) || !isRecord(value.skill.stageResources)) {
    fail(directoryName, 'source and skill.stageResources are required');
  }
  for (const stage of Object.keys(value.skill.stageResources)) {
    if (!stages.includes(stage)) fail(directoryName, `unknown writing stage: ${stage}`);
    const resources = value.skill.stageResources[stage];
    if (!Array.isArray(resources) || resources.length === 0 || resources.length > 8) {
      fail(directoryName, `skill.stageResources.${stage} must contain 1 to 8 resources`);
    }
  }
  if (!Array.isArray(value.skill.stageResources.article) || value.skill.stageResources.article.length === 0) {
    fail(directoryName, 'skill.stageResources.article is required');
  }
  assertString(value.source.license, directoryName, 'source.license', 80);
  if (kind === 'community') {
    if (value.source.type !== 'github') fail(directoryName, 'community source.type must be github');
    assertString(value.source.repository, directoryName, 'source.repository', 160);
    if (!commitPattern.test(value.source.revision)) fail(directoryName, 'community source.revision must be a full commit SHA');
    assertString(value.source.url, directoryName, 'source.url', 500);
    assertString(value.source.license, directoryName, 'source.license', 80);
  } else if (value.source.type !== 'official') {
    fail(directoryName, 'official source.type must be official');
  }
}

function validateLocalizations(value, root) {
  if (!isRecord(value)) fail(root, 'localizations is required');
  const keys = Object.keys(value);
  if (keys.length !== locales.length || keys.some(locale => !locales.includes(locale))) {
    fail(root, `localizations must contain exactly ${locales.join(', ')}`);
  }
  for (const locale of locales) {
    const localization = value[locale];
    if (!isRecord(localization)) fail(root, `localizations.${locale} is invalid`);
    const allowedKeys = new Set(['name', 'description', 'tags', 'structure', 'instructions']);
    for (const key of Object.keys(localization)) {
      if (!allowedKeys.has(key)) fail(root, `unknown localizations.${locale} field: ${key}`);
    }
    assertString(localization.name, root, `localizations.${locale}.name`, 64);
    assertString(localization.description, root, `localizations.${locale}.description`, 240);
    assertStringArray(localization.tags, root, `localizations.${locale}.tags`, 1, 8, 24);
    assertStringArray(localization.structure, root, `localizations.${locale}.structure`, 2, 12, 80);
    if (typeof localization.instructions !== 'string' || localization.instructions.length > 8_000) {
      fail(root, `localizations.${locale}.instructions is invalid`);
    }
  }
}

async function assertRegularFile(path, root, message) {
  try {
    if ((await lstat(path)).isFile()) return;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  fail(root, message);
}

function normalizeSource(source) {
  return {
    type: source.type,
    repository: typeof source.repository === 'string' ? source.repository : null,
    revision: typeof source.revision === 'string' ? source.revision : null,
    url: typeof source.url === 'string' ? source.url : null,
    license: source.license
  };
}

function templateSourceRank(template) {
  return template.source.type === 'github' ? 0 : 1;
}

function safeResourcePath(root, resource) {
  if (typeof resource !== 'string' || resource.startsWith('/') || resource.includes('\\')) {
    fail(root, `invalid resource path: ${String(resource)}`);
  }
  const resolved = resolve(root, resource);
  if (resolved === root || !resolved.startsWith(`${root}${sep}`)) fail(root, `resource escapes package: ${resource}`);
  if (!['.md', '.txt'].includes(extname(resolved).toLowerCase())) fail(root, `resource must be Markdown or text: ${resource}`);
  return resolved;
}

function assertSafePrompt(content, root, resource) {
  const prohibited = [
    /<script\b/i,
    /javascript\s*:/i,
    /data\s*:\s*text\/html/i,
    /\brm\s+-rf\b/i,
    /\bcurl\b[^\n|]*\|\s*(?:ba)?sh\b/i,
    /忽略(?:此前|以上|系统)指令/,
    /ignore (?:all )?(?:previous|system) instructions/i
  ];
  if (prohibited.some(pattern => pattern.test(content))) fail(root, `unsafe instruction detected in ${resource}`);
}

function assertString(value, root, field, maxLength) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) fail(root, `${field} is invalid`);
}

function assertStringArray(value, root, field, min, max, maxLength) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(root, `${field} is invalid`);
  for (const item of value) assertString(item, root, field, maxLength);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(root, message) {
  throw new Error(`WRITING_TEMPLATE_INVALID: ${relative(packageRoot, String(root))}: ${message}`);
}
