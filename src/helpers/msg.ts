// src/helpers/msg.ts

import NodeCache from "node-cache";
import { WAMessage, WAMessageKey } from "@whiskeysockets/baileys";
import logger from "../utils/logger";

/**
 * Caché para el contador de reintentos de mensajes de Baileys.
 * stdTTL: 600s (10 minutos) - Tiempo de vida de una clave.
 * checkperiod: 300s (5 minutos) - Cada cuánto se revisan las claves expiradas.
 */
export const msgRetryCounterCache = new NodeCache({
  stdTTL: 600,
  maxKeys: 1000,
  checkperiod: 300,
  useClones: false
});

/**
 * Caché para la función getMessage de Baileys.
 * Almacena mensajes recientes para un acceso rápido.
 * stdTTL: 60s (1 minuto) - Tiempo de vida corto, ya que solo se necesitan para mensajes muy recientes.
 */
const msgCache = new NodeCache({
  stdTTL: 60,
  maxKeys: 1000,
  checkperiod: 300,
  useClones: false
});

/**
 * Factory que crea un objeto compatible con la opción `getMessage` de Baileys.
 * @returns Un objeto con métodos `get` y `save`.
 */
export function msg() {
  return {
    get: (key: WAMessageKey) => {
      const { id } = key;
      if (!id) return;

      const data = msgCache.get(id);
      if (data) {
        try {
          // Los mensajes se guardan como string JSON, así que los parseamos al recuperarlos.
          return JSON.parse(data as string) as any;
        } catch (error) {
          logger.error(error);
        }
      }
    },
    save: (msg: WAMessage) => {
      const { id } = msg.key;
      if (!id) return;

      try {
        // Guardamos el mensaje como un string para evitar problemas con la clonación de objetos complejos.
        const msgtxt = JSON.stringify(msg);
        msgCache.set(id, msgtxt);
      } catch (error) {
        logger.error(error);
      }
    }
  }
}

// Creamos y exportamos la instancia que se pasará a la configuración de Baileys.
export const msgDB = msg();
