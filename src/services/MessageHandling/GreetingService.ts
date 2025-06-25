// src/services/MessageHandling/GreetingService.ts

import { WASocket } from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";

// Modelos y Tipos
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";

// Servicios y Helpers
import formatBody from "../../helpers/Mustache";
import { getMessageOptions } from "../WbotServices/SendWhatsAppMedia";
import { debounce } from "../../helpers/Debounce";
import { CreateMediaMessage, CreateTextMessage } from "../MessageServices/CreateMessageServiceFromWhatsapp";

/**
 * Servicio especializado en enviar los mensajes de saludo de una cola.
 */
class GreetingService {
  /**
   * Envía el mensaje de saludo de una cola a un ticket.
   * Maneja tanto mensajes de texto como mensajes con archivos adjuntos.
   * @param queue - La cola de la que se obtendrá el saludo.
   * @param ticket - El ticket al que se le enviará el saludo.
   * @param wbot - La instancia de la conexión de WhatsApp.
   */
  public async send(
    queue: Queue,
    ticket: Ticket,
    wbot: WASocket,
  ): Promise<void> {
    const { contact, companyId } = ticket;

    if (!queue.greetingMessage) return;

    const body = formatBody(`\u200e${queue.greetingMessage}`, ticket);

    // Verifica si la conexión (whatsapp) tiene un archivo adjunto para el saludo.
    const hasMediaAttachment = !!ticket.whatsapp.greetingMediaAttachment;

    if (hasMediaAttachment) {
      const filePath = path.resolve("public", `company${companyId}`, ticket.whatsapp.greetingMediaAttachment);
      if (fs.existsSync(filePath)) {
        // Si el archivo existe, lo envía como adjunto con el saludo.
        const options = await getMessageOptions(
          ticket.whatsapp.greetingMediaAttachment,
          filePath,
          String(companyId),
          body
        );

        const debouncedSentMedia = debounce(async () => {
          const sentMessage = await wbot.sendMessage(`${contact.number}@s.whatsapp.net`, { ...options });
          await CreateMediaMessage(sentMessage, ticket, contact, null, false, false, wbot);
        }, 1000, ticket.id);

        debouncedSentMedia();
        return;
      }
    }

    // Si no hay archivo adjunto o no se encuentra, envía solo el texto.
    const debouncedSentMessage = debounce(async () => {
      const sentMessage = await wbot.sendMessage(`${contact.number}@s.whatsapp.net`, { text: body });
      await CreateTextMessage(sentMessage, ticket, contact);
    }, 1000, ticket.id);

    debouncedSentMessage();
  }
}

export default new GreetingService();
