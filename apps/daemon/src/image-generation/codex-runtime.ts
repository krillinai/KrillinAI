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
    if (!runtime) throw new Error('Local Codex image generation is not configured. Check Runtime settings.');
    const configuration = await readCodexImageConfiguration(runtime);
    authentication = configuration.authentication;
    if (configuration.authentication === 'api_key') return {
      authentication, ready: true, executionMode: 'api', model: configuration.provider.model,
      message: 'Codex API configuration was found. Image generation will use this API; both the API and model must support it.'
    };
    if (!runtime.codexBin) throw new Error('The Codex executable is missing. Image generation with ChatGPT sign-in is unavailable.');
    const capability = runtime.checkNativeCapability
      ? await runtime.checkNativeCapability()
      : await probeNativeImageCapability(runtime.codexBin, runtime.codexHome);
    if (!capability.supported) throw new Error(`Codex Runtime ${capability.version ?? ''} does not support native image generation. Update the Runtime.`);
    return { authentication, ready: true, executionMode: 'native', version: capability.version,
      message: 'Local ChatGPT credentials and native image tools were found. Codex will generate images without an additional image API key.'
    };
  } catch (error) {
    return { authentication, ready: false, executionMode: null, message: error instanceof Error ? error.message : 'Could not check Codex image capabilities' };
  }
}

async function probeNativeImageCapability(codexBin: string, codexHome: string): Promise<{ supported: boolean; version?: string }> {
  const run = (args: string[]) => new Promise<string>((resolve, reject) => {
    execFile(codexBin, args, { timeout: 8_000, maxBuffer: 1024 * 1024, encoding: 'utf8', env: { ...process.env, CODEX_HOME: codexHome } }, (error, stdout) => {
      if (error) reject(new Error('Could not start Codex or read native image capabilities. Check the executable.'));
      else resolve(stdout);
    });
  });
  const [features, version] = await Promise.all([run(['features', 'list']), run(['--version'])]);
  return { supported: /^image_generation\s+(?!removed\b)\S.*$/m.test(features), version: version.trim() };
}
