import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  VisualPrompt,
  ScriptData,
  MediaFiles,
} from '../../common/interfaces/video-generation.interface';
import { FilesystemService } from '../filesystem/filesystem.service';

const execAsync = promisify(exec);

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private hfApiKey: string;

  constructor(
    private configService: ConfigService,
    private filesystemService: FilesystemService,
  ) {
    this.hfApiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
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
      // Use edge-tts command line tool
      // edge-tts --text "Your text" --write-media output.mp3
      const command = `edge-tts --text "${script.replace(/"/g, '\\"')}" --write-media "${outputPath}"`;

      await execAsync(command);

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

  private async createSilentAudio(jobId: string): Promise<string> {
    const audioFileName = `${jobId}_audio.mp3`;
    const outputPath = this.filesystemService.getTempPath(audioFileName);

    // Create 30 seconds of silence
    const command = `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 30 -q:a 9 -acodec libmp3lame "${outputPath}"`;

    try {
      await execAsync(command);
      this.logger.log(`Created silent audio: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error(`Error creating silent audio: ${error.message}`);
      throw error;
    }
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
      // Model: damo-vilab/text-to-video-ms-1.7b
      const response = await axios.post(
        'https://api-inference.huggingface.co/models/damo-vilab/text-to-video-ms-1.7b',
        {
          inputs: prompt.prompt,
        },
        {
          headers: {
            Authorization: `Bearer ${this.hfApiKey}`,
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
      this.logger.error(`Hugging Face API error: ${error.message}`);
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

    // Create a simple color video with text overlay
    const command = `ffmpeg -f lavfi -i color=c=blue:s=1280x720:d=${duration} -vf "drawtext=text='${prompt.prompt.substring(0, 50).replace(/'/g, "\\'")}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`;

    try {
      await execAsync(command);
      this.logger.log(`Created placeholder video: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error(`Error creating placeholder video: ${error.message}`);
      throw error;
    }
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
