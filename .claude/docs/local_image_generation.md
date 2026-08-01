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

## SDXL model

1. Download the SDXL checkpoint (`sd_xl_base_1.0.safetensors`) from Civitai or Hugging Face
2. Place it in `ComfyUI/models/checkpoints/`

## Environment variables

```dotenv
# .env
LOCAL_IMAGE_API_URL=http://127.0.0.1:8188
LOCAL_IMAGE_MODEL=sd_xl_base_1.0.safetensors
```

- `LOCAL_IMAGE_API_URL` — ComfyUI **base URL** (no trailing slash). Setting this activates the `local` provider.
- `LOCAL_IMAGE_MODEL` — checkpoint filename as it appears in `ComfyUI/models/checkpoints/`.

## How MediaService calls ComfyUI

The flow in `src/modules/media/media.service.ts` (`generateVideoFromImageLocal`):

1. **Submit** — `POST {base}/prompt` with an SDXL workflow graph (`buildSdxlWorkflow`), returns a `prompt_id`.
2. **Poll** — `GET {base}/history/{prompt_id}` every 5s until `status.status_str === 'success'` (max 3 min).
3. **Download** — `GET {base}/view?filename=...&subfolder=...&type=output` returns the image bytes.
4. **Animate** — the image is converted to a clip with FFmpeg (`convertImageToVideo`, Ken Burns zoom).

The workflow graph uses: `CheckpointLoaderSimple` → two `CLIPTextEncode` (positive/negative) → `EmptyLatentImage` (1024x576) → `KSampler` → `VAEDecode` → `SaveImage`.

## Troubleshooting

| Symptom                              | Fix                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `ComfyUI did not return a prompt_id` | ComfyUI isn't running or `LOCAL_IMAGE_API_URL` is wrong (use the base URL, not `/prompt`)         |
| `ComfyUI job failed`                 | Check the ComfyUI console; the checkpoint name in `LOCAL_IMAGE_MODEL` may not match               |
| `ComfyUI job timed out`              | SDXL on CPU/limited VRAM is slow; raise the poll timeout or reduce steps in `buildSdxlWorkflow`   |
| Placeholder clips appear             | The local call threw and fell back to `createPlaceholderVideo`; check the logs for the real error |

## Fallback

If ComfyUI is unavailable, `MediaService` falls back to blue placeholder clips so the pipeline still completes (see `createPlaceholderVideo`).
