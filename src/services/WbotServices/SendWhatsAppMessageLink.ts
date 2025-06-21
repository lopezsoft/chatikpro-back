import { delay, WAMessage } from "@whiskeysockets/baileys";
import AppError from "../../errors/AppError";
import fs from "fs";
import path from "path";
import Contact from "../../models/Contact";
import { sessionManager } from "../../libs/wbot/SessionManager";

interface Request {
  whatsappId: number;
  contact: Contact;
  url: string;
  caption: string;
  msdelay?: number;
}

function makeid(length) {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");

const SendWhatsAppMessageLink = async ({
  whatsappId,
  contact,
  url,
  caption,
  msdelay
}: Request): Promise<WAMessage> => {
  const wbot = sessionManager.getSession(whatsappId).getSession();
  const number = `${contact.number}@${contact.isGroup ? "g.us" : "s.whatsapp.net"}`;

  const name = caption.replace('/', '-')

  try {

    await delay(msdelay)
    return await wbot.sendMessage(`${number}`, {
      document: url
        ? { url }
        : fs.readFileSync(
            `${publicFolder}/company${contact.companyId}/${name}-${makeid(
              5
            )}.pdf`
          ),
      fileName: name,
      mimetype: "application/pdf"
    });
  } catch (err) {
    console.error("Error sending WhatsApp message link:", err);
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }

};

export default SendWhatsAppMessageLink;
