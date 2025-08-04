import dotenv from "dotenv";
import Redis from "ioredis";

// Load environment variables first
dotenv.config();

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redis.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
});

redis.on("connect", () => {
  console.log("✅ Redis Client Connected");
});

redis.on("ready", () => {
  console.log("🚀 Redis Client Ready");
});

export default redis;
