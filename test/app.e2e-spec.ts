import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /video', () => {
    it('should return API status message', () => {
      return request(app.getHttpServer())
        .get('/video')
        .expect(200)
        .expect('AI Vibes Video Generation API is running!');
    });
  });

  describe('POST /video/generate', () => {
    it('should accept valid video generation request', async () => {
      const response = await request(app.getHttpServer())
        .post('/video/generate')
        .send({
          prompt: 'test battleships sailing',
          uploadToYoutube: false,
          uploadToTiktok: false,
        })
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('queueJobId');
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('queued');
      expect(response.body.message).toBe('Video generation job started');
    });

    it('should accept request with optional fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/video/generate')
        .send({
          prompt: 'historic ships',
          uploadToYoutube: false,
          uploadToTiktok: false,
          title: 'Test Video',
          description: 'Test description',
          tags: 'test,video',
        })
        .expect(201);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('queueJobId');
      expect(response.body.status).toBe('queued');
    });

    it('should reject request without prompt', async () => {
      const response = await request(app.getHttpServer())
        .post('/video/generate')
        .send({
          uploadToYoutube: false,
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(Array.isArray(response.body.message)).toBe(true);
    });

    it('should reject request with invalid prompt type', async () => {
      const response = await request(app.getHttpServer())
        .post('/video/generate')
        .send({
          prompt: 123,
          uploadToYoutube: false,
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject request with invalid uploadToYoutube type', async () => {
      const response = await request(app.getHttpServer())
        .post('/video/generate')
        .send({
          prompt: 'test prompt',
          uploadToYoutube: 'yes',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /video/status/:jobId', () => {
    let testJobId: string;

    beforeAll(async () => {
      // Create a test job first
      const response = await request(app.getHttpServer())
        .post('/video/generate')
        .send({
          prompt: 'test status check',
          uploadToYoutube: false,
        });
      testJobId = response.body.queueJobId;
    });

    it('should return job status for valid job ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/video/status/${testJobId}`)
        .expect(200);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('state');
      expect(response.body).toHaveProperty('progress');
      expect(response.body.jobId).toBe(testJobId);
    });

    it('should return error for non-existent job ID', async () => {
      const response = await request(app.getHttpServer())
        .get('/video/status/nonexistent123')
        .expect(200);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Job not found');
    });
  });

  describe('GET /video/jobs', () => {
    const createdJobIds: string[] = [];

    beforeAll(async () => {
      // Create a few test jobs and store their IDs
      const job1 = await request(app.getHttpServer())
        .post('/video/generate')
        .send({
          prompt: 'test job 1',
          uploadToYoutube: false,
        });
      createdJobIds.push(job1.body.queueJobId);

      const job2 = await request(app.getHttpServer())
        .post('/video/generate')
        .send({
          prompt: 'test job 2',
          uploadToYoutube: false,
        });
      createdJobIds.push(job2.body.queueJobId);

      // Wait a bit for jobs to be registered in queue
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should return list of all jobs', async () => {
      const response = await request(app.getHttpServer())
        .get('/video/jobs')
        .expect(200);

      expect(response.body).toHaveProperty('waiting');
      expect(response.body).toHaveProperty('active');
      expect(response.body).toHaveProperty('completed');
      expect(response.body).toHaveProperty('failed');
      expect(response.body).toHaveProperty('jobs');

      expect(typeof response.body.waiting).toBe('number');
      expect(typeof response.body.active).toBe('number');
      expect(typeof response.body.completed).toBe('number');
      expect(typeof response.body.failed).toBe('number');

      expect(response.body.jobs).toHaveProperty('waiting');
      expect(response.body.jobs).toHaveProperty('active');
      expect(response.body.jobs).toHaveProperty('completed');
      expect(response.body.jobs).toHaveProperty('failed');

      expect(Array.isArray(response.body.jobs.waiting)).toBe(true);
      expect(Array.isArray(response.body.jobs.active)).toBe(true);
      expect(Array.isArray(response.body.jobs.completed)).toBe(true);
      expect(Array.isArray(response.body.jobs.failed)).toBe(true);
    });

    it('should have jobs tracked after creation', async () => {
      // Create a new job right before checking
      await request(app.getHttpServer()).post('/video/generate').send({
        prompt: 'immediate test job',
        uploadToYoutube: false,
      });

      // Immediately check jobs - should still be in queue
      const response = await request(app.getHttpServer())
        .get('/video/jobs')
        .expect(200);

      // Check that the structure is valid and contains our jobs
      const totalJobs =
        response.body.waiting +
        response.body.active +
        response.body.completed +
        response.body.failed;

      // With a fresh job, we should have at least 1
      expect(totalJobs).toBeGreaterThan(0);
    });
  });
});
