import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import { spawn } from 'child_process';
import {
  VisualPrompt,
  ScriptData,
  MediaFiles,
  TimestampSegment,
  WordTiming,
} from '../../common/interfaces/video-generation.interface';
import { FilesystemService } from '../filesystem/filesystem.service';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private localImageApiUrl: string | null = null;
  private imageProvider: 'local' | 'none';
  private videoProvider: 'wan' | 'zimage' | 'none';

  constructor(
    private configService: ConfigService,
    private filesystemService: FilesystemService,
  ) {
    this.localImageApiUrl = this.configService.get<string>(
      'LOCAL_IMAGE_API_URL',
    );

    // VIDEO_PROVIDER: 'wan' = real AI video generation, 'zimage' = image+zoom (legacy), 'none' = placeholder
    const videoProviderConfig = this.configService
      .get<string>('VIDEO_PROVIDER')
      ?.toLowerCase();
    if (videoProviderConfig === 'wan') {
      this.videoProvider = 'wan';
      this.imageProvider = 'none'; // Wan handles everything
    } else if (videoProviderConfig === 'none') {
      this.videoProvider = 'none';
      this.imageProvider = 'none';
    } else {
      // Default: zimage (legacy image+zoom)
      this.videoProvider = 'zimage';
    }

    if (this.localImageApiUrl) {
      if (this.videoProvider === 'none') {
        this.imageProvider = 'none';
      } else if (this.videoProvider === 'wan') {
        this.imageProvider = 'none';
      } else {
        this.imageProvider = 'local';
      }
      this.logger.log(
        `ComfyUI at ${this.localImageApiUrl} — video: ${this.videoProvider}, image: ${this.imageProvider}`,
      );
    } else {
      this.imageProvider = 'none';
      this.videoProvider = 'none';
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

    // Generate audio and get actual word-level timings from Edge-TTS
    const { audioPath, wordTimings } = await this.generateAudio(
      scriptData.script,
      jobId,
    );

    // Generate videos
    const videoPaths = await this.generateVideos(
      scriptData.visual_prompts,
      jobId,
    );

    // Generate subtitles using actual audio word timings
    const subtitlePath = await this.generateSubtitles(
      scriptData.timestamps,
      wordTimings,
      jobId,
    );

    const mediaFiles: MediaFiles = {
      audioPath,
      videoPaths,
      subtitlePath,
    };

    return mediaFiles;
  }

  private async generateAudio(
    script: string,
    jobId: string,
  ): Promise<{ audioPath: string; wordTimings: WordTiming[] }> {
    this.logger.log('Generating audio with Edge-TTS');

    const audioFileName = `${jobId}_audio.mp3`;
    const outputPath = this.filesystemService.getTempPath(audioFileName);

    try {
      // Generate both audio and word-level VTT subtitles from Edge-TTS
      const wordTimings = await this.runEdgeTts(script, outputPath);

      this.logger.log(
        `Audio generated: ${outputPath} (${wordTimings.length} word cues)`,
      );

      // Also save to debug
      this.filesystemService.saveToDebug(
        `${jobId}_audio_raw.mp3`,
        fs.readFileSync(outputPath),
      );

      return { audioPath: outputPath, wordTimings };
    } catch (error) {
      this.logger.error(`Error generating audio: ${error.message}`);
      // Create a silent audio file as fallback (no word timings)
      const fallbackPath = await this.createSilentAudio(jobId);
      return { audioPath: fallbackPath, wordTimings: [] };
    }
  }

  private runEdgeTts(text: string, outputPath: string): Promise<WordTiming[]> {
    return new Promise((resolve, reject) => {
      const vttPath = outputPath.replace(/\.mp3$/, '.vtt');
      const args = [
        '--text',
        text,
        '--write-media',
        outputPath,
        '--write-subtitles',
        vttPath,
      ];
      const edgeTts = spawn('edge-tts', args);

      let stderr = '';

      edgeTts.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      edgeTts.on('close', (code) => {
        if (code === 0) {
          try {
            const wordTimings = this.parseVttSubtitles(vttPath);
            resolve(wordTimings);
          } catch (parseError) {
            // VTT parsing failed but audio was generated — return empty
            this.logger.warn(
              `VTT parsing failed: ${parseError.message}, subtitles will fall back to estimates`,
            );
            resolve([]);
          }
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
    this.logger.log(
      `Generating video for: ${prompt.prompt} (provider: ${this.videoProvider})`,
    );

    const videoFileName = `${jobId}_clip_${prompt.index}.mp4`;
    const outputPath = this.filesystemService.getTempPath(videoFileName);

    // Wan 2.1 native video generation (real AI video)
    if (this.videoProvider === 'wan') {
      return this.generateVideoWithWan(prompt, jobId, outputPath);
    }

    // Legacy: Z-Image turbo → image + FFmpeg zoom
    if (this.imageProvider === 'local') {
      return this.generateVideoFromImageLocal(prompt, jobId, outputPath);
    }

    // Fallback to placeholder
    this.logger.warn('No video/image provider configured, using placeholder');
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

  /**
   * Wan 2.1 Text-to-Video workflow (native local generation via ComfyUI-WanVideoWrapper).
   * Generates an actual AI video clip from a text prompt, not just image+zoom.
   *
   * Supports 9:16 (TikTok), 16:9 (YouTube), 1:1 aspect ratios.
   */
  private buildWanWorkflow(
    positivePrompt: string,
    negativePrompt: string,
    width: number,
    height: number,
    numFrames: number,
    fps: number,
    clipModel: string,
  ): Record<string, unknown> {
    const seed = Math.floor(Math.random() * 1000000);
    const prefix = `ai_vibes_${Date.now()}`;

    return {
      // 1. Load T5 text encoder (for WanVideoTextEncode)
      '1': {
        class_type: 'LoadWanVideoT5TextEncoder',
        inputs: {
          model_name: 'umt5-xxl-enc-bf16.safetensors',
          precision: 'bf16',
          load_device: 'offload_device',
          quantization: 'disabled',
        },
      },
      // 2. CLIP model for auxiliary conditioning (type=wan)
      '2': {
        class_type: 'CLIPLoader',
        inputs: {
          clip_name: clipModel,
          type: 'wan',
        },
      },
      // 3. CLIP positive encoding
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: positivePrompt,
          clip: ['2', 0],
        },
      },
      // 4. CLIP negative encoding
      '4': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: negativePrompt,
          clip: ['2', 0],
        },
      },
      // 5. Bridge CLIP conditioning to Wan text embeds
      '5': {
        class_type: 'WanVideoTextEmbedBridge',
        inputs: {
          positive: ['3', 0],
          negative: ['4', 0],
        },
      },
      // 6. Wan T5 text encoding (primary text encoder)
      '6': {
        class_type: 'WanVideoTextEncode',
        inputs: {
          t5: ['1', 0],
          positive_prompt: positivePrompt,
          negative_prompt: negativePrompt,
          force_offload: true,
          use_disk_cache: false,
          device: 'gpu',
        },
      },
      // 7. Load Wan diffusion model (Wan 2.1 T2V 1.3B)
      '7': {
        class_type: 'WanVideoModelLoader',
        inputs: {
          model: 'diffusion_pytorch_model.safetensors',
          base_precision: 'fp16',
          quantization: 'disabled',
          load_device: 'main_device',
        },
      },
      // 8. Load Wan VAE
      '8': {
        class_type: 'WanVideoVAELoader',
        inputs: {
          model_name: 'Wan2.1_VAE.pth',
        },
      },
      // 9. Empty video embeds (defines video dimensions and frame count)
      '9': {
        class_type: 'WanVideoEmptyEmbeds',
        inputs: {
          width,
          height,
          num_frames: numFrames,
        },
      },
      // 10. Wan sampler (generates latent video)
      '10': {
        class_type: 'WanVideoSampler',
        inputs: {
          model: ['7', 0],
          image_embeds: ['9', 0],
          text_embeds: ['6', 0],
          steps: 20,
          cfg: 6.0,
          shift: 5.0,
          seed,
          force_offload: true,
          scheduler: 'unipc',
          riflex_freq_index: 0,
        },
      },
      // 11. Decode latent to image frames
      '11': {
        class_type: 'WanVideoDecode',
        inputs: {
          vae: ['8', 0],
          samples: ['10', 0],
          enable_vae_tiling: true,
          tile_x: 256,
          tile_y: 256,
          tile_stride_x: 128,
          tile_stride_y: 128,
        },
      },
      // 12. Combine frames into video
      '12': {
        class_type: 'CreateVideo',
        inputs: {
          images: ['11', 0],
          fps,
        },
      },
      // 13. Save video to output
      '13': {
        class_type: 'SaveVideo',
        inputs: {
          video: ['12', 0],
          filename_prefix: prefix,
          format: 'video/h264-mp4',
        },
      },
    };
  }

  /**
   * Generate a video clip using Wan 2.1 T2V via ComfyUI.
   */
  private async generateVideoWithWan(
    prompt: VisualPrompt,
    jobId: string,
    outputPath: string,
  ): Promise<string> {
    const baseUrl = (this.localImageApiUrl || 'http://127.0.0.1:8188').replace(
      /\/+$/,
      '',
    );

    // Use TikTok 9:16 by default for vertical content
    const width = 576;
    const height = 1024;
    const fps = 16;
    const numFrames = Math.min(Math.max(prompt.duration * fps, 33), 241); // 2-15s at 16fps
    // Ensure numFrames is 4n+1 for Wan
    const adjustedFrames = Math.floor(numFrames / 4) * 4 + 1;

    const clipModel =
      this.configService.get<string>('LOCAL_IMAGE_CLIP') ||
      'umt5_xxl_fp16.safetensors';

    this.logger.log(
      `Submitting Wan T2V workflow (${width}x${height}, ${adjustedFrames}f, ${fps}fps)`,
    );

    try {
      const workflow = this.buildWanWorkflow(
        prompt.prompt,
        'low quality, worst quality, blurry, distorted, jpeg artifacts, ugly, deformed',
        width,
        height,
        adjustedFrames,
        fps,
        clipModel,
      );

      // Step 1: Submit workflow
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
      this.logger.log(`Wan T2V prompt submitted: ${promptId}`);

      // Step 2: Poll until done (Wan video generation takes longer - up to 15 min)
      const maxAttempts = 180; // 15 minutes max
      let videoFilename: string | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const historyResponse = await axios.get(
          `${baseUrl}/history/${promptId}`,
          { timeout: 15000 },
        );

        const entry = historyResponse.data?.[promptId];
        const status = entry?.status?.status_str;

        if (status === 'success') {
          // Look for video output from SaveVideo node
          const outputs = entry.outputs || {};
          for (const nodeOutputs of Object.values(outputs)) {
            const gifs = (nodeOutputs as any)?.gifs || [];
            for (const gif of gifs) {
              if (gif?.filename) {
                videoFilename = gif.filename;
                break;
              }
            }
          }
          if (videoFilename) break;

          // Fallback: look for images from WanVideoDecode
          const allImages = Object.values(outputs)
            .flatMap((o: any) => o?.images || [])
            .filter((img: any) => img?.filename);
          if (allImages.length > 0) {
            // Download first frame and use FFmpeg fallback
            const firstImage = allImages[0];
            const imageResponse = await axios.get(`${baseUrl}/view`, {
              params: {
                filename: firstImage.filename,
                subfolder: firstImage.subfolder || '',
                type: firstImage.type || 'output',
              },
              responseType: 'arraybuffer',
              timeout: 30000,
            });
            const imagePath = this.filesystemService.getTempPath(
              `${jobId}_wan_frame_${prompt.index}.png`,
            );
            fs.writeFileSync(imagePath, imageResponse.data);
            await this.convertImageToVideo(
              imagePath,
              outputPath,
              prompt.duration,
            );
            return outputPath;
          }
        } else if (status === 'error') {
          throw new Error(
            `Wan job failed: ${JSON.stringify(entry.status.messages || {})}`,
          );
        }

        if (attempt % 12 === 0 && attempt > 0) {
          this.logger.log(
            `Wan still generating... (${(attempt * 5) / 60}m elapsed)`,
          );
        }
      }

      if (!videoFilename) {
        throw new Error('Wan job timed out or returned no video');
      }

      // Step 3: Download the generated video
      const viewResponse = await axios.get(`${baseUrl}/view`, {
        params: {
          filename: videoFilename,
          subfolder: '',
          type: 'output',
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      fs.writeFileSync(outputPath, viewResponse.data);
      this.logger.log(`Wan video generated: ${outputPath}`);

      this.filesystemService.saveToDebug(
        `${jobId}_clip_${prompt.index}.mp4`,
        fs.readFileSync(outputPath),
      );

      return outputPath;
    } catch (error) {
      this.logger.error(`Wan T2V error: ${error.message}`);
      throw error; // Let caller fall back to placeholder
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
    timestamps: TimestampSegment[],
    wordTimings: WordTiming[],
    jobId: string,
  ): Promise<string> {
    this.logger.log('Generating subtitles');

    const subtitleFileName = `${jobId}_subtitles.srt`;
    const outputPath = this.filesystemService.getTempPath(subtitleFileName);

    // If we have actual word-level timings from Edge-TTS, realign the subtitles
    // to match the actual audio pace. Otherwise, fall back to Gemini estimates.
    const segments =
      wordTimings.length > 0
        ? this.realignSubtitlesWithAudio(timestamps, wordTimings)
        : timestamps;

    let srtContent = '';

    segments.forEach((segment, index) => {
      const startTime = this.formatSrtTime(segment.start);
      const endTime = this.formatSrtTime(segment.end);

      srtContent += `${index + 1}\n`;
      srtContent += `${startTime} --> ${endTime}\n`;
      srtContent += `${segment.text}\n\n`;
    });

    fs.writeFileSync(outputPath, srtContent, 'utf-8');
    this.logger.log(
      `Subtitles generated: ${outputPath} (${wordTimings.length > 0 ? 'audio-aligned' : 'estimate-based'})`,
    );

    return outputPath;
  }

  /**
   * Parses an Edge-TTS VTT subtitle file into an array of word-level timings.
   * Edge-TTS outputs cues with per-word granularity by default.
   */
  private parseVttSubtitles(vttPath: string): WordTiming[] {
    const content = fs.readFileSync(vttPath, 'utf-8');
    const lines = content.split('\n');
    const wordTimings: WordTiming[] = [];

    // Regex to match VTT timestamps: 00:00:00.000 --> 00:00:00.500
    const timestampRegex =
      /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(timestampRegex);

      if (match) {
        const startSec =
          parseInt(match[1]) * 3600 +
          parseInt(match[2]) * 60 +
          parseInt(match[3]) +
          parseInt(match[4]) / 1000;

        const endSec =
          parseInt(match[5]) * 3600 +
          parseInt(match[6]) * 60 +
          parseInt(match[7]) +
          parseInt(match[8]) / 1000;

        // The next non-empty line is the cue text (a word or short phrase)
        const textLine = lines[i + 1]?.trim();
        if (textLine && textLine !== '') {
          wordTimings.push({
            start: startSec,
            end: endSec,
            text: textLine,
          });
        }
      }
    }

    return wordTimings;
  }

  /**
   * Maps Gemini-estimated timestamp segments to actual audio word timings
   * from Edge-TTS VTT output. Uses fuzzy text matching to find the best
   * alignment for each subtitle segment.
   */
  private realignSubtitlesWithAudio(
    segments: TimestampSegment[],
    wordTimings: WordTiming[],
  ): TimestampSegment[] {
    // Build a flat array of all spoken words with their actual timings
    const spokenWords = wordTimings.map((w) => w.text.toLowerCase().trim());
    const spokenStartTimes = wordTimings.map((w) => w.start);
    const spokenEndTimes = wordTimings.map((w) => w.end);

    return segments.map((segment) => {
      // Normalize the segment text for matching
      const segmentWords = segment.text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);

      if (segmentWords.length === 0) {
        return segment; // Keep original estimate as fallback
      }

      // Find the best matching range in the spoken words using a sliding window
      let bestStart = -1;
      let bestEnd = -1;
      let bestScore = 0;

      for (let i = 0; i <= spokenWords.length - segmentWords.length; i++) {
        let matchCount = 0;
        for (let j = 0; j < segmentWords.length; j++) {
          if (spokenWords[i + j] === segmentWords[j]) {
            matchCount++;
          }
        }
        const score = matchCount / segmentWords.length;

        if (score > bestScore && score >= 0.5) {
          bestScore = score;
          bestStart = i;
          bestEnd = i + segmentWords.length - 1;
        }
      }

      if (bestStart >= 0 && bestEnd >= 0) {
        return {
          start: spokenStartTimes[bestStart],
          end: spokenEndTimes[bestEnd],
          text: segment.text, // Keep original text (capitalization, punctuation intact)
        };
      }

      // No good match found — fall back to the original estimate
      this.logger.warn(
        `Could not align subtitle segment "${segment.text.substring(0, 50)}..." to audio, using original timing`,
      );
      return segment;
    });
  }

  private formatSrtTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }
}
