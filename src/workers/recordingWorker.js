import { Worker } from "bullmq";
import redisClient from "../config/redis.js";

const recordingWorker = new Worker(
  "zoom-recording-processing",
  async (job) => {
    const { webhookData, timestamp } = job.data;

    console.log(`🎯 Processing recording job ${job.id}`);

    try {
      const { event, event_ts, payload, download_token } = webhookData;

      if (event !== "session.recording_completed") {
        throw new Error(`Unexpected event type: ${event}`);
      }

      const sessionId = payload?.object?.session_id;
      const files = payload?.object?.recording_files || [];
      const accountId = payload?.account_id;

      console.log(`📊 Processing recording for session: ${sessionId}`);

      const processedFiles = [];

      for (const file of files) {
        console.log(`🔄 Processing file: ${file.id} (${file.recording_type})`);

        const fileData = {
          id: file.id,
          type: file.recording_type,
          name: file.file_name || `recording_${file.id}.mp4`,
          size: file.file_size,
          downloadUrl: file.download_url,
          recordingStart: file.recording_start,
          recordingEnd: file.recording_end,
          duration: file.duration,
          downloadToken: download_token,
          sessionId,
          accountId,
          processedAt: new Date().toISOString(),
        };

        console.log(`✅ File processed:`, {
          id: fileData.id,
          type: fileData.type,
          size: fileData.size,
          duration: fileData.duration,
        });

        processedFiles.push(fileData);

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const result = {
        sessionId,
        accountId,
        filesProcessed: processedFiles.length,
        processedFiles,
        totalSize: processedFiles.reduce((sum, file) => sum + file.size, 0),
        totalDuration: processedFiles.reduce(
          (sum, file) => sum + file.duration,
          0
        ),
        processingTime: new Date().toISOString(),
      };

      console.log(
        `🎉 Recording processing completed for session: ${sessionId}`
      );
      console.log(`📈 Summary:`, {
        filesProcessed: result.filesProcessed,
        totalSize: `${(result.totalSize / 1024 / 1024).toFixed(2)} MB`,
        totalDuration: `${(result.totalDuration / 60).toFixed(2)} minutes`,
      });

      return result;
    } catch (error) {
      console.error(`❌ Error processing recording job ${job.id}:`, error);
      throw error;
    }
  },
  {
    connection: redisClient,
    concurrency: 2,
    removeOnComplete: 100,
    removeOnFail: 50,
  }
);

recordingWorker.on("ready", () => {
  console.log("🚀 Recording worker is ready");
});

recordingWorker.on("active", (job) => {
  console.log(`🔄 Worker started job ${job.id}`);
});

recordingWorker.on("completed", (job, result) => {
  console.log(`✅ Worker completed job ${job.id}`);
});

recordingWorker.on("failed", (job, err) => {
  console.error(`❌ Worker failed job ${job.id}:`, err.message);
});

recordingWorker.on("error", (err) => {
  console.error("💥 Worker error:", err);
});

process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down recording worker...");
  await recordingWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🛑 Shutting down recording worker...");
  await recordingWorker.close();
  process.exit(0);
});

export default recordingWorker;
