// src/services/WbotServices/StartWhatsAppSession.ts

import { getIO } from "../../libs/socket";
import { BaileysClient } from "../../libs/wbot/BaileysClient";
import { WhatsappRepository } from "../../libs/wbot/WhatsappRepository";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import * as Sentry from "@sentry/node";
import { sessionManager } from "../../libs/wbot/SessionManager";

export const StartWhatsAppSession = async (
  whatsapp: Whatsapp,
  companyId: number
): Promise<void> => {
  // 1. Obtener dependencias y singletons
  const io = getIO();
  const repository = new WhatsappRepository();

  // 2. Prevenir múltiples instancias para la misma sesión
  if (sessionManager.getSessions().has(whatsapp.id)) {
    logger.warn(`[SESIÓN: ${whatsapp.name}] Ya existe una sesión activa o en proceso de inicio.`);
    return;
  }

  logger.info(`[SESIÓN: ${whatsapp.name}] Orquestando inicio de sesión.`);

  try {
    // 3. Crear la nueva instancia del cliente, inyectando dependencias
    const client = new BaileysClient(whatsapp, repository, io);

    // 4. Conectar el cliente
    const wsocket = await client.connect();

    // 5. Si la conexión es exitosa, añadir la sesión al gestor global
    sessionManager.addSession(wsocket);
    logger.info(`[SESIÓN: ${whatsapp.name}] Sesión añadida al gestor.`);

  } catch (error) {
    logger.error(`[SESIÓN: ${whatsapp.name}] Error catastrófico durante la inicialización: ${error}`);
    Sentry.captureException(error);

    // Asegurarse de que el estado en la BD refleje el fallo
    try {
      await repository.update(whatsapp.id, {
        status: "DISCONNECTED",
        qrcode: "",
        session: ""
      });
      const updatedWhatsapp = await repository.find(whatsapp.id);
      io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
        action: "update",
        session: updatedWhatsapp
      });
    } catch (dbError) {
      logger.error(`[SESIÓN: ${whatsapp.name}] Fallo al actualizar estado en BD tras error de inicio: ${dbError}`);
    }

    // Asegurar la limpieza si algo falló
    sessionManager.removeSession(whatsapp.id);
  }
};
