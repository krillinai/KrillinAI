import { execFile } from 'node:child_process';
import type { CodexImageStatus } from '@opencreator/protocol';
import { readLocalCodexImageConfiguration, type LocalCodexImageConfiguration } from '../codex/local-provider.js';
import type { CodexNativeImageRuntime } from './provider.js';

export async function readCodexImageConfiguration(runtime: CodexNativeImageRuntime): Promise<LocalCodexImageConfiguration> {
  if (runtime.readProvider) return { authentication: 'api_key', provider: await runtime.readProvider() };
  return readLocalCodexImageConfiguration({ codexHome: runtime.codexHome });
}

export async function inspectCodexImageRuntime(runtime: CodexNativeImageRuntime | undefined): Promise<CodexImageStatus> {
  let authentication: CodexImageStatus['authentication'] = 'none';
  try {
    if (!runtime) throw new Error('当前 Runtime 未配置本机 Codex 生图，请检查 Runtime 配置');
    const configuration = await readCodexImageConfiguration(runtime);
    authentication = configuration.authentication;
    if (configuration.authentication === 'api_key') return {
      authentication, ready: true, executionMode: 'api', model: configuration.provider.model,
      message: '已检测到 Codex API 配置；将沿用当前接口生图，接口和模型需支持图片生成。'
    };
    if (!runtime.codexBin) throw new Error('当前 Runtime 缺少 Codex 可执行程序，无法使用 ChatGPT 登录态生图');
    const capability = runtime.checkNativeCapability
      ? await runtime.checkNativeCapability()
      : await probeNativeImageCapability(runtime.codexBin, runtime.codexHome);
    if (!capability.supported) throw new Error(`当前 Codex Runtime ${capability.version ?? ''} 不支持原生生图，请更新 Runtime`);
    return { authentication, ready: true, executionMode: 'native', version: capability.version,
      message: '已检测到本地 ChatGPT 登录凭据和原生生图工具；将通过 Codex 生成图片，无需额外配置图片 API Key。'
    };
  } catch (error) {
    return { authentication, ready: false, executionMode: null, message: error instanceof Error ? error.message : '无法检查 Codex 生图能力' };
  }
}

async function probeNativeImageCapability(codexBin: string, codexHome: string): Promise<{ supported: boolean; version?: string }> {
  const run = (args: string[]) => new Promise<string>((resolve, reject) => {
    execFile(codexBin, args, { timeout: 8_000, maxBuffer: 1024 * 1024, encoding: 'utf8', env: { ...process.env, CODEX_HOME: codexHome } }, (error, stdout) => {
      if (error) reject(new Error('无法启动 Codex Runtime 或读取原生生图能力，请检查可执行程序'));
      else resolve(stdout);
    });
  });
  const [features, version] = await Promise.all([run(['features', 'list']), run(['--version'])]);
  return { supported: /^image_generation\s+(?!removed\b)\S.*$/m.test(features), version: version.trim() };
}
