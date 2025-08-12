import axios from "axios";

const testWebhook = {
  event: "session.recording_completed",
  event_ts: 1705312200,
  payload: {
    account_id: "test_account_123",
    object: {
      session_id: "test_session_456",
      recording_files: [
        {
          id: "test_file_789",
          recording_type: "video",
          file_name: "test_recording.mp4",
          file_size: 10485760, // 10MB
          download_url: "https://zoom.us/recording/download/test",
          recording_start: "2024-01-15T10:00:00Z",
          recording_end: "2024-01-15T10:30:00Z",
          duration: 1800,
        },
      ],
    },
  },
  download_token: "test_download_token_123",
};

async function testS3Upload() {
  try {
    console.log("�� Testing complete S3 upload flow...");

    const response = await axios.post(
      "http://localhost:4000/webhook/zoom",
      testWebhook,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Webhook sent successfully");
    console.log("📊 Response:", response.data);

    console.log("⏳ Waiting for job processing...");
    console.log("📋 Check your server logs for upload progress");
    console.log("🌐 Visit http://localhost:4000/admin/queues to monitor jobs");
  } catch (error) {
    console.error("❌ Test failed:", error.response?.data || error.message);
  }
}

testS3Upload();
