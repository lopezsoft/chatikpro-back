// src/lib/wbot/strategies/DisconnectStrategy.ts

import { DisconnectReason } from "@whiskeysockets/baileys";
import { BaileysClient } from "../libs/wbot/BaileysClient"; // La crearemos en el siguiente paso
import logger from "../utils/logger";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import { sessionManager } from "../libs/wbot/SessionManager";
import { INITIAL_RECONNECTION_DELAY_MS, MAX_RECONNECTION_ATTEMPTS, MAX_RECONNECTION_DELAY_MS } from "../utils/constants";

// Contrato que cada "estrategia" de desconexión debe seguir
export interface IDisconnectHandler {
  handle(client: BaileysClient): Promise<void>;
}

// --- Implementaciones de Estrategias ---

class ConnectionLostHandler implements IDisconnectHandler {
  public async handle(client: BaileysClient): Promise<void> {
    const attemptInfo = sessionManager.getReconnectionAttempt(client.id);

    if (attemptInfo.count >= MAX_RECONNECTION_ATTEMPTS) {
      logger.error(`[SESIÓN: ${client.name}] Límite de ${MAX_RECONNECTION_ATTEMPTS} reintentos de reconexión alcanzado. Abortando.`);
      await client.handleFatalDisconnection();
      return;
    }

    attemptInfo.count++;
    const delay = Math.min(INITIAL_RECONNECTION_DELAY_MS * Math.pow(2, attemptInfo.count - 1), MAX_RECONNECTION_DELAY_MS);
    attemptInfo.nextAttemptAt = Date.now() + delay;

    sessionManager.setReconnectionAttempt(client.id, attemptInfo);
    logger.info(`[SESIÓN: ${client.name}] Conexión perdida. Intento de reconexión ${attemptInfo.count}/${MAX_RECONNECTION_ATTEMPTS} en ${delay / 1000}s.`);

    // Programamos el reinicio
    client.remove(false); // No hacer logout, solo cerrar la conexión actual
    setTimeout(() => {
      StartWhatsAppSession(client.whatsapp, client.whatsapp.companyId).catch(err => {
        logger.error(`[SESIÓN: ${client.name}] Fallo crítico en StartWhatsAppSession durante el reintento: ${err.message}`);
        client.handleFatalDisconnection();
      });
    }, delay);
  }
}

abstract class FatalErrorHandler implements IDisconnectHandler {
  protected abstract logMessage: string;

  public async handle(client: BaileysClient): Promise<void> {
    logger.error(`[SESIÓN: ${client.name}] ${this.logMessage}. Se requiere nuevo QR.`);
    await client.handleFatalDisconnection();
  }
}

class LoggedOutHandler extends FatalErrorHandler {
  protected logMessage = "Desconexión por Logout";
}

class BadSessionHandler extends FatalErrorHandler {
  protected logMessage = "Sesión corrupta (badSession)";
}

class MultideviceMismatchHandler extends FatalErrorHandler {
  protected logMessage = "Multidevice Mismatch. Tratado como fatal";
}

class ConnectionReplacedHandler implements IDisconnectHandler {
  public async handle(client: BaileysClient): Promise<void> {
    logger.warn(`[SESIÓN: ${client.name}] Conexión reemplazada. Otra instancia ha tomado el control.`);
    // En este caso, solo removemos la sesión sin intentar reconectar ni limpiar datos
    client.remove(false);
  }
}

class DefaultFatalHandler extends FatalErrorHandler {
  protected logMessage = "Causa de desconexión no manejada o desconocida";
}


// --- Mapa de Estrategias ---
// Aquí unimos el código de error con su manejador específico.
export const disconnectStrategy = new Map<number, IDisconnectHandler>([
  [DisconnectReason.connectionLost, new ConnectionLostHandler()],
  [DisconnectReason.connectionClosed, new ConnectionLostHandler()],
  [DisconnectReason.timedOut, new ConnectionLostHandler()],
  [DisconnectReason.restartRequired, new ConnectionLostHandler()],
  [DisconnectReason.loggedOut, new LoggedOutHandler()],
  [DisconnectReason.badSession, new BadSessionHandler()],
  [DisconnectReason.multideviceMismatch, new MultideviceMismatchHandler()],
  [DisconnectReason.connectionReplaced, new ConnectionReplacedHandler()]
]);

// Exportamos una instancia del manejador por defecto para usarla como fallback
export const defaultDisconnectHandler = new DefaultFatalHandler();
