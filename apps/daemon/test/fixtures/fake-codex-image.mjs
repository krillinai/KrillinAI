import { mkdir, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const mode = process.env.TEST_CODEX_IMAGE_MODE ?? 'success';
const threadId = process.env.TEST_CODEX_IMAGE_THREAD ?? 'image-test-thread';
const emit = event => process.stdout.write(`${JSON.stringify(event)}\n`);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');

if (args[0] === 'features') {
  process.stdout.write('image_generation stable true\n');
  process.exit(0);
}
if (args.includes('--version')) {
  process.stdout.write('codex-test 0.149.0\n');
  process.exit(0);
}
if (args[0] === 'login' && args[1] === 'status') {
  process.stderr.write('Logged in using ChatGPT\n');
  process.exit(0);
}

if (!args.includes('--ignore-user-config') || !args.includes('image_generation') || process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL || process.env.CODEX_API_KEY || process.env.CODEX_ACCESS_TOKEN) {
  emit({ type: 'error', message: 'Authentication or tool isolation failed' });
  process.exitCode = 1;
} else {
  for await (const chunk of process.stdin) {
    if (!chunk.length) throw new Error('missing prompt');
  }
  emit({ type: 'thread.started', thread_id: threadId });
  emit({ type: 'turn.started' });
  if (mode === 'recovered') emit({ type: 'error', message: 'Reconnecting... 1/5' });
  if (process.env.TEST_CODEX_IMAGE_DELAY_MS) await new Promise(resolve => setTimeout(resolve, Number(process.env.TEST_CODEX_IMAGE_DELAY_MS)));
  if (mode === 'waiting') {
    setInterval(() => {}, 1000);
  } else if (mode === 'failure') {
    emit({ type: 'turn.failed', error: { message: '401 expired access_token=private-oauth-secret' } });
    process.exitCode = 1;
  } else if (mode === 'text-only') {
    emit({ type: 'item.completed', item: { type: 'agent_message', text: 'An image has been generated' } });
    emit({ type: 'turn.completed' });
  } else if (mode === 'missing-reference' || mode === 'missing-reference-stderr') {
    if (mode === 'missing-reference') emit({ type: 'item.completed', item: { type: 'agent_message', text: '无法生成：当前会话中没有可用的已上传人物照片。请重新上传照片后再次发送请求。 token=private-oauth-secret' } });
    else process.stderr.write('ERROR codex_core::tools::router: requested the last 1 conversation images, but only 0 were available\n');
    emit({ type: 'turn.completed' });
  } else if (mode === 'quota') {
    emit({ type: 'item.completed', item: { type: 'image_generation', status: 'failed', failure: { type: 'usageLimitExceeded', limitId: 'test-limit', resetsAt: null } } });
    emit({ type: 'turn.completed' });
  } else {
    const directory = mode === 'home' || mode === 'other-thread'
      ? join(process.env.CODEX_HOME, 'generated_images', mode === 'other-thread' ? 'another-thread' : threadId)
      : mode === 'outside' || mode === 'symlink' ? process.env.TEST_CODEX_IMAGE_OUTSIDE : join(process.cwd(), 'output');
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'image.png');
    await writeFile(path, mode === 'invalid' ? Buffer.from('not an image') : png);
    if (mode === 'old') await utimes(path, new Date(0), new Date(0));
    const outputPath = mode === 'symlink' ? join(process.cwd(), 'output', 'linked.png') : path;
    if (mode === 'symlink') await symlink(path, outputPath);
    if (mode !== 'cli-only') emit({ type: 'item.completed', item: { type: 'image_generation', status: 'completed', ...(mode === 'home' || mode === 'other-thread' ? {} : { saved_path: outputPath }) } });
    else emit({ type: 'item.completed', item: { type: 'agent_message', text: 'Saved the generated image.' } });
    emit({ type: 'turn.completed' });
  }
}
