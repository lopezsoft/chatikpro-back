import { delay, WAMessage } from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";

import Contact from "../../models/Contact";
import { sessionManager } from "../../libs/wbot/SessionManager";
import logger from "../../utils/logger";

interface Request {
  body: string;
  whatsappId: number;
  contact: Contact;
  quotedMsg?: Message;
  msdelay?: number;
}

const SendWhatsAppMessage = async ({
  body,
  whatsappId,
  contact,
  quotedMsg,
  msdelay
}: Request): Promise<WAMessage> => {
  let options = {};
  const wbot = sessionManager.getSession(whatsappId).getSession();
  const number = `${contact.number}@${contact.isGroup ? "g.us" : "s.whatsapp.net"}`;

  if (quotedMsg) {
    const chatMessages = await Message.findOne({
      where: {
        id: quotedMsg.id
      }
    });

    if (chatMessages) {
      const msgFound = JSON.parse(chatMessages.dataJson);

      options = {
        quoted: {
          key: msgFound.key,
          message: {
            extendedTextMessage: msgFound.message.extendedTextMessage
          }
        }
      };
    }
  }

  try {
    await delay(msdelay)
    return await wbot.sendMessage(
      number,
      {
        text: body
      },
      {
        ...options
      }
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error al enviar mensaje de WhatsApp: ${err}`);
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMessage;
