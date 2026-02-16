import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ScriptData } from '../../common/interfaces/video-generation.interface';
import { FilesystemService } from '../filesystem/filesystem.service';

@Injectable()
export class ScriptService {
  private readonly logger = new Logger(ScriptService.name);
  private genAI: GoogleGenerativeAI;

  constructor(
    private configService: ConfigService,
    private filesystemService: FilesystemService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async generateScript(prompt: string, jobId: string): Promise<ScriptData> {
    this.logger.log(`Generating script for prompt: ${prompt}`);

    if (!this.genAI) {
      this.logger.warn('Gemini API not configured, using fallback script');
      const fallbackScript = this.createFallbackScript(prompt);
      this.filesystemService.saveToDebug(`${jobId}_script.json`, fallbackScript);
      return fallbackScript;
    }

    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

    const systemPrompt = `You are a video script writer. Given a user prompt, generate a structured JSON response for a short video (30-60 seconds).

The response must be valid JSON with this exact structure:
{
  "script": "The complete narration text that will be spoken",
  "visual_prompts": [
    {
      "index": 0,
      "prompt": "Detailed visual description for video generation",
      "duration": 5
    }
  ],
  "timestamps": [
    {
      "start": 0,
      "end": 5,
      "text": "Text to display as subtitle"
    }
  ]
}

Guidelines:
- The script should be engaging and informative
- Create 3-6 visual prompts, each 5-10 seconds long
- Each visual prompt should describe what should be shown in the video
- Timestamps should align with the script for subtitle generation
- Total duration should be 30-60 seconds

User Prompt: ${prompt}

Generate the JSON response now:`;

    try {
      const result = await model.generateContent(systemPrompt);
      const response = await result.response;
      const text = response.text();

      // Try to extract JSON from the response
      let scriptData: ScriptData;
      try {
        // Remove markdown code blocks if present
        const jsonText = text
          .replace(/```json\n/g, '')
          .replace(/```\n/g, '')
          .replace(/```/g, '')
          .trim();

        scriptData = JSON.parse(jsonText);
      } catch (parseError) {
        this.logger.warn(
          'Failed to parse Gemini response as JSON, using fallback',
        );
        scriptData = this.createFallbackScript(prompt);
      }

      // Validate and ensure structure
      scriptData = this.validateScriptData(scriptData);

      // Save to debug
      this.filesystemService.saveToDebug(`${jobId}_script.json`, scriptData);

      this.logger.log(`Script generated successfully`);
      return scriptData;
    } catch (error) {
      this.logger.error(`Error generating script: ${error.message}`);
      // Return fallback script
      return this.createFallbackScript(prompt);
    }
  }

  private createFallbackScript(prompt: string): ScriptData {
    return {
      script: `This is a video about ${prompt}. We'll explore this fascinating topic in detail.`,
      visual_prompts: [
        {
          index: 0,
          prompt: `Cinematic scene showing ${prompt}`,
          duration: 10,
        },
        {
          index: 1,
          prompt: `Close-up details of ${prompt}`,
          duration: 10,
        },
        {
          index: 2,
          prompt: `Wide angle view of ${prompt}`,
          duration: 10,
        },
      ],
      timestamps: [
        {
          start: 0,
          end: 10,
          text: `This is a video about ${prompt}.`,
        },
        {
          start: 10,
          end: 20,
          text: "We'll explore this fascinating topic",
        },
        {
          start: 20,
          end: 30,
          text: 'in detail.',
        },
      ],
    };
  }

  private validateScriptData(data: any): ScriptData {
    if (!data.script) {
      data.script = 'Generated video content.';
    }

    if (
      !Array.isArray(data.visual_prompts) ||
      data.visual_prompts.length === 0
    ) {
      data.visual_prompts = [
        { index: 0, prompt: 'Cinematic video scene', duration: 10 },
      ];
    }

    if (!Array.isArray(data.timestamps) || data.timestamps.length === 0) {
      data.timestamps = [
        { start: 0, end: 10, text: data.script.substring(0, 100) },
      ];
    }

    return data as ScriptData;
  }
}
