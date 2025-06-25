
import AppError from "../../errors/AppError";

import Whatsapp from "../../models/Whatsapp";

import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import { Identifier, Op } from "sequelize";
import { add } from "date-fns";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import moment from "moment";
import { addLogs } from "../../helpers/addLogs";
import { sessionManager } from "../../libs/wbot/SessionManager";
import { dataMessages } from "../../utils/db";
import MessageFlow from "../MessageHandling/MessageFlow";

export const closeTicketsImported = async (whatsappId: Identifier) => {
  const tickets = await Ticket.findAll({
    where: {
      status: "pending",
      whatsappId,
      imported: { [Op.lt]: +add(new Date(), { hours: +5 }) }
    }
  });

  for (const ticket of tickets) {
    await new Promise(r => setTimeout(r, 330));
    await UpdateTicketService({
      ticketData: { status: "closed" },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });
  }
  let whatsApp = await Whatsapp.findByPk(whatsappId);
  whatsApp.update({ statusImportMessages: null });
  const io = getIO();
  io.of(whatsApp.companyId.toString()).emit(
    `importMessages-${whatsApp.companyId}`,
    {
      action: "refresh"
    }
  );
};



function sortByMessageTimestamp(
  a: { messageTimestamp: number },
  b: { messageTimestamp: number }
) {
  return b.messageTimestamp - a.messageTimestamp;
}

function cleaner(array: any) {
  const mapa = new Map();
  const resultado = [];

  for (const objeto of array) {
    const valorChave = objeto["key"]["id"];
    if (!mapa.has(valorChave)) {
      mapa.set(valorChave, true);
      resultado.push(objeto);
    }
  }

  return resultado.sort(sortByMessageTimestamp);
}






const ImportWhatsAppMessageService = async (whatsappId: number | string) => {
  let whatsApp = await Whatsapp.findByPk(whatsappId);


  const wbot = sessionManager.getSession(whatsApp.id).getSession();

  try {

    const io = getIO();
    const messages = cleaner(dataMessages[whatsappId])
    let dateOldLimit = new Date(whatsApp.importOldMessages).getTime();
    let dateRecentLimit = new Date(whatsApp.importRecentMessages).getTime();

    addLogs({
      fileName: `processImportMessagesWppId${whatsappId}.txt`, forceNewFile: true,
      text: `Esperando conexión para iniciar la importación de mensajes:
      Nombre de WhatsApp: ${whatsApp.name}
      ID de WhatsApp: ${whatsApp.id}
      Creación del archivo de logs: ${moment().format("DD/MM/YYYY HH:mm:ss")}
      Fecha de inicio de importación seleccionada: ${moment(dateOldLimit).format("DD/MM/YYYY HH:mm:ss")}
      Fecha final de importación seleccionada: ${moment(dateRecentLimit).format("DD/MM/YYYY HH:mm:ss")}
      `
    })


    const qtd = messages.length
    let i = 0
    while (i < qtd) {

      try {
        const msg = messages[i]
        addLogs({
          fileName: `processImportMessagesWppId${whatsappId}.txt`, text: `
Mensagem ${i + 1} de ${qtd}
              `})
        await MessageFlow.execute(msg, wbot, whatsApp.companyId, true);

        if (i % 2 === 0) {
          const timestampMsg = Math.floor(msg.messageTimestamp["low"] * 1000)
          io.of(whatsApp.companyId.toString())
            .emit(`importMessages-${whatsApp.companyId}`, {
              action: "update",
              status: { this: i + 1, all: qtd, date: moment(timestampMsg).format("DD/MM/YY HH:mm:ss") }
            });

        }


        if (i + 1 === qtd) {
          dataMessages[whatsappId] = [];

          if (whatsApp.closedTicketsPostImported) {
            await closeTicketsImported(whatsappId)
          }
          await whatsApp.update({
            statusImportMessages: whatsApp.closedTicketsPostImported ? null : "renderButtonCloseTickets",
            importOldMessages: null,
            importRecentMessages: null
          });



          io.of(whatsApp.companyId.toString())
            .emit(`importMessages-${whatsApp.companyId}`, {
              action: "refresh",
            });
        }
      } catch (error) { }

      i++
    }


  } catch (error) {
    throw new AppError("ERR_NOT_MESSAGE_TO_IMPORT", 403);
  }

  return "whatsapps";
};

export default ImportWhatsAppMessageService;
