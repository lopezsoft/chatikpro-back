import { handleMessage } from "../services/WbotServices/wbotMessageListener";
import { sessionManager } from "../libs/wbot/SessionManager";
import logger from "../utils/logger";

export default {
    key: `${process.env.DB_NAME}-handleMessage`,

    async handle({ data }) {
        try {
            const { message, wbot, companyId } = data;

            if (message === undefined || wbot === undefined || companyId === undefined) {
                console.log("message, wbot, companyId", message, wbot, companyId)
            }

            const w = sessionManager.getSession(wbot).getSession();

            if (!w) {
              logger.error(`No se encontró la sesión para el wbot: ${wbot}`);
              return;
            }

            try {
                await handleMessage(message, w, companyId);
            } catch (error) {
                logger.error(`Error al manejar el mensaje: ${error}`);
            }
        } catch (error) {
            logger.error(`Error al manejar el mensaje: ${error}`);
        }
    },
};
