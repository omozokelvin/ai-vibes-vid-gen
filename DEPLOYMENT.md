# Deployment Guide

This guide provides instructions for deploying the AI Vibes Video Generation system to production.

## Prerequisites

### System Requirements

- Node.js v18 or higher
- Redis server v6 or higher
- FFMPEG with libx264, libmp3lame, and aac support
- Python 3.7+ (for edge-tts)
- Minimum 4GB RAM
- Minimum 10GB free disk space

### API Keys Required

1. **Google Gemini API Key** (Free tier)
   - Get from: https://makersuite.google.com/app/apikey
2. **Hugging Face API Token** (Free tier)
   - Get from: https://huggingface.co/settings/tokens

3. **YouTube Data API v3** (Optional - for uploads)
   - Setup OAuth2 credentials at: https://console.cloud.google.com/

## Installation Steps

### 1. Install System Dependencies

#### Ubuntu/Debian

```bash
# Update package list
sudo apt-get update

# Install FFMPEG
sudo apt-get install -y ffmpeg

# Install Python and pip
sudo apt-get install -y python3 python3-pip

# Install edge-tts
pip3 install edge-tts

# Install Redis
sudo apt-get install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

#### macOS

```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install FFMPEG
brew install ffmpeg

# Install Python
brew install python3

# Install edge-tts
pip3 install edge-tts

# Install Redis
brew install redis
brew services start redis
```

### 2. Clone and Install Application

```bash
# Clone the repository
git clone https://github.com/omozokelvin/ai-vibes-vid-gen.git
cd ai-vibes-vid-gen

# Install Node.js dependencies
npm install

# Build the application
npm run build
```

### 3. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your API keys and configuration
nano .env  # or use your preferred editor
```

Required environment variables:

```env
# Application
PORT=3000
NODE_ENV=production

# Google Gemini API
GEMINI_API_KEY=your_actual_api_key_here

# Hugging Face API
HUGGINGFACE_API_KEY=your_actual_api_key_here
HUGGINGFACE_VIDEO_MODEL=damo-vilab/text-to-video-ms-1.7b
# Optional: override full inference URL (useful for private endpoints)
# HUGGINGFACE_INFERENCE_URL=https://api-inference.huggingface.co/models/your-model

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# File Storage
TEMP_DIR=./temp
DEBUG_DIR=./debug
```

### 4. Verify Installation

```bash
# Test FFMPEG
ffmpeg -version

# Test edge-tts
edge-tts --list-voices | head

# Test Redis
redis-cli ping  # Should return PONG

# Test Node.js
node --version
```

## Production Deployment

### Option 1: PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application with PM2
pm2 start dist/main.js --name ai-vibes-vid-gen

# Configure PM2 to start on system boot
pm2 startup
pm2 save

# Monitor the application
pm2 monit

# View logs
pm2 logs ai-vibes-vid-gen
```

### Option 2: Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

# Install FFMPEG and Python
RUN apk add --no-cache ffmpeg python3 py3-pip

# Install edge-tts
RUN pip3 install edge-tts

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/main.js"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data

  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - HUGGINGFACE_API_KEY=${HUGGINGFACE_API_KEY}
    volumes:
      - ./temp:/app/temp
      - ./debug:/app/debug
    depends_on:
      - redis

volumes:
  redis-data:
```

Deploy with Docker:

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop
docker-compose down
```

### Option 3: Systemd Service

Create `/etc/systemd/system/ai-vibes-vid-gen.service`:

```ini
[Unit]
Description=AI Vibes Video Generation Service
After=network.target redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/ai-vibes-vid-gen
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ai-vibes-vid-gen
sudo systemctl start ai-vibes-vid-gen
sudo systemctl status ai-vibes-vid-gen
```

## Reverse Proxy Setup (Nginx)

Create `/etc/nginx/sites-available/ai-vibes-vid-gen`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Increase timeout for long video generation
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/ai-vibes-vid-gen /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL/HTTPS Setup (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

## Monitoring and Maintenance

### Health Checks

Create a monitoring script:

```bash
#!/bin/bash
# health-check.sh

response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/video)

if [ $response -eq 200 ]; then
    echo "Service is healthy"
    exit 0
else
    echo "Service is down (HTTP $response)"
    exit 1
