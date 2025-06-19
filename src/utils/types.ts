
import { WASocket } from "@whiskeysockets/baileys";
import { Store } from "../libs/store"; // Asumo que tienes este tipo definido
import Whatsapp from "../models/Whatsapp";

// Extiende el tipo de WASocket para incluir nuestro ID de sesión
export type Session = WASocket & {
  id?: number;
  store?: Store;
};

// Interfaz para los datos que necesita un cliente para inicializarse
// Esto nos ayuda a desacoplar del modelo de Sequelize si fuera necesario en el futuro
export interface WhatsappData extends Whatsapp {
  // Puedes añadir propiedades específicas si es necesario
}
