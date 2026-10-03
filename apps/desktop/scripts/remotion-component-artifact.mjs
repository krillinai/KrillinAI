import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { hashFile, verifyStickmanRuntime } from './stickman-runtime-contract.mjs';

export function copyRemotionDependencies(runtimeRoot, requireFromDaemon) {
  const installed = new Map();
  function copyPackage(name, parentRequire, optional = false) {
    let packagePath;
    try {
      packagePath = parentRequire.resolve(`${name}/package.json`);
    } catch {
      try {
        let current = dirname(parentRequire.resolve(name));
        while (current !== dirname(current)) {
          const candidate = join(current, 'package.json');
          if (existsSync(candidate) && JSON.parse(readFileSync(candidate, 'utf8')).name === name) {
            packagePath = candidate;
            break;
          }
          current = dirname(current);
        }
      } catch { if (optional) return; }
    }
    if (!packagePath) {
      if (optional) return;
      throw new Error(`Remotion production dependency is missing: ${name}`);
    }
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (installed.has(name)) {
      if (installed.get(name) !== pkg.version) throw new Error(`Remotion production dependency version conflict: ${name}`);
      return;
    }
    installed.set(name, pkg.version);
    const source = dirname(packagePath);
    const target = join(runtimeRoot, 'node_modules', name);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true, dereference: true, filter: path => {
      if (path === source) return true;
      const relative = path.slice(source.length + 1).replaceAll('\\', '/');
      return !relative.split('/').some(segment => ['node_modules', 'test', 'tests', '__tests__', '.bin'].includes(segment))
        && !/\.(?:map|d\.ts)$/.test(relative);
    } });
    const packageRequire = createRequire(packagePath);
    for (const dependency of Object.keys(pkg.dependencies ?? {})) copyPackage(dependency, packageRequire);
    for (const dependency of Object.keys(pkg.optionalDependencies ?? {})) copyPackage(dependency, packageRequire, true);
    for (const dependency of Object.keys(pkg.peerDependencies ?? {})) {
      if (!dependency.startsWith('@types/')) copyPackage(dependency, packageRequire, pkg.peerDependenciesMeta?.[dependency]?.optional === true);
    }
  }
  copyPackage('@remotion/renderer', requireFromDaemon);
  writeFileSync(join(runtimeRoot, 'package.json'), `${JSON.stringify({ private: true, type: 'commonjs' }, null, 2)}\n`);
  const rendererPackage = join(runtimeRoot, 'node_modules', '@remotion', 'renderer', 'package.json');
  return createRequire(rendererPackage).resolve('@remotion/renderer').slice(resolve(runtimeRoot).length + 1).replaceAll('\\', '/');
}

export function createRemotionComponentArtifact({ runtimeRoot, outputRoot, version, platform, arch }) {
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('Invalid Remotion component App version');
  const manifest = verifyStickmanRuntime(runtimeRoot, platform, arch);
  if (!manifest.rendererEntry) throw new Error('Remotion component does not include its Renderer');
  mkdirSync(outputRoot, { recursive: true });
  const fileName = `Remotion-${version}-${platform}-${arch}.tar.gz`;
  const archive = join(outputRoot, fileName);
  rmSync(archive, { force: true });
  execFileSync('tar', ['-czf', archive, '-C', runtimeRoot, '.'], { timeout: 5 * 60_000, windowsHide: true, env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const descriptor = {
    version: 1, id: 'remotion', componentVersion: version,
    remotionVersion: manifest.remotionVersion, chromiumVersion: manifest.chromiumVersion,
    platform, arch, fileName,
    archiveUrl: `https://github.com/krillinai/OpenCreator/releases/download/v${version}/${fileName}`,
    archiveSha256: hashFile(archive), manifestSha256: hashFile(join(runtimeRoot, 'manifest.json')),
    bytes: statSync(archive).size
  };
  writeFileSync(join(outputRoot, 'remotion-component.json'), `${JSON.stringify(descriptor, null, 2)}\n`);
  return descriptor;
}
