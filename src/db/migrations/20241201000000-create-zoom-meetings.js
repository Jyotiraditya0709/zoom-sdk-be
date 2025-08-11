"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("ZoomMeetings", {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      mentorId: {
        allowNull: false,
        type: Sequelize.UUID,
      },
      menteeId: {
        allowNull: false,
        type: Sequelize.UUID,
      },
      orgId: {
        allowNull: false,
        type: Sequelize.UUID,
        defaultValue: "00324e7c-0a3e-40d6-a583-ae54105c6311",
      },
      agenda: {
        type: Sequelize.STRING,
      },
      redirectLink: {
        type: Sequelize.STRING,
      },
      isCompleted: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      StartTime: {
        type: Sequelize.STRING,
      },
      EndTime: {
        type: Sequelize.STRING,
      },
      meetingStartBy: {
        type: Sequelize.STRING,
      },
      sessionRecorded: {
        type: Sequelize.STRING,
      },
      recordingUrl: {
        type: Sequelize.TEXT("long"),
      },
      usersJson: {
        type: Sequelize.JSON,
      },
      clientAdditionalInfo: {
        type: Sequelize.JSON,
      },
      joinedUsers: {
        type: Sequelize.STRING,
        defaultValue: "",
      },
      isMentorJoined: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      isMenteeJoined: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      meetingStatus: {
        type: Sequelize.STRING,
        defaultValue: "pending",
      },
      maxCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      studentCv: {
        type: Sequelize.STRING,
      },
      roomStartTime: {
        type: Sequelize.DATE,
      },
      roomEndTime: {
        type: Sequelize.DATE,
      },
      duration: {
        type: Sequelize.INTEGER,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("ZoomMeetings");
  },
};
