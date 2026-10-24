import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const creatorNlpLockPath = join(scriptDir, 'creator-nlp-lock.json');

export function readCreatorNlpLock() {
  return JSON.parse(readFileSync(creatorNlpLockPath, 'utf8'));
}

export function creatorNlpWheels(lock, platform, arch) {
  const wheels = lock.targets[`${platform}-${arch}`];
  if (!Array.isArray(wheels) || wheels.length === 0) {
    throw new Error(`Packaged spaCy wheels are unavailable for ${platform}-${arch}`);
  }
  return [...wheels.map(name => lock.wheels[name]), ...lock.models.map(model => model.wheel)];
}

export function installCreatorNlpDependencies({ vendorRoot, platform, arch, offline = false, proxy, run = execFileSync }) {
  const lock = readCreatorNlpLock();
  const wheelRoot = join(vendorRoot, 'nlp-wheels');
  mkdirSync(wheelRoot, { recursive: true });
  for (const wheel of creatorNlpWheels(lock, platform, arch)) {
    const path = join(wheelRoot, wheel.fileName);
    if (existsSync(path) && hashFile(path) === wheel.sha256) continue;
    if (offline) throw new Error(`spaCy wheel is unavailable in the offline cache: ${wheel.fileName}`);
    const temporary = `${path}.${process.pid}.partial`;
    try {
      const args = ['--fail', '--silent', '--show-error', '--location', '--retry', '3', '--connect-timeout', '20', '--max-time', '180'];
      if (proxy) args.push('--proxy', proxy);
      args.push('--output', temporary, wheel.url);
      run('curl', args, { stdio: 'inherit' });
      if (hashFile(temporary) !== wheel.sha256) throw new Error(`spaCy wheel SHA-256 mismatch: ${wheel.fileName}`);
      rmSync(path, { force: true });
      renameSync(temporary, path);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  return { version: lock.spacyVersion, lockSha256: hashFile(creatorNlpLockPath) };
}

// Target wheels are installed without executing target native code. Only the
// build machine needs an interpreter for the stdlib wheel unpacker.
export function prepareCreatorNlpRuntime({ vendorRoot, outputRoot, pythonExecutable, pythonRoot, platform, arch, run = execFileSync }) {
  const lock = readCreatorNlpLock();
  const wheels = creatorNlpWheels(lock, platform, arch);
  const sitePackages = platform === 'win32'
    ? join(pythonRoot, 'Lib', 'site-packages')
    : join(pythonRoot, 'lib', `python${lock.pythonVersion}`, 'site-packages');
  const paths = wheels.map(wheel => {
    const path = join(vendorRoot, 'nlp-wheels', wheel.fileName);
    if (!existsSync(path) || hashFile(path) !== wheel.sha256) {
      throw new Error(`spaCy wheel is missing or corrupt: ${wheel.fileName}`);
    }
    return path;
  });
  const buildPython = platform === process.platform && arch === process.arch
    ? pythonExecutable
    : process.env.OPENCREATOR_BUILD_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3');
  run(buildPython, ['-I', '-B', join(scriptDir, 'install-creator-nlp-wheels.py'), sitePackages, ...paths], {
    stdio: 'inherit', timeout: 120_000, windowsHide: true
  });
  const lockPath = join(outputRoot, 'nlp-lock.json');
  copyFileSync(creatorNlpLockPath, lockPath);
  const descriptor = {
    engine: 'spacy', version: lock.spacyVersion,
    executable: relative(outputRoot, pythonExecutable).replaceAll('\\', '/'),
    packageMetadata: relative(outputRoot, join(sitePackages, `spacy-${lock.spacyVersion}.dist-info`, 'METADATA')).replaceAll('\\', '/'),
    models: lock.models.map(model => ({
      language: model.language, name: model.name, version: model.version,
      metadata: relative(outputRoot, join(sitePackages, model.name, 'meta.json')).replaceAll('\\', '/')
    }))
  };
  if (platform === process.platform && arch === process.arch) verifyCreatorNlpRuntime(pythonExecutable, descriptor);
  return { descriptor, resourcePaths: [...listFiles(sitePackages), lockPath] };
}

export function verifyCreatorNlpRuntime(pythonExecutable, descriptor, run = execFileSync) {
  const probe = `import json, spacy, importlib.metadata as m
models = json.loads(__import__('sys').argv[1])
assert spacy.__version__ == __import__('sys').argv[2]
for model in models:
    assert m.version(model['name']) == model['version']
    nlp = spacy.load(model['name'], exclude=['ner'])
    assert nlp.has_pipe('parser'), 'dependency parser missing'
    doc = nlp('I bought a book because I wanted to read it.')
    assert doc.has_annotation('DEP') and list(doc.sents)
print(json.dumps({'spacy': spacy.__version__, 'models': [x['name'] for x in models]}))`;
  return run(pythonExecutable, ['-I', '-B', '-c', probe, JSON.stringify(descriptor.models), descriptor.version], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000, windowsHide: true,
    env: Object.fromEntries((process.platform === 'win32'
      ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA']
      : ['HOME', 'TMPDIR', 'LANG', 'LC_ALL']).flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]]]))
  });
}

function listFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : entry.isFile() ? [path] : [];
  });
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
