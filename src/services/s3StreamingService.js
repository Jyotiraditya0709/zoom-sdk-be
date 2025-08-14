import axios from "axios";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  s3Client,
  bucketConfig,
  generateS3Key,
  getS3Url,
} from "../config/s3.js";

/**
 * Stream upload file from Zoom URL directly to S3
 * @param {string} zoomDownloadUrl - Zoom's temporary download URL
 * @param {string} sessionId - Zoom session ID
 * @param {string} fileName - Original file name
 * @param {string} fileType - Type of recording (video, audio, etc.)
 * @param {string} downloadToken - Zoom download token for authentication
 * @returns {Promise<Object>} Upload result with S3 URL and metadata
 */

export const streamUploadToS3 = async (
  zoomDownloadUrl,
  sessionId,
  fileName,
  fileType,
  downloadToken
) => {
  const startTime = Date.now();

  try {
    console.log(
      `🚀 Starting streaming upload for session: ${sessionId}, file: ${fileName}`
    );

    // 1️⃣ Generate a safe, structured S3 key
    const s3Key = generateS3Key(sessionId, fileName, fileType);

    // 2️⃣ Handle different URL types (HTTP vs Data URLs)
    let response, contentLength, fileSizeMB;

    if (zoomDownloadUrl.startsWith("data:")) {
      // Handle data URLs (for testing)
      console.log(`📥 Processing data URL: ${fileName}`);
      const base64Data = zoomDownloadUrl.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");
      contentLength = buffer.length;
      fileSizeMB = (contentLength / 1024 / 1024).toFixed(2);
      console.log(`📊 File size: ${fileSizeMB} MB`);

      // Create a mock response object for data URLs
      response = {
        data: buffer,
        headers: {
          "content-length": contentLength.toString(),
          "content-type": "application/octet-stream",
        },
        // Add methods that axios response would have
        get: function (headerName) {
          return this.headers[headerName.toLowerCase()];
        },
      };
    } else {
      // Handle HTTP URLs (real Zoom recordings)
      console.log(`📥 Downloading from Zoom: ${fileName}`);
      response = await axios({
        method: "GET",
        url: zoomDownloadUrl,
        headers: {
          Authorization: `Bearer ${downloadToken}`,
          "User-Agent": "Zoom-Recording-Uploader/1.0",
        },
        responseType: "arraybuffer", // Changed from "stream" to "arraybuffer"
        timeout: 300000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      contentLength = response.headers["content-length"];
      fileSizeMB = contentLength
        ? (contentLength / 1024 / 1024).toFixed(2)
        : "unknown";
      console.log(`📊 File size: ${fileSizeMB} MB`);
    }

    console.log(`⏱️ Download completed in ${Date.now() - startTime}ms`);

    // 4️⃣ Create upload parameters for S3
    const uploadParams = {
      Bucket: bucketConfig.bucketName,
      Key: s3Key,
      Body: Buffer.from(response.data), // Convert arraybuffer to Buffer
      ContentType: getContentType(fileName),
      Metadata: {
        "session-id": sessionId,
        "file-type": fileType,
        "original-name": fileName,
        "uploaded-at": new Date().toISOString(),
        source: "zoom-streaming-upload",
        "file-size": contentLength || "unknown",
      },
    };

    // Add ContentLength only if it's available and valid
    if (contentLength && contentLength > 0 && !isNaN(parseInt(contentLength))) {
      uploadParams.ContentLength = parseInt(contentLength);
    } else {
      console.log(
        `⚠️ Content-Length not available or invalid: ${contentLength}`
      );
    }

    const uploadStartTime = Date.now();
    console.log(`📤 Starting S3 upload: ${s3Key}`);
    console.log(`📈 Upload progress: Starting...`);

    // 5️⃣ Upload to S3 using AWS SDK v3
    const command = new PutObjectCommand(uploadParams);
    const result = await s3Client.send(command);

    const uploadDuration = Date.now() - uploadStartTime;
    const totalDuration = Date.now() - startTime;
    const s3Url = getS3Url(s3Key);

    console.log(`✅ Upload completed for ${fileName}`);
    console.log(`⏱️ Upload duration: ${uploadDuration}ms`);
    console.log(`⏱️ Total processing time: ${totalDuration}ms`);
    const uploadSpeed = contentLength
      ? `${(fileSizeMB / (uploadDuration / 1000)).toFixed(2)} MB/s`
      : "unknown";
    console.log(`📊 Upload speed: ${uploadSpeed}`);
    console.log(`🔗 S3 URL: ${s3Url}`);

    return {
      success: true,
      s3Url,
      s3Key,
      bucket: result.Bucket,
      key: result.Key,
      etag: result.ETag,
      fileSize: contentLength,
      uploadTime: new Date().toISOString(),
      uploadDuration,
      totalDuration,
      uploadSpeed: uploadSpeed,
    };
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(
      `❌ Upload failed for ${fileName} after ${totalDuration}ms:`,
      error.message
    );

    // 🔍 Handle specific known error cases
    if (error.name === "NetworkError") {
      throw new Error(`Network error during upload: ${error.message}`);
    } else if (error.name === "NoSuchBucket") {
      throw new Error(`S3 bucket not found: ${bucketConfig.bucketName}`);
    } else if (error.name === "AccessDenied") {
      throw new Error("Access denied — check AWS credentials & bucket policy.");
    } else if (error.response?.status === 401) {
      throw new Error("Zoom download token expired or invalid.");
    } else if (error.response?.status === 404) {
      throw new Error("Zoom recording not found or deleted.");
    }

    throw new Error(`Upload failed: ${error.message}`);
  }
};

const getContentType = (fileName) => {
  const extension = fileName.toLowerCase().split(".").pop();
  const contentTypes = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    webm: "video/webm",
    m4v: "video/x-m4v",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    aac: "audio/aac",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
  };
  return contentTypes[extension] || "application/octet-stream";
};

//  Batch upload multiple Zoom files to S3
export const batchStreamUpload = async (files, sessionId, downloadToken) => {
  console.log(
    `🔄 Starting batch upload: ${files.length} files for session: ${sessionId}`
  );

  const uploadPromises = files.map(async (file) => {
    try {
      const result = await streamUploadToS3(
        file.download_url,
        sessionId,
        file.file_name || `recording_${file.id}.mp4`,
        file.recording_type,
        downloadToken
      );
      return {
        ...result,
        originalFileId: file.id,
        recordingType: file.recording_type,
        recordingStart: file.recording_start,
        recordingEnd: file.recording_end,
        duration: file.duration,
      };
    } catch (error) {
      console.error(`❌ Failed to upload ${file.id}:`, error.message);
      return {
        success: false,
        originalFileId: file.id,
        error: error.message,
        recordingType: file.recording_type,
      };
    }
  });

  const results = await Promise.allSettled(uploadPromises);
  const successfulUploads = [];
  const failedUploads = [];

  results.forEach((res, index) => {
    if (res.status === "fulfilled" && res.value && res.value.success) {
      successfulUploads.push(res.value);
    } else {
      const error =
        res.status === "rejected"
          ? res.reason.message
          : res.value && res.value.error
            ? res.value.error
            : "Unknown error";
      failedUploads.push({
        fileId: files[index].id,
        error: error,
      });
    }
  });
  console.log(
    `📊 Batch upload summary: ${successfulUploads.length} successful, ${failedUploads.length} failed`
  );

  if (successfulUploads.length > 0) {
    console.log(
      `✅ Successful uploads:`,
      successfulUploads.map((u) => ({
        fileId: u.originalFileId,
        s3Url: u.s3Url,
        size: u.fileSize,
      }))
    );
  }

  if (failedUploads.length > 0) {
    console.log(`❌ Failed uploads:`, failedUploads);
  }

  return {
    successfulUploads,
    failedUploads,
    totalFiles: files.length,
    sessionId,
    completedAt: new Date().toISOString(),
  };
};
