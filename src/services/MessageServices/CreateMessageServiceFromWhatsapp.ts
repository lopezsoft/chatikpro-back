// src/services/MessageServices/CreateMessageServiceFromWhatsapp.ts

import { proto } from "@whiskeysockets/baileys";
import path, { join } from "path";
import { promisify } from "util";
import fs from "fs";

// Modelos y Servicios
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import CreateMessageService from "./CreateMessageService";

// Helpers
import logger from "../../utils/logger";
import { downloadMedia, verifyQuotedMessage } from "../WbotServices/WbotMessageServices";
import { getBodyMessage, getTypeMessage } from "../../handlers/MessageClassifier";
import Contact from "../../models/Contact";
import TicketTraking from "../../models/TicketTraking";
import { getTimestampMessage } from "../../helpers/utils";
import { ReopenTicketService } from "../TicketServices/ReopenTicketService";
import { Session } from "../../utils/types";
import { getIO } from "../../libs/socket";
import ffmpeg from "fluent-ffmpeg";
import * as Sentry from "@sentry/node";
import Queue from "../../models/Queue";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";

const writeFileAsync = promisify(fs.writeFile);

/**
 * Procesa y guarda en la BD un mensaje que contiene un archivo multimedia.
 * Reemplaza la lógica del antiguo `CreateMediaMessage`.
 */
export const CreateMediaMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking,
  isForwarded: boolean = false,
  isPrivate: boolean = false,
  wbot: Session
): Promise<Message> => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const companyId = ticket.companyId;

  try {
    const media = await downloadMedia(msg, ticket?.imported, wbot, ticket);

    if (!media && ticket.imported) {
      const body =
        "*Sistema:* \nFallo en la descarga del medio, verifique en el dispositivo";
      const messageData = {
        wid: msg.key.id,
        ticketId: ticket.id,
        contactId: msg.key.fromMe ? undefined : ticket.contactId,
        body,
        reactionMessage: msg.message?.reactionMessage,
        fromMe: msg.key.fromMe,
        mediaType: getTypeMessage(msg),
        read: msg.key.fromMe,
        quotedMsgId: quotedMsg?.id || msg.message?.reactionMessage?.key?.id,
        ack: msg.status,
        companyId: companyId,
        remoteJid: msg.key.remoteJid,
        participant: msg.key.participant,
        timestamp: getTimestampMessage(msg.messageTimestamp),
        createdAt: new Date(
          Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
        ).toISOString(),
        dataJson: JSON.stringify(msg),
        ticketImported: ticket.imported,
        isForwarded,
        isPrivate
      };

      await ticket.update({
        lastMessage: body
      });
      logger.error(Error("ERR_WAPP_DOWNLOAD_MEDIA"));
      return CreateMessageService({ messageData, companyId: companyId });
    }

    if (!media) {
      logger.error("ERR_WAPP_DOWNLOAD_MEDIA");
      throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
    }
    if (!media.filename) {
      const ext = media.mimetype.split("/")[1].split(";")[0];
      media.filename = `${new Date().getTime()}.${ext}`;
    } else {
      // Separa el nombre del archivo y la extensión
      const ext = media.filename.split(".").pop();
      // Elimina la extensión del nombre del archivo
      const name = media.filename
        .split(".")
        .slice(0, -1)
        .join(".")
        .replace(/\s/g, "_")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      media.filename = `${name.trim()}_${new Date().getTime()}.${ext}`;
    }

    try {
      const folder = path.resolve(__dirname, "..", "..", "..", "public", `company${companyId}`);
      // const mediaPath = path.resolve("public", `company${ticket.companyId}`, media.filename);

      // await writeFileAsync(mediaPath, media.data);

      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
        fs.chmodSync(folder, 0o777); // Permisos para que el servidor pueda escribir en la carpeta
      }

      await writeFileAsync(
        join(folder, media.filename),
        media.data.toString("base64"),
        "base64"
      )
        .then(() => {
          if (media.mimetype.includes("audio")) {
            logger.info(`Convirtiendo audio a MP3: ${media.filename}`);
            const inputFile = path.join(folder, media.filename);
            let outputFile: string;

            if (inputFile.endsWith(".mpeg")) {
              outputFile = inputFile.replace(".mpeg", ".mp3");
            } else if (inputFile.endsWith(".ogg")) {
              outputFile = inputFile.replace(".ogg", ".mp3");
            } else {
              logger.warn(`Formato de audio no soportado: ${media.filename}`);
              return;
            }

            return new Promise<void>((resolve, reject) => {
              ffmpeg(inputFile)
                .toFormat("mp3")
                .save(outputFile)
                .on("end", () => {
                  resolve();
                })
                .on("error", (err: any) => {
                  reject(err);
                });
            });
          }
        })
        .catch((err) => {
          logger.error(`Error al escribir el archivo: ${err}`);
        });
    } catch (err) {
      Sentry.setExtra("Erro media", {
        companyId: companyId,
        ticket,
        contact,
        media,
        quotedMsg
      });
      Sentry.captureException(err);
      logger.error(err);
    }

    const body = getBodyMessage(msg);

    const messageData = {
      wid: msg.key.id,
      ticketId: ticket.id,
      contactId: msg.key.fromMe ? undefined : contact.id,
      body: body || media.filename,
      fromMe: msg.key.fromMe,
      read: msg.key.fromMe,
      mediaUrl: media.filename,
      mediaType: media.mimetype.split("/")[0],
      quotedMsgId: quotedMsg?.id,
      ack:
        Number(
          String(msg.status).replace("PENDING", "2").replace("NaN", "1")
        ) || 2,
      remoteJid: msg.key.remoteJid,
      participant: msg.key.participant,
      dataJson: JSON.stringify(msg),
      ticketTrakingId: ticketTraking?.id,
      createdAt: new Date(
        Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
      ).toISOString(),
      ticketImported: ticket.imported,
      isForwarded,
      isPrivate
    };

    await ticket.update({
      lastMessage: body || media.filename
    });

    const newMessage = await CreateMessageService({
      messageData,
      companyId: companyId
    });

    if (!msg.key.fromMe && ticket.status === "closed") {
      await ticket.update({ status: "pending" });
      await ticket.reload({
        attributes: [
          "id",
          "uuid",
          "queueId",
          "isGroup",
          "channel",
          "status",
          "contactId",
          "useIntegration",
          "lastMessage",
          "updatedAt",
          "unreadMessages",
          "companyId",
          "whatsappId",
          "imported",
          "lgpdAcceptedAt",
          "amountUsedBotQueues",
          "useIntegration",
          "integrationId",
          "userId",
          "amountUsedBotQueuesNPS",
          "lgpdSendMessageAt",
          "isBot"
        ],
        include: [
          { model: Queue, as: "queue" },
          { model: User, as: "user" },
          { model: Contact, as: "contact" },
          { model: Whatsapp, as: "whatsapp" }
        ]
      });

      io.of(String(companyId))
        .emit(`company-${companyId}-ticket`, {
          action: "delete",
          ticket,
          ticketId: ticket.id
        });
      io.of(String(companyId))
        .emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket,
          ticketId: ticket.id
        });
    }

    return newMessage;
  } catch (error) {
    logger.error(`Error al procesar el mensaje multimedia: ${error}`);
  }
};

