// src/utils/db.ts
// Este archivo puede servir para mantener estados en memoria de la aplicación
// que son necesarios pero no pertenecen a la base de datos principal.

import { WAMessage } from "@whiskeysockets/baileys";

// Mapea el ID de WhatsApp a un array de mensajes pendientes de importación.
export const dataMessages: { [whatsappId: number]: WAMessage[] } = {};
