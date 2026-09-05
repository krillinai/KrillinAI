import {
  readPrivateJsonFile,
  writePrivateJsonFile
} from './private-json-file.js';

export type OpenCreatorCredentialsDocument = {
  version: 1;
  creatorServices?: Record<string, string>;
  codexProvider?: {
    apiKey: string;
  };
};

const updateQueues = new Map<string, Promise<void>>();

export async function readOpenCreatorCredentials(
  path: string
): Promise<OpenCreatorCredentialsDocument> {
  const value = await readPrivateJsonFile(path);
  if (!isRecord(value) || value.version !== 1) return { version: 1 };
  return {
    version: 1,
    ...(isStringRecord(value.creatorServices)
      ? { creatorServices: value.creatorServices }
      : {}),
    ...(isRecord(value.codexProvider) && typeof value.codexProvider.apiKey === 'string'
      ? { codexProvider: { apiKey: value.codexProvider.apiKey } }
      : {})
  };
}

export function updateOpenCreatorCredentials(
  path: string,
  update: (
    document: OpenCreatorCredentialsDocument
  ) => OpenCreatorCredentialsDocument
): Promise<OpenCreatorCredentialsDocument> {
  let result: OpenCreatorCredentialsDocument | undefined;
  const queued = (updateQueues.get(path) ?? Promise.resolve())
    .then(async () => {
      result = update(await readOpenCreatorCredentials(path));
      await writePrivateJsonFile(path, result);
    });
  updateQueues.set(path, queued.then(() => undefined, () => undefined));
  return queued.then(() => result!);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value)
    && Object.values(value).every(candidate => typeof candidate === 'string');
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
