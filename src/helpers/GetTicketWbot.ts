// src/helpers/GetTicketWbot.ts

import { WASocket } from "@whiskeysockets/baileys";
import Ticket from "../models/Ticket";
import AppError from "../errors/AppError";
import logger from "../utils/logger";

// --> CAMBIO 1: Importamos el sessionManager y el helper para obtener el whatsapp por defecto
import { sessionManager } from "../libs/wbot/SessionManager";
import GetDefaultWhatsApp from "./GetDefaultWhatsApp";

const GetTicketWbot = async (ticket: Ticket): Promise<WASocket> => {
  // Mantenemos tu lógica original para asignar una conexión por defecto si es necesario
  if (!ticket.whatsappId) {
    try {
      logger.info(
        `El ticket ${ticket.id} no tiene whatsappId. Buscando conexión por defecto.`
      );
      const defaultWhatsapp = await GetDefaultWhatsApp(ticket.companyId);
      // Actualizamos el ticket con el ID de la conexión encontrada
      await ticket.update({ whatsappId: defaultWhatsapp.id });
    } catch (err) {
      logger.error(err);
      throw new AppError("ERR_NO_DEFAULT_WAPP_FOUND");
    }
  }

  try {
    // --> CAMBIO 2: Usamos el sessionManager para obtener la sesión activa.
    // ticket.whatsappId ahora está garantizado que existe.
    return sessionManager.getSession(ticket.whatsappId).getSession();
  } catch (err) {
    logger.error(
      `No se encontró una sesión activa para el whatsappId: ${ticket.whatsappId}`,
      err
    );
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
};

export default GetTicketWbot;
