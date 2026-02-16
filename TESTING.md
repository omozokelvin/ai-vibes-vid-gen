# Testing Guide

This document describes the testing infrastructure and how to run tests for the AI Vibes Video Generation project.

## Test Structure

The project uses Jest as the testing framework along with NestJS testing utilities.

### Test Files

All tests are located in the `test/` directory:

- **`filesystem.spec.ts`**: Unit tests for the FilesystemService
- **`script.spec.ts`**: Unit tests for the ScriptService  
- **`app.e2e-spec.ts`**: Integration/E2E tests for the API endpoints

### Integration Tests

The `app.e2e-spec.ts` file contains comprehensive integration tests that verify:

1. **API Health Check** (`GET /video`)
   - Verifies the API is running and responds correctly

2. **Video Generation** (`POST /video/generate`)
   - Tests job creation with valid inputs
   - Tests job creation with optional fields (title, description, tags)
   - Tests input validation (missing prompt, invalid types)
   - Verifies proper error handling for invalid requests

3. **Job Status Checking** (`GET /video/status/:jobId`)
   - Tests status retrieval for valid job IDs
   - Tests error handling for non-existent jobs
   - Verifies proper response structure

4. **Job Listing** (`GET /video/jobs`)
   - Tests retrieval of all jobs in different states
   - Verifies proper categorization (waiting, active, completed, failed)
   - Tests response structure and data types

## Prerequisites

### Redis

Integration tests require Redis to be running for the BullMQ queue system.

**Start Redis using Docker:**
```bash
docker run -d -p 6379:6379 --name redis-test redis:alpine
```

**Verify Redis is running:**
```bash
docker exec redis-test redis-cli ping
# Should return: PONG
```

**Stop Redis after testing:**
```bash
docker stop redis-test
docker rm redis-test
```

### Environment Variables

Tests use the `.env` file for configuration. Make sure it exists:
```bash
cp .env.example .env
```

The tests will work without real API keys since they test the API layer, not the external integrations. However, some error messages may appear in the logs (which is expected).

## Running Tests

### Run All Integration Tests
```bash
npm run test:e2e
```

### Run Specific Test File
```bash
npx jest test/app.e2e-spec.ts
```

### Run with Coverage
```bash
npm run test:cov
```

### Run in Watch Mode
```bash
npm run test:watch
```

## Expected Output

When running tests successfully, you should see:

```
Test Suites: 3 passed, 3 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        ~15s
```

## Notes

- **External API Errors**: You may see error messages about Gemini API or FFMPEG not being available. This is expected in the test environment and doesn't indicate test failures.
- **Job Processing**: The tests verify that jobs are created and can be tracked, but don't wait for actual video generation to complete (which would require external APIs and tools).
- **Test Isolation**: Each test suite creates a fresh application instance to ensure test isolation.

## Continuous Integration

These tests are designed to run in CI/CD environments. Make sure your CI pipeline:

1. Starts a Redis instance
2. Sets up the environment variables
3. Runs `npm run test:e2e`
4. Cleans up Redis after tests

Example CI setup (GitHub Actions):
```yaml
- name: Start Redis
  run: docker run -d -p 6379:6379 redis:alpine
  
- name: Run integration tests
  run: npm run test:e2e
```
