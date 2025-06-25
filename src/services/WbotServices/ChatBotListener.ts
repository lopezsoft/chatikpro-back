import { proto } from "@whiskeysockets/baileys";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";

import path from "path";

import ShowDialogChatBotsServices from "../DialogChatBotsServices/ShowDialogChatBotsServices";
import ShowQueueService from "../QueueService/ShowQueueService";
import ShowChatBotServices from "../ChatBotServices/ShowChatBotServices";
import DeleteDialogChatBotsServices from "../DialogChatBotsServices/DeleteDialogChatBotsServices";
import ShowChatBotByChatbotIdServices from "../ChatBotServices/ShowChatBotByChatbotIdServices";
import CreateDialogChatBotsServices from "../DialogChatBotsServices/CreateDialogChatBotsServices";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import formatBody from "../../helpers/Mustache";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import Chatbot from "../../models/Chatbot";
import ShowFileService from "../FileServices/ShowService";

import SendWhatsAppMedia, { getMessageOptions } from "./SendWhatsAppMedia";
import CompaniesSettings from "../../models/CompaniesSettings";
import TicketTraking from "../../models/TicketTraking";
import { Session } from "../../utils/types";
import { getBodyMessage } from "../../handlers/MessageClassifier";
import { makeid, sleep } from "../../helpers/utils";
import { CreateMediaMessage, CreateTextMessage } from "../MessageServices/CreateMessageServiceFromWhatsapp";

const fs = require("fs");

const isNumeric = (value: string) => /^-?\d+$/.test(value);

export const deleteAndCreateDialogStage = async (
  contact: Contact,
  chatbotId: number,
  ticket: Ticket
) => {
  try {
    await DeleteDialogChatBotsServices(contact.id);
    const bots = await ShowChatBotByChatbotIdServices(chatbotId);
    if (!bots) {
      await ticket.update({ isBot: false });
    }
    return await CreateDialogChatBotsServices({
      awaiting: 1,
      contactId: contact.id,
      chatbotId,
      queueId: bots.queueId
    });
  } catch (error) {
    await ticket.update({ isBot: false });
  }
};

