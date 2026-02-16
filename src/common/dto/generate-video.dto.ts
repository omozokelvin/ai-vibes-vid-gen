import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class GenerateVideoDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsOptional()
  @IsBoolean()
  uploadToYoutube?: boolean;

  @IsOptional()
  @IsBoolean()
  uploadToTiktok?: boolean;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  tags?: string;
}
