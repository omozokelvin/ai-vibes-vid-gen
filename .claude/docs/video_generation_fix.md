# Video Generation Fix - ESM to Image-to-Video Approach

## Problem

The original implementation used `@gradio/client` (ESM-only package) which had compatibility issues with NestJS's CommonJS compilation, causing "Cannot find module" errors.

## Solution

Completely removed `@gradio/client` dependency and implemented a more reliable approach:

### New Approach: Text-to-Image → Video Conversion

**Instead of:** Text-to-Video models (unreliable, often unavailable)
**Now uses:**

1. **Text-to-Image** via Hugging Face Inference API (Stable Diffusion)
2. **Image-to-Video** conversion with FFmpeg zoom/pan effects

### Why This Works Better

1. **No ESM/CommonJS Issues**
   - Uses only `axios` for HTTP calls (no problematic ESM imports)
   - All code is pure CommonJS-compatible

2. **More Reliable APIs**
   - Stable Diffusion models are widely available and maintained
   - Hugging Face Inference API has better uptime than Spaces
   - Text-to-image is faster and more stable than text-to-video

3. **Better Free Tier Support**
   - Stable Diffusion models work well on free tier
   - No need for Gradio Spaces authentication
   - Simpler API calls with better error handling

4. **Enhanced Visuals**
   - FFmpeg zoom/pan effects create dynamic videos from static images
   - Ken Burns effect makes images more engaging
   - Consistent video quality

## Technical Changes

### Removed

- `@gradio/client` package dependency
- All Gradio-related code (`loadGradioClient`, `getSpaceInputs`, etc.)
- Hugging Face Spaces configuration
- `pathToFileURL` imports
- ESM dynamic import logic

### Added

- `generateVideoFromImage()` - Generates image via Hugging Face, converts to video
- `convertImageToVideo()` - FFmpeg zoom/pan effect (Ken Burns style)
- Simplified error handling with better logging

### Updated Environment Variables

**New:**

```bash
HUGGINGFACE_IMAGE_MODEL=stabilityai/stable-diffusion-2-1
```

**Removed (no longer needed):**

- `HUGGINGFACE_VIDEO_PROVIDER`
- `HUGGINGFACE_SPACE_NAME`
- `HUGGINGFACE_SPACE_ENDPOINT`
- `HUGGINGFACE_SPACE_INPUTS`
- `HUGGINGFACE_VIDEO_MODEL` (replaced with `HUGGINGFACE_IMAGE_MODEL`)

## Video Generation Flow

### Before

```
Prompt → Hugging Face Space (via @gradio/client) → Video
            ↓ (often fails with ESM errors)
        Placeholder
```

### After

```
Prompt → Hugging Face Inference API → Image
            ↓
         FFmpeg (zoom/pan effect) → Video
            ↓ (if fails)
         Placeholder
```

## FFmpeg Zoom Effect

The new implementation creates engaging videos with a slow zoom effect:

```
zoompan=z='min(zoom+0.0015,1.5)':d=125:s=1280x720
```

- Starts at normal zoom
- Gradually zooms to 1.5x over the video duration
- Creates a Ken Burns documentary-style effect
- 25 fps for smooth motion

## Benefits

✅ **Reliability**: No ESM/CommonJS conflicts
✅ **Performance**: Faster image generation vs video
✅ **Cost**: Better free tier support
✅ **Quality**: Controlled zoom effects look professional
✅ **Maintainability**: Simpler codebase, fewer dependencies
✅ **Error Handling**: Clear fallbacks at each step

## Alternative Models

You can use other Stable Diffusion models:

```bash
# Fast model
HUGGINGFACE_IMAGE_MODEL=runwayml/stable-diffusion-v1-5

# Original Stable Diffusion
HUGGINGFACE_IMAGE_MODEL=CompVis/stable-diffusion-v1-4

# Stable Diffusion 2.1 (default, best quality)
HUGGINGFACE_IMAGE_MODEL=stabilityai/stable-diffusion-2-1
```

## Testing

Build succeeds:

```bash
npm run build ✅
```

No more errors:

- ❌ "Cannot find module '@gradio/client'"
- ❌ "No 'exports' main defined"
- ✅ Clean build with no ESM issues

## Files Modified

1. [media.service.ts](../../src/modules/media/media.service.ts) - Complete rewrite
2. [.env.example](../../.env.example) - Updated configuration
3. [package.json](../../package.json) - Removed @gradio/client

## Migration Notes

If you were using Hugging Face Spaces:

1. Set `HUGGINGFACE_IMAGE_MODEL` instead of `HUGGINGFACE_VIDEO_MODEL`
2. Remove Space-related environment variables
3. Your `HUGGINGFACE_API_KEY` still works the same way
4. Videos will now have zoom effects instead of direct video generation

## Future Enhancements

Possible improvements:

- Add different pan/zoom patterns (left-to-right, zoom-out, etc.)
- Support for multiple images per scene
- Crossfade transitions between clips
- Custom FFmpeg filter configurations via environment variables
