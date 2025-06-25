import {
  WASocket,
  BinaryNode,
  Contact as BContact,
  isJidBroadcast,
  isJidStatusBroadcast,
  isJidUser,
} from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import fs from "fs";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import createOrUpdateBaileysService from "../BaileysServices/CreateOrUpdateBaileysService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import CompaniesSettings from "../../models/CompaniesSettings";
import path from "path";
import { Session } from "../../utils/types";
import { CreateTextMessage } from "../MessageServices/CreateMessageServiceFromWhatsapp";
import { cleanStringForJSON } from "../../helpers/utils";

let i = 0;

setInterval(() => {
  i = 0
}, 5000);

const wbotMonitor = async (
  wbot: Session,
  whatsapp: Whatsapp,
  companyId: number
): Promise<void> => {
  try {
    wbot.ws.on("CB:call", async (node: BinaryNode) => {
      const content = node.content[0] as any;

      await new Promise(r => setTimeout(r, i * 650));
      i++

      if (content.tag === "terminate" && !node.attrs.from.includes('@call')) {
        const settings = await CompaniesSettings.findOne({
          where: { companyId },
        });


        if (settings.acceptCallWhatsapp === "enabled") {
          const sentMessage = await wbot.sendMessage(node.attrs.from, {
            text:
              `\u200e ${settings.AcceptCallWhatsappMessage}`,
          });
          const number = node.attrs.from.split(":")[0].replace(/\D/g, "");

          const contact = await Contact.findOne({
            where: { companyId, number },
          });

          if (!contact)
            return

          const [ticket] = await Ticket.findOrCreate({
            where: {
              contactId: contact.id,
              whatsappId: wbot.id,
              status: ["open", "pending", "nps", "lgpd"],
              companyId
            },
            defaults: {
              companyId,
              contactId: contact.id,
              whatsappId: wbot.id,
              isGroup: contact.isGroup,
              status: "pending"
            }
          });

          if (!ticket) return;

          await CreateTextMessage(sentMessage, ticket, contact);

          const date = new Date();
          const hours = date.getHours();
          const minutes = date.getMinutes();

          const body = `Llamada de voz/video perdida a las ${hours}:${minutes}`;
          const messageData = {
            wid: content.attrs["call-id"],
            ticketId: ticket.id,
            contactId: contact.id,
            body,
            fromMe: false,
            mediaType: "call_log",
            read: true,
            quotedMsgId: null,
            ack: 1,
          };

          await ticket.update({
            lastMessage: body,
          });


          if (ticket.status === "closed") {
            await ticket.update({
              status: "pending",
            });
          }

          return CreateMessageService({ messageData, companyId: companyId });
        }
      }
    });

    wbot.ev.on("contacts.upsert", async (contacts: BContact[]) => {

      const filteredContacts: any[] = [];

      try {
        Promise.all(
          contacts.map(async contact => {
            if (!isJidBroadcast(contact.id) && !isJidStatusBroadcast(contact.id) && isJidUser(contact.id)) {

              const contactArray = {
                'id': contact.id,
                'name': contact.name ? cleanStringForJSON(contact.name) : contact.id.split('@')[0].split(':')[0]
              }

              filteredContacts.push(contactArray);

            }
          })
        );

        const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
        if (!fs.existsSync(path.join(publicFolder, `company${companyId}`))) {
          fs.mkdirSync(path.join(publicFolder, `company${companyId}`), { recursive: true })
          fs.chmodSync(path.join(publicFolder, `company${companyId}`), 0o777)
        }
        const contatcJson = path.join(publicFolder, `company${companyId}`, "contactJson.txt");
        if (fs.existsSync(contatcJson)) {
          fs.unlinkSync(contatcJson);
        }

        await fs.promises.writeFile(contatcJson, JSON.stringify(filteredContacts, null, 2));
      } catch (err) {
        Sentry.captureException(err);
        logger.error(`Erro contacts.upsert: ${JSON.stringify(err)}`);
      }

      try {
        await createOrUpdateBaileysService({
          whatsappId: whatsapp.id,
          contacts: filteredContacts,
        });
      } catch (err) {
        console.log(filteredContacts);
        logger.error(err)
      }
    });


  } catch (err) {
    Sentry.captureException(err);
    logger.error(err);
  }
};

export default wbotMonitor;
