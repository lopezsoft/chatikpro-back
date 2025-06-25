// src/services/TicketServices/HandleRatingService.ts

import Ticket from "../../models/Ticket";
import TicketTraking from "../../models/TicketTraking";
import UserRating from "../../models/UserRating";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import formatBody from "../../helpers/Mustache";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import CreateLogTicketService from "./CreateLogTicketService";
import { getIO } from "../../libs/socket";
import { isNil } from "lodash";
import sendFaceMessage from "../FacebookServices/sendFacebookMessage";
import { CreateTextMessage } from "../MessageServices/CreateMessageServiceFromWhatsapp";

/**
 * Verifica si un ticket se encuentra en el estado adecuado para recibir una calificación.
 * @param ticketTraking - El registro de seguimiento del ticket.
 * @returns `true` si el ticket puede ser calificado, `false` en caso contrario.
 */
export const verifyRating = (ticketTraking: TicketTraking): boolean => {
  return ticketTraking &&
    ticketTraking.finishedAt === null && // Aún no ha sido finalizado formalmente
    ticketTraking.closedAt !== null &&  // Fue cerrado por un agente
    ticketTraking.userId !== null &&    // Fue atendido por un agente
    ticketTraking.ratingAt === null;

};

/**
 * Procesa la calificación de un usuario para un ticket.
 * Guarda la calificación, envía un mensaje de agradecimiento y cierra el ticket formalmente.
 * @param ticket - El ticket que está siendo calificado.
 * @param ticketTraking - El registro de seguimiento del ticket.
 * @param rate - La calificación numérica proporcionada por el usuario.
 */
export const handleRating = async (
  ticket: Ticket,
  ticketTraking: TicketTraking,
  rate: number
): Promise<void> => {
  const companyId = ticket.companyId;
  const { complationMessage } = await ShowWhatsAppService(ticket.whatsappId, ticket.companyId);

  // Asegura que la calificación esté en el rango de 0 a 10
  const finalRate = Math.min(10, Math.max(0, rate));

  await UserRating.create({
    ticketId: ticket.id,
    companyId: ticket.companyId,
    userId: ticketTraking.userId,
    rate: finalRate
  });

  // Marca el tracking como calificado para no volver a pedirlo.
  await ticketTraking.update({ ratingAt: new Date() });

  // Envía el mensaje de finalización si existe.
  if (!isNil(complationMessage) && complationMessage !== "" && !ticket.isGroup
  ) {
    const body = formatBody(`\u200e${complationMessage}`, ticket);
    if (ticket.channel === "whatsapp") {
      const msg = await SendWhatsAppMessage({ body, ticket });

      await CreateTextMessage(msg, ticket, ticket.contact, ticketTraking);
    }

    if (["facebook", "instagram"].includes(ticket.channel)) {
      await sendFaceMessage({ body, ticket });
    }
  }

  // Cierra el ticket formalmente y actualiza la UI.
  await ticket.update({
    isBot: false,
    status: "closed",
  });

  await CreateLogTicketService({
    userId: ticket.userId,
    ticketId: ticket.id,
    type: "closed"
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticket,
      ticketId: ticket.id
    });

  io.of(String(companyId))
    .emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket,
      ticketId: ticket.id
    });
};
