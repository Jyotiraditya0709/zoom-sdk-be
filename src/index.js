import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { KJUR } from "jsrsasign";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "Backend server is running" });
});

// Generate a Zoom Video SDK Signature
app.post("/generateSignature", (req, res) => {
  const { sessionName, role } = req.body;
  console.log("role", typeof role, role);

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
  const exp = iat + 60 * 60 * 2; // 2 hours expiration

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
    console.log("sig:-->", sdkJWT);

    return res.json({ signature: sdkJWT });
  } catch (err) {
    console.error("JWT signing failed:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`✅ Backend running at http://localhost:${port}`);
});
