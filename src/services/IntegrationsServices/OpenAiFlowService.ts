// src/services/Integrations/OpenAiFlowService.ts

import { WAMessage, WASocket } from "@whiskeysockets/baileys";
import { isNil } from "lodash";

// Modelos y Tipos
import Ticket from "../../models/Ticket";
import TicketTraking from "../../models/TicketTraking";
import { FlowBuilderModel } from "../../models/FlowBuilder";

// Servicios y Helpers
import { handleOpenAi } from "./OpenAiService";
import { IOpenAi } from "../../contracts/WBot"; // Asumiendo que esta es la ruta correcta

/**
 * Verifica si un mensaje debe ser manejado por una integración de OpenAI y,
 * en caso afirmativo, orquesta la llamada al servicio correspondiente.
 *
 * @param msg El mensaje de Baileys.
 * @param wbot La instancia de la conexión de WhatsApp.
 * @param ticket El ticket asociado al mensaje.
 * @param ticketTraking El registro de seguimiento del ticket.
 * @returns `true` si OpenAI manejó el mensaje, `false` en caso contrario.
 */
export const checkAndHandleOpenAi = async (
  msg: WAMessage,
  wbot: WASocket,
  ticket: Ticket,
  ticketTraking: TicketTraking
): Promise<boolean> => {
  const { whatsapp, contact } = ticket;

  // Lógica 1: OpenAI activado por FlowBuilder
  const flow = await FlowBuilderModel.findOne({ where: { id: ticket.flowStopped }});
  if (flow) {
    const node = flow.flow["nodes"].find((n: any) => n.id === ticket.lastFlowId);
    if (node?.type === "openai" && !ticket.queue) {
      const openAiSettings = node.data.typebotIntegration as IOpenAi;
      await handleOpenAi(openAiSettings, msg, wbot, ticket, contact, null, ticketTraking);
      return true; // OpenAI manejó el mensaje
    }
  }

  // Lógica 2: OpenAI activado a nivel de conexión
  if (!ticket.queue && !ticket.userId && !isNil(whatsapp.promptId)) {
    const { prompt } = whatsapp;
    await handleOpenAi(prompt, msg, wbot, ticket, contact, null, ticketTraking);
    return true; // OpenAI manejó el mensaje
  }

  return false; // OpenAI no aplicaba para este mensaje
};