/**
 * Procesa y guarda en la BD un mensaje de texto simple.
 * Reemplaza la lógica del antiguo `CreateTextMessage`.
 */
export const CreateTextMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking?: TicketTraking,
  isPrivate?: boolean,
  isForwarded: boolean = false
): Promise<Message> => {
  const quotedMsg = await verifyQuotedMessage(msg);
  const body = getBodyMessage(msg);

  const messageData = {
    wid: msg.key.id,
    ticketId: ticket.id,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body,
    fromMe: msg.key.fromMe,
    mediaType: getTypeMessage(msg),
    read: msg.key.fromMe,
    quotedMsgId: quotedMsg?.id,
    ack:
      Number(String(msg.status).replace("PENDING", "2").replace("NaN", "1")) ||
      2,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: JSON.stringify(msg),
    ticketTrakingId: ticketTraking?.id,
    isPrivate,
    createdAt: new Date(
      Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
    ).toISOString(),
    ticketImported: ticket.imported,
    isForwarded
  };

  await ticket.update({ lastMessage: body });
  const message = await CreateMessageService({ messageData, companyId: ticket.companyId });

  // Si el mensaje es del cliente y el ticket estaba cerrado, llama al nuevo servicio.
  if (!msg.key.fromMe && ticket.status === "closed") {
    await ReopenTicketService(ticket, ticket.companyId);
  }
  return message;
};
