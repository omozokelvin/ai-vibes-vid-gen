# AI Vibes Video Generation

AI-powered video generation system using free APIs and NestJS. This application generates videos from text prompts using AI for script generation, video creation, audio synthesis, and optional social media distribution.

## Features

- **🎬 Script Generation**: Uses Google Gemini API (free tier) to generate video scripts and visual prompts
- **🎥 Video Generation**: Leverages Hugging Face Inference API for text-to-video generation
- **🎙️ Audio Synthesis**: Uses Edge-TTS (Microsoft Edge's free TTS) for high-quality voice narration
- **📝 Subtitle Generation**: Automatically creates synchronized subtitles (.srt format)
- **🎞️ Video Assembly**: Uses FFMPEG to stitch audio, video, and subtitles together
- **📤 Social Distribution**: Upload to YouTube and TikTok (with proper API credentials)
- **⚡ Async Processing**: BullMQ queue system for non-blocking video generation
- **🐛 Debug Mode**: Saves all intermediate assets for debugging

## Architecture

The application follows a modular architecture with 5 core modules:

1. **ScriptModule**: Generates scripts and visual prompts using AI
2. **MediaModule**: Creates video clips, audio, and subtitles
3. **EditorModule**: Assembles all media into a final video
4. **PublisherModule**: Handles uploads to YouTube and TikTok
5. **FilesystemModule**: Manages local file storage and debugging

## Prerequisites

- Node.js (v18 or higher)
- Redis (for BullMQ)
- FFMPEG (with libx264 and aac support)
- edge-tts (Microsoft Edge TTS)

### Installing Prerequisites

```bash
# Install FFMPEG
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Install edge-tts
pip install edge-tts
```

## Installation

1. Clone the repository:

```bash
git clone https://github.com/omozokelvin/ai-vibes-vid-gen.git
cd ai-vibes-vid-gen
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

```bash
cp .env.example .env
# Edit .env and add your API keys
```

4. Start Redis (required for BullMQ):

```bash
# Using Docker
docker run -d -p 6379:6379 redis

# Or install locally
# Ubuntu/Debian: sudo apt-get install redis-server
# macOS: brew install redis && brew services start redis
```

## Configuration

Edit `.env` file with your API credentials:

```env
# Application
PORT=3000
NODE_ENV=development

# Google Gemini API (Free Tier)
# Get your key from: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Hugging Face API (Free Tier)
# Get your key from: https://huggingface.co/settings/tokens
HUGGINGFACE_API_KEY=your_huggingface_api_key_here
# Video generation provider: "space" (free) or "inference"
HUGGINGFACE_VIDEO_PROVIDER=space

# Hugging Face Space (default: genmo/mochi-1-preview)
HUGGINGFACE_SPACE_NAME=genmo/mochi-1-preview
HUGGINGFACE_SPACE_ENDPOINT=/predict
# Optional: JSON array of inputs for the Space; use {{prompt}} as a placeholder
# HUGGINGFACE_SPACE_INPUTS=["{{prompt}}"]

# Inference API (legacy)
HUGGINGFACE_VIDEO_MODEL=damo-vilab/text-to-video-ms-1.7b
# Optional: override full inference URL (useful for private endpoints)
# HUGGINGFACE_INFERENCE_URL=https://api-inference.huggingface.co/models/your-model

# YouTube API (Optional - for uploads)
# Setup: https://console.cloud.google.com/
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
YOUTUBE_REDIRECT_URI=http://localhost:3000/auth/youtube/callback
YOUTUBE_REFRESH_TOKEN=your_youtube_refresh_token

# TikTok API (Optional - for uploads)
TIKTOK_CLIENT_KEY=your_tiktok_client_key
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
TIKTOK_ACCESS_TOKEN=your_tiktok_access_token

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# File Storage
TEMP_DIR=./temp
DEBUG_DIR=./debug
```

## Running the Application

### Development Mode

```bash
npm run start:dev
```

### Production Mode

```bash
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Generate Video

```bash
POST /video/generate
Content-Type: application/json

{
  "prompt": "1860 battleships sailing in the ocean",
  "uploadToYoutube": false,
  "uploadToTiktok": false,
  "title": "Historic Battleships",
  "description": "A video about 1860 era battleships",
  "tags": "history,ships,battleships"
}
```

Response:

```json
{
  "message": "Video generation job started",
  "jobId": "job_1234567890_abc123",
  "queueJobId": "1",
  "status": "queued"
}
```

### Check Job Status

```bash
GET /video/status/:queueJobId
```

Response:

```json
{
  "jobId": "1",
  "state": "completed",
  "progress": 100,
  "result": {
    "success": true,
    "jobId": "job_1234567890_abc123",
    "finalVideoPath": "./temp/job_1234567890_abc123_output.mp4",
    "uploadUrls": {},
    "scriptData": { ... }
  }
}
```

### List All Jobs

```bash
GET /video/jobs
```

## Project Structure

```
ai-vibes-vid-gen/
├── src/
│   ├── common/
│   │   ├── dto/
│   │   │   └── generate-video.dto.ts
│   │   └── interfaces/
│   │       └── video-generation.interface.ts
│   ├── modules/
│   │   ├── script/
│   │   │   ├── script.service.ts
│   │   │   └── script.module.ts
│   │   ├── media/
│   │   │   ├── media.service.ts
│   │   │   └── media.module.ts
│   │   ├── editor/
│   │   │   ├── editor.service.ts
│   │   │   └── editor.module.ts
│   │   ├── publisher/
│   │   │   ├── publisher.service.ts
│   │   │   └── publisher.module.ts
│   │   └── filesystem/
│   │       ├── filesystem.service.ts
│   │       └── filesystem.module.ts
│   ├── queues/
│   │   └── video-generation.processor.ts
│   ├── app.controller.ts
│   ├── app.module.ts
│   └── main.ts
├── temp/          # Temporary files during processing
├── debug/         # Debug files for troubleshooting
├── .env.example
├── package.json
└── README.md
```

## How It Works

1. **User submits a prompt** via POST /video/generate
2. **Job is queued** in BullMQ for async processing
3. **Script Generation**: Gemini AI generates a structured script with visual prompts and timestamps
4. **Media Generation**:
   - Video clips are generated using Hugging Face text-to-video models
   - Audio is synthesized using Edge-TTS
   - Subtitles are created from the timestamps
5. **Video Assembly**: FFMPEG combines all media:
   - Concatenates video clips
   - Loops/trims video to match audio length
   - Mixes audio track
   - Burns subtitles onto video
6. **Social Publishing** (optional): Uploads to YouTube/TikTok
7. **Result returned** with video path and upload URLs

## Cost Optimization

This system uses **100% free APIs and tools**:

- ✅ Google Gemini API (Free tier)
- ✅ Hugging Face Inference API (Free tier)
- ✅ Edge-TTS (Free, unlimited)
- ✅ FFMPEG (Open source, free)
- ✅ YouTube Data API v3 (Free quota)

**Note**: Video quality from free APIs may be limited. For production use, consider upgrading to paid tiers for higher quality outputs.

## Troubleshooting

### Videos Not Generating

- Check that Hugging Face API key is valid
- The free tier may have rate limits - wait and retry
- Check `./debug` folder for intermediate files

### Audio Not Working

- Ensure edge-tts is installed: `pip install edge-tts`
- Check that edge-tts is in your PATH
- Test manually: `edge-tts --text "Hello" --write-media test.mp3`

### FFMPEG Errors

- Ensure FFMPEG is installed with required codecs
- Test: `ffmpeg -version`
- Check logs for specific error messages

### Redis Connection Issues

- Ensure Redis is running: `redis-cli ping` (should return PONG)
- Check REDIS_HOST and REDIS_PORT in .env

## Development

### Running Tests

The project includes both unit tests and integration tests.

#### Run All Tests

```bash
npm run test
```

#### Run Integration/E2E Tests

```bash
npm run test:e2e
```

**Note:** Integration tests require Redis to be running. You can start Redis using Docker:

```bash
docker run -d -p 6379:6379 --name redis-test redis:alpine
```

#### Run Tests with Coverage

```bash
npm run test:cov
```

#### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Test Structure

- **Unit Tests**: Located in `test/` directory
  - `filesystem.spec.ts`: Tests for filesystem service
  - `script.spec.ts`: Tests for script generation service
- **Integration Tests**:
  - `app.e2e-spec.ts`: End-to-end tests for API endpoints
    - Tests video generation endpoint
    - Tests job status checking
    - Tests job listing
    - Tests input validation

### Linting

```bash
npm run lint
```

### Format Code

```bash
npm run format
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- Google Gemini for AI script generation
- Hugging Face for video generation models
- Microsoft Edge TTS for audio synthesis
- NestJS framework
- FFMPEG for video processing
