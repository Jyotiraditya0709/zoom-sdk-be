import { Worker } from "bullmq";
import redisClient from "../config/redis.js";
import { batchStreamUpload } from "../services/s3StreamingService.js";
import ZoomMeeting from "../models/ZoomMeeting.js";

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
      console.log(`📁 Found ${files.length} files to upload`);

      // Validate required data
      if (!sessionId) {
        throw new Error("Session ID is required");
      }

      if (!download_token) {
        throw new Error("Download token is required");
      }

      if (files.length === 0) {
        console.log(`⚠️ No files found for session: ${sessionId}`);
        return {
          sessionId,
          accountId,
          filesProcessed: 0,
          message: "No files to process",
          processingTime: new Date().toISOString(),
        };
      }

      // Upload files to S3 using streaming upload
      console.log(`�� Starting S3 upload for session: ${sessionId}`);

      const uploadResult = await batchStreamUpload(
        files,
        sessionId,
        download_token
      );

      // Calculate summary statistics
      const totalSize = uploadResult.successfulUploads.reduce((sum, file) => {
        return sum + (parseInt(file.fileSize) || 0);
      }, 0);

      const totalDuration = uploadResult.successfulUploads.reduce(
        (sum, file) => {
          return sum + (parseInt(file.duration) || 0);
        },
        0
      );

      // 🆕 UPDATE DATABASE WITH S3 URL
      if (uploadResult.successfulUploads.length > 0) {
        try {
          console.log(`💾 Updating database for session: ${sessionId}`);

          // Find the meeting record
          const meeting = await ZoomMeeting.findOne({
            where: { sessionId: sessionId },
          });

          if (meeting) {
            // Get the primary video recording URL (usually the first successful upload)
            const primaryVideo =
              uploadResult.successfulUploads.find(
                (file) => file.recordingType === "video"
              ) || uploadResult.successfulUploads[0];

            // Update only the existing recordingUrl column
            await meeting.update({
              recordingUrl: primaryVideo.s3Url,
            });

            console.log(
              `✅ Database updated with S3 URL: ${primaryVideo.s3Url}`
            );
          } else {
            console.log(`⚠️ No meeting record found for session: ${sessionId}`);
          }
        } catch (dbError) {
          console.error(`❌ Database update failed:`, dbError.message);
          // Don't fail the entire job if database update fails
        }
      }

      const result = {
        sessionId,
        accountId,
        filesProcessed: uploadResult.successfulUploads.length,
        failedFiles: uploadResult.failedUploads.length,
        totalFiles: uploadResult.totalFiles,
        successfulUploads: uploadResult.successfulUploads.map((file) => ({
          s3Url: file.s3Url,
          s3Key: file.s3Key,
          originalFileId: file.originalFileId,
          recordingType: file.recordingType,
          fileSize: file.fileSize,
          duration: file.duration,
        })),
        failedUploads: uploadResult.failedUploads,
        totalSize: totalSize,
        totalDuration: totalDuration,
        processingTime: new Date().toISOString(),
        uploadCompletedAt: uploadResult.completedAt,
        databaseUpdated: uploadResult.successfulUploads.length > 0, // Add this line
      };

      console.log(
        `🎉 Recording processing completed for session: ${sessionId}`
      );
      console.log(`📈 Summary:`, {
        filesProcessed: result.filesProcessed,
        failedFiles: result.failedFiles,
        totalSize: `${(result.totalSize / 1024 / 1024).toFixed(2)} MB`,
        totalDuration: `${(result.totalDuration / 60).toFixed(2)} minutes`,
        databaseUpdated: result.databaseUpdated,
      });

      // Log successful uploads
      if (result.successfulUploads.length > 0) {
        console.log(`✅ Successfully uploaded files:`);
        result.successfulUploads.forEach((file) => {
          console.log(`   - ${file.recordingType}: ${file.s3Url}`);
        });
      }

      // Log failed uploads
      if (result.failedUploads.length > 0) {
        console.log(`❌ Failed uploads:`);
        result.failedUploads.forEach((failure) => {
          console.log(`   - File ${failure.fileId}: ${failure.error}`);
        });
      }

      return result;
    } catch (error) {
      console.error(`❌ Error processing recording job ${job.id}:`, error);

      return {
        error: true,
        message: error.message,
        stack: error.stack,
        jobId: job.id,
        timestamp: new Date().toISOString(),
      };
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
  console.log("🚀 Recording worker is ready for S3 uploads");
});

recordingWorker.on("active", (job) => {
  console.log(`🔄 Worker started S3 upload job ${job.id}`);
});

recordingWorker.on("completed", (job, result) => {
  if (result.error) {
    console.error(`❌ Worker failed job ${job.id}:`, result.message);
  } else {
    console.log(`✅ Worker completed S3 upload job ${job.id}`);
    console.log(
      `📊 Uploaded ${result.filesProcessed} files for session: ${result.sessionId}`
    );
  }
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
