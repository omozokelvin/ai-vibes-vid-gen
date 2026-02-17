# Hugging Face Image Models for Video Generation

This document lists working image generation models for the AI Vibes Video Generation system.

## How It Works

The system generates images using Hugging Face's Inference API, then converts them to videos with FFmpeg zoom/pan effects.

## Recommended Models (Free Tier)

### 1. **runwayml/stable-diffusion-v1-5** (Default)
- **Status:** ✅ Usually available
- **Quality:** Good
- **Speed:** Fast (~5-10 seconds)
- **Best for:** General use, reliable
```bash
HUGGINGFACE_IMAGE_MODEL=runwayml/stable-diffusion-v1-5
```

### 2. **prompthero/openjourney**
- **Status:** ✅ Usually available
- **Quality:** Artistic, MidJourney-style
- **Speed:** Fast (~5-10 seconds)
- **Best for:** Artistic/stylized images
```bash
HUGGINGFACE_IMAGE_MODEL=prompthero/openjourney
```

### 3. **CompVis/stable-diffusion-v1-4**
- **Status:** ✅ Usually available
- **Quality:** Good (original SD)
- **Speed:** Fast (~5-10 seconds)
- **Best for:** Reliability, classic Stable Diffusion
```bash
HUGGINGFACE_IMAGE_MODEL=CompVis/stable-diffusion-v1-4
```

### 4. **stabilityai/stable-diffusion-xl-base-1.0** (SDXL)
- **Status:** ⚠️ May require loading time
- **Quality:** Excellent (best quality)
- **Speed:** Slower (~20-30 seconds)
- **Best for:** High-quality images (if available)
```bash
HUGGINGFACE_IMAGE_MODEL=stabilityai/stable-diffusion-xl-base-1.0
```

### 5. **black-forest-labs/FLUX.1-schnell**
- **Status:** ⚠️ Newer model, availability varies
- **Quality:** Excellent
- **Speed:** Fast (optimized)
- **Best for:** Modern, high-quality generation
```bash
HUGGINGFACE_IMAGE_MODEL=black-forest-labs/FLUX.1-schnell
```

## Models to Avoid (Currently Deprecated)

❌ **stabilityai/stable-diffusion-2-1** - Returns 410 (endpoint removed)
❌ **stabilityai/stable-diffusion-2** - May not be available
❌ **damo-vilab/text-to-video-ms-1.7b** - Old video model, unreliable

## Common API Errors

### 410 - Endpoint No Longer Available
The model has been deprecated or moved. Try a different model from the recommended list above.

### 503 - Model Loading
The model is being loaded into memory. This usually takes 20-60 seconds. You can:
- Wait and retry the request
- Use a different model
- System will automatically use placeholder videos

### 401 - Authentication Failed
Your `HUGGINGFACE_API_KEY` is invalid or missing. Get a free API key at:
https://huggingface.co/settings/tokens

### 429 - Rate Limited
You've exceeded the free tier rate limit. Wait a few minutes or:
- Upgrade to Hugging Face Pro
- Use a different API key
- System will use placeholder videos

## Testing Models

You can test if a model is available:

```bash
curl -X POST \
  "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inputs":"a cat on a table"}' \
  --output test.png
```

If successful, you'll get an image. If you get a 410 or 404, the model isn't available.

## Fallback Strategy

The system automatically falls back to placeholder videos if:
1. No `HUGGINGFACE_API_KEY` is set
2. API returns any error (410, 503, 401, etc.)
3. Network issues occur

**Placeholder videos:**
- Blue background with prompt text
- Same duration as requested
- No API calls required

## Alternative: Use Placeholders Only

If you don't want to use Hugging Face at all:

1. Don't set `HUGGINGFACE_API_KEY` in `.env`
2. System will always use placeholder videos
3. Faster, no API dependencies, no costs

## Switching Models

To change models:

1. Update `.env`:
   ```bash
   HUGGINGFACE_IMAGE_MODEL=prompthero/openjourney
   ```

2. Restart the server:
   ```bash
   npm run start:dev
   ```

3. New video generation requests will use the new model

## Model Selection Tips

**For Production:**
- Use `runwayml/stable-diffusion-v1-5` (most reliable)
- Have fallback to placeholders enabled

**For Best Quality:**
- Try `stabilityai/stable-diffusion-xl-base-1.0` (SDXL)
- Accept longer generation times

**For Artistic Style:**
- Use `prompthero/openjourney`
- Creates MidJourney-style images

**For Testing:**
- Don't set API key, use placeholders
- Faster iteration during development

## Getting a Free API Key

1. Go to https://huggingface.co/join
2. Sign up for a free account
3. Go to https://huggingface.co/settings/tokens
4. Create a new token (read access is enough)
5. Add to `.env`:
   ```bash
   HUGGINGFACE_API_KEY=hf_YourTokenHere
   ```

## Free Tier Limits

Hugging Face Inference API (free tier):
- Rate limit: ~100 requests/hour
- Concurrent requests: 1-2
- Model loading time: 20-60 seconds (cold start)
- Good for: Testing, small projects, demos

For production with high volume:
- Consider Hugging Face Pro ($9/month)
- Or use Replicate API (pay-per-use)
- Or self-host models with GPU

## Troubleshooting

**Problem:** All models return 410
- **Solution:** Hugging Face might be deprecating older Inference API. Check Hugging Face status page or use placeholder videos.

**Problem:** Model takes too long to load
- **Solution:** Wait 60 seconds, or use a smaller model like `CompVis/stable-diffusion-v1-4`

**Problem:** Images don't match prompts well
- **Solution:** Try different models. SDXL models generally have better prompt following.

**Problem:** Want to avoid API costs
- **Solution:** Remove `HUGGINGFACE_API_KEY` from `.env` to use placeholder videos only
