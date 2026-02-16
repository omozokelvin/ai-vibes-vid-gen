import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import * as fs from 'fs';
import { UploadUrls } from '../../common/interfaces/video-generation.interface';

@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);
  private youtube: any;

  constructor(private configService: ConfigService) {
    this.initializeYouTube();
  }

  private initializeYouTube() {
    const clientId = this.configService.get<string>('YOUTUBE_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'YOUTUBE_CLIENT_SECRET',
    );
    const redirectUri = this.configService.get<string>('YOUTUBE_REDIRECT_URI');

    if (clientId && clientSecret && redirectUri) {
      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri,
      );

      const refreshToken = this.configService.get<string>(
        'YOUTUBE_REFRESH_TOKEN',
      );
      if (refreshToken) {
        oauth2Client.setCredentials({
          refresh_token: refreshToken,
        });
      }

      this.youtube = google.youtube({
        version: 'v3',
        auth: oauth2Client,
      });
    }
  }

  async uploadToSocial(
    videoPath: string,
    title: string,
    description: string,
    tags: string[],
    uploadToYoutube: boolean,
    uploadToTiktok: boolean,
  ): Promise<UploadUrls> {
    const uploadUrls: UploadUrls = {};

    if (uploadToYoutube) {
      try {
        uploadUrls.youtube = await this.uploadToYouTube(
          videoPath,
          title,
          description,
          tags,
        );
      } catch (error) {
        this.logger.error(`Failed to upload to YouTube: ${error.message}`);
      }
    }

    if (uploadToTiktok) {
      try {
        uploadUrls.tiktok = await this.uploadToTikTok(
          videoPath,
          title,
          description,
        );
      } catch (error) {
        this.logger.error(`Failed to upload to TikTok: ${error.message}`);
      }
    }

    return uploadUrls;
  }

  private async uploadToYouTube(
    videoPath: string,
    title: string,
    description: string,
    tags: string[],
  ): Promise<string> {
    this.logger.log('Uploading to YouTube');

    if (!this.youtube) {
      throw new Error(
        'YouTube client not initialized. Please configure YouTube credentials.',
      );
    }

    try {
      const response = await this.youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: title,
            description: description,
            tags: tags,
            categoryId: '22', // People & Blogs
          },
          status: {
            privacyStatus: 'public', // or 'private' or 'unlisted'
          },
        },
        media: {
          body: fs.createReadStream(videoPath),
        },
      });

      const videoId = response.data.id;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      this.logger.log(`Video uploaded to YouTube: ${videoUrl}`);
      return videoUrl;
    } catch (error) {
      this.logger.error(`YouTube upload error: ${error.message}`);
      throw error;
    }
  }

  private async uploadToTikTok(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    videoPath: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    title: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    description: string,
  ): Promise<string> {
    this.logger.log('Uploading to TikTok');

    // Note: TikTok API requires special approval and access
    // This is a placeholder implementation
    // In production, you would need to implement OAuth flow and use the TikTok Content Posting API

    const accessToken = this.configService.get<string>('TIKTOK_ACCESS_TOKEN');

    if (!accessToken) {
      throw new Error('TikTok access token not configured');
    }

    // Placeholder: TikTok upload would require proper API integration
    this.logger.warn(
      'TikTok upload not fully implemented - requires API approval',
    );

    // Return a placeholder URL
    return 'https://tiktok.com/@user/video/placeholder';
  }
}
