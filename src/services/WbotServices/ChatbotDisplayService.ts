// src/services/WbotServices/ChatbotDisplayService.ts
import { WASocket } from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Chatbot from "../../models/Chatbot";
import CompaniesSettings from "../../models/CompaniesSettings";
import ShowChatBotServices from "../ChatBotServices/ShowChatBotServices";
import formatBody from "../../helpers/Mustache";
import { sendText } from "./MessageSenderService";
import { CreateTextMessage, CreateMediaMessage } from "../MessageServices/CreateMessageServiceFromWhatsapp";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import { getMessageOptions } from "./SendWhatsAppMedia";
import TicketTraking from "../../models/TicketTraking";
import {Session} from "../../utils/types";

/**
 * Servicio responsable de la lógica de presentación de los mensajes del chatbot.
 */
class ChatbotDisplayService {
  /**
   * Envía la representación visual de un paso del chatbot al usuario.
   */
  public async sendDialog(chatbotStep: Chatbot, wbot: WASocket, contact: Contact, ticket: Ticket): Promise<void> {
    const chatbotWithOptions = await ShowChatBotServices(chatbotStep.id);
    if (!chatbotWithOptions?.options || chatbotWithOptions.options.length === 0) {
      if (chatbotStep.greetingMessage) {
        await sendText(wbot, contact, ticket, `\u200e${chatbotStep.greetingMessage}`);
      }
      return;
    }
    const settings = await CompaniesSettings.findOne({ where: { companyId: ticket.companyId } });
    const botType = settings?.chatBotType || "text";
    if (botType === "list") {
      await this._sendAsList(chatbotStep, chatbotWithOptions.options, wbot, contact, ticket);
    } else if (botType === "button" && chatbotWithOptions.options.length <= 4) {
      await this._sendAsButtons(chatbotStep, chatbotWithOptions.options, wbot, contact, ticket);
    } else {
      await this._sendAsText(chatbotStep, chatbotWithOptions.options, wbot, contact, ticket);
    }
  }

  /**
   * Envía el menú principal de colas de atención a un usuario.
   */
  public async sendMainMenu(wbot: Session, ticket: Ticket, ticketTraking: TicketTraking ): Promise<void> {
    const { queues, greetingMessage, greetingMediaAttachment } = await ShowWhatsAppService(wbot.id!, ticket.companyId);
    if (queues.length === 0) return;
    let options = "";
    queues.forEach((queue, index) => { options += `*[ ${index + 1} ]* - ${queue.name}\n`; });
    options += `\n*[ Salir ]* - Finalizar Atención`;
    const body = formatBody(`\u200e ${greetingMessage}\n\n${options}`, ticket);
    if (greetingMediaAttachment) {
      const filePath = path.resolve("public", `company${ticket.companyId}`, greetingMediaAttachment);
      if (fs.existsSync(filePath)) {
        const optionsMsg = await getMessageOptions(greetingMediaAttachment, filePath, String(ticket.companyId), body);
        const sentMessage = await wbot.sendMessage(`${ticket.contact.number}@s.whatsapp.net`, { ...optionsMsg });
        await CreateMediaMessage(sentMessage, ticket, ticket.contact, ticketTraking, false, false, wbot);
        return;
      }
    }
    await sendText(wbot, ticket.contact, ticket, body);
  }

  private async _sendAsText(chatbotStep: Chatbot, options: Chatbot[], wbot: WASocket, contact: Contact, ticket: Ticket): Promise<void> {
    let optionsBody = "";
    options.forEach((option, index) => { optionsBody += `*[ ${index + 1} ]* - ${option.name}\n`; });
    const footer = `${optionsBody}\n*[ # ]* Volver al menú principal\n*[ Salir ]* Terminar atención`;
    const body = `\u200e ${chatbotStep.greetingMessage}\n\n${footer}`;
    await sendText(wbot, contact, ticket, body);
  }

  private async _sendAsButtons(chatbotStep: Chatbot, options: Chatbot[], wbot: WASocket, contact: Contact, ticket: Ticket): Promise<void> {
    const buttons = options.map((opt, index) => ({ buttonId: `${index + 1}`, buttonText: { displayText: opt.name }, type: 1, }));
    const buttonMessage = { text: `\u200e${chatbotStep.greetingMessage}`, buttons, headerType: 1 };
    const sentMessage = await wbot.sendMessage(`${contact.number}@s.whatsapp.net`, buttonMessage);
    await CreateTextMessage(sentMessage, ticket, contact);
  }

  private async _sendAsList(chatbotStep: Chatbot, options: Chatbot[], wbot: WASocket, contact: Contact, ticket: Ticket): Promise<void> {
    const sectionsRows = options.map((opt, index) => ({ title: opt.name, rowId: `${index + 1}` }));
    const sections = [{ title: "Menu", rows: sectionsRows }];
    const listMessage = { text: formatBody(`\u200e${chatbotStep.greetingMessage}`, ticket), buttonText: "Escoja una opción", sections };
    const sentMessage = await wbot.sendMessage(`${contact.number}@s.whatsapp.net`, listMessage);
    await CreateTextMessage(sentMessage, ticket, contact);
  }
}
export default new ChatbotDisplayService();
