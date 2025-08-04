import express from "express";
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

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
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

    const crypto = require("crypto");
    const plainToken = payload.plainToken;

    // You'll need to add ZOOM_WEBHOOK_SECRET_TOKEN to your .env file
    const webhookSecret =
      process.env.ZOOM_WEBHOOK_SECRET_TOKEN || "your_webhook_secret_here";

    const hashForValidate = crypto
      .createHmac("sha256", webhookSecret)
      .update(plainToken)
      .digest("hex");

    console.log("✅ Webhook validation response sent");

    return res.status(200).json({
      plainToken: plainToken,
      encryptedToken: hashForValidate,
    });
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

app.listen(port, () => {
  console.log(`✅ Backend running at http://localhost:${port}`);
  console.log(`🎯 Webhook endpoint: http://localhost:${port}/webhook/zoom`);
  console.log(`📊 Queue dashboard: http://localhost:${port}/admin/queues`);
  console.log(`📈 Queue stats: http://localhost:${port}/queue/stats`);
  console.log(`📋 View recordings: http://localhost:${port}/recordings`);
});