const sendMessage = async (
  wbot: Session,
  contact: Contact,
  ticket: Ticket,
  body: string
) => {
  const sentMessage = await wbot.sendMessage(
    `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
    {
      text: formatBody(body, ticket)
    }
  );
  await CreateTextMessage(sentMessage, ticket, contact);
};

const sendMessageLink = async (
  wbot: Session,
  contact: Contact,
  ticket: Ticket,
  url: string,
  caption: string
) => {

  let sentMessage: proto.IWebMessageInfo;
  try {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        document: url ? { url } : fs.readFileSync(`public/temp/${caption}-${makeid(10)}`),
        fileName: caption,
        mimetype: 'application/pdf'
      }
    );
  } catch (error) {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        text: formatBody('\u200eNão consegui enviar o PDF, tente novamente!', ticket)
      }
    );
  }
  await CreateTextMessage(sentMessage, ticket, contact);
};

const sendMessageImage = async (
  wbot: Session,
  contact: Contact,
  ticket: Ticket,
  url: string,
  caption: string
) => {

  let sentMessage
  try {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        image: url ? { url } : fs.readFileSync(`public/temp/${caption}-${makeid(10)}`),
        fileName: caption,
        caption: caption,
        mimetype: 'image/jpeg'
      }
    );
  } catch (error) {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        text: formatBody('Não consegui enviar o PDF, tente novamente!', ticket)
      }
    );
  }
  await CreateTextMessage(sentMessage, ticket, contact);
};


const sendDialog = async (
  choosenQueue: Chatbot,
  wbot: Session,
  contact: Contact,
  ticket: Ticket
) => {
  const showChatBots = await ShowChatBotServices(choosenQueue.id);
  if (showChatBots.options) {

    let companyId = ticket.companyId;
    const buttonActive = await CompaniesSettings.findOne({
      where: { companyId }
    })


    const typeBot = buttonActive?.chatBotType || "text";

    const botText = async () => {
      let options = "";

      showChatBots.options.forEach((option, index) => {
        options += `*[ ${index + 1} ]* - ${option.name}\n`;
      });

      const optionsBack =
        options.length > 0
          ? `${options}\n*[ # ]* Voltar para o menu principal\n*[ Sair ]* Encerrar atendimento`
          : `${options}\n*[ Sair ]* Encerrar atendimento`;

      if (options.length > 0) {
        const body = formatBody(`\u200e ${choosenQueue.greetingMessage}\n\n${optionsBack}`, ticket);
        return await sendMessage(wbot, contact, ticket, body);
      }

      const body = formatBody(`\u200e ${choosenQueue.greetingMessage}`, ticket);
      return await sendMessage(wbot, contact, ticket, body);
    };

    const botButton = async () => {
      const buttons = [];
      showChatBots.options.forEach((option, index) => {
        buttons.push({
          buttonId: `${index + 1}`,
          buttonText: { displayText: option.name },
          type: 1
        });
      });

      if (buttons.length > 0) {

        const buttonMessage = {
          text: `\u200e${choosenQueue.greetingMessage}`,
          buttons,
          headerType: 1
        };

        const send = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          buttonMessage
        );

        await CreateTextMessage(send, ticket, contact);

        return send;
      }

      const body = `\u200e${choosenQueue.greetingMessage}`;
      return await sendMessage(wbot, contact, ticket, body);

    };

    const botList = async () => {
      const sectionsRows = [];
      showChatBots.options.forEach((queue, index) => {
        sectionsRows.push({
          title: queue.name,
          rowId: `${index + 1}`
        });
      });

      if (sectionsRows.length > 0) {
        const sections = [
          {
            title: "Menu",
            rows: sectionsRows
          }
        ];

        const listMessage = {
          text: formatBody(`\u200e${choosenQueue.greetingMessage}`, ticket),
          buttonText: "Escolha uma opção",
          sections
        };

        const sendMsg = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          listMessage
        );

        await CreateTextMessage(sendMsg, ticket, contact);

        return sendMsg;
      }

      const body = `\u200e${choosenQueue.greetingMessage}`;
      return await sendMessage(wbot, contact, ticket, body);
    };

    if (typeBot === "text") {
      return await botText();
    }

    if (typeBot === "button" && showChatBots.options.length > 4) {
      return await botText();
    }

    if (typeBot === "button" && showChatBots.options.length <= 4) {
      return await botButton();
    }

    if (typeBot === "list") {
      return await botList();
    }
  }

};

