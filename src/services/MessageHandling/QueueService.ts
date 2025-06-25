// src/services/MessageHandling/QueueService.ts

import { WAMessage, WASocket } from "@whiskeysockets/baileys";

// Modelos
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import CompaniesSettings from "../../models/CompaniesSettings";
import TicketTraking from "../../models/TicketTraking";

// Servicios y Helpers
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import formatBody from "../../helpers/Mustache";
import { CreateTextMessage } from "../MessageServices/CreateMessageServiceFromWhatsapp";
import { getBodyMessage } from "../../handlers/MessageClassifier";
import { debounce } from "../../helpers/Debounce";
import GreetingService from "./GreetingService";
import FileSenderService from "./FileSenderService";
import TicketClosingService from "./TicketClosingService";
import QueuePositionService from "./QueuePositionService";

// --> LÓGICA DE SALUDO (será extraída después a su propio servicio)
const sendGreeting = async (greetingMessage: any, ticket: Ticket, wbot: {
  sendMessage: (arg0: string, arg1: { text: string; }) => any;
}, contact: Contact, ticketTraking: TicketTraking) => {
  const body = formatBody(`\u200e${greetingMessage}`, ticket);
  const sentMessage = await wbot.sendMessage(`${contact.number}@s.whatsapp.net`, { text: body });
  await CreateTextMessage(sentMessage, ticket, contact, ticketTraking);
}

/**
 * Este nuevo servicio contendrá el núcleo de la lógica de decisión de verifyQueue. Su trabajo es analizar la
 * situación (¿cuántas colas hay? ¿qué respondió el usuario?) y tomar la decisión principal: asignar una cola
 * directamente o mostrar un menú.
 * Servicio para gestionar la lógica de colas de atención.
 * Decide si asignar una cola directamente o mostrar un menú de opciones.
 */
class QueueService {
  /**
   * Punto de entrada principal para manejar la lógica de colas.
   */
  public async handle(
    wbot: WASocket,
    msg: WAMessage,
    ticket: Ticket,
    contact: Contact,
    settings: CompaniesSettings,
    ticketTraking: TicketTraking
  ): Promise<void> {
    const { queues, greetingMessage } = await ShowWhatsAppService(
      (wbot as any).id,
      ticket.companyId
    );

    // Si no hay colas, no hay nada que hacer.
    if (queues.length === 0) return;

    // Caso 1: Hay una sola cola disponible.
    if (queues.length === 1) {
      await this._assignSingleQueue(
        wbot,
        msg,
        ticket,
        contact,
        queues[0],
        settings,
        ticketTraking
      );
      return;
    }

    // Caso 2: Hay múltiples colas, se maneja la selección del usuario.
    await this._handleQueueSelection(
      wbot,
      msg,
      ticket,
      contact,
      queues,
      greetingMessage,
      settings,
      ticketTraking
    );
  }

  /**
   * Asigna directamente una cola al ticket y envía el mensaje de saludo correspondiente.
   */
  private async _assignSingleQueue(
    wbot,
    msg,
    ticket,
    contact,
    queue,
    settings,
    ticketTraking
  ) {
    await UpdateTicketService({
      ticketData: { queueId: queue.id },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });

    // --> AJUSTE: Llama al servicio de cierre automático. Si cierra el ticket, termina el flujo.
    const ticketWasClosed = await TicketClosingService.closeIfRequired(queue, ticket);
    if (ticketWasClosed) return;

    await GreetingService.send(queue, ticket, wbot);

    await FileSenderService.send(queue, ticket);

    await QueuePositionService.send(queue, ticket, wbot);
    // Aquí iría la lógica de enviar saludo, archivos, etc., que después moveremos.
    if (queue.greetingMessage) {
      await sendGreeting(
        queue.greetingMessage,
        ticket,
        wbot,
        contact,
        ticketTraking
      );
    }
  }

  /**
   * Maneja la interacción del usuario con el menú de colas.
   */
  private async _handleQueueSelection(
    wbot,
    msg,
    ticket,
    contact,
    queues,
    greetingMessage,
    settings,
    ticketTraking
  ) {
    const selectedOption = getBodyMessage(msg);

    // Manejo del comando para salir
    if (selectedOption.toLowerCase() === "sair") {
      await UpdateTicketService({
        ticketData: { status: "closed", sendFarewellMessage: true },
        ticketId: ticket.id,
        companyId: ticket.companyId
      });
      return;
    }

    // Elige la cola basada en la respuesta numérica del usuario
    const choosenQueue = queues[+selectedOption - 1];

    if (choosenQueue) {
      // Asigna la cola elegida
      await UpdateTicketService({
        ticketData: { queueId: choosenQueue.id },
        ticketId: ticket.id,
        companyId: ticket.companyId
      });

      const ticketWasClosed = await TicketClosingService.closeIfRequired(choosenQueue, ticket);
      if (ticketWasClosed) return;

      await GreetingService.send(choosenQueue, ticket, wbot);
      await FileSenderService.send(choosenQueue, ticket);

      // --> AJUSTE: También aquí, llama al servicio para enviar la posición en la fila.
      await QueuePositionService.send(choosenQueue, ticket, wbot);

      // Envía el saludo de la cola elegida
      if (choosenQueue.greetingMessage) {
        await sendGreeting(
          choosenQueue.greetingMessage,
          ticket,
          wbot,
          contact,
          ticketTraking
        );
      }
    } else {
      // Si la opción es inválida, muestra el menú de nuevo.
      await this._showQueueMenu(
        wbot,
        ticket,
        queues,
        greetingMessage,
        contact,
        ticketTraking
      );
    }
  }

  /**
   * Construye y envía el menú de opciones de las colas.
   */
  private async _showQueueMenu(
    wbot: { sendMessage: (arg0: string, arg1: { text: string }) => any },
    ticket: Ticket,
    queues: {
      name: any;
    }[],
    greetingMessage: any,
    contact: Contact,
    ticketTraking: TicketTraking
  ) {
    let options = "";
    queues.forEach((queue: { name: any }, index: number) => {
      options += `*[ ${index + 1} ]* - ${queue.name}\n`;
    });
    options += `\n*[ Sair ]* - Encerrar atendimento`;

    const body = formatBody(`\u200e${greetingMessage}\n\n${options}`, ticket);

    const debouncedSentMessage = debounce(
      async () => {
        const sentMessage = await wbot.sendMessage(
          `${contact.number}@s.whatsapp.net`,
          { text: body }
        );
        await CreateTextMessage(sentMessage, ticket, contact, ticketTraking);
      },
      1000,
      ticket.id
    );

    debouncedSentMessage();
  }
}

export default new QueueService();
