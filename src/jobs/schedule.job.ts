// src/jobs/schedule.job.ts

import { Job } from "bull";
import * as Sentry from "@sentry/node";
import moment from "moment";
import { Op } from "sequelize";
import { isNil } from "lodash";
import path from 'path';

import { sendScheduledMessages } from "../queues/definitions";
import logger from "../utils/logger";
import Schedule from "../models/Schedule";
import Contact from "../models/Contact";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import Ticket from "../models/Ticket";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import { SendMessage } from "../helpers/SendMessage";
import { verifyMediaMessage, verifyMessage } from "../services/WbotServices/wbotMessageListener";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import formatBody from "../helpers/Mustache";

export async function handleVerifySchedules(job: Job): Promise<void> {
  try {
    const { count, rows: schedules } = await Schedule.findAndCountAll({
      where: {
        status: "PENDENTE",
        sentAt: null,
        sendAt: {
          [Op.gte]: moment().format("YYYY-MM-DD HH:mm:ss"),
          [Op.lte]: moment().add("30", "seconds").format("YYYY-MM-DD HH:mm:ss")
        }
      },
      include: [{ model: Contact, as: "contact" }, { model: User, as: "user" }],
    });

    if (count > 0) {
      for (const schedule of schedules) {
        await schedule.update({ status: "AGENDADA" });
        sendScheduledMessages.add("SendMessage", { schedule }, { delay: 40000 });
        logger.info(`Mensaje agendado para: ${schedule.contact.name}`);
      }
    }
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("SendScheduledMessage -> Verify: error", e.message);
    throw e;
  }
}

export async function handleSendScheduledMessage(job: Job): Promise<void> {
  const { schedule } = job.data;
  let scheduleRecord: Schedule | null = null;
  try {
    scheduleRecord = await Schedule.findByPk(schedule.id);
    if (!scheduleRecord) return;

    let whatsapp = schedule.whatsappId
      ? await Whatsapp.findByPk(schedule.whatsappId)
      : await GetDefaultWhatsApp(null, schedule.companyId);

    if (!whatsapp) throw new Error(`Whatsapp no encontrado para agendamiento ${schedule.id}`);

    const filePath = schedule.mediaPath ? path.resolve("public", `company${schedule.companyId}`, schedule.mediaPath) : null;

    // Lógica completa de envío con y sin ticket
    if (schedule.openTicket === "enabled") {
      let ticket = await Ticket.findOne({
        where: { contactId: schedule.contact.id, companyId: schedule.companyId, whatsappId: whatsapp.id, status: ["open", "pending"] }
      });

      if (!ticket) {
        ticket = await Ticket.create({
          companyId: schedule.companyId,
          contactId: schedule.contactId,
          whatsappId: whatsapp.id,
          queueId: schedule.queueId,
          userId: schedule.ticketUserId,
          status: schedule.statusTicket
        });
      }

      const ticketToShow = await ShowTicketService(ticket.id, schedule.companyId);
      const body = schedule.assinar && schedule.user ? `*${schedule.user.name}:*\n${schedule.body.trim()}` : schedule.body.trim();

      const sentMessage = await SendMessage(whatsapp, {
        number: schedule.contact.number,
        body: `\u200e ${formatBody(body, ticketToShow)}`,
        mediaPath: filePath,
        companyId: schedule.companyId
      }, schedule.contact.isGroup);

      if (schedule.mediaPath) {
        await verifyMediaMessage(sentMessage, ticketToShow, ticketToShow.contact, null, true, false, whatsapp as any);
      } else {
        await verifyMessage(sentMessage, ticketToShow, ticketToShow.contact, null, true, false);
      }
    } else {
      await SendMessage(whatsapp, {
        number: schedule.contact.number,
        body: `\u200e ${schedule.body}`,
        mediaPath: filePath,
        companyId: schedule.companyId
      }, schedule.contact.isGroup);
    }

    await scheduleRecord.update({ sentAt: moment().toDate(), status: "ENVIADA" });
    logger.info(`Mensaje agendado enviado para: ${schedule.contact.name}`);
    sendScheduledMessages.clean(15000, "completed");
  } catch (e: any) {
    Sentry.captureException(e);
    if (scheduleRecord) await scheduleRecord.update({ status: "ERRO" });
    logger.error("SendScheduledMessage -> SendMessage: error", e.message);
    throw e;
  }
}
