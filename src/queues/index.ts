// src/queues/index.ts

import logger from '../utils/logger';

// Importa las definiciones de las colas
import {
  messageQueue,
  scheduleMonitor,
  sendScheduledMessages,
  campaignQueue,
  userMonitor,
  queueMonitor
} from './definitions';

// Importa los procesadores de trabajos
import { handleSendMessage } from '../jobs/sendMessage.job';
import { handleVerifySchedules, handleSendScheduledMessage } from '../jobs/schedule.job';
import { handleVerifyCampaigns, handleProcessCampaign, handlePrepareContact, handleDispatchCampaign } from '../jobs/campaign.job';
import { handleLoginStatus } from '../jobs/user.job';
import { handleVerifyQueue } from '../jobs/ticket.job';

export function startAllQueues() {
  logger.info("Iniciando y registrando todos los procesadores de colas...");

  // Conecta cada cola con su procesador
  messageQueue.process("SendMessage", handleSendMessage);

  scheduleMonitor.process("Verify", handleVerifySchedules);
  sendScheduledMessages.process("SendMessage", handleSendScheduledMessage);

  campaignQueue.process("VerifyCampaignsDaatabase", handleVerifyCampaigns);
  campaignQueue.process("ProcessCampaign", handleProcessCampaign);
  campaignQueue.process("PrepareContact", handlePrepareContact);
  campaignQueue.process("DispatchCampaign", handleDispatchCampaign);

  userMonitor.process("VerifyLoginStatus", handleLoginStatus);
  queueMonitor.process("VerifyQueueStatus", handleVerifyQueue);

  // Añade los trabajos recurrentes de Bull
  logger.info("Añadiendo trabajos recurrentes a las colas...");

  // Añade trabajos recurrentes a las colas
  scheduleMonitor.add("Verify", {}, { // Revisa cada minuto
    repeat: { cron: "0 * * * * *"},
    removeOnComplete: true
  });
  // Añade un trabajo para enviar mensajes agendados
  campaignQueue.add("VerifyCampaignsDaatabase", {}, { // Revisa cada 20 segundos
    repeat: { cron: "*/20 * * * * *" },
    removeOnComplete: true
  });
  // Añade un trabajo para enviar mensajes agendados
  userMonitor.add("VerifyLoginStatus", {}, { // Revisa cada minuto
    repeat: { cron: "* * * * *"},
    removeOnComplete: true
  });
  // Añade un trabajo para verificar el estado de las colas
  queueMonitor.add("VerifyQueueStatus", {}, {
    repeat: { cron: "0 * * * * *" },
    removeOnComplete: true
  });

  logger.info("Procesadores de colas y trabajos recurrentes iniciados.");
}
