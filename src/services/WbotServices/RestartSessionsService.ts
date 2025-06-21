import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import { sessionManager } from "../../libs/wbot/SessionManager";
import { BaileysClient } from "../../libs/wbot/BaileysClient";

/**
 * Orquesta el reinicio de todas las sesiones de WhatsApp activas para una compañía específica.
 * Este proceso no es un reinicio instantáneo, sino que cierra la conexión de bajo nivel (WebSocket)
 * para activar la lógica de reconexión automática y robusta que ya hemos construido.
 *
 * @param companyId - El ID de la compañía cuyas sesiones se reiniciarán.
 */
export const RestartSessionsService = async (
  companyId: number
): Promise<void> => {
  logger.info(`Solicitud de reinicio para todas las sesiones de la empresa: ${companyId}`);
  try {
    // 1. Busca en la base de datos todas las conexiones que pertenecen a la compañía.
    const whatsapps = await Whatsapp.findAll({
      where: { companyId },
      attributes: ["id"],
    });

    if (!whatsapps.length) {
      logger.info(`No se encontraron conexiones configuradas para la empresa ${companyId}.`);
      return;
    }

    // 2. Obtiene el mapa de todas las sesiones que están ACTUALMENTE activas desde nuestro gestor.
    const activeClients: Map<number, BaileysClient> = sessionManager.getSessions();
    if (activeClients.size === 0) {
      logger.info("No hay ninguna sesión activa en memoria para reiniciar.");
      return;
    }

    const whatsappIdsToRestart = whatsapps.map(w => w.id);
    let restartedCount = 0;

    // 3. Itera sobre las sesiones activas y cierra la conexión de las que pertenecen a la compañía.
    activeClients.forEach((client, clientId) => {
      if (whatsappIdsToRestart.includes(clientId)) {
        try {
          logger.info(`Cerrando conexión de la sesión ${clientId} para forzar reinicio.`);

          // Usamos optional chaining (?.) para seguridad, en caso de que wsocket no esté definido.
          client.wsocket?.ws.close();

          restartedCount++;
        } catch (e) {
          logger.error(`Error al intentar cerrar la sesión ${clientId}:`, e);
        }
      }
    });

    if (restartedCount > 0) {
      logger.info(`${restartedCount} sesiones de la empresa ${companyId} han sido enviadas a reiniciar.`);
    } else {
      logger.info(`Ninguna sesión activa en memoria encontrada para la empresa ${companyId}.`);
    }

  } catch (err) {
    logger.error("Error inesperado en RestartSessionsService:", err);
  }
};
