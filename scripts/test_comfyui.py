#!/usr/bin/env python3
"""End-to-end test of the Z-Image turbo workflow against the running ComfyUI.

Mirrors the exact workflow that MediaService.buildZImageWorkflow sends:
  UNETLoader -> CLIPLoader(qwen_image) -> VAELoader
  -> CLIPTextEncode x2 -> EmptySD3LatentImage -> KSampler(steps 4, cfg 1.0)
  -> VAEDecode -> SaveImage

Usage:
  python3 scripts/test_comfyui.py ["prompt"] [output.png]
"""
import json
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:8188"
PROMPT = sys.argv[1] if len(sys.argv) > 1 else "a cinematic sunset over a quiet ocean, 16:9, high detail"
OUT = sys.argv[2] if len(sys.argv) > 2 else "debug/comfyui_test.png"


def build_workflow(prompt, width=1024, height=576):
    seed = int(time.time() * 1000) % 1000000
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b.safetensors", "type": "qwen_image"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": "low quality, worst quality, blurry, distorted", "clip": ["2", 0]}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0],
            "seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0,
        }},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "comfyui_test"}},
    }


def post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def get(url):
    with urllib.request.urlopen(url, timeout=15) as r:
        return r.read()


def main():
    print("Submitting Z-Image turbo workflow...")
    resp = post(f"{BASE}/prompt", {"prompt": build_workflow(PROMPT)})
    pid = resp.get("prompt_id")
    if not pid:
        print("ERROR: no prompt_id:", resp)
        sys.exit(1)
    print("prompt_id:", pid)

    deadline = time.time() + 180
    while time.time() < deadline:
        time.sleep(5)
        hist = json.loads(get(f"{BASE}/history/{pid}"))
        entry = hist.get(pid)
        if not entry:
            continue
        status = entry.get("status", {}).get("status_str")
        print("status:", status)
        if status == "success":
            imgs = [img for out in entry.get("outputs", {}).values() for img in out.get("images", [])]
            if imgs:
                img = imgs[0]
                data = get(f"{BASE}/view?filename={img['filename']}&subfolder={img.get('subfolder', '')}&type={img.get('type', 'output')}")
                with open(OUT, "wb") as f:
                    f.write(data)
                print(f"OK saved image -> {OUT} ({len(data)} bytes)")
                return
        elif status == "error":
            print("ERROR:", json.dumps(entry.get("status", {}).get("messages", {}), indent=2))
            sys.exit(1)
    print("TIMEOUT waiting for ComfyUI")
    sys.exit(1)


if __name__ == "__main__":
    main()
