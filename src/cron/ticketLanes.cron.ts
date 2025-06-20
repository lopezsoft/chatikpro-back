// src/cron/ticketLanes.cron.ts

import { CronJob } from 'cron';
import * as Sentry from "@sentry/node";
import { isNil } from 'lodash';
import logger from '../utils/logger';

// Importa modelos y servicios
import Company from '../models/Company';
import Plan from '../models/Plan';
import TicketTag from '../models/TicketTag';
import Ticket from '../models/Ticket';
import Tag from '../models/Tag';
import Whatsapp from '../models/Whatsapp';
import Contact from '../models/Contact';
import ShowTicketService from '../services/TicketServices/ShowTicketService';
import { SendMessage } from '../helpers/SendMessage';
import formatBody from '../helpers/Mustache';

async function processTicketLanes() {
  const companies = await Company.findAll({
    include: [{
      model: Plan, as: "plan",
      where: { useKanban: true }
    }]
  });

  for (const company of companies) {
    try {
      const ticketTags = await TicketTag.findAll({
        include: [
          {
            model: Ticket, as: "ticket",
            where: { status: "open", fromMe: true, companyId: company.id },
          },
          {
            model: Tag, as: "tag",
            where: { companyId: company.id }
          }
        ]
      });

      for (const ticketTag of ticketTags) {
        await moveTicketToNextLaneIfNeeded(ticketTag, company.id);
      }
    } catch (e) {
      Sentry.captureException(e);
      logger.error(`Error procesando lanes para la empresa ${company.id}:`, e.message);
    }
  }
}

async function moveTicketToNextLaneIfNeeded(ticketTag: TicketTag, companyId: number) {
  const { tag, ticket } = ticketTag;
  if (isNil(tag?.nextLaneId) || tag.nextLaneId <= 0 || tag.timeLane <= 0) {
    return;
  }

  const limitDate = new Date();
  limitDate.setHours(limitDate.getHours() - Number(tag.timeLane));

  if (new Date(ticket.updatedAt) < limitDate) {
    const nextTag = await Tag.findByPk(tag.nextLaneId);
    if (!nextTag) return;

    await TicketTag.destroy({ where: { ticketId: ticket.id, tagId: tag.id } });
    await TicketTag.create({ ticketId: ticket.id, tagId: nextTag.id });

    if (!isNil(nextTag.greetingMessageLane) && nextTag.greetingMessageLane !== "") {
      const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
      const contact = await Contact.findByPk(ticket.contactId);
      const ticketUpdate = await ShowTicketService(ticket.id, companyId);

      await SendMessage(whatsapp, {
        number: contact.number,
        body: `${formatBody(nextTag.greetingMessageLane, ticketUpdate)}`,
        companyId: companyId
      }, contact.isGroup);
    }
  }
}

export function initializeTicketLanesCron() {
  // Se ejecuta cada minuto.
  const job = new CronJob('*/1 * * * *', processTicketLanes);
  job.start();
  logger.info("Cron de procesamiento de lanes (Kanban) inicializado.");
}
