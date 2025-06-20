// src/cron/ticketRouting.cron.ts

import { CronJob } from 'cron';
import { Op } from 'sequelize';
import * as Sentry from "@sentry/node";
import logger from '../utils/logger';

// Importa todos los modelos y servicios necesarios
import Company from '../models/Company';
import Queues from '../models/Queue';
import Ticket from '../models/Ticket';
import UserQueue from '../models/UserQueue';
import User from '../models/User';
import CompaniesSettings from '../models/CompaniesSettings';
import ShowContactService from '../services/ContactServices/ShowContactService';
import ShowTicketService from '../services/TicketServices/ShowTicketService';
import UpdateTicketService from '../services/TicketServices/UpdateTicketService';
import SendWhatsAppMessage from '../services/WbotServices/SendWhatsAppMessage';

// La lógica original de handleRandomUser, ahora en una función con nombre más descriptivo
async function assignPendingTickets() {
  try {
    const companies = await Company.findAll({
      include: [{
        model: Queues,
        as: "queues",
        where: { ativarRoteador: true, tempoRoteador: { [Op.ne]: 0 } }
      }]
    });

    if (!companies) return;

    for (const company of companies) {
      for (const queue of company.queues) {
        await processQueueTickets(queue, company.id);
      }
    }
  } catch (e) {
    Sentry.captureException(e);
    logger.error("Error en el cron de asignación de tickets:", e.message);
  }
}

async function processQueueTickets(queue: Queues, companyId: number) {
  const tickets = await Ticket.findAll({
    where: { companyId, status: "pending", queueId: queue.id, userId: null },
  });

  if (tickets.length === 0) return;

  const userQueues = await UserQueue.findAll({ where: { queueId: queue.id } });
  const userIds = userQueues.map(uq => uq.userId);

  if (userIds.length === 0) return;

  let settings = await CompaniesSettings.findOne({ where: { companyId } });
  const sendGreeting = settings?.sendGreetingMessageOneQueues === "enabled";

  for (const ticket of tickets) {
    const onlineUserIds = await getOnlineUsersFromList(userIds, companyId);
    if (onlineUserIds.length === 0) continue;

    const randomUserId = onlineUserIds[Math.floor(Math.random() * onlineUserIds.length)];

    if (sendGreeting) {
      const ticketToSend = await ShowTicketService(ticket.id, companyId);
      const greeting = `Hola, ${ticketToSend.contact.name || ticketToSend.contact.number}. Tu ticket ha sido asignado a un agente.`;
      await SendWhatsAppMessage({ body: greeting, ticket: ticketToSend });
    }

    await UpdateTicketService({
      ticketData: { userId: randomUserId },
      ticketId: ticket.id,
      companyId: companyId,
    });

    logger.info(`Ticket ID ${ticket.id} asignado al usuario ${randomUserId}.`);
  }
}

async function getOnlineUsersFromList(userIds: number[], companyId: number): Promise<number[]> {
  const users = await User.findAll({
    where: {
      id: { [Op.in]: userIds },
      companyId,
      profile: "user",
      online: true
    },
    attributes: ["id"]
  });
  return users.map(u => u.id);
}


export function initializeTicketRoutingCron() {
  // Se ejecuta cada 2 minutos.
  const job = new CronJob('0 */2 * * * *', assignPendingTickets);
  job.start();
  logger.info("Cron de asignación de tickets inicializado.");
}
