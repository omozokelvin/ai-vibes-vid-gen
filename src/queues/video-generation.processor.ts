import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ScriptService } from '../modules/script/script.service';
import { MediaService } from '../modules/media/media.service';
import { EditorService } from '../modules/editor/editor.service';
import { PublisherService } from '../modules/publisher/publisher.service';
import { FilesystemService } from '../modules/filesystem/filesystem.service';

export interface VideoGenerationJobData {
  jobId: string;
  prompt: string;
  uploadToYoutube?: boolean;
  uploadToTiktok?: boolean;
  title?: string;
  description?: string;
  tags?: string;
}

@Processor('video-generation')
export class VideoGenerationProcessor {
  private readonly logger = new Logger(VideoGenerationProcessor.name);

  constructor(
    private scriptService: ScriptService,
    private mediaService: MediaService,
    private editorService: EditorService,
    private publisherService: PublisherService,
    private filesystemService: FilesystemService,
  ) {}

  @Process('generate')
  async handleVideoGeneration(job: Job<VideoGenerationJobData>) {
    const { jobId, prompt, uploadToYoutube, uploadToTiktok, title, description, tags } = job.data;

    this.logger.log(`Starting video generation job: ${jobId}`);

    try {
      // Update progress
      await job.progress(10);

      // Step 1: Generate script
      this.logger.log('Step 1: Generating script...');
      const scriptData = await this.scriptService.generateScript(prompt, jobId);
      await job.progress(25);

      // Step 2: Generate media
      this.logger.log('Step 2: Generating media...');
      const mediaFiles = await this.mediaService.generateMedia(scriptData, jobId);
      await job.progress(50);

      // Step 3: Assemble video
      this.logger.log('Step 3: Assembling video...');
      const finalVideoPath = await this.editorService.assembleVideo(mediaFiles, jobId);
      await job.progress(75);

      // Step 4: Upload to social media (if requested)
      let uploadUrls = {};
      if (uploadToYoutube || uploadToTiktok) {
        this.logger.log('Step 4: Uploading to social media...');
        
        const videoTitle = title || `AI Generated Video: ${prompt}`;
        const videoDescription = description || `This video was automatically generated about: ${prompt}`;
        const videoTags = tags ? tags.split(',').map(t => t.trim()) : ['AI', 'Generated', 'Video'];

        uploadUrls = await this.publisherService.uploadToSocial(
          finalVideoPath,
          videoTitle,
          videoDescription,
          videoTags,
          uploadToYoutube || false,
          uploadToTiktok || false,
        );
      }
      await job.progress(90);

      // Clean up temp files (keep debug files)
      // this.filesystemService.cleanupTemp(jobId);
      await job.progress(100);

      this.logger.log(`Video generation completed: ${jobId}`);

      return {
        success: true,
        jobId,
        finalVideoPath,
        uploadUrls,
        scriptData,
      };
    } catch (error) {
      this.logger.error(`Error in video generation job ${jobId}: ${error.message}`);
      throw error;
    }
  }
}
