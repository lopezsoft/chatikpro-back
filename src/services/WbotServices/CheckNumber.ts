import AppError from "../../errors/AppError";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { sessionManager } from "../../libs/wbot/SessionManager";
import logger from "../../utils/logger";

const CheckContactNumber = async (
  number: string, companyId: number, isGroup: boolean = false
): Promise<string> => {
  const WhatsAppList = await GetDefaultWhatsApp(null, companyId);

  const wbot = sessionManager.getSession(WhatsAppList.id).getSession();

  let numberArray:
    | { jid: string; exists: unknown; lid: unknown }[]
    | { jid: string; exists: boolean }[];

  if (isGroup) {
    const grupoMeta = await wbot.groupMetadata(number);
    numberArray = [
      {
        jid: grupoMeta.id,
        exists: true
      }
    ];
  } else {
    numberArray = await wbot.onWhatsApp(`${number}@s.whatsapp.net`);
  }

  const isNumberExit = numberArray;

  if (!isNumberExit[0]?.exists) {
    logger.error(`[CheckContactNumber] El número ${number} no existe en WhatsApp.`);
    throw new AppError("Número no existe en WhatsApp", 404);
  }

  return isGroup ? number.split("@")[0] : isNumberExit[0].jid.split("@")[0];
};

export default CheckContactNumber;
