"""Telugu narration with Piper (offline). Reads te_sentences.json, writes 24 kHz PCM files and updates manifest.json['te']."""
import hashlib, json, os, sys
import numpy as np
from piper import PiperVoice, SynthesisConfig

LENGTH = float(os.environ.get("LENGTH", "1.12"))   # >1 = slower, clearer
voice = PiperVoice.load("models/te_IN-padmavathi-medium.onnx")
cfg = SynthesisConfig(length_scale=LENGTH, noise_scale=0.55, noise_w_scale=0.65)
os.makedirs("audio/cache", exist_ok=True)
beats = json.load(open("te_sentences.json", encoding="utf-8"))
manifest = json.load(open("manifest.json", encoding="utf-8")) if os.path.exists("manifest.json") else {"sr": 24000}
manifest["te"] = {}
n = 0
for b in beats:
    out = []
    for text in b["sentences"]:
        h = hashlib.md5(f"piper-padmavathi-{LENGTH}-{text}".encode()).hexdigest()
        f = f"audio/cache/te_{h}.pcm"
        if not os.path.exists(f):
            chunks = list(voice.synthesize(text, syn_config=cfg))
            sr = chunks[0].sample_rate
            a = np.concatenate([c.audio_int16_array for c in chunks]).astype(np.float32) / 32768.0
            gap = np.zeros(int(0.12 * sr), dtype=np.float32)
            a = np.concatenate([a, gap])
            t_old = np.arange(len(a)) / sr; t_new = np.arange(int(len(a) * 24000 / sr)) / 24000
            r = np.interp(t_new, t_old, a)
            (np.clip(r, -1, 1) * 32767).astype("<i2").tofile(f)
        out.append({"text": text, "file": f, "dur": os.path.getsize(f) / 2 / 24000})
        n += 1
        if n % 10 == 0: print(n, "sentences", flush=True)
    manifest["te"][b["id"]] = out
tmp = "manifest.json.tmp"; json.dump(manifest, open(tmp, "w", encoding="utf-8"), indent=1); os.replace(tmp, "manifest.json")
tot = sum(s["dur"] + 0.14 for v in manifest["te"].values() for s in v)
print("DONE te | sentences:", n, "| narration seconds:", round(tot))
