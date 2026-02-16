# API Usage Examples

This document provides practical examples of using the AI Vibes Video Generation API.

## Prerequisites

1. Ensure the application is running:
```bash
npm run start:dev
```

2. Ensure Redis is running for BullMQ

3. Set up your API keys in `.env` file

## Basic Video Generation

### Example 1: Generate a video without social media upload

```bash
curl -X POST http://localhost:3000/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Ancient Roman battleships sailing in the Mediterranean Sea"
  }'
```

Response:
```json
{
  "message": "Video generation job started",
  "jobId": "job_1708123456789_abc123def",
  "queueJobId": "1",
  "status": "queued"
}
```

### Example 2: Generate a video with YouTube upload

```bash
curl -X POST http://localhost:3000/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "1860 battleships in a naval battle",
    "uploadToYoutube": true,
    "title": "Historic Naval Battle - 1860 Battleships",
    "description": "A cinematic recreation of naval warfare during the 1860s featuring period-accurate battleships.",
    "tags": "history,naval,battleships,1860s,warfare"
  }'
```

### Example 3: Generate with custom metadata

```bash
curl -X POST http://localhost:3000/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Mars rover exploring the red planet",
    "uploadToYoutube": false,
    "uploadToTiktok": false,
    "title": "Mars Exploration Mission",
    "description": "AI-generated visualization of Mars rover exploring the Martian surface",
    "tags": "space,mars,rover,science,exploration"
  }'
```

## Checking Job Status

Use the `queueJobId` from the generation response:

```bash
curl http://localhost:3000/video/status/1
```

Response:
```json
{
  "jobId": "1",
  "state": "completed",
  "progress": 100,
  "result": {
    "success": true,
    "jobId": "job_1708123456789_abc123def",
    "finalVideoPath": "./temp/job_1708123456789_abc123def_output.mp4",
    "uploadUrls": {
      "youtube": "https://www.youtube.com/watch?v=VIDEO_ID"
    },
    "scriptData": {
      "script": "Ancient Roman battleships...",
      "visual_prompts": [...],
      "timestamps": [...]
    }
  }
}
```

## Monitoring Jobs

List all jobs in the queue:

```bash
curl http://localhost:3000/video/jobs
```

Response:
```json
{
  "waiting": 2,
  "active": 1,
  "completed": 5,
  "failed": 1,
  "jobs": {
    "waiting": [...],
    "active": [...],
    "completed": [...],
    "failed": [...]
  }
}
```

## Job States

- **waiting**: Job is queued and waiting to be processed
- **active**: Job is currently being processed
- **completed**: Job finished successfully
- **failed**: Job failed (will retry up to 3 times)

## Progress Tracking

Jobs report progress at different stages:

- 10%: Job started
- 25%: Script generated
- 50%: Media (video, audio, subtitles) generated
- 75%: Video assembled
- 90%: Social media upload (if requested)
- 100%: Complete

## Output Files

All intermediate files are saved for debugging:

### Debug Directory (`./debug/`)
- `{jobId}_script.json`: Generated script data
- `{jobId}_audio_raw.mp3`: Original audio file
- `{jobId}_clip_{index}.mp4`: Individual video clips

### Temp Directory (`./temp/`)
- `{jobId}_audio.mp3`: Processed audio
- `{jobId}_clip_{index}.mp4`: Video clips
- `{jobId}_subtitles.srt`: Subtitle file
- `{jobId}_concatenated.mp4`: Combined video clips
- `{jobId}_looped.mp4` or `{jobId}_trimmed.mp4`: Duration-adjusted video
- `{jobId}_output.mp4`: **Final output video**

## Error Handling

If a job fails, check the error message:

```bash
curl http://localhost:3000/video/status/FAILED_JOB_ID
```

Common errors:
- **Missing API keys**: Configure GEMINI_API_KEY and HUGGINGFACE_API_KEY
- **Redis not running**: Start Redis server
- **FFMPEG not found**: Install FFMPEG with required codecs
- **edge-tts not found**: Install via `pip install edge-tts`

## Using with Postman

Import this collection to test with Postman:

```json
{
  "info": {
    "name": "AI Vibes Video Generation",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Generate Video",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "url": "http://localhost:3000/video/generate",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"prompt\": \"1860 battleships\",\n  \"uploadToYoutube\": false\n}"
        }
      }
    },
    {
      "name": "Check Status",
      "request": {
        "method": "GET",
        "url": "http://localhost:3000/video/status/1"
      }
    },
    {
      "name": "List Jobs",
      "request": {
        "method": "GET",
        "url": "http://localhost:3000/video/jobs"
      }
    }
  ]
}
```

## Production Considerations

1. **Rate Limiting**: Free APIs have rate limits. Consider implementing request throttling.

2. **Storage**: Clean up temp files periodically to save disk space.

3. **Queue Management**: Monitor Redis and BullMQ queue sizes.

4. **Error Notifications**: Set up alerts for failed jobs.

5. **Scaling**: Use multiple workers for parallel processing.

6. **Caching**: Cache generated scripts for similar prompts.

## Advanced Usage

### Custom Voice for TTS

Modify the `edge-tts` command in `media.service.ts` to use different voices:

```typescript
const command = `edge-tts --voice "en-GB-SoniaNeural" --text "${script}" --write-media "${outputPath}"`;
```

Available voices: Run `edge-tts --list-voices` to see all options.

### Adjusting Video Quality

Modify FFMPEG parameters in `editor.service.ts`:

```typescript
outputOptions([
  '-c:v libx264',
  '-preset medium',  // faster/medium/slow
  '-crf 23',         // 18-28, lower = better quality
  '-c:a aac',
  '-b:a 192k',       // audio bitrate
])
```

### Custom Video Resolution

Change the placeholder video generation:

```typescript
const command = `ffmpeg -f lavfi -i color=c=blue:s=1920x1080:d=${duration} ...`;
```

## Troubleshooting

### Videos are too short
- The free tier models may generate shorter clips
- Videos are automatically looped to match audio length

### Poor video quality
- Free tier models have quality limitations
- Consider upgrading to paid tiers for production

### Slow generation
- Video generation can take several minutes per clip
- Use the job queue system to handle multiple requests

### Out of memory
- Reduce the number of visual prompts in the script
- Process jobs sequentially instead of in parallel
