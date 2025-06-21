// src/services/WbotServices/DeleteWhatsAppSession.ts

import logger from "../../utils/logger";
import { sessionManager } from "../../libs/wbot/SessionManager";
import AppError from "../../errors/AppError";

/**
 * Orquesta la eliminación de una sesión de WhatsApp activa.
 * @param whatsappId - El ID de la conexión de WhatsApp a eliminar.
 * @param isLogout - Si es true, también se deslogueará de la API de WhatsApp, forzando un nuevo QR.
 */
export const DeleteWhatsAppSession = (
  whatsappId: number,
  isLogout = true
): void => {
  try {
    // Le pide al sessionManager la instancia de la sesión que corresponde a ese ID.
    const wbot = sessionManager.getSession(whatsappId);

    // El cliente (wbot) se encargará de su propia limpieza.
    wbot.remove(isLogout);

    logger.info(`Se ha iniciado el proceso de eliminación para la sesión ${whatsappId}.`);

  } catch (err: any) {
    // Este error normalmente ocurre si la sesión no estaba activa en primer lugar.
    logger.error(`Error al intentar remover la sesión ${whatsappId}: ${err.message}`);

    // Opcional: podrías lanzar el error si necesitas que el código que llama se entere del fallo.
    throw new AppError(err.message);
  }
};
