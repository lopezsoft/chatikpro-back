// src/services/TicketServices/ReopenTicketService.ts

import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";

/**
 * Servicio para reabrir un ticket que estaba cerrado y notificar a la UI.
 * @param ticket El ticket que se va a reabrir.
 * @param companyId El ID de la compañía.
 */
export const ReopenTicketService = async (
  ticket: Ticket,
  companyId: number
): Promise<void> => {
  // Cambia el estado del ticket a 'pendiente'
  await ticket.update({ status: "pending" });

  // Recarga la instancia del ticket con todas sus asociaciones para tener los datos más recientes
  await ticket.reload({
    include: [
      { model: Queue, as: "queue" },
      { model: User, as: "user" },
      { model: Contact, as: "contact" },
      { model: Whatsapp, as: "whatsapp" }
    ]
  });

  const io = getIO();

  // Si el ticket no es uno importado, emite el evento para actualizar la UI
  if (!ticket.imported) {
    io.of(String(companyId))
      .emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket,
        ticketId: ticket.id
      });
  }
};
