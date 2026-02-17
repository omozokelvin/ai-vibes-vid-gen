# Architectural Patterns

This document describes the architectural patterns, design decisions, and conventions used throughout the AI Vibes Video Generation codebase.

## Table of Contents
1. [Dependency Injection](#dependency-injection)
2. [Decorator-Based Programming](#decorator-based-programming)
3. [Modular Architecture](#modular-architecture)
4. [Job Queue Pattern](#job-queue-pattern)
5. [Data Transfer Objects & Validation](#data-transfer-objects--validation)
6. [Service-Based Business Logic](#service-based-business-logic)
7. [Configuration Management](#configuration-management)
8. [Error Handling & Graceful Degradation](#error-handling--graceful-degradation)
9. [HTTP API Design](#http-api-design)
10. [Testing Patterns](#testing-patterns)

---

## Dependency Injection

**Pattern:** NestJS built-in dependency injection container

**Usage:** All services are injected via constructor parameters

**Example Locations:**
- [script.service.ts:15-19](../../src/modules/script/script.service.ts#L15-L19)
- [media.service.ts:17-21](../../src/modules/media/media.service.ts#L17-L21)
- [editor.service.ts:13-16](../../src/modules/editor/editor.service.ts#L13-L16)
- [video-generation.processor.ts:24-34](../../src/queues/video-generation.processor.ts#L24-L34)

**Benefits:**
- Testability through easy mocking
- Loose coupling between components
- Clear dependency declarations
- Automatic lifecycle management

**Convention:**
```typescript
constructor(
  private readonly configService: ConfigService,
  private readonly filesystemService: FilesystemService,
) {}
```

All dependencies use `private readonly` to ensure immutability and encapsulation.

---

## Decorator-Based Programming

**Pattern:** TypeScript decorators for metadata-driven configuration

**Decorator Categories:**

### Module Decorators
- `@Module()` - Defines module boundaries, imports, providers, exports
- See [app.module.ts:12](../../src/app.module.ts#L12), [script.module.ts:5](../../src/modules/script/script.module.ts#L5)

### Controller Decorators
- `@Controller()` - Defines HTTP route prefix
- `@Post()`, `@Get()` - HTTP method handlers
- `@Body()`, `@Param()`, `@Query()` - Parameter extraction
- See [app.controller.ts:13-17](../../src/app.controller.ts#L13-L17)

### Injectable Decorators
- `@Injectable()` - Marks class as available for DI
- Used on all services: [script.service.ts:14](../../src/modules/script/script.service.ts#L14)

### Job Processor Decorators
- `@Processor('queue-name')` - Registers BullMQ processor
- `@Process('job-name')` - Defines job handler method
- See [video-generation.processor.ts:14](../../src/queues/video-generation.processor.ts#L14)

### Validation Decorators
- `@IsString()`, `@IsNotEmpty()`, `@IsOptional()`, `@IsBoolean()`
- See [generate-video.dto.ts:5-26](../../src/common/dto/generate-video.dto.ts#L5-L26)

### Documentation Decorators
- `@ApiOperation()`, `@ApiResponse()`, `@ApiProperty()`
- See [app.controller.ts:21-30](../../src/app.controller.ts#L21-L30)

---

## Modular Architecture

**Pattern:** Feature-based module organization with clear boundaries

**Module Structure:**
```
Module/
├── *.module.ts      # Module definition (@Module decorator)
├── *.service.ts     # Business logic (@Injectable)
└── *.spec.ts        # Unit tests
```

**Core Modules:**
1. **ScriptModule** - AI script generation
   - Dependencies: FilesystemModule, ConfigModule
   - See [script.module.ts:5-10](../../src/modules/script/script.module.ts#L5-L10)

2. **MediaModule** - Audio, video, subtitle generation
   - Dependencies: FilesystemModule, ConfigModule
   - See [media.module.ts:5-10](../../src/modules/media/media.module.ts#L5-L10)

3. **EditorModule** - FFmpeg video assembly
   - Dependencies: FilesystemModule, ConfigModule
   - See [editor.module.ts:5-10](../../src/modules/editor/editor.module.ts#L5-L10)

4. **PublisherModule** - Social media uploads
   - Dependencies: ConfigModule
   - See [publisher.module.ts:5-10](../../src/modules/publisher/publisher.module.ts#L5-L10)

5. **FilesystemModule** - File operations utility
   - Base dependency for most modules
   - See [filesystem.module.ts:5-10](../../src/modules/filesystem/filesystem.module.ts#L5-L10)

**Module Registration:**
- All modules registered in [app.module.ts:31-35](../../src/app.module.ts#L31-L35)
- ConfigModule set as global: [app.module.ts:14-17](../../src/app.module.ts#L14-L17)

---

## Job Queue Pattern

**Pattern:** BullMQ-based asynchronous job processing with Redis backend

**Configuration:**
- Queue registration: [app.module.ts:28-30](../../src/app.module.ts#L28-L30)
- Redis connection: [app.module.ts:18-27](../../src/app.module.ts#L18-L27)

**Job Creation:**
- Controller adds job to queue: [app.controller.ts:37-58](../../src/app.controller.ts#L37-L58)
- Retry strategy: 3 attempts with exponential backoff (5s initial delay)

**Job Processing:**
- Processor decorated with `@Processor('video-generation')`
- Handler method: [video-generation.processor.ts:36-116](../../src/queues/video-generation.processor.ts#L36-L116)
- Progress reporting at: 10%, 25%, 50%, 75%, 90%, 100%

**Progress Tracking:**
```typescript
await job.progress(25); // After script generation
await job.progress(50); // After media generation
await job.progress(75); // After video assembly
await job.progress(90); // After upload
```

**Job Status Queries:**
- Status endpoint: [app.controller.ts:67-100](../../src/app.controller.ts#L67-L100)
- Returns job state, progress, and result

**Benefits:**
- Decouples request/response from long-running processes
- Enables retry logic for transient failures
- Provides progress visibility to clients
- Prevents API overload

---

## Data Transfer Objects & Validation

**Pattern:** Class-based DTOs with decorator-driven validation

**DTO Location:** `src/common/dto/`

**Validation Setup:**
- Global ValidationPipe: [main.ts:10](../../src/main.ts#L10)
- Automatic transformation and validation on all requests

**Example DTO:**
See [generate-video.dto.ts:5-26](../../src/common/dto/generate-video.dto.ts#L5-L26)

**Validation Decorators:**
- `@IsString()` - Ensures string type
- `@IsNotEmpty()` - Requires non-empty value
- `@IsOptional()` - Allows undefined/null
- `@IsBoolean()` - Ensures boolean type

**Swagger Integration:**
- `@ApiProperty()` - Documents required fields
- `@ApiPropertyOptional()` - Documents optional fields

**Benefits:**
- Type safety at runtime
- Automatic request validation
- Self-documenting API (via Swagger)
- Centralized validation rules

---

## Service-Based Business Logic

**Pattern:** Single Responsibility Principle - one service per domain

**Service Characteristics:**
- All services marked with `@Injectable()`
- Constructor-based dependency injection
- Private methods for internal logic
- Public methods for module interface
- Logger instance for debugging

**Service Responsibilities:**

1. **ScriptService** - Script generation only
   - See [script.service.ts:20-84](../../src/modules/script/script.service.ts#L20-L84)

2. **MediaService** - Media asset creation
   - Audio generation: [media.service.ts:23-50](../../src/modules/media/media.service.ts#L23-L50)
   - Video generation: [media.service.ts:52-120](../../src/modules/media/media.service.ts#L52-L120)
   - Subtitle generation: [media.service.ts:122-150](../../src/modules/media/media.service.ts#L122-L150)

3. **EditorService** - Video assembly
   - Video concatenation: [editor.service.ts:18-60](../../src/modules/editor/editor.service.ts#L18-L60)
   - Audio/subtitle merging: [editor.service.ts:62-100](../../src/modules/editor/editor.service.ts#L62-L100)

4. **PublisherService** - Platform uploads
   - YouTube upload: [publisher.service.ts:30-80](../../src/modules/publisher/publisher.service.ts#L30-L80)
   - TikTok placeholder: [publisher.service.ts:82-90](../../src/modules/publisher/publisher.service.ts#L82-L90)

5. **FilesystemService** - File operations
   - Directory management: [filesystem.service.ts:12-30](../../src/modules/filesystem/filesystem.service.ts#L12-L30)
   - File I/O helpers: [filesystem.service.ts:32-70](../../src/modules/filesystem/filesystem.service.ts#L32-L70)

**Convention:** Services never directly depend on each other except through module exports

---

## Configuration Management

**Pattern:** Environment-based configuration via ConfigModule

**Setup:**
- Global ConfigModule: [app.module.ts:14-17](../../src/app.module.ts#L14-L17)
- Loads `.env` file at startup

**Usage in Services:**
```typescript
constructor(private readonly configService: ConfigService) {}

const apiKey = this.configService.get<string>('GEMINI_API_KEY');
const port = this.configService.get<number>('REDIS_PORT') || 6379;
```

**Configuration Categories:**
1. **API Keys:** GEMINI_API_KEY, HUGGINGFACE_API_KEY, YOUTUBE_*, TIKTOK_*
2. **Infrastructure:** REDIS_HOST, REDIS_PORT, PORT
3. **Providers:** HUGGINGFACE_VIDEO_PROVIDER, HUGGINGFACE_SPACE_NAME
4. **Paths:** TEMP_DIR, DEBUG_DIR

**Benefits:**
- Environment-specific configuration without code changes
- Centralized configuration access
- Type-safe configuration retrieval
- Secret management through environment variables

---

## Error Handling & Graceful Degradation

**Pattern:** Fallback mechanisms at every integration point

**Fallback Strategies:**

1. **Script Generation Fallback**
   - Primary: Google Gemini API
   - Fallback: Hardcoded template script
   - See [script.service.ts:60-84](../../src/modules/script/script.service.ts#L60-L84)

2. **Video Generation Fallback**
   - Primary: Hugging Face API
   - Fallback: Placeholder video files
   - See [media.service.ts:90-120](../../src/modules/media/media.service.ts#L90-L120)

3. **Audio Generation Fallback**
   - Primary: edge-tts CLI
   - Fallback: Silent audio file
   - See [media.service.ts:40-50](../../src/modules/media/media.service.ts#L40-L50)

4. **Upload Fallback**
   - Primary: YouTube/TikTok APIs
   - Fallback: Continue without upload
   - See [publisher.service.ts:70-80](../../src/modules/publisher/publisher.service.ts#L70-L80)

**Error Logging:**
- All services use NestJS Logger: `private readonly logger = new Logger(ServiceName.name);`
- Errors logged with context: `this.logger.error('Message', error.stack);`

**Benefits:**
- System continues despite external API failures
- Partial results better than complete failure
- Clear error visibility through logging
- Retry logic via BullMQ

---

## HTTP API Design

**Pattern:** RESTful API with Swagger documentation

**Endpoint Structure:**

1. **POST /video/generate** - Job creation
   - Body: GenerateVideoDto
   - Response: `{ jobId, queueJobId, status }`
   - See [app.controller.ts:21-60](../../src/app.controller.ts#L21-L60)

2. **GET /video/status/:jobId** - Job status
   - Param: queueJobId
   - Response: Job state with progress/result
   - See [app.controller.ts:67-100](../../src/app.controller.ts#L67-L100)

3. **GET /video/jobs** - List jobs
   - Response: Array of job states
   - See [app.controller.ts:107-120](../../src/app.controller.ts#L107-L120)

4. **GET /video** - Health check
   - Response: Service status
   - See [app.controller.ts:127-130](../../src/app.controller.ts#L127-L130)

**Response Format Convention:**
```typescript
{
  message: string,
  jobId?: string,
  queueJobId?: string,
  status?: string,
  data?: any
}
```

**Swagger Documentation:**
- Setup: [main.ts:16-26](../../src/main.ts#L16-L26)
- Available at: `http://localhost:3000/docs`
- All endpoints decorated with `@ApiOperation()`, `@ApiResponse()`

**CORS:**
- Enabled globally: [main.ts:13](../../src/main.ts#L13)

---

## Testing Patterns

**Pattern:** Jest-based unit and E2E testing with mocking

### Unit Testing

**Structure:**
- Test files: `*.spec.ts` alongside implementation
- Test framework: Jest with ts-jest
- Mocking: NestJS Testing utilities

**Example Pattern:**
```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let mockDependency: Partial<DependencyType>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ServiceName,
        { provide: Dependency, useValue: mockDependency }
      ],
    }).compile();

    service = module.get(ServiceName);
  });

  it('should perform operation', async () => {
    // Arrange, Act, Assert
  });
});
```

**Unit Test Examples:**
- [script.service.spec.ts](../../src/modules/script/script.service.spec.ts)
- [media.service.spec.ts](../../src/modules/media/media.service.spec.ts)
- [editor.service.spec.ts](../../src/modules/editor/editor.service.spec.ts)

### E2E Testing

**Location:** `test/app.e2e-spec.ts`

**Scope:**
- Full application bootstrap
- Real HTTP requests via supertest
- Real Redis queue (requires running instance)
- DTO validation testing

**Pattern:**
```typescript
describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/video/generate (POST)', () => {
    return request(app.getHttpServer())
      .post('/video/generate')
      .send({ prompt: 'test' })
      .expect(201);
  });
});
```

**Test Coverage:**
- Configuration: [package.json:80-83](../../package.json#L80-L83)
- Excludes: `*.spec.ts`, `main.ts`
- Run: `npm run test:cov`

---

## Conventions Summary

1. **File Naming:** kebab-case for all files (e.g., `video-generation.processor.ts`)
2. **Class Naming:** PascalCase (e.g., `VideoGenerationProcessor`)
3. **Module Pattern:** Each feature module exports its service for DI
4. **Async/Await:** All I/O operations use async/await (no callbacks)
5. **Error Handling:** Try-catch with fallbacks, never throw unhandled errors
6. **Logging:** Use NestJS Logger, never console.log
7. **Type Safety:** All public APIs have explicit return types
8. **Dependency Injection:** Constructor injection only, no property injection
9. **Testing:** Mock all external dependencies in unit tests

---

## Migration & Scaling Considerations

**Current Architecture Supports:**
- Horizontal scaling of worker instances (multiple processors on same queue)
- Separate deployment of API and processor components
- Easy addition of new video providers or social platforms
- Potential migration to microservices (modules are already isolated)

**Future Enhancements:**
- Replace BullMQ with cloud queue (SQS, Pub/Sub) for distributed deployment
- Add caching layer (Redis) for script generation results
- Implement webhook callbacks instead of polling
- Add database for persistent job history
