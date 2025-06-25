// src/services/MessageHandling/TicketClosingService.ts

import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import UpdateTicketService from "../TicketServices/UpdateTicketService";

/**
 * Servicio especializado en cerrar un ticket automáticamente si la cola
 * a la que ha sido asignado está configurada para ello.
 */
class TicketClosingService {
  /**
   * Verifica la configuración de la cola y cierra el ticket si es necesario.
   * @param queue - La cola que ha sido asignada al ticket.
   * @param ticket - El ticket a verificar.
   * @returns `true` si el ticket fue cerrado, `false` en caso contrario.
   */
  public async closeIfRequired(queue: Queue, ticket: Ticket): Promise<boolean> {
    if (queue.closeTicket) {
      await UpdateTicketService({
        ticketData: {
          status: "closed",
          queueId: queue.id,
        },
        ticketId: ticket.id,
        companyId: ticket.companyId,
      });
    }
    return queue.closeTicket; // El ticket no fue cerrado.
  }
}

export default new TicketClosingService();
