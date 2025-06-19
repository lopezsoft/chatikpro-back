
import { Browsers } from "@whiskeysockets/baileys";

// Configuración de reconexión
export const MAX_RECONNECTION_ATTEMPTS = 5;
export const INITIAL_RECONNECTION_DELAY_MS = 5000;
export const MAX_RECONNECTION_DELAY_MS = 300000; // 5 minutos

// Límite de reintentos de QR
export const MAX_QR_RETRIES = 3;

// Estados de la sesión de WhatsApp
export const WHATSAPP_STATUS = {
  CONNECTED: "CONNECTED",
  QRCODE: "qrcode",
  PENDING: "PENDING",
  DISCONNECTED: "DISCONNECTED",
  OPENING: "OPENING" // Un estado intermedio útil
};

// Configuración del navegador para Baileys
export const BROWSER_CONFIG = Browsers.appropriate("Desktop");

// Tiempos de espera
export const CONNECT_TIMEOUT_MS = 25000;
export const KEEP_ALIVE_INTERVAL_MS = 60000;
