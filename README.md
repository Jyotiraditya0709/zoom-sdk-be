# Zoom Video SDK Backend with BullMQ Webhook Processing

A robust backend system for processing Zoom Video SDK webhooks using BullMQ, Redis, and BullBoard for monitoring.

## 🚀 Features

- **Zoom Webhook Processing**: Captures and processes `session.recording_completed` events
- **BullMQ Queue System**: Robust job queuing with retries and backoff
- **Redis Integration**: Persistent job storage and processing (supports online Redis services)
- **BullBoard Dashboard**: Real-time queue monitoring and management
- **Worker Processing**: Asynchronous processing of recording files
- **Comprehensive Logging**: Detailed logging for debugging and monitoring

## 📋 Prerequisites

- Node.js 18+ 
- Redis server (local or online service like Redis Cloud, Upstash, etc.)
- Zoom Video SDK credentials

## 🛠️ Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env
   ```
   
   Update `.env` with your credentials:
   ```env
   # Zoom Video SDK Credentials
   ZOOM_SDK_KEY=your_zoom_sdk_key_here
   ZOOM_SDK_SECRET=your_zoom_sdk_secret_here
   
   # Server Configuration
   PORT=4000
   
   # Redis Configuration (for BullMQ) - Online Redis Service
   # For Redis Cloud, Upstash, or other online Redis providers
   REDIS_URL=redis://username:password@host:port/database
   
   # Alternative: Individual Redis parameters (if not using URL)
   # REDIS_HOST=your-redis-host.redis.cloud.com
   # REDIS_PORT=6379
   # REDIS_PASSWORD=your-redis-password
   # REDIS_DB=0
   ```

3. **Redis Setup Options:**

   **Option A: Online Redis Service (Recommended)**
   - Sign up for a Redis service like [Redis Cloud](https://redis.com/try-free/), [Upstash](https://upstash.com/), or [Railway](https://railway.app/)
   - Get your Redis URL from the service dashboard
   - Add the URL to your `.env` file as `REDIS_URL`

   **Option B: Local Redis (Development)**
   ```bash
   # Install Redis locally
   # On macOS: brew install redis
   # On Ubuntu: sudo apt-get install redis-server
   # On Windows: Download from https://redis.io/download
   
   # Start Redis server
   redis-server
   ```

## 🚀 Running the Application

### Start the server:
```bash
npm start
```

### Test the webhook system:
```bash
npm run test-webhook
```

## 📊 Available Endpoints

### Core Services
- `GET /` - Health check and service information
- `POST /webhook/zoom` - Zoom webhook endpoint
- `POST /generateSignature` - Generate Zoom Video SDK signatures

### Queue Management
- `GET /queue/stats` - Queue statistics
- `GET /admin/queues` - BullBoard dashboard
- `GET /recordings` - View captured recordings
- `DELETE /recordings` - Clear captured recordings

## 🎯 Webhook Processing Flow

1. **Webhook Reception**: Zoom sends `session.recording_completed` event
2. **Job Queuing**: Recording data is added to BullMQ queue
3. **Worker Processing**: Background worker processes each recording file
4. **Monitoring**: BullBoard dashboard shows real-time processing status

### Sample Webhook Data Structure:
```json
{
  "event": "session.recording_completed",
  "event_ts": 1705312200,
  "payload": {
    "account_id": "abc123",
    "object": {
      "session_id": "session_123",
      "recording_files": [
        {
          "id": "file_123",
          "recording_type": "video",
          "file_name": "recording.mp4",
          "file_size": 52428800,
          "download_url": "https://zoom.us/recording/download/...",
          "recording_start": "2024-01-15T10:00:00Z",
          "recording_end": "2024-01-15T10:30:00Z",
          "duration": 1800
        }
      ]
    }
  },
  "download_token": "token_123"
}
```

## 📈 Queue Configuration

### Recording Queue Settings:
- **Concurrency**: 2 jobs simultaneously
- **Retries**: 3 attempts with exponential backoff
- **Cleanup**: Jobs removed after 24 hours
- **Priority**: High priority for recording jobs

### Worker Features:
- Automatic retry on failure
- Exponential backoff strategy
- Graceful shutdown handling
- Comprehensive error logging

## 🔍 Monitoring & Debugging

### BullBoard Dashboard
Visit `http://localhost:4000/admin/queues` to:
- View all queues and their status
- Monitor job progress in real-time
- Retry failed jobs
- View job details and logs
- Clean up completed/failed jobs

### Queue Statistics
Visit `http://localhost:4000/queue/stats` for:
- Waiting jobs count
- Active jobs count
- Completed jobs count
- Failed jobs count
- Total jobs processed

### Console Logging
The system provides detailed console logs:
- Webhook reception and validation
- Job queuing and processing
- Worker status and progress
- Error details and debugging info

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Zoom Webhook  │───▶│  Express Server │───▶│  BullMQ Queue   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  BullBoard UI   │    │  Worker Process │
                       └─────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  Online Redis   │
                                               └─────────────────┘
```

## 🔧 Configuration Options

### Redis Configuration
The system supports both Redis URL and individual parameters:

**Redis URL (Recommended for online services):**
```env
REDIS_URL=redis://username:password@host:port/database
```

**Individual Parameters:**
```env
REDIS_HOST=your-redis-host.redis.cloud.com
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0
```

### Popular Redis Services:
- **Redis Cloud**: `redis://default:password@host.redis.cloud.com:6379`
- **Upstash**: `redis://default:password@host.upstash.io:6379`
- **Railway**: `redis://default:password@host.railway.app:6379`

### Queue Configuration
- **Job Attempts**: 3 retries
- **Backoff Strategy**: Exponential with 2-second delay
- **Concurrency**: 2 simultaneous workers
- **Cleanup**: 24-hour retention

## 🚨 Error Handling

The system includes comprehensive error handling:
- Webhook validation and logging
- Job failure tracking and retry
- Worker error recovery
- Graceful shutdown procedures
- Detailed error logging for debugging

## 🔮 Future Enhancements

- **S3 Upload Integration**: Upload processed files to S3
- **Database Storage**: Store recording metadata in database
- **File Processing**: Video/audio processing and optimization
- **Notification System**: Email/SMS notifications on completion
- **API Authentication**: Secure webhook endpoints
- **Scaling**: Horizontal scaling with multiple workers

## 📝 License

ISC License
