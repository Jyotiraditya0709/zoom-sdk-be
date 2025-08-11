import Sequelize from "sequelize";
import ZoomMeetingModel from "../models/ZoomMeeting.js";

// Initialize sequelize connection
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
  }
);
// Initialize the model
const ZoomMeeting = ZoomMeetingModel(sequelize, Sequelize.DataTypes);

// for active meeting participants
const activeMeetings = new Map();

// Helper: central responce
function createResponse() {
  return {
    IsSuccess: false,
    Message: "OK..",
    Data: null,
  };
}

//check if meeting exists
async function findMeetingById(meetingId) {
  return await ZoomMeeting.findOne({ where: { id: meetingId } });
}

// Helper: persist meeting update inside a transcation: to prevent race conditions
async function updateMeetingTransactional(meetingId, updateObj) {
  return await sequelize.transaction(async (t) => {
    await ZoomMeeting.update(updateObj, {
      where: { id: meetingId },
      transaction: t,
    });

    //return a updated meeting row
    const updated = await ZoomMeeting.findOne({
      where: { id: meetingId },
      transaction: t,
    });
    return updated;
  });
}

// Utility: normalize Ids
function normalizeId(id) {
  if (id === null || id === undefined) return null;
  return String(id);
}

/* =========================
   Controller functions
   ========================= */

// Get meeting info
async function getMeetingInfo(req, res) {
  let resObj = createResponse();

  try {
    const meetingId = normalizeId(req.params.meetingId);
    const userId = normalizeId(req.params.userId);

    if (!meetingId || !userId) {
      resObj.Message = "Invalid meetingId or userId";
      return res.status(400).json(resObj);
    }

    const meeting = await findMeetingById(meetingId);

    if (!meeting) {
      resObj.Message = "Meeting not found";
      return res.status(404).json(resObj);
    }

    // Check if meeting has expired based on EndTime
    if (meeting.EndTime) {
      const endTime = new Date(meeting.EndTime);
      const currentTime = new Date();

      if (currentTime > endTime) {
        resObj.Message = "Meeting time has passed";
        return res.status(410).json(resObj); // 410 Gone - resource no longer available
      }
    }

    // Check if user is authorized (mentor or mentee)
    const isAuthorized =
      normalizeId(meeting.mentorId) === userId ||
      normalizeId(meeting.menteeId) === userId;

    if (!isAuthorized) {
      resObj.Message = "User not authorized for this meeting";
      return res.status(403).json(resObj);
    }

    resObj.IsSuccess = true;
    resObj.Message = "✅ Meeting found and User authorized";
    resObj.Data = {
      meetingId: meeting.id,
      mentorId: meeting.mentorId,
      menteeId: meeting.menteeId,
      agenda: meeting.agenda,
      redirectLink: meeting.redirectLink,
      meetingStatus: meeting.meetingStatus,
      startTime: meeting.StartTime,
      endTime: meeting.EndTime,
      isCompleted: meeting.isCompleted,
      clientAdditionalInfo: meeting.clientAdditionalInfo,
    };

    return res.json(resObj);
  } catch (err) {
    console.error("❌ getMeetingInfo Error:", err);
    resObj.Message = "Server Error ...";
    return res.status(500).json(resObj);
  }
}

// Post: user joined
async function handleUserJoined(req, res) {
  const resObj = createResponse();

  try {
    const meetingId = normalizeId(req.body.meetingId);
    const userId = normalizeId(req.body.userId);
    const userType = req.body.userType || null;

    if (!meetingId || !userId) {
      resObj.Message = "Missing meetingId or userId";
      return res.status(400).json(resObj);
    }

    const meeting = await findMeetingById(meetingId);

    if (!meeting) {
      resObj.Message = "Meeting not found";
      return res.status(404).json(resObj);
    }

    //initialize array if needed
    if (!activeMeetings.has(meetingId)) {
      activeMeetings.set(meetingId, []);
    }

    const userArray = activeMeetings.get(meetingId);

    //add user to array
    if (!userArray.includes(userId)) {
      userArray.push(userId);
    }

    let isMentorJoined = meeting.isMentorJoined || false;
    let isMenteeJoined = meeting.isMenteeJoined || false;

    if (normalizeId(meeting.mentorId) === userId) isMentorJoined = true;
    if (normalizeId(meeting.menteeId) === userId) isMenteeJoined = true;

    // Maintain list of all users who ever joined (not just currently active)
    const existingJoinedUsers = meeting.joinedUsers
      ? meeting.joinedUsers.split(",").filter((id) => id)
      : [];
    const allJoinedUsers = [...new Set([...existingJoinedUsers, userId])]; // Remove duplicates

    const updateObj = {
      joinedUsers: allJoinedUsers.join(","),
      currentParticipants: userArray.length,
      maxCount: Math.max(meeting.maxCount || 0, userArray.length),
      isMentorJoined,
      isMenteeJoined,
      lastActivityTime: new Date(),
    };

    // if more than 1 user, meeting : started
    if (userArray.length > 1 && meeting.meetingStatus !== "started") {
      updateObj.roomStartTime = new Date();
      updateObj.meetingStatus = "started";
      // Set meetingStartBy to the first user who joined (not the current user)
      const firstUser = userArray[0];
      updateObj.meetingStartBy = firstUser;

      console.log("🚀 Meeting started - Both users joined:", {
        meetingId,
        roomStartTime: updateObj.roomStartTime.toISOString(),
        meetingStartBy: updateObj.meetingStartBy,
        activeUsers: userArray,
        userCount: userArray.length,
        allJoinedUsers: allJoinedUsers,
      });
    } else if (userArray.length === 1 && !meeting.meetingStatus) {
      // First user joined, set status to "waiting"
      updateObj.meetingStatus = "waiting";

      console.log("⏳ Meeting waiting - First user joined:", {
        meetingId,
        activeUsers: userArray,
        userCount: userArray.length,
        allJoinedUsers: allJoinedUsers,
      });
    }

    // wait for db commit
    const updatedMeeting = await updateMeetingTransactional(
      meetingId,
      updateObj
    );
    resObj.IsSuccess = true;
    resObj.Message = "User joined successfully";
    resObj.Data = {
      meetingId,
      activeUsers: userArray,
      userCount: userArray.length,
      meetingStarted: userArray.length > 1,
      persisted: {
        id: updatedMeeting.id,
        meetingStatus: updatedMeeting.meetingStatus,
        roomStartTime: updatedMeeting.roomStartTime,
        maxCount: updatedMeeting.maxCount,
      },
    };
    return res.json(resObj);
  } catch (err) {
    console.error("❌ handleUserJoined Error:", err);
    resObj.Message = "Server Error ...";
    return res.status(500).json(resObj);
  }
}