fi
```

### Log Rotation

Configure logrotate for PM2:

```bash
sudo nano /etc/logrotate.d/ai-vibes-vid-gen
```

Content:

```
/home/user/.pm2/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

### Cleanup Script

Create a cleanup cron job to remove old temp files:

```bash
# Edit crontab
crontab -e

# Add daily cleanup at 2 AM
0 2 * * * find /path/to/ai-vibes-vid-gen/temp -type f -mtime +7 -delete
```

## Scaling Considerations

### Horizontal Scaling

1. **Redis Cluster**: Use Redis Cluster for distributed queue management
2. **Load Balancer**: Use Nginx or HAProxy to distribute requests
3. **Shared Storage**: Use NFS or S3 for temp/debug files across instances

### Worker Processes

Increase BullMQ workers for parallel video generation:

```typescript
// In app.module.ts
BullModule.registerQueue({
  name: 'video-generation',
  processors: [
    {
      concurrency: 5, // Process 5 jobs simultaneously
    },
  ],
}),
```

## Backup and Recovery

### Database Backup (Redis)

```bash
# Backup Redis data
redis-cli BGSAVE

# Copy RDB file
cp /var/lib/redis/dump.rdb /backup/redis-$(date +%Y%m%d).rdb
```

### Application Backup

```bash
# Backup script
#!/bin/bash
tar -czf ai-vibes-backup-$(date +%Y%m%d).tar.gz \
  /var/www/ai-vibes-vid-gen \
  /etc/nginx/sites-available/ai-vibes-vid-gen \
  /etc/systemd/system/ai-vibes-vid-gen.service
```

## Troubleshooting

### Application won't start

```bash
# Check logs
pm2 logs ai-vibes-vid-gen --lines 100

# Or with systemd
sudo journalctl -u ai-vibes-vid-gen -n 100
```

### Redis connection issues

```bash
# Check Redis status
sudo systemctl status redis
redis-cli ping

# Check Redis configuration
redis-cli CONFIG GET bind
```

### FFMPEG errors

```bash
# Verify FFMPEG installation
ffmpeg -version
ffmpeg -codecs | grep h264
ffmpeg -codecs | grep aac
```

### Out of disk space

```bash
# Check disk usage
df -h

# Clean old temp files
find ./temp -type f -mtime +1 -delete
find ./debug -type f -mtime +7 -delete
```

## Security Hardening

1. **Firewall Configuration**

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

2. **Rate Limiting** (in Nginx)

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/m;

location /video/generate {
    limit_req zone=api burst=5;
    proxy_pass http://localhost:3000;
}
```

3. **Environment Security**

```bash
# Restrict .env permissions
chmod 600 .env
chown www-data:www-data .env
```

## Performance Optimization

1. **Node.js Memory**

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" node dist/main.js
```

2. **Redis Optimization**

```bash
# Edit Redis config
sudo nano /etc/redis/redis.conf

# Set max memory
maxmemory 2gb
maxmemory-policy allkeys-lru
```

3. **FFMPEG Hardware Acceleration** (if available)

```typescript
// In editor.service.ts
.outputOptions([
  '-c:v h264_nvenc', // Use NVIDIA GPU
  // or
  '-c:v h264_qsv',   // Use Intel QuickSync
])
```

## Support and Updates

### Updating the Application

```bash
# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Rebuild
npm run build

# Restart with PM2
pm2 restart ai-vibes-vid-gen

# Or with systemd
sudo systemctl restart ai-vibes-vid-gen
```

### Monitoring Resources

- Check application health: `http://your-domain.com/video`
- Monitor queue: `http://your-domain.com/video/jobs`
- PM2 dashboard: `pm2 web` (accessible at http://localhost:9615)

## Production Checklist

- [ ] All system dependencies installed
- [ ] API keys configured in .env
- [ ] Redis running and accessible
- [ ] Application builds successfully
- [ ] PM2/Systemd service configured
- [ ] Nginx reverse proxy configured
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Log rotation configured
- [ ] Backup system in place
- [ ] Monitoring setup
- [ ] Health checks configured
- [ ] Cleanup cron job scheduled

## Contact and Support

For issues and questions:

- Create an issue on GitHub
- Check the documentation in README.md and USAGE.md
- Review logs for error details