const backToMainMenu = async (
  wbot: Session,
  contact: Contact,
  ticket: Ticket,
  ticketTraking: TicketTraking
) => {
  await UpdateTicketService({
    ticketData: { queueId: null, userId: null },
    ticketId: ticket.id,
    companyId: ticket.companyId
  });
  // console.log("GETTING WHATSAPP BACK TO MAIN MENU", ticket.whatsappId, wbot.id)
  const { queues, greetingMessage, greetingMediaAttachment } = await ShowWhatsAppService(wbot.id!, ticket.companyId);



  const buttonActive = await CompaniesSettings.findOne({
    where: {
      companyId: ticket.companyId
    }
  });

  const botText = async () => {
    let options = "";

    queues.forEach((option, index) => {
      options += `*[ ${index + 1} ]* - ${option.name}\n`;
    });
    options += `\n*[ Sair ]* - Encerrar Atendimento`;


    const body = formatBody(`\u200e ${greetingMessage}\n\n${options}`, ticket);

    if (greetingMediaAttachment !== null) {
      const filePath = path.resolve("public", `company${ticket.companyId}`, ticket.whatsapp.greetingMediaAttachment);

      const messagePath = ticket.whatsapp.greetingMediaAttachment
      const optionsMsg = await getMessageOptions(messagePath, filePath, String(ticket.companyId), body);

      const sentMessage = await wbot.sendMessage(`${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, { ...optionsMsg });

      await CreateMediaMessage(sentMessage, ticket, contact, ticketTraking, false, false, wbot);

    } else {
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        {
          text: body
        }
      );

      await CreateTextMessage(sentMessage, ticket, contact);
    }

    return await DeleteDialogChatBotsServices(contact.id);
  };

  if (buttonActive.chatBotType === "text") {
    return botText();
  }
};

async function sendMsgAndCloseTicket(wbot, contact, ticket) {

  const ticketUpdateAgent = {
    ticketData: {
      status: "closed",
      userId: ticket?.userId || null,
      sendFarewellMessage: false,
      amountUsedBotQueues: 0
    },
    ticketId: ticket.id,
    companyId: ticket.companyId,
  };

  await sleep(2000)
  await UpdateTicketService(ticketUpdateAgent);
}

export const sayChatbot = async (
  queueId: number,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  msg: proto.IWebMessageInfo,
  ticketTraking: TicketTraking
): Promise<any> => {

  const selectedOption =
    msg?.message?.buttonsResponseMessage?.selectedButtonId ||
    msg?.message?.listResponseMessage?.singleSelectReply.selectedRowId ||
    getBodyMessage(msg);

  if (!queueId && selectedOption && msg.key.fromMe) return;

  const getStageBot = await ShowDialogChatBotsServices(contact.id);

  if (String(selectedOption).toLocaleLowerCase() === "sair") {
    const ticketUpdateAgent = {
      ticketData: {
        status: "closed",
        sendFarewellMessage: true,
        amountUsedBotQueues: 0
      },
      ticketId: ticket.id,
      companyId: ticket.companyId
    };

    await UpdateTicketService(ticketUpdateAgent);
    return;
  }

  if (selectedOption === "#") {
    await backToMainMenu(wbot, contact, ticket, ticketTraking);
    return;
  }


  if (!getStageBot) {
    const queue = await ShowQueueService(queueId, ticket.companyId);

    const selectedOptions =
      msg?.message?.buttonsResponseMessage?.selectedButtonId ||
      msg?.message?.listResponseMessage?.singleSelectReply.selectedRowId ||
      getBodyMessage(msg);

    const choosenQueue = queue.chatbots[+selectedOptions - 1];

    if (choosenQueue) {
      if (choosenQueue.queueType === "integration") {
        try {

          await ticket.update({
            integrationId: choosenQueue.optIntegrationId,
            useIntegration: true,
            status: "pending",
            queueId: null
          });
        } catch (error) {
          await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
        }
      } else if (choosenQueue.queueType === "queue") {
        try {

          const ticketUpdateAgent = {
            ticketData: {
              queueId: choosenQueue.optQueueId,
              status: "pending"
            },
            ticketId: ticket.id
          };
          await UpdateTicketService(
            {
              ticketData: {
                ...ticketUpdateAgent.ticketData,
              },
              ticketId: ticketUpdateAgent.ticketId,
              companyId: ticket.companyId
            }

          );
        } catch (error) {
          await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
        }
      } else if (choosenQueue.queueType === "attendent") {
        try {

          const ticketUpdateAgent = {
            ticketData: {
              queueId: choosenQueue.optQueueId,
              userId: choosenQueue.optUserId,
              status: "pending"
            },
            ticketId: ticket.id
          };
          await UpdateTicketService(
            {
              ticketData: {
                ...ticketUpdateAgent.ticketData,
              },
              ticketId: ticketUpdateAgent.ticketId,
              companyId: ticket.companyId
            }

          );
        } catch (error) {
          await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
        }
      }

      await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);

      let send
      if (choosenQueue?.greetingMessage && (!choosenQueue.optIntegrationId || ticket.typebotSessionTime === null)) {
        send = await sendDialog(choosenQueue, wbot, contact, ticket);
      } // nao tem mensagem de boas vindas

      if (choosenQueue.queueType === "file") {
        try {
          const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");

          const files = await ShowFileService(choosenQueue.optFileId, ticket.companyId)

          const folder = path.resolve(publicFolder, `company${ticket.companyId}`, "fileList", String(files.id))

          for (const [index, file] of files.options.entries()) {
            const mediaSrc = {
              fieldname: 'medias',
              originalname: file.path,
              encoding: '7bit',
              mimetype: file.mediaType,
              filename: file.path,
              path: path.resolve(folder, file.path),
            } as Express.Multer.File

            await SendWhatsAppMedia({ media: mediaSrc, ticket, body: file.name, isForwarded: false });
          };

        } catch (error) {
          await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
        }
      }
      if (choosenQueue.closeTicket) {
        await sendMsgAndCloseTicket(wbot, ticket.contact, ticket);
      }

      return send;
    }

  }

  if (getStageBot) {
    const selected = isNumeric(selectedOption) ? selectedOption : 1;
    const bots = await ShowChatBotServices(getStageBot.chatbotId);

    const choosenQueue = bots.options[+selected - 1]
      ? bots.options[+selected - 1]
      : bots.options[0];
    // console.log("linha 1508")
    if (!choosenQueue.greetingMessage) {
      await DeleteDialogChatBotsServices(contact.id);
      return;
    } // nao tem mensagem de boas vindas

    if (choosenQueue) {
      if (choosenQueue.queueType === "integration") {
        try {

          const ticketUpdateAgent = {
            ticketData: {
              integrationId: choosenQueue.optIntegrationId,
              useIntegration: true,
              status: "pending"
            },
            ticketId: ticket.id
          };
          await UpdateTicketService(
            {
              ticketData: {
                ...ticketUpdateAgent.ticketData,
              },
              ticketId: ticketUpdateAgent.ticketId,
              companyId: ticket.companyId
            }

          );
        } catch (error) {
          await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
        }
      } else if (choosenQueue.queueType === "queue") {
        try {

          const ticketUpdateAgent = {
            ticketData: {
              queueId: choosenQueue.optQueueId,
              status: "pending"
            },
            ticketId: ticket.id
          };
          await UpdateTicketService(
            {
              ticketData: {
                ...ticketUpdateAgent.ticketData,
              },
              ticketId: ticketUpdateAgent.ticketId,
              companyId: ticket.companyId
            }

          );
        } catch (error) {
          await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
        }
      } else if (choosenQueue.queueType === "attendent") {
        try {

          const ticketUpdateAgent = {
            ticketData: {
              queueId: choosenQueue.optQueueId,
              userId: choosenQueue.optUserId,
              status: "pending"
            },
            ticketId: ticket.id
          };
          await UpdateTicketService(
            {
              ticketData: {
                ...ticketUpdateAgent.ticketData,
              },
              ticketId: ticketUpdateAgent.ticketId,
              companyId: ticket.companyId
            }

          );
        } catch (error) {
          await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
        }
      }

      await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);

      // let send
      // if (choosenQueue?.greetingMessage) {
      //   send = await sendDialog(choosenQueue, wbot, contact, ticket);
      // } // nao tem mensagem de boas vindas

      if (choosenQueue.queueType === "file") {
        try {
          const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");

          const files = await ShowFileService(choosenQueue.optFileId, ticket.companyId)

          const folder = path.resolve(publicFolder, `company${ticket.companyId}`, "fileList", String(files.id))

          for (const [index, file] of files.options.entries()) {
            const mediaSrc = {
              fieldname: 'medias',
              originalname: file.path,
              encoding: '7bit',
              mimetype: file.mediaType,
              filename: file.path,
              path: path.resolve(folder, file.path),
            } as Express.Multer.File

            await SendWhatsAppMedia({ media: mediaSrc, ticket, body: file.name, isForwarded: false });
          }

        } catch (error) {
          await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
        }
      }
      if (choosenQueue.closeTicket) {
        await sendMsgAndCloseTicket(wbot, ticket.contact, ticket);
      }

      await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);

      return await sendDialog(choosenQueue, wbot, contact, ticket);
    }
  }

};
