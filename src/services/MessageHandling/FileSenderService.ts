// src/services/MessageHandling/FileSenderService.ts

import { isNil } from "lodash";
import path from "path";
import fs from "fs";

// Modelos y Tipos
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";

// Servicios y Helpers
import logger from "../../utils/logger";
import ShowFileService from "../FileServices/ShowService";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia";

/**
 * Servicio especializado en enviar una lista de archivos adjuntos de una cola.
 */
class FileSenderService {
  /**
   * Verifica si una cola tiene una lista de archivos y los envía al ticket.
   * @param queue - La cola que puede contener el FileList.
   * @param ticket - El ticket al que se le enviarán los archivos.
   */
  public async send(queue: Queue, ticket: Ticket): Promise<void> {
    if (isNil(queue.fileListId)) {
      return; // No hay lista de archivos para esta cola.
    }

    try {
      const files = await ShowFileService(queue.fileListId, ticket.companyId);
      if (!files || !files.options || files.options.length === 0) {
        return;
      }

      const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
      const companyFolder = path.resolve(publicFolder, `company${ticket.companyId}`, "fileList", String(files.id));

      for (const file of files.options) {
        const filePath = path.resolve(companyFolder, file.path);

        if (fs.existsSync(filePath)) {
          // Simulamos la estructura de un archivo de Multer para compatibilidad con SendWhatsAppMedia
          const mediaSrc = {
            path: filePath,
            originalname: file.path,
            mimetype: file.mediaType,
            size: fs.statSync(filePath).size
          } as Express.Multer.File;

          await SendWhatsAppMedia({
            media: mediaSrc,
            ticket,
            body: `\u200e${file.name}`,
          });
        }
      }
    } catch (error) {
      logger.error(`Error al enviar FileList para la cola ${queue.id}:`, error);
    }
  }
}

export default new FileSenderService();
