
import { WAMessage } from "@whiskeysockets/baileys";
import { BaileysClient } from "../libs/wbot/BaileysClient";
import logger from "../utils/logger";
import { dataMessages } from "../utils/db";
import ImportWhatsAppMessageService from "../services/WhatsappService/ImportWhatsAppMessageService";
import { add } from "date-fns";
import MessageValidator from "../services/MessageHandling/MessageValidator";

export async function onHistorySet(messages: WAMessage[], client: BaileysClient) {
  const { id: whatsappId, io } = client;

  try {
    const wpp = await client.repository.find(whatsappId);
    if (!wpp || !wpp.importOldMessages || wpp.status !== "CONNECTED") return;

    const dateOldLimit = new Date(wpp.importOldMessages).getTime();
    const dateRecentLimit = new Date(wpp.importRecentMessages).getTime();

    // Lógica de logging inicial... (idéntica a la original)

    await wpp.update({ statusImportMessages: new Date().getTime().toString() });

    const filteredDateMessages = messages.filter(msg => {
      const timestampMsg = Math.floor(Number(msg.messageTimestamp) * 1000);
      const isValid = MessageValidator.validate(msg) && dateOldLimit < timestampMsg && dateRecentLimit > timestampMsg;
      if (!isValid) return false;

      const isGroup = msg.key?.remoteJid?.endsWith("@g.us");
      return !isGroup || (isGroup && wpp.importOldMessagesGroups);
    });

    if (!dataMessages[whatsappId]) {
      dataMessages[whatsappId] = [];
    }
    dataMessages[whatsappId].unshift(...filteredDateMessages);

    // Lógica de emisión de eventos de socket.io y programación del servicio de importación
    // (Esta parte es idéntica a la original, solo cambia cómo accedemos a `io` y `wpp`)
    setTimeout(() => {
      io.of(String(wpp.companyId)).emit(`importMessages-${wpp.companyId}`, {
        action: "update",
        status: { this: -1, all: -1 }
      });
      io.of(String(wpp.companyId)).emit(`company-${wpp.companyId}-whatsappSession`, {
        action: "update",
        session: wpp
      });
    }, 500);

    setTimeout(async () => {
      const wppUpdated = await client.repository.find(whatsappId);
      if (wppUpdated?.importOldMessages) {
        const lastStatus = Number(wppUpdated.statusImportMessages);
        if (!isNaN(lastStatus)) {
          const limitDate = add(lastStatus, { seconds: 45 }).getTime();
          if (limitDate < Date.now()) {
            await ImportWhatsAppMessageService(wppUpdated.id);
            await wppUpdated.update({ statusImportMessages: "Running" });
          }
        }
      }
      io.of(String(wppUpdated.companyId)).emit(`company-${wppUpdated.companyId}-whatsappSession`, {
        action: "update",
        session: wppUpdated
      });
    }, 1000 * 45);

  } catch (error) {
    logger.error(`Error en onHistorySet para sesión ${whatsappId}: ${error}`);
  }
}
