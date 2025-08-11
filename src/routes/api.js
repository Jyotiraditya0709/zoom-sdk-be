import express from "express";
import {
  getMeetingInfo,
  handleUserJoined,
  handleUserLeft,
  handleMeetingEnd,
  getMeetingState,
} from "../controllers/meetingController.js";

let router = express.Router();

// Meeting validation and info
router.get("/getMeetingInfo/:meetingId/:userId", getMeetingInfo);

// Webhook endpoints for Zoom events
router.post("/userJoined", handleUserJoined);
router.post("/userLeft", handleUserLeft);
router.post("/meetingEnd", handleMeetingEnd);

// Debug endpoint to check meeting state
router.get("/meetingState/:meetingId", getMeetingState);

export default router;
