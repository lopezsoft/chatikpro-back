// src/services/DialogChatBotsServices/ChatbotStateService.ts

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import DialogChatBots from "../../models/DialogChatBots";
import logger from "../../utils/logger";

// Importamos los servicios de bajo nivel que este nuevo servicio orquestará
import ShowChatBotByChatbotIdServices from "../ChatBotServices/ShowChatBotByChatbotIdServices";
import ShowDialogChatBotsServices from "../DialogChatBotsServices/ShowDialogChatBotsServices";
import DeleteDialogChatBotsServices from "../DialogChatBotsServices/DeleteDialogChatBotsServices";
import CreateDialogChatBotsServices from "../DialogChatBotsServices/CreateDialogChatBotsServices";

/**
 * Servicio dedicado a gestionar el estado (o etapa) de la interacción
 * de un contacto con un flujo de chatbot.
 */
class ChatbotStateService {
  /**
   * Obtiene la etapa actual del diálogo para un contacto.
   * @param contactId - El ID del contacto.
   * @returns El registro de la etapa actual o null si no existe.
   */
  public async getStage(contactId: number): Promise<DialogChatBots | null> {
    return await ShowDialogChatBotsServices(contactId) || null;
  }

  /**
   * Elimina cualquier etapa de diálogo existente para un contacto.
   * @param contactId - El ID del contacto.
   */
  public async resetStage(contactId: number): Promise<void> {
    await DeleteDialogChatBotsServices(contactId);
  }

  /**
   * Establece una nueva etapa de diálogo para un contacto, eliminando cualquier etapa anterior.
   * Encapsula la lógica de 'deleteAndCreateDialogStage'.
   * @param contact - El objeto Contacto.
   * @param chatbotId - El ID de la nueva etapa del chatbot.
   * @param ticket - El ticket actual, para actualizar su estado si ocurre un error.
   * @returns El nuevo registro de la etapa del diálogo.
   */
  public async setStage(
    contact: Contact,
    chatbotId: number,
    ticket: Ticket
  ): Promise<DialogChatBots> {
    try {
      await this.resetStage(contact.id);

      const botStep = await ShowChatBotByChatbotIdServices(chatbotId);
      if (!botStep) {
        await ticket.update({ isBot: false });
        logger.error(`No se encontró el paso de chatbot con ID: ${chatbotId}`);
        throw new Error(`Chatbot step ${chatbotId} not found.`);
      }

      return CreateDialogChatBotsServices({
        awaiting: 1,
        contactId: contact.id,
        chatbotId,
        queueId: botStep.queueId
      });
    } catch (error) {
      // Si algo falla, nos aseguramos de que el ticket salga del modo bot.
      await ticket.update({ isBot: false });
      logger.error(`Error al establecer la etapa del chatbot para el contacto ${contact.id}:`, error);
      throw error;
    }
  }
}

export default new ChatbotStateService();
