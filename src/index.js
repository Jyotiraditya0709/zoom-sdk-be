import express, { application } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { KJUR } from "jsrsasign";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter.js";
import { ExpressAdapter } from "@bull-board/express";
import recordingQueue, {
  addRecordingJob,
  getQueueStats,
} from "./queues/recordingQueue.js";
import "./workers/recordingWorker.js";
import apiRoutes from "./routes/api.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://master.d1i6jrqa49nh2k.amplifyapp.com",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);
app.use(express.json({ limit: "10mb" }));

// Setup BullBoard dashboard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(recordingQueue)],
  serverAdapter: serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "Backend server is running",
    services: {
      webhook: `/webhook/zoom`,
      dashboard: `/admin/queues`,
      queueStats: `/queue/stats`,
      recordings: `/recordings`,
    },
    env: {
      hasWebhookSecret: !!process.env.ZOOM_WEBHOOK_SECRET_TOKEN,
      webhookSecretLength: process.env.ZOOM_WEBHOOK_SECRET_TOKEN
        ? process.env.ZOOM_WEBHOOK_SECRET_TOKEN.length
        : 0,
      webhookSecretStart: process.env.ZOOM_WEBHOOK_SECRET_TOKEN
        ? process.env.ZOOM_WEBHOOK_SECRET_TOKEN.substring(0, 4)
        : "NOT_SET",
    },
  });
});

// Queue statistics endpoint
app.get("/queue/stats", async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json({
      status: "success",
      timestamp: new Date().toISOString(),
      stats,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get queue statistics",
      error: error.message,
    });
  }
});

// Zoom Webhook endpoint
app.post("/webhook/zoom", async (req, res) => {
  const { event, event_ts, payload, download_token } = req.body;

  console.log("🎯 ZOOM WEBHOOK RECEIVED:", event);

  // Handle Zoom webhook validation
  if (event === "endpoint.url_validation") {
    console.log("🔐 Handling webhook validation...");
    console.log("📝 Validation payload:", JSON.stringify(req.body, null, 2));

    const crypto = await import("crypto");
    const plainToken = payload?.plainToken;

    if (!plainToken) {
      console.error("❌ No plainToken in validation request");
      return res.status(400).json({
        error: "Missing plainToken in validation request",
      });
    }

    // Check if webhook secret is configured
    const webhookSecret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;

    if (!webhookSecret) {
      console.error("❌ ZOOM_WEBHOOK_SECRET_TOKEN not configured");
      return res.status(500).json({
        error: "Webhook secret not configured",
        message:
          "Please add ZOOM_WEBHOOK_SECRET_TOKEN to environment variables",
      });
    }

    console.log(
      "🔑 Using webhook secret:",
      webhookSecret.substring(0, 4) + "..."
    );
    console.log("📝 Plain token:", plainToken);

    const hashForValidate = crypto.default
      .createHmac("sha256", webhookSecret)
      .update(plainToken)
      .digest("hex");

    console.log("🔐 Generated hash:", hashForValidate);

    const response = {
      plainToken: plainToken,
      encryptedToken: hashForValidate,
    };

    console.log(
      "✅ Webhook validation response:",
      JSON.stringify(response, null, 2)
    );

    return res.status(200).json(response);
  }

  if (event === "session.recording_completed") {
    const sessionId = payload?.object?.session_id;
    const files = payload?.object?.recording_files || [];
    const accountId = payload?.account_id;

    console.log("📊 Recording Details:", {
      sessionId,
      accountId,
      filesCount: files.length,
    });

    try {
      const job = await addRecordingJob(req.body);
      console.log("📝 Recording job queued:", job.id);

      if (!global.zoomRecordings) {
        global.zoomRecordings = [];
      }

      global.zoomRecordings.push({
        timestamp: new Date().toISOString(),
        sessionId,
        accountId,
        event,
        files,
        downloadToken: download_token,
        fullPayload: req.body,
        jobId: job.id,
        queueStatus: "queued",
      });
    } catch (error) {
      console.error("❌ Error queuing recording job:", error);
    }
  }

  res.status(200).json({
    status: "webhook_received",
    event,
    timestamp: new Date().toISOString(),
    message:
      event === "session.recording_completed"
        ? "Recording queued for processing"
        : "Event logged",
  });
});

