import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { GenerateVideoDto } from './common/dto/generate-video.dto';
import { VideoGenerationJobData } from './queues/video-generation.processor';

@ApiTags('video')
@Controller('video')
export class AppController {
  constructor(@InjectQueue('video-generation') private videoQueue: Queue) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Returns API status message',
    schema: {
      type: 'string',
      example: 'AI Vibes Video Generation API is running!',
    },
  })
  getHello(): string {
    return 'AI Vibes Video Generation API is running!';
  }

  @Post('generate')
  @ApiOperation({
    summary: 'Generate a video from a text prompt',
    description:
      'Creates a video generation job that uses AI to generate scripts, create video clips, synthesize audio, and assemble the final video. The job is processed asynchronously.',
  })
  @ApiResponse({
    status: 201,
    description: 'Video generation job successfully created and queued',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Video generation job started' },
        jobId: { type: 'string', example: 'job_1234567890_abc123' },
        queueJobId: { type: 'string', example: '1' },
        status: { type: 'string', example: 'queued' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
  })
  async generateVideo(@Body() generateVideoDto: GenerateVideoDto) {
    // Generate unique job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    const jobData: VideoGenerationJobData = {
      jobId,
      prompt: generateVideoDto.prompt,
      uploadToYoutube: generateVideoDto.uploadToYoutube,
      uploadToTiktok: generateVideoDto.uploadToTiktok,
      title: generateVideoDto.title,
      description: generateVideoDto.description,
      tags: generateVideoDto.tags,
    };

    // Add job to queue
    const job = await this.videoQueue.add('generate', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    return {
      message: 'Video generation job started',
      jobId: jobId,
      queueJobId: job.id,
      status: 'queued',
    };
  }

  @Get('status/:jobId')
  @ApiOperation({
    summary: 'Get the status of a video generation job',
    description:
      'Retrieves the current status, progress, and result (if completed) of a video generation job.',
  })
  @ApiParam({
    name: 'jobId',
    description:
      'The queue job ID returned when the video generation job was created',
    example: '1',
  })
  @ApiResponse({
    status: 200,
    description: 'Job status successfully retrieved',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', example: '1' },
        state: {
          type: 'string',
          example: 'completed',
          enum: ['waiting', 'active', 'completed', 'failed', 'delayed'],
        },
        progress: { type: 'number', example: 100 },
        result: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            jobId: { type: 'string', example: 'job_1234567890_abc123' },
            finalVideoPath: {
              type: 'string',
              example: './temp/job_1234567890_abc123_output.mp4',
            },
            uploadUrls: { type: 'object' },
            scriptData: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Job not found',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Job not found' },
      },
    },
  })
  async getJobStatus(@Param('jobId') queueJobId: string) {
    const job = await this.videoQueue.getJob(queueJobId);

    if (!job) {
      return {
        error: 'Job not found',
      };
    }

    const state = await job.getState();
    const progress = job.progress();
    const result = job.returnvalue;

    return {
      jobId: queueJobId,
      state,
      progress,
      result,
    };
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'List all video generation jobs',
    description:
      'Returns a summary of all jobs in different states (waiting, active, completed, failed) with details about the most recent jobs in each category.',
  })
  @ApiResponse({
    status: 200,
    description: 'Jobs list successfully retrieved',
    schema: {
      type: 'object',
      properties: {
        waiting: { type: 'number', example: 0 },
        active: { type: 'number', example: 1 },
        completed: { type: 'number', example: 5 },
        failed: { type: 'number', example: 0 },
        jobs: {
          type: 'object',
          properties: {
            waiting: { type: 'array', items: { type: 'object' } },
            active: { type: 'array', items: { type: 'object' } },
            completed: { type: 'array', items: { type: 'object' } },
            failed: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  })
  async listJobs() {
    const waiting = await this.videoQueue.getWaiting();
    const active = await this.videoQueue.getActive();
    const completed = await this.videoQueue.getCompleted();
    const failed = await this.videoQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      jobs: {
        waiting: waiting.map((j) => ({ id: j.id, data: j.data })),
        active: active.map((j) => ({ id: j.id, data: j.data })),
        completed: completed
          .slice(0, 10)
          .map((j) => ({ id: j.id, data: j.data, result: j.returnvalue })),
        failed: failed
          .slice(0, 10)
          .map((j) => ({ id: j.id, data: j.data, error: j.failedReason })),
      },
    };
  }
}
