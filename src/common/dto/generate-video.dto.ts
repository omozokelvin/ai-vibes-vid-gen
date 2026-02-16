import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateVideoDto {
  @ApiProperty({
    description: 'Text prompt describing the video to generate',
    example: '1860 battleships sailing in the ocean',
  })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiPropertyOptional({
    description: 'Whether to upload the generated video to YouTube',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  uploadToYoutube?: boolean;

  @ApiPropertyOptional({
    description: 'Whether to upload the generated video to TikTok',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  uploadToTiktok?: boolean;

  @ApiPropertyOptional({
    description: 'Title for the video (used for social media uploads)',
    example: 'Historic Battleships',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Description for the video (used for social media uploads)',
    example: 'A video about 1860 era battleships',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated tags for the video (used for social media uploads)',
    example: 'history,ships,battleships',
  })
  @IsOptional()
  @IsString()
  tags?: string;
}
