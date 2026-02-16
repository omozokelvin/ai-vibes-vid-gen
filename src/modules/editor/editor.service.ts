import { Injectable, Logger } from '@nestjs/common';
import Ffmpeg from 'fluent-ffmpeg';
import { MediaFiles } from '../../common/interfaces/video-generation.interface';
import { FilesystemService } from '../filesystem/filesystem.service';

@Injectable()
export class EditorService {
  private readonly logger = new Logger(EditorService.name);

  constructor(private filesystemService: FilesystemService) {}

  async assembleVideo(mediaFiles: MediaFiles, jobId: string): Promise<string> {
    this.logger.log('Starting video assembly');

    const outputFileName = `${jobId}_output.mp4`;
    const outputPath = this.filesystemService.getTempPath(outputFileName);

    try {
      // Step 1: Concatenate video clips
      const concatenatedVideoPath = await this.concatenateVideos(
        mediaFiles.videoPaths,
        jobId,
      );

      // Step 2: Loop video to match audio duration if needed
      const loopedVideoPath = await this.loopVideoToMatchAudio(
        concatenatedVideoPath,
        mediaFiles.audioPath,
        jobId,
      );

      // Step 3: Add audio and subtitles
      await this.addAudioAndSubtitles(
        loopedVideoPath,
        mediaFiles.audioPath,
        mediaFiles.subtitlePath,
        outputPath,
      );

      this.logger.log(`Video assembly completed: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error(`Error assembling video: ${error.message}`);
      throw error;
    }
  }

  private concatenateVideos(
    videoPaths: string[],
    jobId: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputPath = this.filesystemService.getTempPath(
        `${jobId}_concatenated.mp4`,
      );

      this.logger.log(`Concatenating ${videoPaths.length} video clips`);

      const command = Ffmpeg();

      videoPaths.forEach((videoPath) => {
        command.input(videoPath);
      });

      command
        .on('start', (commandLine) => {
          this.logger.debug(`FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          this.logger.debug(`Processing: ${progress.percent}% done`);
        })
        .on('end', () => {
          this.logger.log(`Videos concatenated successfully`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          this.logger.error(`Error concatenating videos: ${err.message}`);
          reject(err);
        })
        .mergeToFile(outputPath, this.filesystemService.getTempDir());
    });
  }

  private loopVideoToMatchAudio(
    videoPath: string,
    audioPath: string,
    jobId: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // First, get the duration of the audio
      Ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          this.logger.error(`Error probing audio: ${err.message}`);
          // If we can't get audio duration, just use the video as-is
          resolve(videoPath);
          return;
        }

        const audioDuration = metadata.format.duration;

        // Get video duration
        Ffmpeg.ffprobe(videoPath, (err, videoMetadata) => {
          if (err) {
            this.logger.error(`Error probing video: ${err.message}`);
            resolve(videoPath);
            return;
          }

          const videoDuration = videoMetadata.format.duration;

          if (videoDuration >= audioDuration) {
            // Video is long enough, trim it to match audio
            this.trimVideo(videoPath, audioDuration, jobId)
              .then(resolve)
              .catch(reject);
          } else {
            // Video is too short, loop it
            this.loopVideo(videoPath, audioDuration, jobId)
              .then(resolve)
              .catch(reject);
          }
        });
      });
    });
  }

  private trimVideo(
    videoPath: string,
    duration: number,
    jobId: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputPath = this.filesystemService.getTempPath(
        `${jobId}_trimmed.mp4`,
      );

      Ffmpeg(videoPath)
        .setDuration(duration)
        .output(outputPath)
        .on('end', () => {
          this.logger.log(`Video trimmed to ${duration} seconds`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          this.logger.error(`Error trimming video: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }

  private loopVideo(
    videoPath: string,
    targetDuration: number,
    jobId: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputPath = this.filesystemService.getTempPath(
        `${jobId}_looped.mp4`,
      );

      Ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoDuration = metadata.format.duration;
        const loopCount = Math.ceil(targetDuration / videoDuration);

        this.logger.log(
          `Looping video ${loopCount} times to match audio duration`,
        );

        Ffmpeg(videoPath)
          .inputOptions([`-stream_loop ${loopCount - 1}`])
          .setDuration(targetDuration)
          .output(outputPath)
          .on('end', () => {
            this.logger.log(`Video looped successfully`);
            resolve(outputPath);
          })
          .on('error', (err) => {
            this.logger.error(`Error looping video: ${err.message}`);
            reject(err);
          })
          .run();
      });
    });
  }

  private addAudioAndSubtitles(
    videoPath: string,
    audioPath: string,
    subtitlePath: string,
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.log('Adding audio and burning subtitles');

      // Escape subtitle path for FFmpeg filter - replace backslashes and colons
      const escapedSubtitlePath = subtitlePath
        .replace(/\\/g, '/')
        .replace(/:/g, '\\:');

      Ffmpeg(videoPath)
        .input(audioPath)
        .outputOptions([
          '-c:v libx264',
          '-c:a aac',
          '-map 0:v:0',
          '-map 1:a:0',
          '-shortest',
          `-vf subtitles='${escapedSubtitlePath}'`,
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          this.logger.debug(`FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          this.logger.debug(`Processing: ${progress.percent}% done`);
        })
        .on('end', () => {
          this.logger.log('Audio and subtitles added successfully');
          resolve();
        })
        .on('error', (err) => {
          this.logger.error(`Error adding audio and subtitles: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }
}