// POST : user left
async function handleUserLeft(req, res) {
  const resObj = createResponse();

  try {
    const meetingId = normalizeId(req.body.meetingId);
    const userId = normalizeId(req.body.userId);

    if (!meetingId || !userId) {
      resObj.Message = "Missing meetingId or userId";
      return res.status(400).json(resObj);
    }

    const meeting = await findMeetingById(meetingId);

    if (!meeting) {
      resObj.Message = "Meeting not found";
      return res.status(404).json(resObj);
    }

    const userArray = activeMeetings.get(meetingId) || [];

    //remove if present
    const updatedUserArray = userArray.filter((id) => id !== userId);
    activeMeetings.set(meetingId, updatedUserArray);

    // Keep track of who ever joined (historical participation)
    let isMentorJoined = meeting.isMentorJoined || false;
    let isMenteeJoined = meeting.isMenteeJoined || false;

    // If the leaving user is mentor or mentee, mark them as having joined
    if (normalizeId(meeting.mentorId) === userId) {
      isMentorJoined = true;
    }
    if (normalizeId(meeting.menteeId) === userId) {
      isMenteeJoined = true;
    }

    // Keep the joinedUsers list intact (don't remove users who left)
    const updateObj = {
      joinedUsers: meeting.joinedUsers || "", // Keep existing joinedUsers
      currentParticipants: updatedUserArray.length,
      isMentorJoined,
      isMenteeJoined,
      lastActivityTime: new Date(),
    };

    // if no user left, check if meeting actually took place
    if (updatedUserArray.length === 0) {
      // Check if meeting actually took place (had at least 2 users join at some point)
      const maxCountReached = meeting.maxCount >= 2;
      const meetingStarted =
        meeting.meetingStatus === "started" && meeting.roomStartTime;

      if (maxCountReached || meetingStarted) {
        // Meeting actually took place - mark as completed
        updateObj.meetingStatus = "completed";
        updateObj.roomEndTime = new Date();
        updateObj.isCompleted = 1;

        // Calculate duration if roomStartTime exists
        if (meeting.roomStartTime) {
          const startTime = new Date(meeting.roomStartTime);
          const endTime = new Date(updateObj.roomEndTime);
          const durationMs = endTime.getTime() - startTime.getTime();
          const durationMinutes = Math.round(durationMs / (1000 * 60)); // Convert to minutes
          updateObj.duration = durationMinutes;

          console.log("📊 Meeting completed - Duration calculated:", {
            meetingId,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            durationMs,
            durationMinutes,
            maxCount: meeting.maxCount,
            meetingStarted: meetingStarted,
          });
        }
      } else {
        // Meeting never actually took place (only one user joined and left)
        // Reset meeting status to pending and clear any start time
        updateObj.meetingStatus = "pending";
        updateObj.roomStartTime = null;
        updateObj.roomEndTime = null;
        updateObj.isCompleted = 0;
        updateObj.duration = null;
        updateObj.meetingStartBy = null;
        updateObj.joinedUsers = ""; // Reset joined users list
        // Keep isMentorJoined and isMenteeJoined as they are (based on who joined)
        // Keep maxCount as it reflects actual users who joined
        updateObj.currentParticipants = 0; // Reset current participants

        console.log(
          "🔄 Meeting reset to pending - Only one user joined and left:",
          {
            meetingId,
            maxCount: meeting.maxCount,
            meetingStatus: meeting.meetingStatus,
            roomStartTime: meeting.roomStartTime,
            isMentorJoined: updateObj.isMentorJoined,
            isMenteeJoined: updateObj.isMenteeJoined,
          }
        );
      }
    }

    const updatedMeeting = await updateMeetingTransactional(
      meetingId,
      updateObj
    );

    // clearup
    if (updatedUserArray.length === 0) {
      activeMeetings.delete(meetingId);
    }

    resObj.IsSuccess = true;
    resObj.Message = "User left successfully";
    resObj.Data = {
      meetingId,
      remainingUsers: updatedUserArray,
      userCount: updatedUserArray.length,
      meetingActuallyTookPlace:
        meeting.maxCount >= 2 ||
        (meeting.meetingStatus === "started" && meeting.roomStartTime),
      persisted: {
        id: updatedMeeting.id,
        meetingStatus: updatedMeeting.meetingStatus,
        maxCount: meeting.maxCount,
        isMentorJoined: updateObj.isMentorJoined,
        isMenteeJoined: updateObj.isMenteeJoined,
      },
    };
    return res.json(resObj);
  } catch (err) {
    console.error("❌ handleUserLeft Error:", err);
    resObj.Message = "Server Error ...";
    return res.status(500).json(resObj);
  }
}

