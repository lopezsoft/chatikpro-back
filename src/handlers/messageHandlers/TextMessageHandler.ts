// src/handlers/messageHandlers/TextMessageMessageHandler.ts

import Ticket from "../../models/Ticket";
import { WAMessage, WASocket } from "@whiskeysockets/baileys";
import InteractiveFlowService from "../../services/MessageHandling/InteractiveFlowService";
import TicketTraking from "../../models/TicketTraking";
import { CreateTextMessage } from "../../services/MessageServices/CreateMessageServiceFromWhatsapp";

/**
 * Especialista en manejar y procesar mensajes de texto entrantes.
 */
class TextMessageHandler {
  /**
   * Procesa un mensaje de texto.
   * 1. Guarda el mensaje en la base de datos a través de `CreateTextMessage`.
   * 2. Delega el siguiente paso del flujo conversacional al `InteractiveFlowService`.
   *
   * @param ticket - El ticket al que pertenece el mensaje.
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
    // 1. Guarda el mensaje de texto en la base de datos usando la función reutilizada.
    await CreateTextMessage(msg, ticket, ticket.contact, ticketTraking);

    // 2. Pasa el control al servicio de flujo interactivo para que decida qué hacer a continuación
    // (mostrar menú, ejecutar chatbot, etc.).
    await InteractiveFlowService.execute(ticket, msg, wbot, ticketTraking);
  }
}

export default new TextMessageHandler();
