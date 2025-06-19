import { ConnectionState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { BaileysClient } from "../libs/wbot/BaileysClient";
import logger from "../utils/logger";
import { disconnectStrategy, defaultDisconnectHandler } from "../strategies/DisconnectStrategy";

export async function onConnectionUpdate(
  update: Partial<ConnectionState>,
  client: BaileysClient
): Promise<void> {
  const { connection, lastDisconnect, qr } = update;
  logger.info(`[SESIÓN: ${client.name} | ID: ${client.id}] Estado de conexión: ${connection || ""}. Razón: ${lastDisconnect?.error?.message || "N/A"}`);

  if (connection === "open") {
    await client.handleSuccessfulConnection();
    return;
  }

  if (qr) {
    await client.handleQrCode(qr);
    return;
  }

  if (connection === "close") {
    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
    const handler = disconnectStrategy.get(statusCode) || defaultDisconnectHandler;

    try {
      await handler.handle(client);
    } catch (error) {
      logger.error(`[SESIÓN: ${client.name}] Error en manejador de desconexión para código ${statusCode}: ${error}`);
      // Como fallback final, ejecutar una desconexión fatal.
      await client.handleFatalDisconnection();
    }
  }
}