// POST: end meeting (when host ends meeting)
async function handleMeetingEnd(req, res) {
  const resObj = createResponse();

  try {
    const meetingId = normalizeId(req.body.meetingId);
    const userId = normalizeId(req.body.userId);

    if (!meetingId || !userId) {
      resObj.Message = "Missing meetingId or userId";
      return res.status(400).json(resObj);
    }

    const meeting = await findMeetingById(meetingId);

    if (!meeting) {
      resObj.Message = "Meeting not found";
      return res.status(404).json(resObj);
    }

    // Check if user is mentor (host) who can end the meeting
    const isMentor = normalizeId(meeting.mentorId) === userId;
    if (!isMentor) {
      resObj.Message = "Only mentor can end the meeting";
      return res.status(403).json(resObj);
    }

    const updateObj = {
      meetingStatus: "completed",
      roomEndTime: new Date(),
      isCompleted: 1,
      // Keep mentor/mentee joined flags true when meeting is completed
      isMentorJoined: meeting.isMentorJoined || false,
      isMenteeJoined: meeting.isMenteeJoined || false,
    };

    // Calculate duration if roomStartTime exists
    if (meeting.roomStartTime) {
      const startTime = new Date(meeting.roomStartTime);
      const endTime = new Date(updateObj.roomEndTime);
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60)); // Convert to minutes
      updateObj.duration = durationMinutes;

      console.log("📊 Meeting ended by host - Duration calculated:", {
        meetingId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        durationMs,
        durationMinutes,
      });
    }

    // Clear active users
    activeMeetings.delete(meetingId);

    const updatedMeeting = await updateMeetingTransactional(
      meetingId,
      updateObj
    );

    resObj.IsSuccess = true;
    resObj.Message = "Meeting ended successfully";
    resObj.Data = {
      meetingId,
      persisted: {
        id: updatedMeeting.id,
        meetingStatus: updatedMeeting.meetingStatus,
        roomEndTime: updatedMeeting.roomEndTime,
        duration: updatedMeeting.duration,
        isCompleted: updatedMeeting.isCompleted,
      },
    };
    return res.json(resObj);
  } catch (err) {
    console.error("❌ handleMeetingEnd Error:", err);
    resObj.Message = "Server Error ...";
    return res.status(500).json(resObj);
  }
}

//GET debug
async function getMeetingState(req, res) {
  const resObj = createResponse();

  try {
    const meetingId = normalizeId(req.params.meetingId);
    if (!meetingId) {
      resObj.Message = "Missing meetingId";
      return res.status(400).json(resObj);
    }

    const userArray = activeMeetings.get(meetingId) || [];
    const meeting = await findMeetingById(meetingId);

    if (!meeting) {
      resObj.Message = "Meeting not found";
      return res.status(404).json(resObj);
    }

    resObj.IsSuccess = true;
    resObj.Message = "Meeting state retrieved";
    resObj.Data = {
      meetingId,
      activeUsers: userArray,
      userCount: userArray.length,
      meeting: {
        id: meeting.id,
        mentorId: meeting.mentorId,
        menteeId: meeting.menteeId,
        isMentorJoined: meeting.isMentorJoined,
        isMenteeJoined: meeting.isMenteeJoined,
        meetingStatus: meeting.meetingStatus,
        roomStartTime: meeting.roomStartTime,
        meetingStartBy: meeting.meetingStartBy,
        maxCount: meeting.maxCount,
        currentParticipants: meeting.currentParticipants,
        joinedUsers: meeting.joinedUsers,
      },
    };

    return res.json(resObj);
  } catch (err) {
    console.error("getMeetingState error:", err);
    resObj.Message = "Server Error ...";
    return res.status(500).json(resObj);
  }
}

export {
  getMeetingInfo,
  handleUserJoined,
  handleUserLeft,
  handleMeetingEnd,
  getMeetingState,
};
