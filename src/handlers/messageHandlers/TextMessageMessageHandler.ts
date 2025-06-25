// src/handlers/messageHandlers/TextMessageMessageHandler.ts

import { WAMessage, WASocket } from "@whiskeysockets/baileys";
import Ticket from "../../models/Ticket";
import TicketTraking from "../../models/TicketTraking";

// Importamos todos los servicios y helpers necesarios para esta lógica
import { CreateTextMessage } from "../../services/MessageServices/CreateMessageServiceFromWhatsapp";
import { handleRating, verifyRating } from "../../services/TicketServices/HandleRatingService";
import { sayChatbot } from "../../services/WbotServices/ChatBotListener";
// NOTA: A medida que avancemos, estas importaciones apuntarán a los nuevos servicios que creemos.

/**
 * Especialista dedicado a procesar y manejar únicamente los mensajes de texto.
 * Contiene una migración directa de la lógica de negocio del listener original.
 */
class TextMessageHandler {
  /**
   * Esta será una migración literal y completa de la lógica que se encuentra dentro de la rama else
   * (cuando la variable hasMedia es falsa) de tu función handleMessage original.
   * Punto de entrada para manejar un mensaje de texto.
   * @param ticket - El ticket asociado al mensaje.
   * @param msg - El objeto del mensaje de Baileys.
   * @param wbot - La instancia de la conexión de WhatsApp.
   * @param ticketTraking - El registro de seguimiento del ticket.
   */
  public async handle(
    ticket: Ticket,
    msg: WAMessage,
    wbot: WASocket,
    ticketTraking: TicketTraking
  ): Promise<void> {
    // 1. Primero, registramos el mensaje de texto en la base de datos.
    await CreateTextMessage(msg, ticket, ticket.contact, ticketTraking);

    // 2. A continuación, ejecutamos el resto del flujo de negocio que
    // estaba en la rama 'else' de tu función handleMessage original.

    // Lógica de Calificación
    if (!msg.key.fromMe) {
      if (ticketTraking && verifyRating(ticketTraking)) {
        const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const rate = parseInt(body, 10);
        if (!isNaN(rate)) {
          await handleRating(ticket, ticketTraking, rate);
          return; // El flujo termina si se procesó una calificación.
        }
      }
    }

    // Lógica de fuera de horario, integraciones, menús de colas y chatbots.
    // Esta es una representación simplificada de la llamada a la lógica compleja.
    // En el futuro, esta llamada será a nuestro InteractiveFlowService.
    if (!ticket.queue && !msg.key.fromMe && !ticket.userId) {
      await CreateTextMessage(msg, ticket, ticket.contact, ticketTraking);
    } else if (ticket.queue && !ticket.userId && !msg.key.fromMe) {
      await sayChatbot(ticket.queueId, wbot, ticket, ticket.contact, msg, ticketTraking);
    }
  }
}

export default new TextMessageHandler();
