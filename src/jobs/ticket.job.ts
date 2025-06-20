// src/jobs/ticket.job.ts

import { Job } from "bull";
import { Op } from "sequelize";
import moment from "moment";
import * as Sentry from "@sentry/node";
import logger from '../utils/logger';

import { getIO } from "../libs/socket";
import Company from "../models/Company";
import Whatsapp from "../models/Whatsapp";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import Queue from "../models/Queue";
import CreateLogTicketService from "../services/TicketServices/CreateLogTicketService";

export async function handleVerifyQueue(job: Job): Promise<void> {
  try {
    const companies = await Company.findAll({
      where: { status: true },
      include: [{
        model: Whatsapp,
        attributes: ["id", "name", "status", "timeSendQueue", "sendIdQueue"]
      }]
    });

    for (const company of companies) {
      for (const whatsapp of company.whatsapps) {
        if (whatsapp.status !== "CONNECTED") continue;

        const { timeSendQueue, sendIdQueue, id: whatsappId } = whatsapp;
        const companyId = company.id;

        if (timeSendQueue > 0 && sendIdQueue) {
          await processPendingTicketsForWhatsapp(companyId, whatsappId, timeSendQueue, sendIdQueue);
        }
      }
    }
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("SearchForQueue -> VerifyQueue: error", e.message);
    throw e;
  }
};

async function processPendingTicketsForWhatsapp(
  companyId: number,
  whatsappId: number,
  timeQueue: number,
  idQueue: number
) {
  const tempoPassado = moment().subtract(timeQueue, "minutes").toDate();

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: {
      status: "pending",
      queueId: null,
      companyId: companyId,
      whatsappId: whatsappId,
      updatedAt: { [Op.lt]: tempoPassado },
    },
    include: ["contact", "queue", "whatsapp"]
  });

  if (count > 0) {
    for (const ticket of tickets) {
      await ticket.update({ queueId: idQueue });
      await CreateLogTicketService({
        userId: null,
        queueId: idQueue,
        ticketId: ticket.id,
        type: "redirect"
      });

      await ticket.reload();

      const io = getIO();
      io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket,
        ticketId: ticket.id
      });

      logger.info(`Ticket perdido reasignado: ${ticket.id} a la cola ${idQueue} - Empresa: ${companyId}`);
    }
  }
}
