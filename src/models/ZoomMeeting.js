import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
  class ZoomMeeting extends Model {
    static associate(models) {}
  }

  ZoomMeeting.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      mentorId: {
        allowNull: false,
        type: DataTypes.UUID,
      },
      menteeId: {
        allowNull: false,
        type: DataTypes.UUID,
      },
      orgId: {
        allowNull: false,
        type: DataTypes.UUID,
        defaultValue: "00324e7c-0a3e-40d6-a583-ae54105c6311",
      },
      agenda: {
        type: DataTypes.STRING,
      },
      redirectLink: {
        type: DataTypes.STRING,
      },
      isCompleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      StartTime: {
        type: DataTypes.STRING,
      },
      EndTime: {
        type: DataTypes.STRING,
      },
      meetingStartBy: {
        type: DataTypes.STRING,
      },
      sessionRecorded: {
        type: DataTypes.STRING,
      },
      recordingUrl: {
        type: DataTypes.TEXT("long"),
      },
      usersJson: {
        type: DataTypes.JSON,
      },
      clientAdditionalInfo: {
        type: DataTypes.JSON,
      },
      joinedUsers: {
        type: DataTypes.STRING,
        defaultValue: "",
      },
      isMentorJoined: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      isMenteeJoined: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      meetingStatus: {
        type: DataTypes.STRING,
        defaultValue: "pending",
      },
      maxCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      studentCv: {
        type: DataTypes.STRING,
      },
      roomStartTime: {
        type: DataTypes.DATE,
      },
      roomEndTime: {
        type: DataTypes.DATE,
      },
      duration: {
        type: DataTypes.INTEGER,
      },
    },

    {
      sequelize,
      modelName: "ZoomMeeting",
      tableName: "ZoomMeetings",
    }
  );

  return ZoomMeeting;
};
