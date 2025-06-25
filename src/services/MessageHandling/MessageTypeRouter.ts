// src/services/MessageHandling/MessageTypeRouter.ts

import { WAMessage, WASocket } from "@whiskeysockets/baileys";
import logger from "../../utils/logger";


// Importamos las instancias singleton de nuestros especialistas
import TextMessageHandler from "../../handlers/messageHandlers/TextMessageMessageHandler";
import MediaMessageHandler from "../../handlers/messageHandlers/MediaMessageHandler";

// Importamos los modelos necesarios para definir el "contrato" del handler
import Ticket from "../../models/Ticket";
import TicketTraking from "../../models/TicketTraking";
import { getTypeMessage } from "../../handlers/MessageClassifier";
import VCardMessageHandler from "../../handlers/messageHandlers/VCardMessageHandler";
import EditedMessageHandler from "../../handlers/messageHandlers/EditedMessageHandler";

/**
 * Define la "interfaz" o el contrato que todos nuestros manejadores de mensajes deben cumplir.
 * Esto asegura que todos tengan un método 'handle' con la misma firma.
 */
export interface IMessageHandler {
  handle(
    ticket: Ticket,
    msg: WAMessage,
    wbot: WASocket,
    ticketTraking: TicketTraking
  ): Promise<void>;
}

/**
 * Enruta un mensaje al manejador especializado correcto según su tipo.
 */
class MessageTypeRouter {
  /**
   * Creamos un "mapa" que asocia un tipo de mensaje (string) con su manejador (objeto).
   * Esta es una forma muy limpia y eficiente de gestionar el enrutamiento.
   */
  private handlerMap: { [key: string]: IMessageHandler } = {
    // Tipos de mensaje que manejará el especialista en TEXTO
    conversation: TextMessageHandler,
    extendedTextMessage: TextMessageHandler,
    // editedMessage: TextMessageHandler,

    // Tipos de mensaje que manejará el especialista en MULTIMEDIA
    imageMessage: MediaMessageHandler,
    videoMessage: MediaMessageHandler,
    audioMessage: MediaMessageHandler,
    documentMessage: MediaMessageHandler,
    stickerMessage: MediaMessageHandler,
    documentWithCaptionMessage: MediaMessageHandler,
    // Tipos de mensaje que manejará el especialista en VCard
    contactMessage: VCardMessageHandler,
    contactsArrayMessage: VCardMessageHandler,
    // Tipos de mensaje que manejará el especialista en MENSAJES EDITADOS
    editedMessage: EditedMessageHandler,
    protocolMessage: EditedMessageHandler,
  };

  /**
   * Analiza el mensaje y devuelve la instancia del manejador apropiado.
   * @param msg - El objeto del mensaje de Baileys.
   * @returns Una instancia de un manejador de mensajes o null si no se encuentra uno.
   */
  public getHandler(msg: WAMessage): IMessageHandler | null {
    // 1. Usamos nuestro clasificador para obtener el tipo de mensaje.
    const type = getTypeMessage(msg);

    if (!type) {
      logger.warn({ msgId: msg.key.id }, "No se pudo determinar el tipo de mensaje.");
      return null;
    }

    // 2. Buscamos en nuestro mapa si tenemos un especialista para ese tipo.
    const handler = this.handlerMap[type];

    if (!handler) {
      logger.warn(`No se encontró un manejador para el tipo de mensaje: ${type}`);
      return null;
    }

    // 3. Devolvemos el especialista encontrado.
    return handler;
  }
}

export default new MessageTypeRouter();
