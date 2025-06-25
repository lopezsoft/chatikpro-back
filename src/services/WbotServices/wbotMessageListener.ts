// src/services/WbotServices/wbotMessageListener.ts

import {
  MessageUpsertType,
  WAMessage,
  WAMessageUpdate,
  WASocket,
  GroupMetadata, Contact
} from "@whiskeysockets/baileys";

// Importamos el orquestador principal de nuestro nuevo pipeline
import MessageFlow from "../MessageHandling/MessageFlow";

// Importamos el servicio centralizado con las funciones auxiliares

// Importamos los servicios que necesitan los otros listeners
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import MarkDeleteWhatsAppMessage from "./MarkDeleteWhatsAppMessage";
import { UpdateMessageAckService } from "../MessageServices/UpdateMessageAckService";
import CampaignService from "../CampaignService";

/**
 * Inicializa todos los listeners de eventos para una sesión de WhatsApp.
 * Su responsabilidad es escuchar los eventos de bajo nivel de Baileys y
 * delegar las acciones a los servicios correspondientes.
 *
 * @param wbot La instancia de la conexión de WhatsApp (WASocket).
 * @param companyId El ID de la compañía a la que pertenece la sesión.
 */
export const wbotMessageListener = (wbot: WASocket & { id?: number }, companyId: number): void => {

  // =========================================================================
  // LISTENER DE NUEVOS MENSAJES ('messages.upsert') - LA PARTE REFACTORIZADA
  // =========================================================================
  wbot.ev.on("messages.upsert", async (messageUpsert: { messages: WAMessage[], type: MessageUpsertType }) => {
    const messages = messageUpsert.messages;
    if (!messages) return;

    for (const message of messages) {
      // ¡Toda la complejidad se ha ido!
      // Simplemente llamamos a nuestro 'MessageFlow' y le pasamos el mensaje.
      // Él se encargará de todo el pipeline que construimos.
      await MessageFlow.execute(message, wbot, companyId);
      // tal como estaba en tu archivo original.
      await CampaignService.checkConfirmation(message, companyId);
      await CampaignService.checkMessageAndCloseTicket(message, companyId, wbot);
    }
  });

  // =========================================================================
  // OTROS LISTENERS DE EVENTOS (se mantienen con su lógica original)
  // =========================================================================

  // Listener para actualizaciones de mensajes (ej. 'leído') y mensajes eliminados
  wbot.ev.on("messages.update", (updates: WAMessageUpdate[]) => {
    updates.forEach(async (update) => {
      // Maneja mensajes eliminados
      if (update.update?.messageStubType === 1) {
        await MarkDeleteWhatsAppMessage(update.key.remoteJid, null, update.key.id, companyId);
      } else {
        // Maneja las actualizaciones de estado (ACKs) a través de su propio servicio
        await UpdateMessageAckService(update, update.update.status);
      }
    });
  });

  // Listener para actualizaciones de contactos (ej. cambio de foto de perfil)
  wbot.ev.on("contacts.update", (contacts: Partial<Contact>[]) => {
    contacts.forEach(async (contact: any) => {
      if (!contact?.id || contact.id.endsWith("@g.us")) return;

      let profilePicUrl: string;
      if (typeof contact.imgUrl !== "undefined") {
        try {
          profilePicUrl = await wbot!.profilePictureUrl(contact.id, "image");
        } catch (e) {
          profilePicUrl = null;
        }
      }

      await CreateOrUpdateContactService({
        isGroup: false,
        name: contact.notify || contact.name || contact.id.replace(/\D/g, ""),
        number: contact.id.replace(/\D/g, ""),
        profilePicUrl,
        companyId
      });
    });
  });

  // Listener para actualizaciones de grupos (ej. cambio de nombre del grupo)
  wbot.ev.on("groups.update", (groupUpdate: Partial<GroupMetadata>[]) => {
    if (groupUpdate.length === 0) return;

    groupUpdate.forEach(async (group: Partial<GroupMetadata>) => {
      const contactData = {
        name: group.subject,
        number: group.id.replace(/\D/g, ""),
        isGroup: true,
        companyId: companyId,
      };
      await CreateOrUpdateContactService(contactData);
    });
  });
};
