// src/services/MessageServices/UpdateMessageAckService.ts

import { WAMessageUpdate } from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";

/**
 * Migración de la función `handleMsgAck` para actualizar el estado de ACK de un mensaje.
 * Actualiza el estado de ACK (confirmación de entrega/lectura) de un mensaje.
 * @param msg - El objeto de actualización de mensaje de Baileys.
 * @param ack - El nuevo estado de ACK (ej. 1 para enviado, 2 para entregado, 3 para leído).
 */
export const UpdateMessageAckService = async (
  msg: WAMessageUpdate,
  ack: number
): Promise<void> => {
  // Esperamos un momento para asegurar que el mensaje original ya fue procesado y guardado.
  await new Promise(r => setTimeout(r, 500));
  const io = getIO();

  try {
    const messageToUpdate = await Message.findOne({
      where: { wid: msg.key.id! },
      include: [
        {
          model: Ticket,
          as: "ticket",
          attributes: ["id", "status", "companyId"]
        },
      ],
    });

    if (!messageToUpdate) {
      logger.warn(`Mensaje con wid ${msg.key.id} no encontrado para actualizar ACK.`);
      return;
    }

    // Para no hacer un "downgrade" del estado (ej. de leído a entregado)
    if (messageToUpdate.ack >= ack) {
      return;
    }

    await messageToUpdate.update({ ack });

    // Emitimos el evento de socket para actualizar la UI en tiempo real.
    io.of(String(messageToUpdate.ticket.companyId))
      .to(messageToUpdate.ticketId.toString())
      .emit(`company-${messageToUpdate.ticket.companyId}-appMessage`, {
        action: "update",
        message: messageToUpdate
      });

  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error al actualizar ACK del mensaje. Err: ${err}`);
  }
};
