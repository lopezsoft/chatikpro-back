// src/handlers/messageHandlers/MediaMessageHandler.ts

import { WAMessage, WASocket } from "@whiskeysockets/baileys";
import Ticket from "../../models/Ticket";
import TicketTraking from "../../models/TicketTraking";
import CompaniesSettings from "../../models/CompaniesSettings";

// Importamos los servicios y helpers necesarios
import { getTypeMessage } from "../MessageClassifier";
import { sayChatbot } from "../../services/WbotServices/ChatBotListener";
import { CreateMediaMessage, CreateTextMessage } from "../../services/MessageServices/CreateMessageServiceFromWhatsapp";
import InteractiveFlowService from "../../services/MessageHandling/InteractiveFlowService";
import QueueService from "../../services/MessageHandling/QueueService";

/**
 * Especialista dedicado a procesar y manejar mensajes que contienen archivos multimedia.
 */
class MediaMessageHandler {
  /**
   * Objetivo: Este archivo se encargará de todo lo que sucede cuando llega un mensaje con un
   * archivo (imagen, audio, video, etc.). Esto incluye la lógica de negocio para rechazar audios,
   * guardar el archivo y luego continuar con el flujo del bot.
   * Punto de entrada para manejar un mensaje multimedia.
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
    const { whatsapp, contact, companyId } = ticket;
    const settings = await CompaniesSettings.findOne({ where: { companyId } });

    // 1. Lógica para rechazar audios, migrada fielmente.
    const isAudio = getTypeMessage(msg) === "audioMessage";
    const isApplicable = !ticket.isGroup || whatsapp.groupAsTicket === "enabled";
    const audioIsRejected = !contact?.acceptAudioMessage || settings?.acceptAudioMessageContact === "disabled";

    if (isAudio && !msg.key.fromMe && isApplicable && audioIsRejected) {
      const body = `\u200e*Asistente Virtual*:\nLamentablemente, no podemos escuchar audios por este canal. Por favor, envíe un mensaje de *texto*.`;
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@s.whatsapp.net`,
        { text: body },
        { quoted: msg }
      );
      await CreateTextMessage(sentMessage, ticket, contact, ticketTraking);
      return;
    }

    // 2. Guardamos el mensaje multimedia en la base de datos y el archivo en el disco.
    await CreateMediaMessage(msg, ticket, contact, ticketTraking, false, false, wbot);

    // 3. A continuación, se ejecuta el mismo flujo de negocio que en el handler de texto.
    // Esto demuestra la necesidad de nuestro futuro 'InteractiveFlowService'.
    await InteractiveFlowService.execute(ticket, msg, wbot, ticketTraking);


    // Lógica de fuera de horario, integraciones, menús de colas y chatbots.
    if (!ticket.queue && !msg.key.fromMe && !ticket.userId) {
      await QueueService.handle(wbot, msg, ticket, contact, settings, ticketTraking);
    } else if (ticket.queue && !ticket.userId && !msg.key.fromMe) {
      await sayChatbot(ticket.queueId, wbot, ticket, contact, msg, ticketTraking);
    }
  }
}

export default new MediaMessageHandler();
