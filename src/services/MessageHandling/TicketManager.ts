// src/services/MessageHandling/TicketManager.ts

import { WAMessage, WASocket } from "@whiskeysockets/baileys";
import { Mutex } from "async-mutex";

// Modelos y Tipos
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import CompaniesSettings from "../../models/CompaniesSettings";
import TicketTraking from "../../models/TicketTraking";
import { MessagePayload } from "../../contracts/WBot"; // Suponiendo que tienes este tipo definido

// Servicios y Helpers
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import cacheLayer from "../../libs/cache";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import logger from "../../utils/logger";
import { getContactMessage, verifyContact } from "../../helpers/ContactHelpers";

/**
 * Gestiona de forma centralizada la lógica de encontrar o crear un contacto
 * y su correspondiente ticket para cualquier mensaje entrante.
 */
class TicketManager {
  /**
   * Orquesta la obtención del ticket y su registro de seguimiento.
   * @returns Un objeto que contiene el ticket y el registro de seguimiento.
   */
  public async getTicket(payload: MessagePayload): Promise<{ ticket: Ticket; ticketTraking: TicketTraking; contact: Contact }> {
    const { msg, wbot, companyId, isImported } = payload;

    // 1. Identificar Contacto y Grupo
    const isGroup = msg.key.remoteJid.endsWith("@g.us");
    const msgContact = getContactMessage(msg, wbot);
    const contact = await verifyContact(msgContact, wbot, companyId);
    const groupContact = isGroup ? await this._verifyGroupContact(msg, wbot, companyId) : undefined;

    // 2. Obtener la Conexión de WhatsApp
    const whatsapp = await ShowWhatsAppService(wbot.id, companyId);
    if (!whatsapp.allowGroup && isGroup) {
      logger.warn(`Grupo no permitido para WhatsApp ID: ${whatsapp.id}`);
      return ;
    }

    // 3. Gestionar Mensajes No Leídos
    const unreadMessages = await this._handleUnreadMessages(msg, contact);

    // 4. Encontrar o Crear el Ticket de forma segura
    const settings = await CompaniesSettings.findOne({ where: { companyId } });
    const ticketContact = groupContact || contact;

    const mutex = new Mutex();
    const ticket = await mutex.runExclusive(async () =>
      FindOrCreateTicketService(
        ticketContact,
        whatsapp,
        unreadMessages,
        companyId,
        null, // queueId
        null, // userId
        groupContact,
        "whatsapp",
        isImported,
        false,
        settings
      )
    );

    // 5. Crear el registro de seguimiento
    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId: whatsapp.id
    });

    // 6. Marcar mensajes como leídos
    if (!msg.key.fromMe && ticket.status !== "closed") {
      await SetTicketMessagesAsRead(ticket);
    }

    return { ticket, ticketTraking, contact };
  }
  /**
   * Guarda o actualiza el contacto del grupo en la base de datos.
   */
  private async _verifyGroupContact(msg: WAMessage, wbot: WASocket, companyId: number): Promise<Contact> {
    const grupoMeta = await wbot.groupMetadata(msg.key.remoteJid);
    const groupContactData = {
      name: grupoMeta.subject,
      number: grupoMeta.id.replace("@g.us", ""),
      isGroup: true,
      companyId
    };
    return CreateOrUpdateContactService(groupContactData);
  }

  /**
   * Maneja el contador de mensajes no leídos usando Redis (cacheLayer).
   */
  private async _handleUnreadMessages(msg: WAMessage, contact: Contact): Promise<number> {
    if (msg.key.fromMe) {
      await cacheLayer.set(`contacts:${contact.id}:unreads`, "0");
      return 0;
    }
    const unreads = await cacheLayer.get(`contacts:${contact.id}:unreads`);
    const unreadMessages = +unreads + 1;
    await cacheLayer.set(`contacts:${contact.id}:unreads`, `${unreadMessages}`);
    return unreadMessages;
  }
}

export default new TicketManager();
