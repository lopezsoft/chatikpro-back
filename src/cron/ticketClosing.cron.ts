// src/cron/ticketClosing.cron.ts

import { CronJob } from 'cron';
import * as Sentry from "@sentry/node";
import logger from '../utils/logger';

import Company from '../models/Company';
import { ClosedAllOpenTickets } from '../services/WbotServices/wbotClosedTickets';

async function closeAutomaticTickets() {
  const companies = await Company.findAll({ where: { status: true } });

  for (const company of companies) {
    try {
      await ClosedAllOpenTickets(company.id);
    } catch (e) {
      Sentry.captureException(e);
      logger.error(`Error al cerrar tickets para la empresa ${company.id}:`, e.message);
    }
  }
}

export function initializeTicketClosingCron() {
  // Se ejecuta cada minuto.
  const job = new CronJob('*/1 * * * *', closeAutomaticTickets);
  job.start();
  logger.info("Cron de cierre automático de tickets inicializado.");
}
