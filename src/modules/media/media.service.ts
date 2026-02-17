import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import { spawn } from 'child_process';
import Replicate from 'replicate';
import {
  VisualPrompt,
  ScriptData,
  MediaFiles,
} from '../../common/interfaces/video-generation.interface';
import { FilesystemService } from '../filesystem/filesystem.service';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private hfApiKey: string;
  private hfModelId: string;
  private replicate: Replicate | null = null;
  private imageProvider: 'huggingface' | 'replicate' | 'stablehorde' | 'none';
  private useFreeAI: boolean;

  constructor(
    private configService: ConfigService,
    private filesystemService: FilesystemService,
  ) {
    this.hfApiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
    this.hfModelId =
      this.configService.get<string>('HUGGINGFACE_IMAGE_MODEL') ||
      'runwayml/stable-diffusion-v1-5';

    // Check for free AI preference
    this.useFreeAI = this.configService.get<string>('USE_FREE_AI') === 'true';

    // Priority: Free AI (Stable Horde) > Replicate > Hugging Face > None
    const replicateApiKey = this.configService.get<string>(
      'REPLICATE_API_TOKEN',
    );

    if (this.useFreeAI) {
      this.imageProvider = 'stablehorde';
      this.logger.log(
        'Using Stable Horde (FREE, no API key) for image generation',
      );
      this.logger.warn(
        'Note: Free generation may be slow (30-120s per image) depending on community availability',
      );
    } else if (replicateApiKey) {
      this.replicate = new Replicate({ auth: replicateApiKey });
      this.imageProvider = 'replicate';
      this.logger.log('Using Replicate for image generation');
    } else if (this.hfApiKey) {
      this.imageProvider = 'huggingface';
      this.logger.log(
        'Using Hugging Face for image generation (may fail with 410)',
      );
    } else {
      this.imageProvider = 'none';
      this.logger.warn(
        'No image generation API configured, using placeholders',
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

    // Try image generation based on available provider
    if (this.imageProvider === 'stablehorde') {
      return this.generateVideoFromImageStableHorde(prompt, jobId, outputPath);
    } else if (this.imageProvider === 'replicate') {
      return this.generateVideoFromImageReplicate(prompt, jobId, outputPath);
    } else if (this.imageProvider === 'huggingface') {
      return this.generateVideoFromImage(prompt, jobId, outputPath);
    }

    // Fallback to placeholder
    this.logger.warn('No image generation API configured, using placeholder');
    return this.createPlaceholderVideo(prompt, jobId);
  }

  private async generateVideoFromImage(
    prompt: VisualPrompt,
    jobId: string,
    outputPath: string,
  ): Promise<string> {
    const imageFileName = `${jobId}_image_${prompt.index}.png`;
    const imagePath = this.filesystemService.getTempPath(imageFileName);

    try {
      // Generate image using Hugging Face Inference API
      const inferenceUrl = `https://api-inference.huggingface.co/models/${this.hfModelId}`;

      this.logger.log(`Generating image from: ${this.hfModelId}`);

      const response = await axios.post(
        inferenceUrl,
        {
          inputs: prompt.prompt,
        },
        {
          headers: {
            Authorization: `Bearer ${this.hfApiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 120000, // 2 minutes timeout
        },
      );

      // Save the image
      fs.writeFileSync(imagePath, response.data);
      this.logger.log(`Image generated: ${imagePath}`);

      // Convert image to video with zoom/pan effect using FFmpeg
      await this.convertImageToVideo(imagePath, outputPath, prompt.duration);

      this.logger.log(`Video created from image: ${outputPath}`);

      // Save to debug
      this.filesystemService.saveToDebug(
        `${jobId}_clip_${prompt.index}.mp4`,
        fs.readFileSync(outputPath),
      );

      return outputPath;
    } catch (error) {
      const status = error?.response?.status;
      if (status === 503) {
        this.logger.warn(
          `Model is loading (503). This usually takes 20-60 seconds. Retrying or using placeholder. Model: ${this.hfModelId}`,
        );
      } else if (status === 401) {
        this.logger.error('Invalid Hugging Face API key (401)');
      } else if (status === 410) {
        this.logger.error(
          `Model endpoint no longer available (410): ${this.hfModelId}. ` +
            `Try alternative models: runwayml/stable-diffusion-v1-5, prompthero/openjourney, ` +
            `stabilityai/stable-diffusion-xl-base-1.0, or black-forest-labs/FLUX.1-schnell`,
        );
      } else {
        this.logger.error(
          `Hugging Face API error (${status || 'unknown'}): ${error.message}`,
        );
      }
      return this.createPlaceholderVideo(prompt, jobId);
    }
  }

  private async generateVideoFromImageStableHorde(
    prompt: VisualPrompt,
    jobId: string,
    outputPath: string,
  ): Promise<string> {
    const imageFileName = `${jobId}_image_${prompt.index}.png`;
    const imagePath = this.filesystemService.getTempPath(imageFileName);

    try {
      this.logger.log(
        'Requesting image from Stable Horde (FREE, community-powered)...',
      );

      // Step 1: Submit generation request
      const requestBody = {
        prompt: prompt.prompt,
        params: {
          width: 1024, // Standard size for better compatibility
          height: 576, // 16:9 ratio
          steps: 20,
          cfg_scale: 7.5,
          sampler_name: 'k_euler_a',
          n: 1,
        },
        nsfw: false,
        censor_nsfw: true,
        trusted_workers: false,
        slow_workers: true,
        workers: [],
        models: [], // Empty = use any available model
      };

      const submitResponse = await axios.post(
        'https://stablehorde.net/api/v2/generate/async',
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: '0000000000', // Anonymous API key
          },
          timeout: 15000,
        },
      );

      const requestId = submitResponse.data.id;
      this.logger.log(`Stable Horde request submitted: ${requestId}`);
      this.logger.log(
        'Waiting for community workers to generate image (this may take 30-120 seconds)...',
      );

      // Step 2: Poll for result
      let attempts = 0;
      const maxAttempts = 40; // 40 attempts * 3 seconds = 2 minutes max

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds
        attempts++;

        const statusResponse = await axios.get(
          `https://stablehorde.net/api/v2/generate/check/${requestId}`,
          { timeout: 10000 },
        );

        const status = statusResponse.data;

        if (status.done) {
          this.logger.log('Image generation complete! Fetching result...');

          // Step 3: Get the generated image
          const resultResponse = await axios.get(
            `https://stablehorde.net/api/v2/generate/status/${requestId}`,
            { timeout: 10000 },
          );

          const imageUrl = resultResponse.data.generations[0]?.img;

          if (!imageUrl) {
            throw new Error('No image URL in response');
          }

          // Download the image
          const imageResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
          });

          fs.writeFileSync(imagePath, imageResponse.data);
          this.logger.log(`Image generated via Stable Horde: ${imagePath}`);

          // Convert to video
          await this.convertImageToVideo(
            imagePath,
            outputPath,
            prompt.duration,
          );
          this.logger.log(`Video created from image: ${outputPath}`);

          // Save to debug
          this.filesystemService.saveToDebug(
            `${jobId}_clip_${prompt.index}.mp4`,
            fs.readFileSync(outputPath),
          );

          return outputPath;
        }

        if (status.faulted) {
          throw new Error('Generation faulted on Stable Horde');
        }

        // Log progress every 5 attempts
        if (attempts % 5 === 0) {
          this.logger.log(
            `Still waiting... (${attempts * 3}s elapsed, queue position: ${status.queue_position || 'unknown'})`,
          );
        }
      }

      throw new Error('Timeout waiting for Stable Horde generation');
    } catch (error) {
      this.logger.error(`Stable Horde error: ${error.message}`);
      this.logger.warn(
        'Falling back to placeholder video. For faster/reliable generation, consider Replicate API (~$0.003/image)',
      );
      return this.createPlaceholderVideo(prompt, jobId);
    }
  }

  private async generateVideoFromImageReplicate(
    prompt: VisualPrompt,
    jobId: string,
    outputPath: string,
  ): Promise<string> {
    const imageFileName = `${jobId}_image_${prompt.index}.png`;
    const imagePath = this.filesystemService.getTempPath(imageFileName);

    try {
      this.logger.log('Generating image with Replicate API');

      // Use SDXL for high-quality images
      const output = (await this.replicate.run(
        'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
        {
          input: {
            prompt: prompt.prompt,
            width: 1280,
            height: 720,
            num_outputs: 1,
          },
        },
      )) as string[];

      if (!output || output.length === 0) {
        throw new Error('No image returned from Replicate');
      }

      // Download the image
      const imageUrl = output[0];
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
      });

      fs.writeFileSync(imagePath, imageResponse.data);
      this.logger.log(`Image generated via Replicate: ${imagePath}`);

      // Convert image to video with zoom/pan effect
      await this.convertImageToVideo(imagePath, outputPath, prompt.duration);

      this.logger.log(`Video created from image: ${outputPath}`);

      // Save to debug
      this.filesystemService.saveToDebug(
        `${jobId}_clip_${prompt.index}.mp4`,
        fs.readFileSync(outputPath),
      );

      return outputPath;
    } catch (error) {
      this.logger.error(`Replicate API error: ${error.message}`);
      return this.createPlaceholderVideo(prompt, jobId);
    }
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
