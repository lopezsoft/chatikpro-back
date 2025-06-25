// src/services/MessageHandling/MessageFlow.ts

import { proto} from "@whiskeysockets/baileys";
import logger from "../../utils/logger";
import * as Sentry from "@sentry/node";

// Importamos todas las piezas de nuestro pipeline
import MessageValidator from "./MessageValidator";
import TicketManager from "./TicketManager";
import MessageTypeRouter from "./MessageTypeRouter";
import { Session } from "../../utils/types";

/**
 * Orquesta el pipeline completo para procesar un mensaje entrante,
 * desde la validación inicial hasta la ejecución del manejador final.
 */
class MessageFlow {
  /**
   * Este servicio es el cerebro de nuestro pipeline. Su única misión es recibir un mensaje y coordinar a todos los
   * demás servicios que hemos creado, llamándolos en el orden correcto.
   * Es el reemplazo funcional de la gigantesca función handleMessage que tenías en tu archivo original.
   * Orquestador de la migración de la lógica ``handleMessage``
   * Punto de entrada principal para procesar un único mensaje.
   * @param msg - El objeto del mensaje de Baileys.
   * @param wbot - La instancia de la conexión de WhatsApp.
   * @param companyId - El ID de la compañía propietaria de la sesión.
   * @param isImported - Indica si el mensaje es importado (opcional, por defecto es false).
   */
  public async execute(
    msg: proto.IWebMessageInfo,
    wbot: Session,
    companyId: number,
    isImported: boolean = false
  ): Promise<void> {
    try {
      // Decide si el mensaje es relevante o debe ser ignorado.
      if (!MessageValidator.validate(msg)) {
        return;
      }

      // --- ETAPA 2: El Administrador (Gestión de Ticket) ---
      // Obtiene el ticket y el registro de seguimiento, creándolos si es necesario.
      const { ticket, ticketTraking } = await TicketManager.getTicket({
        msg,
        wbot,
        companyId,
        isImported
      });
      // Si por alguna razón no se pudo obtener un ticket, detenemos el flujo.
      if (!ticket) {
        logger.warn(`No se pudo obtener o crear un ticket para el mensaje ${msg.key.id}`);
        return;
      }
      // --- ETAPA 3: El Despachador (Enrutamiento) ---
      // Encuentra el manejador especialista para este tipo de mensaje.
      const handler = MessageTypeRouter.getHandler(msg);

      // --- ETAPA 4: El Especialista (Ejecución) ---
      // Si se encontró un especialista, se le entrega el trabajo.
      if (handler) {
        await handler.handle(ticket, msg, wbot, ticketTraking);
      } else {
        logger.warn(`No se encontró un manejador para el tipo de mensaje y se ignoró. msgId: ${msg.key.id}`);
      }

    } catch (error) {
      Sentry.captureException(error);
      logger.error(`Error en el flujo principal de manejo de mensajes para ${msg.key.id}:`, error);
    }
  }
}

export default new MessageFlow();
