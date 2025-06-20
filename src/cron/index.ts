// src/cron/index.ts

import logger from '../utils/logger';
import { initializeInvoiceCron } from './invoice.cron';
import { initializeTicketLanesCron } from './ticketLanes.cron';
import { initializeTicketRoutingCron } from './ticketRouting.cron';
import { initializeTicketClosingCron } from './ticketClosing.cron';

export function initializeAllCrons() {
  logger.info("Inicializando todos los CronJobs de la aplicación...");

  initializeInvoiceCron();
  initializeTicketLanesCron();
  initializeTicketRoutingCron();
  initializeTicketClosingCron();
  // Aquí añadiremos los demás crons a medida que los migremos.
}
