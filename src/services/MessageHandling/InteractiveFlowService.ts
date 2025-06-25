// src/services/MessageHandling/InteractiveFlowService.ts

import { WAMessage, WASocket } from "@whiskeysockets/baileys";

// Modelos
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import CompaniesSettings from "../../models/CompaniesSettings";
import TicketTraking from "../../models/TicketTraking";

// Servicios
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import formatBody from "../../helpers/Mustache";
import { sayChatbot } from "../WbotServices/ChatBotListener";

// Otros
import { debounce } from "../../helpers/Debounce";
import { getBodyMessage } from "../../handlers/MessageClassifier";
import { handleRating, verifyRating } from "../TicketServices/HandleRatingService";
import { checkAndHandleOpenAi } from "../IntegrationsServices/OpenAiFlowService";
import { CreateTextMessage } from "../MessageServices/CreateMessageServiceFromWhatsapp";


/**
 * Orquesta el flujo conversacional interactivo después de que un mensaje ha sido procesado.
 * Decide si debe mostrar un menú de colas, activar un chatbot, pedir una calificación, etc.
 */
class InteractiveFlowService {
  /**
   * Punto de entrada principal del servicio.
   */
  public async execute(
    ticket: Ticket,
    msg: WAMessage,
    wbot: WASocket,
    ticketTraking: TicketTraking
  ): Promise<void> {

    // Si el mensaje no es propio y el ticket no es de un grupo...
    if (!msg.key.fromMe && !ticket.isGroup) {
      // 1. Primero, verifica si el mensaje debe ser manejado por la IA.
      const isHandledByOpenAI = await checkAndHandleOpenAi(msg, wbot, ticket, ticketTraking);
      if (isHandledByOpenAI) return;
      if (verifyRating(ticketTraking)) {
        const messageBody = getBodyMessage(msg);
        const rate = parseInt(messageBody, 10);
        if (!isNaN(rate)) {
          await handleRating(ticket, ticketTraking, rate);
          return; // El flujo termina aquí si se procesó una calificación.
        }
      }

      // 2. Lógica de Menú de Colas (si el ticket aún no tiene una)
      const settings = await CompaniesSettings.findOne({ where: { companyId: ticket.companyId }});
      if (!ticket.queue && !ticket.userId) {
        await this._verifyQueue(wbot, msg, ticket, ticket.contact, settings, ticketTraking);
        return; // Termina el flujo, ya que se mostró el menú.
      }
    }

    // 3. Lógica de Chatbot (si el ticket ya está en una cola pero sin agente)
    if (ticket.queue && !ticket.userId && !msg.key.fromMe) {
      await sayChatbot(ticket.queueId, wbot, ticket, ticket.contact, msg, ticketTraking);
    }

    // 4. Actualiza el ticket para reiniciar contadores de inactividad.
    await ticket.update({ sendInactiveMessage: false });
  }

  /**
   * Contiene la lógica completa para mostrar el menú de colas o activar el chatbot de la conexión.
   * (Esta es la lógica extraída de la función `verifyQueue` del archivo original).
   */
  private async _verifyQueue(
    wbot: WASocket,
    msg: WAMessage,
    ticket: Ticket,
    contact: Contact,
    settings: CompaniesSettings,
    ticketTraking: TicketTraking
  ) {
    const { queues, greetingMessage } = await ShowWhatsAppService(
      (wbot as any).id,
      ticket.companyId
    );

    // Si no hay colas configuradas, no hace nada.
    if (queues.length === 0) {
      return;
    }

    // Si solo hay una cola, la asigna y envía el saludo si corresponde.
    if (queues.length === 1) {
      const queue = queues[0];
      await UpdateTicketService({
        ticketData: { queueId: queue.id },
        ticketId: ticket.id,
        companyId: ticket.companyId,
      });

      if (queue.greetingMessage) {
        const body = formatBody(`\u200e${queue.greetingMessage}`, ticket);
        const debouncedSentMessage = debounce(async () => {
          const sentMessage = await wbot.sendMessage(`${contact.number}@s.whatsapp.net`, { text: body });
          await CreateTextMessage(sentMessage, ticket, contact, ticketTraking);
        }, 1000, ticket.id);
        debouncedSentMessage();
      }
      return;
    }

    // Si hay múltiples colas, construye y envía el menú de opciones.
    if (queues.length > 1) {
      let options = "";
      queues.forEach((queue, index) => {
        options += `*[ ${index + 1} ]* - ${queue.name}\n`;
      });
      options += `\n*[ Sair ]* - Encerrar atendimento`;

      const body = formatBody(`\u200e${greetingMessage}\n\n${options}`, ticket);

      const debouncedSentMessage = debounce(
        async () => {
          const sentMessage = await wbot.sendMessage(`${contact.number}@s.whatsapp.net`, { text: body });
          await CreateTextMessage(sentMessage, ticket, contact, ticketTraking);
        },
        1000,
        ticket.id
      );

      debouncedSentMessage();
    }
  }
}

export default new InteractiveFlowService();
