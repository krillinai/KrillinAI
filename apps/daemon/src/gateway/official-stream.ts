// Preserve model output while replacing upstream operational errors with product-facing text.
export function officialEventStream(stream: ReadableStream<Uint8Array>, onError?: (error: unknown) => void | Promise<void>, onComplete?: () => void | Promise<void>, operation = 'responses') {
  const decoder = new TextDecoder(); const encoder = new TextEncoder(); let buffered = '';
  let failed = false;
  let completed = false;
  async function complete() {
    if (failed || completed) return;
    completed = true;
    try { await onComplete?.(); } catch {}
  }
  async function sanitize(frame: string) {
    const lines: string[] = [];
    for (let line of frame.split('\n')) {
      if (!line.startsWith('data:')) { lines.push(line); continue; }
      if (line.slice(5).trim() === '[DONE]') {
        if (operation === 'chat/completions') await complete();
        lines.push(line); continue;
      }
      try {
        const value = JSON.parse(line.slice(5)) as { type?: string; message?: string; error?: unknown; response?: { error?: unknown; status?: string } };
        const error = value.error ?? value.response?.error ?? (value.type === 'error' ? value : undefined);
        if (error || ['response.failed', 'response.incomplete'].includes(value.type ?? '')
          || ['failed', 'incomplete', 'cancelled'].includes(value.response?.status ?? '')) failed = true;
        if (error) { try { await onError?.(error); } catch {} }
        if (operation === 'responses' && value.type === 'response.completed' && value.response?.status === 'completed') await complete();
        if (value.type === 'error') { lines.push(`data: ${JSON.stringify({ type: 'error', error: { code: 'official_service_unavailable', message: 'The official model service is unavailable' } })}`); continue; }
        if (value.error) value.error = { code: 'official_service_unavailable', message: 'The official model service is unavailable' };
        if (value.response?.error) value.response.error = { code: 'official_service_unavailable', message: 'The official model service is unavailable' };
        line = `data: ${JSON.stringify(value)}`;
      } catch {}
      lines.push(line);
    }
    return lines.join('\n');
  }
  return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      buffered += decoder.decode(chunk, { stream: true });
      buffered = buffered.replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffered.indexOf('\n\n')) >= 0) { controller.enqueue(encoder.encode(await sanitize(buffered.slice(0, boundary)) + '\n\n')); buffered = buffered.slice(boundary + 2); }
      if (buffered.length > 1024 * 1024) throw new Error('Official event exceeds the supported size');
    },
    async flush(controller) { buffered += decoder.decode(); if (buffered) controller.enqueue(encoder.encode(await sanitize(buffered))); }
  }));
}
