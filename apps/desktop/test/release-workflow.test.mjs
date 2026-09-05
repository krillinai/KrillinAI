import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const releaseWorkflow = readFileSync(
  resolve(process.cwd(), '../../.github/workflows/desktop-release.yml'),
  'utf8'
);
const ciWorkflow = readFileSync(
  resolve(process.cwd(), '../../.github/workflows/ci.yml'),
  'utf8'
);

describe('Desktop release workflow', () => {
  it('runs CI on demand and for pull requests without automatic push builds', () => {
    expect(ciWorkflow).toContain('workflow_dispatch:');
    expect(ciWorkflow).toContain('pull_request:');
    expect(ciWorkflow).not.toContain('\n  push:');
    expect(ciWorkflow).toContain('cancel-in-progress: true');
  });

  it('runs the network audit before expensive verification steps', () => {
    const auditCommand =
      'pnpm audit --audit-level high --ignore-registry-errors';
    expect(ciWorkflow).toContain(auditCommand);
    expect(ciWorkflow.indexOf(auditCommand)).toBeLessThan(
      ciWorkflow.indexOf('pnpm test')
    );
  });

  it('uses the release Environment and requires macOS signing secrets', () => {
    expect(releaseWorkflow).toContain('environment: release');
    expect(releaseWorkflow).toContain('name: 验证 macOS 正式签名凭据');
    expect(releaseWorkflow).toContain('secrets.MACOS_CERTIFICATE');
    expect(releaseWorkflow).toContain('secrets.MACOS_CERTIFICATE_PASSWORD');
    expect(releaseWorkflow).toContain('secrets.APPLE_ID');
    expect(releaseWorkflow).toContain('secrets.APPLE_APP_SPECIFIC_PASSWORD');
    expect(releaseWorkflow).toContain('secrets.APPLE_TEAM_ID');
    expect(releaseWorkflow).toContain(
      'release Environment 缺少 macOS 签名 Secret'
    );
  });

  it('builds signed macOS packages and unsigned Windows packages', () => {
    expect(releaseWorkflow).toContain("if: matrix.platform == 'darwin'");
    expect(releaseWorkflow).toContain('run: pnpm desktop:release');
    expect(releaseWorkflow).toContain("if: matrix.platform == 'win32'");
    expect(releaseWorkflow).toContain('run: pnpm desktop:dist');
    expect(releaseWorkflow).not.toContain('secrets.WINDOWS_CERTIFICATE');
    expect(releaseWorkflow).toContain(
      '"artifact":"opencreator-desktop-windows-x64-unsigned"'
    );
    expect(releaseWorkflow).not.toContain('WINDOWS-UNSIGNED.txt');
  });

  it('reuses the successful master CI instead of repeating all tests', () => {
    expect(releaseWorkflow).toContain('name: 校验同一提交的 CI 已通过');
    expect(releaseWorkflow).toContain('--workflow ci.yml');
    expect(releaseWorkflow).toContain('--event workflow_dispatch');
    expect(releaseWorkflow).toContain('--status success');
    expect(releaseWorkflow).toContain('先在 master 上运行 CI');
    expect(releaseWorkflow).not.toContain('run: pnpm test');
    expect(releaseWorkflow).not.toContain('run: pnpm typecheck');
    expect(releaseWorkflow).not.toContain('run: pnpm build');
  });

  it('cancels remaining platform builds after the first package failure', () => {
    expect(releaseWorkflow).toContain('fail-fast: true');
  });

  it('supports single-platform manual validation while tag releases build every platform', () => {
    expect(releaseWorkflow).toContain('target:');
    expect(releaseWorkflow).toContain('default: all');
    expect(releaseWorkflow).toContain("TARGET: ${{ inputs.target || 'all' }}");
    expect(releaseWorkflow).toContain(
      'matrix: ${{ fromJSON(needs.verify.outputs.matrix) }}'
    );
    expect(releaseWorkflow).toContain(
      '{"include":[{"name":"macos-x64"'
    );
    expect(releaseWorkflow).toContain(
      '{"include":[{"name":"windows-x64"'
    );
  });

  it('keeps build diagnostics separate from validated public release assets', () => {
    expect(releaseWorkflow).toContain(
      'opencreator-desktop-build-manifest-${{ matrix.platform }}-${{ matrix.arch }}.json'
    );
    expect(releaseWorkflow).toContain('pattern: opencreator-desktop-*');
    expect(releaseWorkflow).toContain('merge-multiple: true');
    expect(releaseWorkflow).toContain('name: desktop-build-diagnostics-${{ matrix.name }}');
    expect(releaseWorkflow).toContain('path: ${{ env.OPENCREATOR_DESKTOP_RELEASE_ASSETS }}/*');
    expect(releaseWorkflow).toContain('release-assets.mjs artifacts');
    expect(releaseWorkflow).not.toContain('apps/desktop/release/*.exe');
    expect(releaseWorkflow).not.toContain('apps/desktop/release/krillinai-*');
    expect(releaseWorkflow).toContain('--verify-tag --draft');
    expect(releaseWorkflow).toContain('--draft=false --latest');
  });

  it('invalidates the Desktop cache when Creator Runtime releases change', () => {
    expect(releaseWorkflow).toContain(
      "'apps/desktop/scripts/creator-runtime-releases.mjs'"
    );
    expect(releaseWorkflow).toContain(
      "'apps/desktop/packaging/daemon-runtime/pnpm-lock.yaml'"
    );
  });
});
