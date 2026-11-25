"""Make the pre-recorded voice clips for sentences that never change.

The Learning Corner natural voice (lc/voice.js) makes speech in the browser. Sentences listed in
lc/voice-clips/sentences.json are made here once instead, with the same Kokoro model and "Heart" voice,
so they play instantly. Run again whenever that list changes.

  pip install kokoro-onnx soundfile
  # model files: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
  #   kokoro-v1.0.int8.onnx and voices-v1.0.bin
  python tools/make_voice_clips.py --model kokoro-v1.0.int8.onnx --voices voices-v1.0.bin --speed 0.85
  python tools/make_voice_clips.py --model kokoro-v1.0.int8.onnx --voices voices-v1.0.bin --speed 0.95
Needs ffmpeg on the PATH. Writes lc/voice-clips/<85|95>/<code>.mp3 and updates lc/voice-clips/manifest.json.
"""
import argparse, json, os, subprocess, tempfile
import numpy as np, soundfile as sf, onnxruntime as ort
from kokoro_onnx import Kokoro

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lc', 'voice-clips')

def code(tag, text):
    """FNV-1a 32-bit hash of 'tag|text' (UTF-8), 8 hex digits. lc/voice.js computes the same."""
    h = 0x811c9dc5
    for b in f'{tag}|{text}'.encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xffffffff
    return f'{h:08x}'

def trim(x, sr, th=.004):
    idx = np.where(np.abs(x) > th)[0]
    if not len(idx): return x
    pad = int(.04 * sr)
    return x[max(0, idx[0] - pad):min(len(x), idx[-1] + pad)]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True); ap.add_argument('--voices', required=True)
    ap.add_argument('--speed', type=float, default=.85); ap.add_argument('--voice', default='af_heart')
    ap.add_argument('--threads', type=int, default=1); ap.add_argument('--part', default='0/1')
    a = ap.parse_args()
    tag = str(round(a.speed * 100))
    so = ort.SessionOptions(); so.intra_op_num_threads = a.threads
    K = Kokoro.from_session(ort.InferenceSession(a.model, so, providers=['CPUExecutionProvider']), a.voices)
    sents = json.load(open(os.path.join(ROOT, 'sentences.json'), encoding='utf-8'))
    k, n = map(int, a.part.split('/'))
    out = os.path.join(ROOT, tag); os.makedirs(out, exist_ok=True)
    for i, s in enumerate(sents):
        if i % n != k: continue
        f = os.path.join(out, code(tag, s) + '.mp3')
        if os.path.exists(f): continue
        x, sr = K.create(s, voice=a.voice, speed=a.speed, lang='en-us')
        x = trim(x.astype(np.float32), sr)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t: tmp = t.name
        sf.write(tmp, x, sr)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp, '-ac', '1', '-b:a', '48k', f], check=True)
        os.remove(tmp)
    # manifest: which sentence codes exist for each speed
    man = {'voice': a.voice, 'model': 'Kokoro-82M v1.0 int8', 'speeds': {}}
    for t in sorted(os.listdir(ROOT)):
        d = os.path.join(ROOT, t)
        if os.path.isdir(d): man['speeds'][t] = sorted(x[:-4] for x in os.listdir(d) if x.endswith('.mp3'))
    json.dump(man, open(os.path.join(ROOT, 'manifest.json'), 'w'), separators=(',', ':'))

if __name__ == '__main__':
    main()
