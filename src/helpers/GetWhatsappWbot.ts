import Whatsapp from "../models/Whatsapp";
import { sessionManager } from "../libs/wbot/SessionManager";

const GetWhatsappWbot = async (whatsapp: Whatsapp) => {
  const wbot = sessionManager.getSession(whatsapp.id);
  return wbot.getSession();
};

export default GetWhatsappWbot;
