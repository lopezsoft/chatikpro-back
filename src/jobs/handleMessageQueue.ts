import { sessionManager } from "../libs/wbot/SessionManager";
import logger from "../utils/logger";
import MessageFlow from "../services/MessageHandling/MessageFlow";

export default {
    key: `${process.env.DB_NAME}-handleMessage`,

    async handle({ data }) {
        try {
            const { message, wbot, companyId } = data;

            if (message === undefined || wbot === undefined || companyId === undefined) {
                logger.error("Datos incompletos para manejar el mensaje. Asegúrate de que message, " +
                  "wbot y companyId estén definidos.", data);
                return;
            }
            const w = sessionManager.getSession(wbot).getSession();

            if (!w) {
              logger.error(`No se encontró la sesión para el wbot: ${wbot}`);
              return;
            }

            try {
                await MessageFlow.execute(message, w, companyId);
            } catch (error) {
                logger.error(`Error al manejar el mensaje: ${error}`);
            }
        } catch (error) {
            logger.error(`Error al manejar el mensaje: ${error}`);
        }
    },
};
