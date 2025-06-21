import { Request, Response } from "express";
import AppError from "../errors/AppError";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import ShowWhatsAppServiceAdmin from "../services/WhatsappService/ShowWhatsAppServiceAdmin";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import Whatsapp from "../models/Whatsapp";
import Userverify from "../models/User";
import { sessionManager } from "../libs/wbot/SessionManager";
import logger from "../utils/logger";

const store = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;

  const whatsapp = await ShowWhatsAppService(whatsappId, companyId);
  await StartWhatsAppSession(whatsapp, companyId);


  return res.status(200).json({ message: "Starting session." });
};

const update = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });

  await whatsapp.update({ session: "" });

  if (whatsapp.channel === "whatsapp") {
    await StartWhatsAppSession(whatsapp, companyId);
  }

  return res.status(200).json({ message: "Starting session." });
};

const remove = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  logger.info(`Disconnecting session for WhatsApp ID: ${whatsappId}, Company ID: ${companyId}`);
  const whatsapp = await ShowWhatsAppService(whatsappId, companyId);


  if (whatsapp.channel === "whatsapp") {
    await DeleteBaileysService(whatsappId);

    const wbot = sessionManager.getSession(whatsapp.id);

    await wbot.logout();
    await wbot.close();
  }

  return res.status(200).json({ message: "Session disconnected." });
};

const removeadmin = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const userId = req.user.id;
    const requestUser = await Userverify.findByPk(userId);
    if (requestUser.super === false) {
    logger.error(`User ${userId} attempted to disconnect session without permission.`);
    throw new AppError("You do not have permission to disconnect this session.", 403);
  }
  logger.info(`Disconnecting session for WhatsApp ID: ${whatsappId}, User ID: ${userId}`);
  const whatsapp = await ShowWhatsAppServiceAdmin(whatsappId);
  if (whatsapp.channel === "whatsapp") {
    await DeleteBaileysService(whatsappId);
    const wbot = sessionManager.getSession(whatsapp.id);
    await wbot.logout();
    await wbot.close();
  }
  return res.status(200).json({ message: "Session disconnected." });
};
export default { store, remove, update, removeadmin };
