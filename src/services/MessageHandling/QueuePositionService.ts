// src/services/MessageHandling/QueuePositionService.ts

// Modelos y Tipos
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import CompaniesSettings from "../../models/CompaniesSettings";

// Servicios y Helpers
import formatBody from "../../helpers/Mustache";
import { debounce } from "../../helpers/Debounce";
import { Session } from "../../utils/types";

/**
 * Servicio especializado en calcular y enviar la posición de un ticket en la fila de atención.
 */
class QueuePositionService {
  /**
   * Verifica la configuración y, si está habilitado, envía la posición en la fila al usuario.
   * @param queue - La cola en la que se encuentra el ticket.
   * @param ticket - El ticket del usuario.
   * @param wbot - La instancia de la conexión de WhatsApp.
   */
  public async send(queue: Queue, ticket: Ticket, wbot: Session): Promise<void> {
    const settings = await CompaniesSettings.findOne({ where: { companyId: ticket.companyId } });

    // Solo procede si la opción está habilitada en la configuración.
    if (settings?.sendQueuePosition !== "enabled") {
      return;
    }

    // No informa la posición si la cola tiene chatbots, ya que la interacción es diferente.
    if (queue.chatbots && queue.chatbots.length > 0) {
      return;
    }

    // Cuenta los tickets pendientes en la misma cola, compañía y conexión.
    const { count } = await Ticket.findAndCountAll({
      where: {
        userId: null,
        status: "pending",
        companyId: ticket.companyId,
        queueId: queue.id,
        whatsappId: wbot.id,
        isGroup: false
      }
    });

    // Construye el mensaje a enviar.
    const position = count === 0 ? 1 : count;
    const message = `${settings.sendQueuePositionMessage || "Su posición en la fila es:"} *${position}*`;
    const body = formatBody(message, ticket);

    // Envía el mensaje con un debounce para evitar spam.
    const debouncedSendMessage = debounce(async () => {
      await wbot.sendMessage(
        `${ticket.contact.number}@s.whatsapp.net`,
        { text: body }
      );
    }, 3000, ticket.id);

    debouncedSendMessage();
  }
}

export default new QueuePositionService();
