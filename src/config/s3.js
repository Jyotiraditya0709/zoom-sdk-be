import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const s3Config = {
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

//s3 client instance
const s3Client = new S3Client(s3Config);

const bucketConfig = {
  bucketName: process.env.S3_BUCKET_NAME || "zoomsdk-rec",
  region: process.env.AWS_REGION || "ap-south-1",
  folderPrefix: process.env.S3_FOLDER_PREFIX || "recordings/",
};

const generateS3Key = (sessionId, fileName, fileType) => {
  const timestamp = new Date().toISOString().split("T")[0]; // "2025-08-11"
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_"); // replace spaces
  return `${bucketConfig.folderPrefix}${timestamp}/${sessionId}/${fileType}/${sanitizedFileName}`;
};

// get public s3 file url
const getS3Url = (s3Key) => {
  return `https://${bucketConfig.bucketName}.s3.${bucketConfig.region}.amazonaws.com/${s3Key}`;
};

export { s3Client, bucketConfig, generateS3Key, getS3Url };
