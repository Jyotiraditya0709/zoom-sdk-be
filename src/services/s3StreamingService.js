import axios from "axios";
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
  try {
    console.log(
      `🚀 Starting streaming upload for session: ${sessionId}, file: ${fileName}`
    );

    // 1️⃣ Generate a safe, structured S3 key
    const s3Key = generateS3Key(sessionId, fileName, fileType);

    // 2️⃣ Create upload parameters for S3

    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: null,
      ContentType: getContentType(fileType),
      Metadata: {
        "session-id": sessionId,
        "file-type": fileType,
        "original-name": fileName,
        "uploaded-at": new Date().toISOString(),
        source: "zoom-streaming-upload",
      },
    };
    // 3️⃣ Create a stream from the Zoom file without storing it locally
    const response = await axios({
      method: "GET",
      url: zoomDownloadUrl,
      headers: {
        Authorization: `Bearer ${downloadToken}`,
        "User-Agent": "Zoom-Recording-Uploader/1.0",
      },
      responseType: "stream",
      timeout: 300000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    uploadParams.Body = response.data;

    // 4️⃣ Record file size in metadata
    const contentLength = response.headers["content-length"];
    if (contentLength) {
      uploadParams.Metadata["file-size"] = contentLength;
      console.log(
        `📊 File size: ${(contentLength / 1024 / 1024).toFixed(2)} M`
      );
    }
    console.log(`📤 Uploading to S3: ${s3Key}`);

    const upload = s3Client.upload(uploadParams, {
      partSize: 10 * 1024 * 1024, // 10MB parts
      queueSize: 4,
      leavePartsOnError: false,
    });

    // Optional: Log progress
    upload.on("httpUploadProgress", (progress) => {
      const percentage = Math.round((progress.loaded / progress.total) * 100);
      console.log(
        `📈 Upload progress: ${percentage}% (${progress.loaded}/${progress.total} bytes)`
      );
    });

    // 6️⃣ Wait for upload to complete
    const result = await upload.promise();

    const s3Url = getS3Url(s3Key);

    console.log(`✅ Upload completed for ${fileName}`);
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
    };
  } catch (error) {
    console.error(`❌ Upload failed for ${fileName}:`, error.message);

    // 🔍 Handle specific known error cases
    if (error.code === "NetworkingError") {
      throw new Error(`Network error during upload: ${error.message}`);
    } else if (error.code === "NoSuchBucket") {
      throw new Error(`S3 bucket not found: ${process.env.S3_BUCKET_NAME}`);
    } else if (error.code === "AccessDenied") {
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
  return contentType[extension] || "application/octet-stream";
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
    if (res.status === "fulfilled" && res.value.success) {
      successfulUploads.push(res.value);
    } else {
      failedUploads.push({
        fileId: files[index].id,
        error: res.status === "rejected" ? res.reason.message : res.value.error,
      });
    }
  });
  console.log(
    `📊 Batch upload summary: ${successfulUploads.length} successful, ${failedUploads.length} failed`
  );

  return {
    successfulUploads,
    failedUploads,
    totalFiles: files.length,
    sessionId,
    completedAt: new Date().toISOString(),
  };
};
