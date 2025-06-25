// src/handlers/messageHandlers/EditedMessageHandler.ts

import { WAMessage, WASocket } from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";

// Suponiendo que 'findCaption' es una función auxiliar que podemos mover a un helper.
// Por ahora, la definimos localmente para que el handler sea autocontenido.
function findCaption(obj: any): string | null {
  if (typeof obj !== "object" || obj === null) {
    return null;
  }
  for (const key in obj) {
    if (key === "caption" || key === "text" || key === "conversation") {
      return obj[key];
    }
    const result = findCaption(obj[key]);
    if (result) {
      return result;
    }
  }
  return null;
}

/**
 * Especialista en manejar mensajes que han sido editados.
 */
class EditedMessageHandler {
  public async handle(
    ticket: Ticket,
    msg: WAMessage,
    wbot: WASocket
  ): Promise<void> {
    const { companyId } = ticket;

    // Lógica extraída fielmente de tu función original
    const msgKeyIdEdited = msg.message?.protocolMessage?.key?.id;
    if (!msgKeyIdEdited) return;

    const bodyEdited = findCaption(msg.message);
    if (!bodyEdited) return;

    logger.info(`Mensaje editado detectado. msgId: ${msgKeyIdEdited}, ticketId: ${ticket.id}`);
    const io = getIO();

    try {
      const messageToUpdate = await Message.findOne({
        where: {
          wid: msgKeyIdEdited,
          companyId,
          ticketId: ticket.id
        }
      });

      if (!messageToUpdate) return;

      await messageToUpdate.update({ isEdited: true, body: bodyEdited });
      await ticket.update({ lastMessage: bodyEdited });

      io.of(String(companyId)).emit(`company-${companyId}-appMessage`, {
        action: "update",
        message: messageToUpdate
      });

      // También notificamos que el ticket fue actualizado para que aparezca arriba en la lista.
      io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket
      });

    } catch (err) {
      Sentry.captureException(err);
      logger.error(`Error manejando mensaje editado. Err: ${err}`);
    }
  }
}

export default new EditedMessageHandler();
