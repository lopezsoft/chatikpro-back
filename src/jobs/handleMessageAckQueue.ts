import { UpdateMessageAckService } from "../services/MessageServices/UpdateMessageAckService";
import logger from "../utils/logger";

export default {
  key: `${process.env.DB_NAME}-handleMessageAck`,
  options: {
    priority: 1
  },
  async handle({ data }) {
    try {
      const { msg, chat } = data;
      await UpdateMessageAckService(msg, chat);
    } catch (error) {
      logger.error(`Error en handleMessageAckQueue: ${error}`);
    }
  },
};
