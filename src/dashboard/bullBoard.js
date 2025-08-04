import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter.js";
import { ExpressAdapter } from "@bull-board/express";
import recordingQueue from "../queues/recordingQueue.js";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [new BullMQAdapter(recordingQueue)],
  serverAdapter: serverAdapter,
});

export const getBullBoardRoutes = () => {
  return {
    addQueue,
    removeQueue,
    setQueues,
    replaceQueues,
    serverAdapter,
  };
};

export const addQueueToDashboard = (queue) => {
  addQueue(new BullMQAdapter(queue));
};

export const removeQueueFromDashboard = (queue) => {
  removeQueue(new BullMQAdapter(queue));
};

export default {
  addQueue,
  removeQueue,
  setQueues,
  replaceQueues,
  addQueueToDashboard,
  removeQueueFromDashboard,
  serverAdapter,
};
