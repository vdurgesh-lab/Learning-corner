/* Learning Corner voice worker: runs the Kokoro voice model off the main thread so pages never freeze.
   Started by lc/voice.js. The model files come from Hugging Face once and the browser caches them. */
import { KokoroTTS } from './vendor/kokoro.web.js';

let tts = null;

self.onmessage = async ({ data: m }) => {
  if (m.type === 'init') {
    try {
      tts = await KokoroTTS.from_pretrained(m.model, {
        dtype: m.dtype,
        device: 'wasm',
        progress_callback: p => {
          if (p && (p.status === 'progress' || p.status === 'done' || p.status === 'initiate'))
            self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total, status: p.status });
        }
      });
      await tts.generate('Hello.', { voice: m.voice, speed: 1 }); // warm up, and fetch the voice file
      self.postMessage({ type: 'ready' });
    } catch (e) {
      self.postMessage({ type: 'error', msg: String((e && e.message) || e) });
    }
    return;
  }
  if (m.type === 'synth') {
    try {
      const a = await tts.generate(m.text, { voice: m.voice, speed: m.speed });
      const pcm = new Float32Array(a.audio); // a copy, so the library's buffer is never moved away
      self.postMessage({ type: 'audio', id: m.id, pcm, sr: a.sampling_rate || 24000 }, [pcm.buffer]);
    } catch (e) {
      self.postMessage({ type: 'audio', id: m.id, err: String((e && e.message) || e) });
    }
  }
};
