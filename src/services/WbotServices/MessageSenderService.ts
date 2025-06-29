// src/services/WbotServices/MessageSenderService.ts

import { WAMessage, WASocket } from "@whiskeysockets/baileys";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import { CreateTextMessage } from "../MessageServices/CreateMessageServiceFromWhatsapp";
import formatBody from "../../helpers/Mustache";
import logger from "../../utils/logger";

/**
 * Envía un mensaje de texto simple y lo registra en la base de datos.
 * @param wbot La instancia de la conexión de WhatsApp.
 * @param contact El contacto destinatario.
 * @param ticket El ticket asociado.
 * @param body El cuerpo del mensaje de texto.
 * @returns La promesa del mensaje enviado.
 */
export const sendText = async (
  wbot: WASocket,
  contact: Contact,
  ticket: Ticket,
  body: string
): Promise<WAMessage> => {
  const sentMessage = await wbot.sendMessage(
    `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
    {
      text: formatBody(body, ticket)
    }
  );
  // Asumimos que CreateTextMessage es el sucesor de verifyMessage para texto.
  await CreateTextMessage(sentMessage, ticket, contact);
  return sentMessage;
};

/**
 * Envía un documento (PDF) y lo registra en la base de datos.
 * @param wbot La instancia de la conexión de WhatsApp.
 * @param contact El contacto destinatario.
 * @param ticket El ticket asociado.
 * @param url La URL del documento a enviar.
 * @param caption El nombre del archivo.
 * @returns La promesa del mensaje enviado.
 */
export const sendLink = async (
  wbot: WASocket,
  contact: Contact,
  ticket: Ticket,
  url: string,
  caption: string
): Promise<WAMessage> => {
  let sentMessage: WAMessage;
  try {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        document: { url },
        fileName: caption,
        mimetype: 'application/pdf'
      }
    );
  } catch (error) {
    logger.error("Error al enviar el enlace PDF:", error);
    sentMessage = await sendText(wbot, contact, ticket, '\u200eNo se pudo enviar el PDF, por favor intente de nuevo.');
  }
  await CreateTextMessage(sentMessage, ticket, contact);
  return sentMessage;
};

/**
 * Envía una imagen y la registra en la base de datos.
 * @param wbot La instancia de la conexión de WhatsApp.
 * @param contact El contacto destinatario.
 * @param ticket El ticket asociado.
 * @param url La URL de la imagen.
 * @param caption El texto que acompaña a la imagen.
 * @returns La promesa del mensaje enviado.
 */
export const sendImage = async (
  wbot: WASocket,
  contact: Contact,
  ticket: Ticket,
  url: string,
  caption: string
): Promise<WAMessage> => {
  let sentMessage: WAMessage;
  try {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        image: { url },
        fileName: caption,
        caption: caption,
        mimetype: 'image/jpeg'
      }
    );
  } catch (error) {
    logger.error("Error al enviar la imagen:", error);
    sentMessage = await sendText(wbot, contact, ticket, '\u200eNo se pudo enviar la imagen, por favor intente de nuevo.');
  }
  await CreateTextMessage(sentMessage, ticket, contact);
  return sentMessage;
};
