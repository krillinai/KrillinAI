import { spawnSync } from 'node:child_process';

const defaultPollIntervalMs = 15_000;
const defaultMaxPolls = 120;

export async function submitAndWaitForNotarization(
  filePath,
  credentialArgs,
  options = {}
) {
  const runJson = options.runJson ?? runNotarytoolJson;
  const wait = options.delay ?? delay;
  const logger = options.logger ?? console.log;
  const pollIntervalMs = options.pollIntervalMs ?? defaultPollIntervalMs;
  const maxPolls = options.maxPolls ?? defaultMaxPolls;
  const submission = runJson([
    'submit',
    filePath,
    ...credentialArgs,
    '--output-format',
    'json'
  ], 15 * 60_000);
  if (typeof submission.id !== 'string' || submission.id.length === 0) {
    throw new Error('Apple notarization submission did not return an ID');
  }

  const id = submission.id;
  logger(`[desktop-package] Apple 公证已提交：${id}`);
  let transientFailures = 0;
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    let info;
    try {
      info = runJson([
        'info',
        id,
        ...credentialArgs,
        '--output-format',
        'json'
      ], 2 * 60_000);
      transientFailures = 0;
    } catch (error) {
      transientFailures += 1;
      if (transientFailures >= 3) throw error;
      logger(
        `[desktop-package] Apple 公证状态查询失败，准备重试：`
        + `${transientFailures}/3`
      );
      await wait(pollIntervalMs);
      continue;
    }

    if (info.status === 'Accepted') {
      logger(`[desktop-package] Apple 公证已通过：${id}`);
      return { id, status: info.status };
    }
    if (info.status !== 'In Progress') {
      const log = tryReadNotarizationLog(runJson, id, credentialArgs);
      throw new Error(formatNotarizationFailure(id, info, log));
    }
    if (attempt < maxPolls) {
      logger(
        `[desktop-package] Apple 公证处理中：${id} `
        + `(${attempt}/${maxPolls})`
      );
      await wait(pollIntervalMs);
    }
  }

  throw new Error(
    `Apple notarization timed out while waiting for submission ${id}`
  );
}

function tryReadNotarizationLog(runJson, id, credentialArgs) {
  try {
    return runJson([
      'log',
      id,
      ...credentialArgs,
      '--output-format',
      'json'
    ], 2 * 60_000);
  } catch {
    return undefined;
  }
}

function formatNotarizationFailure(id, info, log) {
  const summary = log?.statusSummary
    ?? info.statusSummary
    ?? info.message
    ?? info.status
    ?? 'unknown status';
  const issues = Array.isArray(log?.issues)
    ? log.issues.slice(0, 10).map(issue => (
        `${issue.path ?? '<unknown path>'}: `
        + `${issue.message ?? '<unknown issue>'}`
      ))
    : [];
  return [
    `Apple notarization failed for submission ${id}: ${summary}`,
    ...issues
  ].join('\n');
}

function runNotarytoolJson(args, timeout) {
  const result = spawnSync('xcrun', ['notarytool', ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout
  });
  if (result.error) throw result.error;
  const stdout = result.stdout?.trim() ?? '';
  const stderr = result.stderr?.trim() ?? '';
  if (result.status !== 0) {
    throw new Error(
      `Apple notarytool command failed with exit ${String(result.status)}: `
      + [stdout, stderr].filter(Boolean).join('\n')
    );
  }
  const output = stdout || stderr;
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Apple notarytool returned invalid JSON: ${output}`);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
