export interface ScriptData {
  script: string;
  visual_prompts: VisualPrompt[];
  timestamps: TimestampSegment[];
}

export interface VisualPrompt {
  index: number;
  prompt: string;
  duration: number;
}

export interface TimestampSegment {
  start: number;
  end: number;
  text: string;
}

export interface VideoGenerationJob {
  id: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scriptData?: ScriptData;
  mediaFiles?: MediaFiles;
  finalVideoPath?: string;
  uploadUrls?: UploadUrls;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaFiles {
  audioPath: string;
  videoPaths: string[];
  subtitlePath: string;
}

export interface UploadUrls {
  youtube?: string;
  tiktok?: string;
}
