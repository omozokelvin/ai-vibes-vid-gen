# Local Image Generation with ComfyUI

Scene images for the video pipeline are generated **locally** with ComfyUI (free, no API costs). This replaces the paid/unreliable cloud providers that were previously used (Veo, Kling, Replicate, Hugging Face, Stable Horde).

## Architecture

```
Gemini (cloud)  ──▶ script + visual prompts
                          │
                          ▼
ComfyUI (local) ──▶ scene image (PNG)
                          │
                          ▼
FFmpeg (local)  ──▶ animated clip (MP4)  ──▶ EditorService assembles final video
```

## Install ComfyUI

1. Download ComfyUI: https://github.com/comfyanonymous/ComfyUI
2. Run it (it serves an API on `http://127.0.0.1:8188` by default)
3. Verify it is reachable:
   ```bash
   curl http://127.0.0.1:8188/system_stats
   ```

## Z-Image turbo model

1. In ComfyUI, open the **Model Manager** and install the `image_z_image_turbo` template (downloads ~19 GB: diffusion model + text encoder + VAE).
2. The template installs three separate files (Z-Image uses separate loaders, unlike an SDXL checkpoint):
   - `z_image_turbo_bf16.safetensors` → diffusion model
   - `qwen_3_4b.safetensors` → CLIP text encoder (type `qwen_image`)
   - `ae.safetensors` → VAE

## Environment variables

```dotenv
# .env
LOCAL_IMAGE_API_URL=http://127.0.0.1:8188
LOCAL_IMAGE_MODEL=z_image_turbo_bf16.safetensors
LOCAL_IMAGE_CLIP=qwen_3_4b.safetensors
LOCAL_IMAGE_VAE=ae.safetensors
```

- `LOCAL_IMAGE_API_URL` — ComfyUI **base URL** (no trailing slash). Setting this activates the `local` provider.
- `LOCAL_IMAGE_MODEL` — Z-Image diffusion model filename (default `z_image_turbo_bf16.safetensors`).
- `LOCAL_IMAGE_CLIP` — Z-Image text encoder filename (default `qwen_3_4b.safetensors`).
- `LOCAL_IMAGE_VAE` — Z-Image VAE filename (default `ae.safetensors`).

## How MediaService calls ComfyUI

The flow in `src/modules/media/media.service.ts` (`generateVideoFromImageLocal`):

1. **Submit** — `POST {base}/prompt` with a Z-Image turbo workflow graph (`buildZImageWorkflow`), returns a `prompt_id`.
2. **Poll** — `GET {base}/history/{prompt_id}` every 5s until `status.status_str === 'success'` (max 3 min).
3. **Download** — `GET {base}/view?filename=...&subfolder=...&type=output` returns the image bytes.
4. **Animate** — the image is converted to a clip with FFmpeg (`convertImageToVideo`, Ken Burns zoom).

The workflow graph uses: `UNETLoader` → `CLIPLoader` (type `qwen_image`) → `VAELoader` → two `CLIPTextEncode` (positive/negative) → `EmptySD3LatentImage` (1024x576) → `KSampler` (steps 4, cfg 1.0, euler/simple — turbo) → `VAEDecode` → `SaveImage`.

## Troubleshooting

| Symptom                              | Fix                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ComfyUI did not return a prompt_id` | ComfyUI isn't running or `LOCAL_IMAGE_API_URL` is wrong (use the base URL, not `/prompt`)                                                 |
| `ComfyUI job failed`                 | Check the ComfyUI console; the model filenames in `LOCAL_IMAGE_MODEL`/`LOCAL_IMAGE_CLIP`/`LOCAL_IMAGE_VAE` may not match what's installed |
| `ComfyUI job timed out`              | First generation loads the model (slow); raise the poll timeout or increase `steps` in `buildZImageWorkflow`                              |
| Placeholder clips appear             | The local call threw and fell back to `createPlaceholderVideo`; check the logs for the real error                                         |

## Fallback

If ComfyUI is unavailable, `MediaService` falls back to blue placeholder clips so the pipeline still completes (see `createPlaceholderVideo`).
