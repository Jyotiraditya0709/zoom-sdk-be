import fetch from "node-fetch";

const WEBHOOK_URL = "http://localhost:4000/webhook/zoom";

const sampleWebhookData = {
  event: "session.recording_completed",
  event_ts: Math.floor(Date.now() / 1000),
  payload: {
    account_id: "test_account_123",
    object: {
      session_id: "test_session_456",
      recording_files: [
        {
          id: "recording_file_789",
          recording_type: "video",
          file_name: "test_recording.mp4",
          file_size: 52428800,
          download_url: "https://zoom.us/recording/download/test",
          recording_start: "2024-01-15T10:00:00Z",
          recording_end: "2024-01-15T10:30:00Z",
          duration: 1800,
        },
        {
          id: "recording_file_790",
          recording_type: "audio",
          file_name: "test_recording_audio.m4a",
          file_size: 10485760,
          download_url: "https://zoom.us/recording/download/test_audio",
          recording_start: "2024-01-15T10:00:00Z",
          recording_end: "2024-01-15T10:30:00Z",
          duration: 1800,
        },
      ],
    },
  },
  download_token: "test_download_token_123",
};

async function testWebhook() {
  try {
    console.log("🧪 Testing Zoom webhook endpoint...");

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Zoom-Signature": "test_signature",
        "X-Zoom-Timestamp": sampleWebhookData.event_ts.toString(),
      },
      body: JSON.stringify(sampleWebhookData),
    });

    const result = await response.json();

    console.log("📥 Response status:", response.status);
    console.log("📥 Response data:", result);

    if (response.ok) {
      console.log("✅ Webhook test successful!");
      console.log("🔗 Check the following URLs:");
      console.log("   - Queue Dashboard: http://localhost:4000/admin/queues");
      console.log("   - Queue Stats: http://localhost:4000/queue/stats");
      console.log("   - Recordings: http://localhost:4000/recordings");
    } else {
      console.log("❌ Webhook test failed!");
    }
  } catch (error) {
    console.error("💥 Error testing webhook:", error.message);
  }
}

testWebhook();
