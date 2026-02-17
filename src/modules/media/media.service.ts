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
  private hfApiKey: string;
  private hfInferenceUrl: string;
  private hfModelId: string;

  constructor(
    private configService: ConfigService,
    private filesystemService: FilesystemService,
  ) {
    this.hfApiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
    this.hfModelId =
      this.configService.get<string>('HUGGINGFACE_VIDEO_MODEL') ||
      'damo-vilab/text-to-video-ms-1.7b';
    this.hfInferenceUrl =
      this.configService.get<string>('HUGGINGFACE_INFERENCE_URL') ||
      `https://api-inference.huggingface.co/models/${this.hfModelId}`;
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

    if (!this.hfApiKey) {
      this.logger.warn(
        'Hugging Face API key not configured, using placeholder',
      );
      return this.createPlaceholderVideo(prompt, jobId);
    }

    try {
      // Use Hugging Face Inference API for text-to-video
      const response = await axios.post(
        this.hfInferenceUrl,
        {
          inputs: prompt.prompt,
        },
        {
          headers: {
            Authorization: `Bearer ${this.hfApiKey}`,
            Accept: 'video/mp4',
          },
          responseType: 'arraybuffer',
          timeout: 120000, // 2 minutes timeout
        },
      );

      fs.writeFileSync(outputPath, response.data);
      this.logger.log(`Video generated: ${outputPath}`);

      // Save to debug
      this.filesystemService.saveToDebug(
        `${jobId}_clip_${prompt.index}.mp4`,
        response.data,
      );

      return outputPath;
    } catch (error) {
      const status = error?.response?.status;
      if (status === 410) {
        this.logger.error(
          `Hugging Face model is no longer available (410). Update HUGGINGFACE_VIDEO_MODEL or HUGGINGFACE_INFERENCE_URL. Current model: ${this.hfModelId}`,
        );
      } else {
        this.logger.error(`Hugging Face API error: ${error.message}`);
      }
      return this.createPlaceholderVideo(prompt, jobId);
    }
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
