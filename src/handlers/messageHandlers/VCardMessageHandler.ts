// src/handlers/messageHandlers/VCardMessageHandler.ts

import Ticket from "../../models/Ticket";
import { WAMessage, WASocket } from "@whiskeysockets/baileys";
import InteractiveFlowService from "../../services/MessageHandling/InteractiveFlowService";
import TicketTraking from "../../models/TicketTraking";
import { CreateTextMessage } from "../../services/MessageServices/CreateMessageServiceFromWhatsapp";

/**
 * Especialista dedicado a procesar y manejar mensajes que contienen una vCard (tarjeta de contacto).
 */
class VCardMessageHandler {
  /**
   * Procesa un mensaje de vCard.
   * La lógica de parseo ya está en `getBodyMessage`, por lo que aquí solo necesitamos
   * registrar el mensaje y continuar el flujo.
   */
  public async handle(
    ticket: Ticket,
    msg: WAMessage,
    wbot: WASocket,
    ticketTraking: TicketTraking
  ): Promise<void> {
    // 1. Guarda el mensaje (ya parseado a texto) en la base de datos.
    await CreateTextMessage(msg, ticket, ticket.contact, ticketTraking);

    // 2. Pasa el control al servicio de flujo interactivo.
    await InteractiveFlowService.execute(ticket, msg, wbot, ticketTraking);
  }
}

export default new VCardMessageHandler();
