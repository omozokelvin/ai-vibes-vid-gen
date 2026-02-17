# Free AI Image Generation Options

Yes! There are **completely free** AI tools for generating images. This guide covers the best free options integrated into the system.

## 🆓 Pollinations.ai (RECOMMENDED - Already Integrated!)

**Status:** ✅ Working, completely free, no API key needed
**Quality:** Good (uses Stable Diffusion)
**Speed:** Fast (~5-10 seconds per image)
**Limits:** Unlimited (community-supported)

### Setup

Just add to your `.env`:
```bash
USE_FREE_AI=true
```

That's it! No API key, no signup, completely free.

### How It Works

Pollinations.ai provides a free API that generates images using Stable Diffusion models. The system automatically:
1. Encodes your prompt
2. Calls `https://image.pollinations.ai/prompt/{prompt}?width=1280&height=720`
3. Downloads the generated image
4. Converts it to video with FFmpeg zoom effects

### Example

**Prompt:** "A serene mountain landscape at sunset"
**Generated:** High-quality AI image automatically

## Other Free AI Options (Not Yet Integrated)

### 1. Stable Horde

**Status:** Free, community-run
**Quality:** Variable (depends on available workers)
**Speed:** Slow (~30-120 seconds)
**Limits:** No hard limits, but may queue during high usage

**Setup needed:**
- No API key required
- Would need to implement the API client
- Uses distributed community GPUs

**API:** https://stablehorde.net/

### 2. Craiyon (DALL-E Mini)

**Status:** Free
**Quality:** Lower than Stable Diffusion
**Speed:** Medium (~20-30 seconds)
**Limits:** No hard limits

**Setup needed:**
- No API key
- Would need to implement scraping or unofficial API

**Website:** https://www.craiyon.com/

### 3. Leonardo.ai Free Tier

**Status:** Free tier with daily credits
**Quality:** Excellent
**Speed:** Fast
**Limits:** 150 credits/day (~30-60 images)

**Setup needed:**
- Requires signup
- Free API key
- Would need implementation

**Website:** https://leonardo.ai/

## Comparison

| Service | Quality | Speed | API Key | Cost | Limits |
|---------|---------|-------|---------|------|--------|
| **Pollinations.ai** ✅ | Good | Fast | ❌ No | Free | None |
| Stable Horde | Variable | Slow | ❌ No | Free | Queue |
| Craiyon | Fair | Medium | ❌ No | Free | None |
| Leonardo.ai | Excellent | Fast | ✅ Yes | Free | 150/day |
| Replicate | Excellent | Fast | ✅ Yes | $0.003 | Pay-per-use |
| Hugging Face | N/A | N/A | ✅ Yes | Free | ❌ Deprecated |

## Current Implementation

The system automatically chooses the best available option:

1. **USE_FREE_AI=true** → Pollinations.ai (FREE)
2. **REPLICATE_API_TOKEN** → Replicate ($0.003/image)
3. **HUGGINGFACE_API_KEY** → Hugging Face (deprecated, returns 410)
4. **None** → Placeholder videos (blue with text)

## Setup for 100% Free AI Videos

Edit your `.env`:

```bash
# Application
PORT=4000
NODE_ENV=development

# FREE AI IMAGE GENERATION! 🎨
USE_FREE_AI=true

# Optional: Free Gemini for better scripts (15 req/min free tier)
GEMINI_API_KEY=your_free_gemini_key

# Redis (free local service)
REDIS_HOST=localhost
REDIS_PORT=6379

# File Storage
TEMP_DIR=./temp
DEBUG_DIR=./debug
```

## What You Get with Free AI

### Complete Video Generation Pipeline - 100% Free

1. **Script:** Template or Gemini AI (free tier)
2. **Images:** Pollinations.ai (Stable Diffusion, free)
3. **Videos:** FFmpeg converts images to videos with zoom effects
4. **Audio:** Edge-TTS (Microsoft's free TTS)
5. **Subtitles:** Generated from script
6. **Final Video:** Fully assembled MP4

### Sample Output Quality

**With Pollinations.ai (Free):**
- ✅ Real AI-generated images
- ✅ Professional-looking results
- ✅ Varied styles and scenes
- ✅ Ken Burns zoom effects
- ✅ Synced audio and subtitles

**Example prompts it handles well:**
- Landscapes and nature scenes
- Abstract concepts
- Cinematic shots
- Product visualizations
- Character portraits
- Historical scenes

## Testing Free AI Mode

### 1. Setup

```bash
# Copy the free config
cp .env.free .env

# Or manually edit .env
echo "USE_FREE_AI=true" >> .env
```

### 2. Start Server

```bash
npm run start:dev
```

You should see in logs:
```
[MediaService] Using Pollinations.ai (FREE) for image generation
```

### 3. Generate a Video

```bash
curl -X POST http://localhost:4000/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset over mountains with vibrant colors"
  }'
```

### 4. Check Status

```bash
curl http://localhost:4000/video/status/{jobId}
```

### 5. View Result

Check `temp/` directory for the final video with AI-generated images!

## Advanced: Using Multiple Free Services

You can create a hybrid approach:

```bash
# Mix free and paid
USE_FREE_AI=true              # Free images
GEMINI_API_KEY=your_key       # Free scripts (15/min limit)
```

Or rotate between services based on availability.

## Limitations of Free Services

### Pollinations.ai
- **Pros:** Unlimited, fast, good quality
- **Cons:**
  - Community-supported (could go down)
  - Less control over model/parameters
  - No NSFW filtering (use responsibly)

### General Free API Risks
- No SLA guarantees
- May experience downtime
- Rate limiting during high usage
- Quality varies

### When to Upgrade

Consider paid APIs for:
- 🏢 Commercial/business use
- 🎯 Consistent quality requirements
- ⚡ Guaranteed uptime/SLA
- 🎨 Advanced customization
- 📊 Analytics and reporting

## Cost Savings

**Free Mode:**
- 100 videos/day: **$0**
- 1000 videos/month: **$0**
- Unlimited: **$0**

**Paid Mode (Replicate):**
- 100 videos/day (3 images each): **$0.90/day** = **$27/month**
- 1000 videos/month: **$9/month** (with optimization)

**Savings:** $27-300/month depending on volume!

## Troubleshooting

### "Pollinations.ai timeout"
- Network issue or service down
- Falls back to placeholder automatically
- Try again in a few minutes

### "Images look different than expected"
- Pollinations uses community models
- Quality depends on current models deployed
- Try adjusting prompts for better results

### "Want even better quality"
- Use more descriptive prompts
- Add style keywords: "cinematic", "4k", "professional"
- Example: "cinematic shot of sunset, 4k, vibrant colors, professional photography"

## Future Free Options

Potential services to integrate:
- [ ] Stable Horde (slower but free)
- [ ] Leonardo.ai free tier (excellent quality, 150/day limit)
- [ ] Playground AI (free tier available)
- [ ] NightCafe free credits

Let us know which you'd like to see added!

## Summary

✅ **Pollinations.ai is the best free option right now**
- No API key needed
- Unlimited usage
- Good quality
- Already integrated!

Just set `USE_FREE_AI=true` in your `.env` and you're done! 🎉
