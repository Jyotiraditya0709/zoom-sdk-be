# 🚀 Zoom SDK Backend Setup Guide

## 📋 Prerequisites

- Node.js 18+ installed
- Git installed
- Zoom Developer Account
- Redis service (for queue management)
- AWS S3 bucket (for recording storage)

## 🛠️ Installation Steps

### 1. Clone and Install Dependencies
```bash
git clone <your-repo-url>
cd zoom-sdk-be
npm install
```

### 2. Environment Configuration

#### Step A: Copy Environment Template
```bash
# Copy the template to create your .env file
cp env.template .env
```

#### Step B: Configure Zoom SDK Credentials
1. Go to [Zoom Developer Console](https://developers.zoom.us/)
2. Create a new app or use existing one
3. Get your SDK Key and Secret
4. Update `.env` file:
```env
ZOOM_SDK_KEY=your_actual_sdk_key
ZOOM_SDK_SECRET=your_actual_sdk_secret
```

#### Step C: Configure Webhook (Optional)
1. In Zoom Developer Console, go to your app's Event Subscriptions
2. Add webhook URL: `https://your-domain.com/webhook/zoom`
3. Get the webhook secret token
4. Update `.env` file:
```env
ZOOM_WEBHOOK_SECRET_TOKEN=your_webhook_secret
```

#### Step D: Configure Redis (Required for Queue System)
**Option A: Online Redis Service (Recommended)**
1. Sign up for [Redis Cloud](https://redis.com/try-free/) or [Upstash](https://upstash.com/)
2. Get your Redis URL
3. Update `.env` file:
```env
REDIS_URL=redis://default:password@host:port
```

**Option B: Local Redis (Development Only)**
```bash
# Install Redis locally
# macOS: brew install redis
# Ubuntu: sudo apt-get install redis-server
# Windows: Download from https://redis.io/download

# Start Redis
redis-server

# Update .env
REDIS_URL=redis://localhost:6379
```

#### Step E: Configure AWS S3 (Required for Recording Storage)
1. Create AWS account and S3 bucket
2. Create IAM user with S3 access
3. Get Access Key ID and Secret Access Key
4. Update `.env` file:
```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-southeast-1
S3_BUCKET_NAME=your_bucket_name
```

### 3. Start the Server

#### Development Mode
```bash
npm start
```

#### Production Mode
```bash
NODE_ENV=production npm start
```

## 🔧 Configuration Options

### Environment Variables Explained

| Variable | Required | Description |
|----------|----------|-------------|
| `ZOOM_SDK_KEY` | ✅ | Your Zoom SDK Key |
| `ZOOM_SDK_SECRET` | ✅ | Your Zoom SDK Secret |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | ❌ | Webhook validation token |
| `PORT` | ❌ | Server port (default: 4000) |
| `REDIS_URL` | ✅ | Redis connection URL |
| `AWS_ACCESS_KEY_ID` | ✅ | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | ✅ | AWS secret key |
| `AWS_REGION` | ✅ | AWS region |
| `S3_BUCKET_NAME` | ✅ | S3 bucket name |

### Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `ENABLE_WEBHOOK_VALIDATION` | true | Enable webhook signature validation |
| `ENABLE_QUEUE_DASHBOARD` | true | Enable BullBoard dashboard |
| `ENABLE_RECORDING_PROCESSING` | true | Enable recording processing |

## 🧪 Testing

### Test Signature Generation
```bash
curl -X POST http://localhost:4000/generateSignature \
  -H "Content-Type: application/json" \
  -d '{"sessionName":"test-session","role":0}'
```

### Test Webhook (if configured)
```bash
npm run test-webhook
```

## 📊 Monitoring

### Queue Dashboard
Visit: `http://localhost:4000/admin/queues`

### Health Check
Visit: `http://localhost:4000/`

### Queue Statistics
Visit: `http://localhost:4000/queue/stats`

## 🔒 Security Notes

- ✅ Never commit `.env` file
- ✅ Use strong, unique secrets
- ✅ Rotate credentials regularly
- ✅ Use HTTPS in production
- ✅ Enable webhook validation

## 🚨 Troubleshooting

### Common Issues

1. **"Zoom SDK credentials not configured"**
   - Check that `ZOOM_SDK_KEY` and `ZOOM_SDK_SECRET` are set
   - Ensure they're not placeholder values

2. **"Redis connection failed"**
   - Verify `REDIS_URL` is correct
   - Check if Redis service is running
   - Test connection: `redis-cli ping`

3. **"AWS S3 access denied"**
   - Verify AWS credentials
   - Check IAM permissions
   - Ensure bucket exists and is accessible

4. **"Webhook validation failed"**
   - Check `ZOOM_WEBHOOK_SECRET_TOKEN`
   - Verify webhook URL is accessible
   - Check Zoom app configuration

## 📞 Support

For issues related to:
- **Zoom SDK**: [Zoom Developer Support](https://developers.zoom.us/support/)
- **Redis**: Check your Redis service provider's documentation
- **AWS S3**: [AWS Documentation](https://docs.aws.amazon.com/s3/)
- **This Application**: Check the repository issues or create a new one
