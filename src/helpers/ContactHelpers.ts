// src/helpers/ContactHelpers.ts

import { WAMessage, WASocket, jidNormalizedUser } from "@whiskeysockets/baileys";
import Contact from "../models/Contact";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import { IMe } from "../contracts/WBot"; // Suponiendo que IMe está en tus contratos

const getSenderMessage = (msg: WAMessage, wbot: WASocket): string => {
  const me = { id: jidNormalizedUser(wbot.user.id), name: wbot.user.name };
  if (msg.key.fromMe) return me.id;

  const senderId = msg.participant || msg.key.participant || msg.key.remoteJid;
  return senderId && jidNormalizedUser(senderId);
};

/**
 * Migración de la función getContactMessage y verifyContact
 * Obtiene la información de contacto del remitente de un mensaje.
 * @param msg - El mensaje de Baileys.
 * @param wbot - La instancia de la conexión de WhatsApp.
 * @returns Un objeto con el id (JID) y el nombre del contacto.
 */
export const getContactMessage = (msg: WAMessage, wbot: WASocket): IMe => {
  const isGroup = msg.key.remoteJid.includes("g.us");
  const rawNumber = msg.key.remoteJid.replace(/\D/g, "");

  return isGroup
    ? {
      id: getSenderMessage(msg, wbot),
      name: msg.pushName
    }
    : {
      id: msg.key.remoteJid,
      name: msg.key.fromMe ? rawNumber : msg.pushName
    };
};

/**
 * Verifica si un contacto existe en la base de datos y lo crea o actualiza.
 * @param msgContact - La información del contacto obtenida del mensaje.
 * @param wbot - La instancia de la conexión de WhatsApp.
 * @param companyId - El ID de la compañía.
 * @returns El registro del Contacto desde la base de datos.
 */
export const verifyContact = async (
  msgContact: IMe,
  wbot: WASocket,
  companyId: number
): Promise<Contact> => {
  const contactData = {
    name: msgContact.name || msgContact.id.replace(/\D/g, ""),
    number: msgContact.id.replace(/\D/g, ""),
    isGroup: msgContact.id.includes("g.us"),
    companyId: companyId,
  };

  return CreateOrUpdateContactService(contactData);
};
