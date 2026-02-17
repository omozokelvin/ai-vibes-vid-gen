# AI Vibes Video Generation

## What

AI-powered video generation system that creates videos from text prompts using only free APIs. The system generates scripts via Google Gemini, creates video clips with Hugging Face, synthesizes audio with Edge TTS, assembles videos with FFmpeg, and optionally uploads to YouTube/TikTok.

## Tech Stack

**Framework:** NestJS 10.0 (TypeScript 5.1)
**Queue:** BullMQ with Redis backend
**AI APIs:** Google Gemini (script), Hugging Face (video), Edge TTS (audio)
**Media:** FFmpeg via fluent-ffmpeg
**Social:** YouTube API v3, TikTok (placeholder)
**Validation:** class-validator, class-transformer
**Testing:** Jest, Supertest
**Documentation:** Swagger/OpenAPI

## Project Structure

```
src/
├── common/                    # Shared DTOs and interfaces
│   ├── dto/                  # Request validation (GenerateVideoDto)
│   └── interfaces/           # TypeScript type definitions
├── modules/                  # Core business logic
│   ├── script/              # AI script generation (Gemini)
│   ├── media/               # Video/audio/subtitle generation
│   ├── editor/              # FFmpeg video assembly
│   ├── publisher/           # YouTube/TikTok uploads
│   └── filesystem/          # File operations (temp/debug)
├── queues/                   # BullMQ job processors
├── app.controller.ts         # REST API endpoints
├── app.module.ts            # Root module (see line 12-40)
└── main.ts                  # Bootstrap (see line 6-37)
```

**Key Directories:**
- `temp/` - Temporary processing files (cleaned up)
- `debug/` - Preserved debug artifacts for troubleshooting

## How to Build & Run

### Prerequisites
- Node.js 18+
- Redis (for job queue)
- FFmpeg (system dependency)
- Python 3 with edge-tts (`pip install edge-tts`)

### Environment Setup
1. Copy `.env.example` to `.env`
2. Add required API keys: `GEMINI_API_KEY`, `HUGGINGFACE_API_KEY`
3. Configure Redis: `REDIS_HOST`, `REDIS_PORT` (defaults: localhost:6379)
4. Optional: Add YouTube/TikTok credentials for uploads

### Development Commands
```bash
npm install              # Install dependencies
npm run start:dev        # Run with auto-reload
npm run build            # Compile TypeScript
npm run start:prod       # Run production build
```

### Testing
```bash
npm test                 # Unit tests
npm run test:cov         # With coverage
npm run test:e2e         # Integration tests
npm run lint             # ESLint
npm run format           # Prettier
```

### API
- **Swagger docs:** http://localhost:3000/docs
- **Main endpoints:**
  - `POST /video/generate` - Create video generation job
  - `GET /video/status/:jobId` - Check job progress
  - `GET /video/jobs` - List all jobs

## Architecture Overview

**Pattern:** Job queue-based async processing with modular services

**Request Flow:**
1. Client sends POST to `/video/generate` with prompt
2. Controller creates job in BullMQ queue, returns `jobId`
3. `VideoGenerationProcessor` handles job asynchronously:
   - **Step 1 (25%):** `ScriptService` generates script with Gemini AI
   - **Step 2 (50%):** `MediaService` creates video clips, audio, subtitles
   - **Step 3 (75%):** `EditorService` assembles final video with FFmpeg
   - **Step 4 (90%):** `PublisherService` uploads to social platforms (optional)
4. Client polls `/video/status/:jobId` to track progress

**Module Dependencies:**
- All feature modules depend on `FilesystemModule`
- `VideoGenerationProcessor` orchestrates all services
- See [app.module.ts:12-40](src/app.module.ts#L12-L40) for module imports

## Configuration

**Critical Environment Variables:**
- `GEMINI_API_KEY` - Google Gemini for script generation
- `HUGGINGFACE_API_KEY` - Video generation
- `HUGGINGFACE_VIDEO_PROVIDER` - `space` or `inference`
- `HUGGINGFACE_SPACE_NAME` - Space ID (default: genmo/mochi-1-preview)
- `YOUTUBE_*` - YouTube upload credentials (optional)
- `REDIS_HOST`, `REDIS_PORT` - Job queue backend
- `TEMP_DIR`, `DEBUG_DIR` - File storage paths

See `.env.example` for full list.

## Key Design Decisions

1. **Async Job Queue:** Prevents API overload, enables retry logic, provides progress tracking
2. **Graceful Degradation:** Fallbacks at every step (fallback script, placeholder videos, silent audio)
3. **Modular Services:** Each domain isolated for independent testing and potential microservice migration
4. **Free APIs Only:** Uses only free-tier services (Gemini, Hugging Face, Edge TTS, YouTube API)
5. **File System Abstraction:** Separate temp/debug directories for easier troubleshooting

## File References

**Entry Points:**
- [main.ts:6-37](src/main.ts#L6-L37) - Application bootstrap with ValidationPipe, CORS, Swagger
- [app.module.ts:12-40](src/app.module.ts#L12-L40) - Module registration and DI configuration
- [app.controller.ts](src/app.controller.ts) - HTTP endpoints

**Core Services:**
- [script.service.ts](src/modules/script/script.service.ts) - Gemini AI integration
- [media.service.ts](src/modules/media/media.service.ts) - Audio, video, subtitle generation
- [editor.service.ts](src/modules/editor/editor.service.ts) - FFmpeg video assembly
- [publisher.service.ts](src/modules/publisher/publisher.service.ts) - Social media uploads
- [filesystem.service.ts](src/modules/filesystem/filesystem.service.ts) - File operations

**Job Processing:**
- [video-generation.processor.ts](src/queues/video-generation.processor.ts) - BullMQ job orchestrator

**Validation:**
- [generate-video.dto.ts](src/common/dto/generate-video.dto.ts) - Request validation rules
- [video-generation.interface.ts](src/common/interfaces/video-generation.interface.ts) - Type definitions

## Additional Documentation

For detailed information on specific topics, see:
- [Architectural Patterns](.claude/docs/architectural_patterns.md) - DI, decorators, job queues, error handling
- [Video Generation Fix](.claude/docs/video_generation_fix.md) - ESM/CommonJS fix, image-to-video approach
- [Hugging Face Models](.claude/docs/huggingface_models.md) - Working models, troubleshooting, API errors
