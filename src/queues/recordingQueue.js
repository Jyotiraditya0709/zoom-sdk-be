import { Queue } from "bullmq";
import redisClient from "../config/redis.js";

const recordingQueue = new Queue("zoom-recording-processing", {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

recordingQueue.on("waiting", (job) => {
  console.log(`⏳ Job ${job.id} waiting`);
});

recordingQueue.on("active", (job) => {
  console.log(`🔄 Job ${job.id} started`);
});

recordingQueue.on("completed", (job, result) => {
  console.log(`✅ Job ${job.id} completed`);
});

recordingQueue.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

export const addRecordingJob = async (webhookData) => {
  try {
    const job = await recordingQueue.add(
      "process-recording",
      {
        webhookData,
        timestamp: new Date().toISOString(),
      },
      {
        priority: 1,
        delay: 0,
      }
    );

    console.log(`📝 Recording job added: ${job.id}`);
    return job;
  } catch (error) {
    console.error("❌ Error adding recording job:", error);
    throw error;
  }
};

export const getQueueStats = async () => {
  try {
    const waiting = await recordingQueue.getWaiting();
    const active = await recordingQueue.getActive();
    const completed = await recordingQueue.getCompleted();
    const failed = await recordingQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  } catch (error) {
    console.error("❌ Error getting queue stats:", error);
    return null;
  }
};

export const cleanupQueue = async () => {
  try {
    await recordingQueue.clean(1000 * 60 * 60 * 24, "completed");
    await recordingQueue.clean(1000 * 60 * 60 * 24, "failed");
    console.log("🧹 Queue cleanup completed");
  } catch (error) {
    console.error("❌ Error cleaning up queue:", error);
  }
};

export default recordingQueue;
