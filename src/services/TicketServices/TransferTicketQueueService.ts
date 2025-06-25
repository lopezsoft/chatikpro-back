// src/services/TicketServices/TransferTicketQueueService.ts

import Ticket from "../../models/Ticket";
import UpdateTicketService from "./UpdateTicketService";

/**
 * Migración de la función `transferQueue` para transferir un ticket a una nueva cola de atención.
 * Transfiere un ticket a una nueva cola de atención.
 * @param queueId - El ID de la nueva cola.
 * @param ticket - El ticket a transferir.
 */
export const TransferTicketQueueService = async (
  queueId: number,
  ticket: Ticket,
): Promise<void> => {
  await UpdateTicketService({
    ticketData: { queueId: queueId },
    ticketId: ticket.id,
    companyId: ticket.companyId
  });
};
