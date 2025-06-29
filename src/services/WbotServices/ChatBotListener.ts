// src/services/WbotServices/ChatBotListener.ts

import { proto, WASocket } from "@whiskeysockets/baileys";

// Modelos y Tipos
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Chatbot from "../../models/Chatbot";
import Queue from "../../models/Queue";

// Servicios Refactorizados
import ChatbotDisplayService from "./ChatbotDisplayService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import ShowQueueService from "../QueueService/ShowQueueService";
import ShowChatBotServices from "../ChatBotServices/ShowChatBotServices";
import { Session } from "../../utils/types";
import TicketTraking from "../../models/TicketTraking";
import { getBodyMessage } from "../../handlers/MessageClassifier";
import ChatbotStateService from "./ChatbotStateService";

/**
 * Orquestador principal del flujo del chatbot.
 * Distingue entre la interacción con el menú principal y los sub-menús del bot.
 */
export const sayChatbot = async (
  queueId: number,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  msg: proto.IWebMessageInfo,
  ticketTraking: TicketTraking
): Promise<void> => {
  const selectedOption = getBodyMessage(msg);

  // 1. Manejar Comandos Universales
  if (String(selectedOption).toLowerCase() === "sair") {
    await UpdateTicketService({
      ticketData: { status: "closed", sendFarewellMessage: true },
      ticketId: ticket.id, companyId: ticket.companyId
    });
    return;
  }

  const stage = await ChatbotStateService.getStage(contact.id);

  if (selectedOption === "#" && stage) {
    await backToMainMenu(wbot, ticket, ticketTraking);
    return;
  }

  // 2. Enrutar al manejador correcto basado en el estado del diálogo
  if (stage) {
    // Si hay una etapa, el usuario está en un sub-menú de un bot.
    await handleSubMenuInteraction(stage, selectedOption, wbot, ticket, contact);
  } else {
    // Si no hay etapa, es la primera interacción o se ha vuelto al menú principal.
    const initialQueue = await ShowQueueService(queueId, ticket.companyId);
    await handleMainMenuInteraction(initialQueue, selectedOption, wbot, ticket, contact);
  }
};

/**
 * Maneja la interacción del usuario con el menú principal de colas.
 */
async function handleMainMenuInteraction(
  initialQueue: Queue, // Recibe la cola inicial con sus opciones de bot
  selectedOption: string,
  wbot: WASocket,
  ticket: Ticket,
  contact: Contact
) {
  // Las opciones del menú principal son los chatbots de la cola inicial.
  const options = initialQueue?.chatbots;
  if (!options || options.length === 0) return;

  const chosenOption = options[+selectedOption - 1];

  if (!chosenOption) {
    // Opción inválida, volver a mostrar el menú principal de esta cola.
    await ChatbotDisplayService.sendDialog(initialQueue as any, wbot, contact, ticket);
    return;
  }

  await processChosenOption(chosenOption, ticket, contact, wbot);
}

/**
 * Maneja la interacción del usuario cuando ya está dentro de un sub-menú de un bot.
 */
async function handleSubMenuInteraction(
  stage: any,
  selectedOption: string,
  wbot: WASocket,
  ticket: Ticket,
  contact: Contact
) {
  // El paso actual del bot se obtiene a partir del estado guardado.
  const currentBotStep = await ShowChatBotServices(stage.chatbotId);
  if (!currentBotStep?.options || currentBotStep.options.length === 0) return;

  const chosenOption = currentBotStep.options[+selectedOption - 1];

  if (!chosenOption) {
    // Opción inválida, volver a enviar el diálogo del paso actual.
    await ChatbotDisplayService.sendDialog(currentBotStep, wbot, contact, ticket);
    return;
  }

  await processChosenOption(chosenOption, ticket, contact, wbot);
}

/**
 * Procesa la opción que el usuario ha elegido (que siempre es un paso de tipo 'Chatbot').
 */
async function processChosenOption(
  chosenBotStep: Chatbot,
  ticket: Ticket,
  contact: Contact,
  wbot: WASocket
) {
  // Acción: Transferir a una Cola o a un Agente
  if (chosenBotStep.queueType === "queue" || chosenBotStep.queueType === "attendent") {
    await UpdateTicketService({
      ticketData: {
        queueId: chosenBotStep.optQueueId,
        userId: chosenBotStep.optUserId, // Será null si es a una cola
        status: "pending"
      },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });
  }

  // Acción: Continuar al siguiente paso del Bot
  await ChatbotStateService.setStage(contact, chosenBotStep.id, ticket);

  // Muestra el siguiente diálogo al usuario si tiene un mensaje de saludo.
  if (chosenBotStep.greetingMessage) {
    await ChatbotDisplayService.sendDialog(chosenBotStep, wbot, contact, ticket);
  }
}

/**
 * Orquesta los pasos para devolver a un usuario al menú principal.
 */
const backToMainMenu = async (wbot: Session, ticket: Ticket, ticketTraking: TicketTraking) => {
  await ChatbotStateService.resetStage(ticket.contact.id);
  await UpdateTicketService({
    ticketData: { queueId: null, userId: null },
    ticketId: ticket.id, companyId: ticket.companyId,
  });
  // Vuelve a cargar el ticket para obtener las asociaciones actualizadas
  await ticket.reload();
  await ChatbotDisplayService.sendMainMenu(wbot, ticket, ticketTraking);
};
