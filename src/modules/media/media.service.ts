import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import { spawn } from 'child_process';
import {
  VisualPrompt,
  ScriptData,
  MediaFiles,
} from '../../common/interfaces/video-generation.interface';
import { FilesystemService } from '../filesystem/filesystem.service';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private localImageApiUrl: string | null = null;
  private imageProvider: 'local' | 'none';

  constructor(
    private configService: ConfigService,
    private filesystemService: FilesystemService,
  ) {
    this.localImageApiUrl = this.configService.get<string>(
      'LOCAL_IMAGE_API_URL',
    );

    if (this.localImageApiUrl) {
      this.imageProvider = 'local';
      this.logger.log(
        `Using ComfyUI for local image generation: ${this.localImageApiUrl}`,
      );
    } else {
      this.imageProvider = 'none';
      this.logger.warn(
        'No LOCAL_IMAGE_API_URL configured; scene clips will fall back to placeholder videos',
      );
    }
  }

  async generateMedia(
    scriptData: ScriptData,
    jobId: string,
  ): Promise<MediaFiles> {
    this.logger.log('Starting media generation');

    // Generate audio
    const audioPath = await this.generateAudio(scriptData.script, jobId);

    // Generate videos
    const videoPaths = await this.generateVideos(
      scriptData.visual_prompts,
      jobId,
    );

    // Generate subtitles
    const subtitlePath = await this.generateSubtitles(
      scriptData.timestamps,
      jobId,
    );

    const mediaFiles: MediaFiles = {
      audioPath,
      videoPaths,
      subtitlePath,
    };

    return mediaFiles;
  }

  private async generateAudio(script: string, jobId: string): Promise<string> {
    this.logger.log('Generating audio with Edge-TTS');

    const audioFileName = `${jobId}_audio.mp3`;
    const outputPath = this.filesystemService.getTempPath(audioFileName);

    try {
      // Use edge-tts command line tool with spawn for security
      await this.runEdgeTts(script, outputPath);

      this.logger.log(`Audio generated: ${outputPath}`);

      // Also save to debug
      this.filesystemService.saveToDebug(
        `${jobId}_audio_raw.mp3`,
        fs.readFileSync(outputPath),
      );

      return outputPath;
    } catch (error) {
      this.logger.error(`Error generating audio: ${error.message}`);
      // Create a silent audio file as fallback
      return this.createSilentAudio(jobId);
    }
  }

  private runEdgeTts(text: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['--text', text, '--write-media', outputPath];
      const edgeTts = spawn('edge-tts', args);

      let stderr = '';

      edgeTts.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      edgeTts.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`edge-tts failed with code ${code}: ${stderr}`));
        }
      });

      edgeTts.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async createSilentAudio(jobId: string): Promise<string> {
    const audioFileName = `${jobId}_audio.mp3`;
    const outputPath = this.filesystemService.getTempPath(audioFileName);

    // Create 30 seconds of silence using spawn
    return new Promise((resolve, reject) => {
      const args = [
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=44100:cl=mono',
        '-t',
        '30',
        '-q:a',
        '9',
        '-acodec',
        'libmp3lame',
        outputPath,
      ];

      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`Created silent audio: ${outputPath}`);
          resolve(outputPath);
        } else {
          reject(new Error(`ffmpeg failed with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (error) => {
        this.logger.error(`Error creating silent audio: ${error.message}`);
        reject(error);
      });
    });
  }

  private async generateVideos(
    visualPrompts: VisualPrompt[],
    jobId: string,
  ): Promise<string[]> {
    this.logger.log(`Generating ${visualPrompts.length} video clips`);

    const videoPaths: string[] = [];

    for (const prompt of visualPrompts) {
      try {
        const videoPath = await this.generateSingleVideo(prompt, jobId);
        videoPaths.push(videoPath);
      } catch (error) {
        this.logger.error(
          `Error generating video for prompt ${prompt.index}: ${error.message}`,
        );
        // Create a placeholder video
        const placeholderPath = await this.createPlaceholderVideo(
          prompt,
          jobId,
        );
        videoPaths.push(placeholderPath);
      }
    }

    return videoPaths;
  }

  private async generateSingleVideo(
    prompt: VisualPrompt,
    jobId: string,
  ): Promise<string> {
    this.logger.log(`Generating video for: ${prompt.prompt}`);

    const videoFileName = `${jobId}_clip_${prompt.index}.mp4`;
    const outputPath = this.filesystemService.getTempPath(videoFileName);

    if (this.imageProvider === 'local') {
      return this.generateVideoFromImageLocal(prompt, jobId, outputPath);
    }

    // Fallback to placeholder
    this.logger.warn('No local image generator configured, using placeholder');
    return this.createPlaceholderVideo(prompt, jobId);
  }

  private async generateVideoFromImageLocal(
    prompt: VisualPrompt,
    jobId: string,
    outputPath: string,
  ): Promise<string> {
    const imageFileName = `${jobId}_image_${prompt.index}.png`;
    const imagePath = this.filesystemService.getTempPath(imageFileName);

    // LOCAL_IMAGE_API_URL is the ComfyUI base URL, e.g. http://127.0.0.1:8188
    const baseUrl = (this.localImageApiUrl || 'http://127.0.0.1:8188').replace(
      /\/+$/,
      '',
    );

    try {
      // Z-Image turbo uses three separate model files (diffusion, CLIP, VAE)
      const diffusionModel =
        this.configService.get<string>('LOCAL_IMAGE_MODEL') ||
        'z_image_turbo_bf16.safetensors';
      const clipModel =
        this.configService.get<string>('LOCAL_IMAGE_CLIP') ||
        'qwen_3_4b.safetensors';
      const vaeModel =
        this.configService.get<string>('LOCAL_IMAGE_VAE') || 'ae.safetensors';

      this.logger.log(
        `Submitting Z-Image workflow to ComfyUI (${baseUrl}, model: ${diffusionModel})`,
      );

      // Step 1: Submit the Z-Image turbo workflow
      const workflow = this.buildZImageWorkflow(
        prompt.prompt,
        diffusionModel,
        clipModel,
        vaeModel,
        1024,
        576,
      );

      const submitResponse = await axios.post(
        `${baseUrl}/prompt`,
        { prompt: workflow },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        },
      );

      const promptId = submitResponse.data?.prompt_id;
      if (!promptId) {
        throw new Error('ComfyUI did not return a prompt_id');
      }
      this.logger.log(`ComfyUI prompt submitted: ${promptId}`);

      // Step 2: Poll history until the job is done (max 3 minutes)
      const maxAttempts = 36;
      let images: Array<Record<string, string>> = [];

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const historyResponse = await axios.get(
          `${baseUrl}/history/${promptId}`,
          {
            timeout: 15000,
          },
        );

        const entry = historyResponse.data?.[promptId];
        const status = entry?.status?.status_str;

        if (status === 'success') {
          images = Object.values(entry.outputs || {})
            .flatMap((output: any) => output?.images || [])
            .filter((img: any) => img?.filename);
          if (images.length > 0) break;
        } else if (status === 'error') {
          throw new Error(
            `ComfyUI job failed: ${JSON.stringify(entry.status.messages || {})}`,
          );
        }

        if (attempt % 6 === 0) {
          this.logger.log(
            `ComfyUI still processing... (${(attempt + 1) * 5}s elapsed)`,
          );
        }
      }

      if (images.length === 0) {
        throw new Error('ComfyUI job timed out or returned no images');
      }

      // Step 3: Download the generated image
      const image = images[0];
      const viewResponse = await axios.get(`${baseUrl}/view`, {
        params: {
          filename: image.filename,
          subfolder: image.subfolder || '',
          type: image.type || 'output',
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      fs.writeFileSync(imagePath, viewResponse.data);
      this.logger.log(`Image generated via ComfyUI: ${imagePath}`);

      // Step 4: Animate the image into a video clip with FFmpeg
      await this.convertImageToVideo(imagePath, outputPath, prompt.duration);
      this.logger.log(`Video created from local image: ${outputPath}`);

      this.filesystemService.saveToDebug(
        `${jobId}_clip_${prompt.index}.mp4`,
        fs.readFileSync(outputPath),
      );

      return outputPath;
    } catch (error) {
      this.logger.error(`Local image API error: ${error.message}`);
      return this.createPlaceholderVideo(prompt, jobId);
    }
  }

  private buildZImageWorkflow(
    positivePrompt: string,
    diffusionModel: string,
    clipModel: string,
    vaeModel: string,
    width: number,
    height: number,
  ): Record<string, unknown> {
    const seed = Math.floor(Math.random() * 1000000);
    return {
      '1': {
        class_type: 'UNETLoader',
        inputs: { unet_name: diffusionModel, weight_dtype: 'default' },
      },
      '2': {
        class_type: 'CLIPLoader',
        inputs: { clip_name: clipModel, type: 'qwen_image' },
      },
      '3': {
        class_type: 'VAELoader',
        inputs: { vae_name: vaeModel },
      },
      '4': {
        class_type: 'CLIPTextEncode',
        inputs: { text: positivePrompt, clip: ['2', 0] },
      },
      '5': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: 'low quality, worst quality, blurry, distorted',
          clip: ['2', 0],
        },
      },
      '6': {
        class_type: 'EmptySD3LatentImage',
        inputs: { width, height, batch_size: 1 },
      },
      '7': {
        class_type: 'KSampler',
        inputs: {
          model: ['1', 0],
          positive: ['4', 0],
          negative: ['5', 0],
          latent_image: ['6', 0],
          seed,
          steps: 4,
          cfg: 1.0,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1.0,
        },
      },
      '8': {
        class_type: 'VAEDecode',
        inputs: { samples: ['7', 0], vae: ['3', 0] },
      },
      '9': {
        class_type: 'SaveImage',
        inputs: {
          images: ['8', 0],
          filename_prefix: `ai_vibes_${Date.now()}`,
        },
      },
    };
  }

  private convertImageToVideo(
    imagePath: string,
    outputPath: string,
    duration: number = 5,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create video from image with slow zoom effect
      const args = [
        '-loop',
        '1',
        '-i',
        imagePath,
        '-vf',
        `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0015,1.5)':d=${duration * 25}:s=1280x720,fps=25`,
        '-t',
        duration.toString(),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        outputPath,
      ];

      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `ffmpeg image-to-video failed with code ${code}: ${stderr}`,
            ),
          );
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async createPlaceholderVideo(
    prompt: VisualPrompt,
    jobId: string,
  ): Promise<string> {
    const videoFileName = `${jobId}_clip_${prompt.index}.mp4`;
    const outputPath = this.filesystemService.getTempPath(videoFileName);

    const duration = prompt.duration || 5;
    const text = prompt.prompt.substring(0, 50).replace(/[:\\]/g, '\\$&');

    // Create a simple color video with text overlay using spawn
    return new Promise((resolve, reject) => {
      const args = [
        '-f',
        'lavfi',
        '-i',
        `color=c=blue:s=1280x720:d=${duration}`,
        '-vf',
        `drawtext=text='${text}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        outputPath,
      ];

      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`Created placeholder video: ${outputPath}`);
          resolve(outputPath);
        } else {
          reject(new Error(`ffmpeg failed with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (error) => {
        this.logger.error(`Error creating placeholder video: ${error.message}`);
        reject(error);
      });
    });
  }

  private async generateSubtitles(
    timestamps: any[],
    jobId: string,
  ): Promise<string> {
    this.logger.log('Generating subtitles');

    const subtitleFileName = `${jobId}_subtitles.srt`;
    const outputPath = this.filesystemService.getTempPath(subtitleFileName);

    let srtContent = '';

    timestamps.forEach((segment, index) => {
      const startTime = this.formatSrtTime(segment.start);
      const endTime = this.formatSrtTime(segment.end);

      srtContent += `${index + 1}\n`;
      srtContent += `${startTime} --> ${endTime}\n`;
      srtContent += `${segment.text}\n\n`;
    });

    fs.writeFileSync(outputPath, srtContent, 'utf-8');
    this.logger.log(`Subtitles generated: ${outputPath}`);

    return outputPath;
  }

  private formatSrtTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }
}
