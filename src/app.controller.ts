import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { GenerateVideoDto } from './common/dto/generate-video.dto';
import { VideoGenerationJobData } from './queues/video-generation.processor';

@Controller('video')
export class AppController {
  constructor(@InjectQueue('video-generation') private videoQueue: Queue) {}

  @Get()
  getHello(): string {
    return 'AI Vibes Video Generation API is running!';
  }

  @Post('generate')
  async generateVideo(@Body() generateVideoDto: GenerateVideoDto) {
    // Generate unique job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
