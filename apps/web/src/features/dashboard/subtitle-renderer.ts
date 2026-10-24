import JASSUB from 'jassub';
import workerUrl from 'jassub/dist/worker/worker.js?worker&url';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';

class CompositionRenderer extends JASSUB {
  override async resize(forceRepaint = false, width = 0, height = 0) {
    width ||= this._videoWidth || this._canvas.width;
    height ||= this._videoHeight || this._canvas.height;
    // FFmpeg supplies the output frame as libass's storage size. JASSUB's
    // canvas-only default supplies zero, which scales blur and shadows
    // differently. Keep both paths in the same video coordinate system.
    await this.renderer._resizeCanvas(width, height, width, height);
    if (this._lastDemandTime) await this._demandRender(forceRepaint);
  }
}

export async function createSubtitleRenderer(canvas: HTMLCanvasElement, ass: string, fonts: Uint8Array[], width: number, height: number) {
  canvas.width = width;
  canvas.height = height;
  const renderer = new CompositionRenderer({ canvas, subContent: ass, fonts, defaultFont: 'OpenCreator Sans Bold', queryFonts: false,
    workerUrl, wasmUrl, modernWasmUrl });
  try {
    await renderer.ready;
    await renderer.resize(false, width, height);
    return renderer;
  } catch (error) { await renderer.destroy().catch(() => {}); throw error; }
}