// View captured recordings
app.get("/recordings", (req, res) => {
  const recordings = global.zoomRecordings || [];
  res.json({
    count: recordings.length,
    recordings: recordings,
    timestamp: new Date().toISOString(),
  });
});

// Clear captured recordings
app.delete("/recordings", (req, res) => {
  global.zoomRecordings = [];
  res.json({
    status: "cleared",
    message: "All captured recordings cleared",
    timestamp: new Date().toISOString(),
  });
});

// Generate Zoom Video SDK Signature
app.post("/generateSignature", (req, res) => {
  const { sessionName, role } = req.body;

  if (!sessionName || isNaN(role)) {
    return res.status(400).json({
      error: "sessionName and role are required",
    });
  }

  if (!process.env.ZOOM_SDK_KEY || !process.env.ZOOM_SDK_SECRET) {
    return res.status(500).json({
      error: "Zoom SDK credentials not configured",
    });
  }

  if (
    process.env.ZOOM_SDK_KEY === "your_zoom_sdk_key_here" ||
    process.env.ZOOM_SDK_SECRET === "your_zoom_sdk_secret_here"
  ) {
    return res.status(500).json({
      error: "Zoom SDK credentials are placeholder values. Please update .env.",
    });
  }

  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;

  const payload = {
    app_key: process.env.ZOOM_SDK_KEY,
    tpc: sessionName,
    role_type: role,
    version: 1,
    iat,
    exp,
  };

  const sHeader = unescape(
    encodeURIComponent(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  );
  const sPayload = unescape(encodeURIComponent(JSON.stringify(payload)));

  try {
    const sdkJWT = KJUR.jws.JWS.sign(
      "HS256",
      sHeader,
      sPayload,
      process.env.ZOOM_SDK_SECRET
    );
    return res.json({ signature: sdkJWT });
  } catch (err) {
    console.error("JWT signing failed:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
// �� Add debug logging -- seeing this sitll remove this-jmishra
app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// routes
app.use("/api", apiRoutes);

// S3 Test Endpoints
app.get("/test-s3", async (req, res) => {
  try {
    const { S3Client, ListBucketsCommand } = await import("@aws-sdk/client-s3");

    const s3Client = new S3Client({
      region: process.env.AWS_REGION || "ap-south-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);

    res.json({
      status: "SUCCESS",
      message: "S3 connection successful",
      buckets: response.Buckets?.map((b) => b.Name) || [],
      region: process.env.AWS_REGION || "ap-south-1",
      hasCredentials: !!(
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      message: "S3 connection failed",
      error: error.message,
      region: process.env.AWS_REGION || "ap-south-1",
      hasCredentials: !!(
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ),
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/test-simple-upload", async (req, res) => {
  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

    const s3Client = new S3Client({
      region: process.env.AWS_REGION || "ap-south-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const testContent = "Hello S3! This is a test upload.";
    const testKey = `test-uploads/test-${Date.now()}.txt`;

    console.log(`📤 Starting test S3 upload: ${testKey}`);
    console.log(`📊 Test content size: ${testContent.length} bytes`);

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || "zoomsdk-rec",
      Key: testKey,
      Body: testContent,
      ContentType: "text/plain",
    });

    console.log(`🔄 Sending S3 command...`);
    const result = await s3Client.send(command);
    console.log(`✅ S3 upload completed: ${result.ETag}`);

    const s3Url = `https://${process.env.S3_BUCKET_NAME || "zoomsdk-rec"}.s3.${
      process.env.AWS_REGION || "ap-south-1"
    }.amazonaws.com/${testKey}`;

    res.json({
      status: "SUCCESS",
      message: "Test upload successful",
      bucket: process.env.S3_BUCKET_NAME || "zoomsdk-rec",
      key: testKey,
      s3Url: s3Url,
      size: testContent.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      message: "Test upload failed",
      error: error.message,
      bucket: process.env.S3_BUCKET_NAME || "zoomsdk-rec",
      timestamp: new Date().toISOString(),
    });
  }
});

// Test real recording upload simulation
app.get("/test-recording-upload", async (req, res) => {
  try {
    console.log("🧪 Testing real recording upload simulation...");

    // Simulate a real Zoom recording webhook payload
    const mockWebhookData = {
      event: "session.recording_completed",
      payload: {
        account_id: "ERnPOFFzRH2yEqVglq1UGg",
        object: {
          session_name: "test-session-123",
          start_time: "2025-08-13T10:00:00Z",
          timezone: "",
          recording_files: [
            {
              id: "test-file-1",
              status: "completed",
              recording_start: "2025-08-13T10:01:00Z",
              recording_end: "2025-08-13T10:02:00Z",
              file_type: "MP4",
              file_size: 1024000, // 1MB test file
              download_url: "https://httpbin.org/stream/1024", // Test download URL with proper streaming
              recording_type: "shared_screen_with_speaker_view",
              file_extension: "MP4",
              clip_id: "",
            },
          ],
          session_key: "",
          session_id: "test-session-id-123",
        },
      },
      event_ts: Date.now(),
      download_token: "test-token-123",
    };

    console.log(
      "📋 Mock webhook data:",
      JSON.stringify(mockWebhookData, null, 2)
    );

    // Add the job to the queue
    const job = await recordingQueue.add("process-recording", {
      webhookData: mockWebhookData,
    });

    console.log(`🎯 Added test recording job: #${job.id}`);

    res.json({
      status: "SUCCESS",
      message: "Test recording job added to queue",
      jobId: job.id,
      webhookData: mockWebhookData,
      queueSize: await recordingQueue.count(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Test recording upload failed:", error);
    res.status(500).json({
      status: "ERROR",
      message: "Test recording upload failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Test S3 upload with local file generation
app.get("/test-s3-upload-local", async (req, res) => {
  try {
    console.log("🧪 Testing S3 upload with local file generation...");

    // Generate a test file content (1MB of data)
    const testContent = Buffer.alloc(1024 * 1024, "A"); // 1MB of 'A' characters
    const testFileName = `test-recording-${Date.now()}.mp4`;

    console.log(
      `📁 Generated test file: ${testFileName} (${testContent.length} bytes)`
    );

    // Simulate a real Zoom recording webhook payload with local file
    const mockWebhookData = {
      event: "session.recording_completed",
      payload: {
        account_id: "ERnPOFFzRH2yEqVglq1UGg",
        object: {
          session_name: "test-session-local",
          start_time: "2025-08-13T10:00:00Z",
          timezone: "",
          recording_files: [
            {
              id: "test-file-local",
              status: "completed",
              recording_start: "2025-08-13T10:01:00Z",
              recording_end: "2025-08-13T10:02:00Z",
              file_type: "MP4",
              file_size: testContent.length,
              download_url: "https://httpbin.org/bytes/1024", // Simple HTTP test URL
              recording_type: "shared_screen_with_speaker_view",
              file_extension: "MP4",
              clip_id: "",
            },
          ],
          session_key: "",
          session_id: "test-session-local-123",
        },
      },
      event_ts: Date.now(),
      download_token: "test-token-local",
    };

    console.log(
      "📋 Mock webhook data with local file:",
      JSON.stringify(mockWebhookData, null, 2)
    );

    // Add the job to the queue
    const job = await recordingQueue.add("process-recording", {
      webhookData: mockWebhookData,
    });

    console.log(`🎯 Added test recording job: #${job.id}`);

    res.json({
      status: "SUCCESS",
      message: "Test recording job with local file added to queue",
      jobId: job.id,
      fileSize: testContent.length,
      fileName: testFileName,
      queueSize: await recordingQueue.count(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Test recording upload failed:", error);
    res.status(500).json({
      status: "ERROR",
      message: "Test recording upload failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Test with exact Job #26 data structure
app.get("/test-exact-job26", async (req, res) => {
  try {
    console.log("🧪 Testing with real Zoom recording URLs from Job #26...");

    // Use the EXACT data structure from Job #26
    const mockWebhookData = {
      event: "session.recording_completed",
      payload: {
        account_id: "ERnPOFFzRH2yEqVglq1UGg",
        object: {
          session_name: "06422c41-0d73-456a-a414-c612131f7e63",
          start_time: "2025-08-13T10:55:40Z",
          timezone: "",
          recording_files: [
            {
              id: "df2d6508-81f2-4cb1-b0a4-1252de0e968f",
              status: "completed",
              recording_start: "2025-08-13T10:56:15Z",
              recording_end: "2025-08-13T10:57:12Z",
              file_type: "TIMELINE",
              file_size: 1024, // Use small test size
              download_url: "https://httpbin.org/bytes/1024", // Use test URL
              recording_type: "timeline",
              file_extension: "JSON",
              clip_id: "",
            },
            {
              id: "7de3b1f2-3263-4a5a-a842-a9cce1bdc0cb",
              status: "completed",
              recording_start: "2025-08-13T10:56:15Z",
              recording_end: "2025-08-13T10:57:12Z",
              file_type: "MP4",
              file_size: 1024, // Use small test size
              download_url: "https://httpbin.org/bytes/1024", // Use test URL
              recording_type: "shared_screen_with_speaker_view",
              file_extension: "MP4",
              clip_id: "",
            },
          ],
          session_key: "",
          session_id: "7l2WUs8vTvKTj/qzYSyGxw==",
        },
      },
      event_ts: 1755082696305,
      download_token: "test-token-exact",
    };

    console.log("📋 Testing with real Zoom URL structure...");

    // Add the job to the queue
    const job = await recordingQueue.add("process-recording", {
      webhookData: mockWebhookData,
    });

    console.log(`🎯 Added test job with real URLs: #${job.id}`);

    res.json({
      status: "SUCCESS",
      message: "Test job with real Zoom URLs added to queue",
      jobId: job.id,
      queueSize: await recordingQueue.count(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Test with real URLs failed:", error);
    res.status(500).json({
      status: "ERROR",
      message: "Test with real URLs failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/job/:jobId/status", async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await recordingQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        status: "NOT_FOUND",
        message: `Job ${jobId} not found`,
        timestamp: new Date().toISOString(),
      });
    }

    const state = await job.getState();
    const returnValue = await job.returnvalue;
    const failedReason = await job.failedReason;

    res.json({
      jobId,
      state,
      returnValue,
      failedReason,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      message: "Failed to get job status",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/job/:jobId/progress", async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await recordingQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        status: "NOT_FOUND",
        message: `Job ${jobId} not found`,
        timestamp: new Date().toISOString(),
      });
    }

    const state = await job.getState();
    const returnValue = await job.returnvalue;
    const failedReason = await job.failedReason;
    const progress = job.progress || 0;
    const delay = job.delay || 0;
    const timestamp = job.timestamp || 0;
    const processedOn = job.processedOn || 0;
    const finishedOn = job.finishedOn || 0;

    // Calculate timing information
    const now = Date.now();
    const processingTime = processedOn ? now - processedOn : 0;
    const totalTime = finishedOn ? finishedOn - timestamp : processingTime;

    res.json({
      jobId,
      state,
      progress: `${progress}%`,
      returnValue,
      failedReason,
      timing: {
        created: new Date(timestamp).toISOString(),
        started: processedOn ? new Date(processedOn).toISOString() : null,
        finished: finishedOn ? new Date(finishedOn).toISOString() : null,
        processingTime: `${processingTime}ms`,
        totalTime: `${totalTime}ms`,
        delay: `${delay}ms`,
      },
      status:
        state === "completed"
          ? "SUCCESS"
          : state === "failed"
            ? "FAILED"
            : state === "active"
              ? "PROCESSING"
              : "WAITING",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      message: "Failed to get job progress",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/jobs/completed", async (req, res) => {
  try {
    const completedJobs = await recordingQueue.getCompleted();
    const recentJobs = completedJobs.slice(-10); // Last 10 jobs

    res.json({
      totalCompleted: completedJobs.length,
      recentJobs: recentJobs.map((job) => ({
        id: job.id,
        returnValue: job.returnvalue,
        completedAt: job.finishedOn,
        duration: job.finishedOn ? job.finishedOn - job.processedOn : null,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      message: "Failed to get completed jobs",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/s3-dashboard", (req, res) => {
  const recordings = global.zoomRecordings || [];
  const recentUploads = recordings.slice(-5).map((rec) => ({
    jobId: rec.jobId,
    sessionId: rec.sessionId,
    filesCount: rec.files?.length || 0,
    timestamp: rec.timestamp,
    queueStatus: rec.queueStatus,
  }));

  res.json({
    totalRecordings: recordings.length,
    recentUploads,
    s3Config: {
      bucket: process.env.S3_BUCKET_NAME || "zoomsdk-rec",
      region: process.env.AWS_REGION || "ap-south-1",
      hasCredentials: !!(
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ),
    },
    timestamp: new Date().toISOString(),
  });
});

// Test with exact Job #30 data structure (real recording that failed)
app.get("/test-exact-job30", async (req, res) => {
  try {
    console.log("🧪 Testing with real Zoom recording URLs from Job #30...");

    // Use the EXACT data structure from Job #30
    const mockWebhookData = {
      event: "session.recording_completed",
      payload: {
        account_id: "ERnPOFFzRH2yEqVglq1UGg",
        object: {
          session_name: "06422c41-0d73-456a-a414-c612131f7e63",
          start_time: "2025-08-13T11:34:49Z",
          timezone: "",
          recording_files: [
            {
              id: "469de46b-c74a-45e9-be53-00e7c5917382",
              status: "completed",
              recording_start: "2025-08-13T11:35:06Z",
              recording_end: "2025-08-13T11:36:05Z",
              file_type: "MP4",
              file_size: 2978792,
              download_url:
                "https://us06web.zoom.us/rec/webhook_download/w-iKRClkrr5MfZ6Vjc7g5VawnK0bj74u1mUjWPnb6fqtpH5NjvEMnecugU3H6_X-0emhwbttG7bLnqQh.3p5-m-gL6lYtcWCa/k2npj4_b_ofZbKjbuW7mm4Q79LhTBwyBh095AMGiBlY9sV5iDfGMOXZADkNniWep2Y09pY5CT8z5KLSMWJiupMaDbXpWRzgzepGcyUXbNr42ZWPv-0UoWsv6zylFYUF71KokcytmP5uiReTdCF-PXUxc0QfbYeL0zuNdaV88joEbCMV48f5lfna3VFfyByihNtHzVitWRgiRnvVgzC5IQNYglgZSEgzpoXvOT7Z3ROgJtSbBwB-fTz26FiQy9wzw5-6s9S1KwLQ1jzwBrfMBnWgxjzzKvbTz2plKlfbHmVjrmzJbJjm6ah9X0RO1IHtyvaFHadGQPRJE_Wp8GXP6eQ",
              recording_type: "shared_screen_with_speaker_view",
              file_extension: "MP4",
              clip_id: "",
            },
            {
              id: "c26cd73e-c9a2-4ef7-b466-d8db9aa028ad",
              status: "completed",
              recording_start: "2025-08-13T11:35:06Z",
              recording_end: "2025-08-13T11:36:05Z",
              file_type: "TIMELINE",
              file_size: 252332,
              download_url:
                "https://us06web.zoom.us/rec/webhook_download/N_vVNdSgDVehQKHpm_5Le3y1IAXB-xpgd3k-sixISwGGO4aKqWYYPzJfqIf4eXV8SXgyOTZxoFMhWv7Y.zD02H8f_gZgiGpPB/YghPFLvkqyZXVAi_xbAc7e1zrXNtbcBMm2F7fMvmCjXs7gsUun29fXEOk-VfCgCuIN4lrpnElGflDPw3wtpOfUjPLjiExjYaJR2ETA3vUy6xk58s8VSHhtvSYEeSLzGQW-1Fj6aeidXSwFeyaMpFdDCXgJUb2KMbN6JvNt60Fpa9Fe3NVxh_zUeIaEpqqnyY-DzEIMnTwnPSzY-60-2JRlubsafuO4LJ-8GLTZ1ae4Xo1xIc9VEpGYjksZJ3AJKtrOhDYCwjWSfWI-Sb1HkWlqjfPOVh9q5oiJEemff7DjTqy1e0cfy1VcKJg-5UAV7wglvU6aTVR0LZk1pOHn5vGA",
              recording_type: "timeline",
              file_extension: "JSON",
              clip_id: "",
            },
          ],
          session_key: "",
          session_id: "Ej21rhR7RqKfJYoqSDFmeg==",
        },
      },
      event_ts: 1755085064801,
      download_token:
        "eyJzdiI6IjAwMDAwMSIsInptX3NrbSI6InptX28ybSIsInR5cCI6IkpXVCIsImFsZyI6IkVTMjU2In0.eyJhdWQiOiJXZWJSZWNEb3dubG9hZCIsImFjY291bnRJZCI6IkVSblBPRkZ6UkgyeUVxVmdscTFVR2ciLCJpc3MiOiJFdmVudENvbnN1bWVyUmVjRG93bmxvYWQiLCJtaWQiOiJFajIxcmhSN1JxS2ZKWW9xU0RGbWVnPT0iLCJleHAiOjE3NTUxNzE0ODAsImlhdCI6MTc1NTA4NTA4MCwidXNlcklkIjoiNW1iZlllN2NUVE85WjBPYWpheFlNUSJ9.2MgkIejAXx_MBqEVagSUT56jVz3nB4mB0YDz8ramWfeEvTzqhfmL1h6ZnUN_lWjc4VNBjSVSXHzpqbl-SudQkA",
    };

    console.log("📋 Testing with real Job #30 data structure...");
    const job = await recordingQueue.add("process-recording", {
      webhookData: mockWebhookData,
    });

    res.json({
      status: "SUCCESS",
      jobId: job.id,
      message:
        "Test job created with Job #30 data structure (real recording URLs)",
      testData: {
        files: mockWebhookData.payload.object.recording_files.length,
        sessionId: mockWebhookData.payload.object.session_id,
        fileSizes: mockWebhookData.payload.object.recording_files.map((f) => ({
          id: f.id,
          size: f.file_size,
          type: f.file_type,
        })),
      },
    });
  } catch (error) {
    console.error("❌ Test failed:", error);
    res.status(500).json({
      status: "ERROR",
      error: error.message,
    });
  }
});

// Test with Job #38 data structure (real meeting that failed database update)
app.get("/test-job38-database", async (req, res) => {
  try {
    console.log("🧪 Testing database update with Job #38 data...");

    // Use the EXACT data structure from Job #38
    const mockWebhookData = {
      event: "session.recording_completed",
      payload: {
        account_id: "ERnPOFFzRH2yEqVglq1UGg",
        object: {
          session_name: "06422c41-0d73-456a-a414-c612131f7e65", // This is the meeting ID in your DB
          start_time: "2025-08-14T10:12:27Z",
          timezone: "",
          recording_files: [
            {
              id: "aaf318c5-9c29-4bae-80fe-9766d7b7fb6d",
              status: "completed",
              recording_start: "2025-08-14T10:13:24Z",
              recording_end: "2025-08-14T10:14:32Z",
              file_type: "MP4",
              file_size: 3646246,
              download_url: "https://httpbin.org/bytes/1024", // Use test URL for faster testing
              recording_type: "shared_screen_with_speaker_view",
              file_extension: "MP4",
              clip_id: "",
            },
            {
              id: "e5468fff-a70a-4436-8ac9-1454f6bb27a1",
              status: "completed",
              recording_start: "2025-08-14T10:13:24Z",
              recording_end: "2025-08-14T10:14:32Z",
              file_type: "TIMELINE",
              file_size: 229973,
              download_url: "https://httpbin.org/bytes/1024", // Use test URL for faster testing
              recording_type: "timeline",
              file_extension: "JSON",
              clip_id: "",
            },
          ],
          session_key: "",
          session_id: "4P18AD2MTHW+HbZWaAaGoQ==",
        },
      },
      event_ts: 1755166544799,
      download_token: "test-token-38",
    };

    console.log("📋 Testing database update with Job #38 meeting ID...");
    const job = await recordingQueue.add("process-recording", {
      webhookData: mockWebhookData,
    });

    res.json({
      status: "SUCCESS",
      jobId: job.id,
      message:
        "Test job created with Job #38 data structure (testing database update)",
      testData: {
        files: mockWebhookData.payload.object.recording_files.length,
        sessionId: mockWebhookData.payload.object.session_id,
        meetingId: mockWebhookData.payload.object.session_name, // This should match your DB
        fileSizes: mockWebhookData.payload.object.recording_files.map((f) => ({
          id: f.id,
          size: f.file_size,
          type: f.file_type,
        })),
      },
    });
  } catch (error) {
    console.error("❌ Test failed:", error);
    res.status(500).json({
      status: "ERROR",
      error: error.message,
    });
  }
});

app.use((req, res) => {
  console.log(`❌ 404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: "Route not found",
    method: req.method,
    path: req.path,
    availableRoutes: [
      "GET /api/getMeetingInfo/:meetingId/:userId",
      "POST /api/userJoined",
      "POST /api/userLeft",
      "GET /api/meetingState/:meetingId",
    ],
  });
});

app.listen(port, () => {
  console.log(`✅ Backend running at http://localhost:${port}`);
  console.log(`🎯 Webhook endpoint: http://localhost:${port}/webhook/zoom`);
  console.log(`📊 Queue dashboard: http://localhost:${port}/admin/queues`);
  console.log(`📈 Queue stats: http://localhost:${port}/queue/stats`);
  console.log(`📋 View recordings: http://localhost:${port}/recordings`);
});
