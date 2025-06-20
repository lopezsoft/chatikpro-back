// src/jobs/sendMessage.job.ts

import * as Sentry from "@sentry/node";
import { Job } from "bull";
import { MessageData, SendMessage } from "../helpers/SendMessage";
import Whatsapp from "../models/Whatsapp";
import logger from "../utils/logger";

export async function handleSendMessage(job: Job): Promise<void> {
  try {
    const { data } = job;
    const whatsapp = await Whatsapp.findByPk(data.whatsappId);

    if (whatsapp === null) {
      throw new Error("Whatsapp no identificado");
    }

    const messageData: MessageData = data.data;
    await SendMessage(whatsapp, messageData);
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("MessageQueue -> SendMessage: error", e.message);
    throw e;
  }
}
