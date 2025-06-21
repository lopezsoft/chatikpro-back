// src/lib/wbot/BaileysClient.ts

import makeWASocket, {
  makeCacheableSignalKeyStore,
  WAMessage,
  proto,
  jidNormalizedUser,
  fetchLatestBaileysVersion,
  SignalAuthState,
  SignalRepository,
  isJidBroadcast,
  isJidGroup,
  AnyMessageContent
} from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import { Server } from "socket.io";
import { Boom } from "@hapi/boom";

import MAIN_LOGGER from "@whiskeysockets/baileys/lib/Utils/logger";
const loggerBaileys = MAIN_LOGGER.child({});
loggerBaileys.level = "info"; // O el nivel que prefieras

import logger from "../../utils/logger";
import { WhatsappData, Session } from "../../utils/types";
import { IWhatsappRepository } from "./WhatsappRepository";
import { BROWSER_CONFIG, CONNECT_TIMEOUT_MS, MAX_QR_RETRIES, WHATSAPP_STATUS } from "../../utils/constants";
import { sessionManager } from "./SessionManager";
import { onConnectionUpdate } from "../../handlers/onConnectionUpdate";
import { onCredsUpdate } from "../../handlers/onCredsUpdate";
import { onHistorySet } from "../../handlers/onHistorySet";
import { msg, msgDB, msgRetryCounterCache } from "../../helpers/msg";
import message from "../../models/Message";
import { useCacheAuthState } from "../../helpers/useCacheAuthState"; // Asumiendo que msg y msgDB se mueven a un helper

export class BaileysClient {
  public id: number;
  public name: string;
  public wsocket: Session | null = null;
  public whatsapp: WhatsappData;

  // Dependencias inyectadas
  public readonly repository: IWhatsappRepository;
  public readonly io: Server;

  private authState: any; // Para mantener el estado de la autenticación

  constructor(
    whatsapp: WhatsappData,
    repository: IWhatsappRepository,
    io: Server
  ) {
    this.id = whatsapp.id;
    this.name = whatsapp.name;
    this.whatsapp = whatsapp;
    this.repository = repository; // Inyección de dependencia
    this.io = io; // Inyección de dependencia
  }

  public async connect(): Promise<Session> {
    logger.info(`[SESIÓN: ${this.name}] Iniciando conexión...`);
    await this.repository.update(this.id, { status: WHATSAPP_STATUS.OPENING });

    const { state, saveCreds } = await useCacheAuthState(this.whatsapp);
    this.authState = { saveCreds };

    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`[SESIÓN: ${this.name}] Usando WA v${version.join(".")}, es la última: ${isLatest}`);

    this.wsocket = makeWASocket({
      placeholderResendCache: undefined,
      makeSignalRepository(auth: SignalAuthState): SignalRepository {
        return undefined;
      },
      version,
      logger: loggerBaileys,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: BROWSER_CONFIG,
      msgRetryCounterCache, // Asumiendo que msgRetryCounterCache está definido globalmente o en un helper
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
      defaultQueryTimeoutMs: undefined,
      keepAliveIntervalMs: 60000,
      getMessage: msgDB.get,
      patchMessageBeforeSending(message) {
        // Lógica de patchMessageBeforeSending...
        return message;
      },
      shouldIgnoreJid: (jid) => {
        return isJidBroadcast(jid) || (!this.whatsapp.allowGroup && isJidGroup(jid));
      }
      // ... otras opciones de configuración ...
    }) as Session;

    this.wsocket.id = this.id;

    // Vinculamos los eventos a nuestros manejadores, pasando esta instancia como contexto
    this.wsocket.ev.on("connection.update", (update) => onConnectionUpdate(update, this));
    this.wsocket.ev.on("creds.update", () => onCredsUpdate(this));
    this.wsocket.ev.on("messaging-history.set", ({ messages }) => onHistorySet(messages, this));

    return this.wsocket;
  }
  // =================================================================
  // --> MÉTODOS AÑADIDOS (DELEGACIÓN / FACHADA)
  // =================================================================

  /**
   * Envía un mensaje a través de la conexión de Baileys.
   * @param jid - El JID del destinatario.
   * @param content - El contenido del mensaje.
   */
  public async sendMessage(jid: string, content: AnyMessageContent) {
    if (!this.wsocket) throw new Error("Wsocket no está conectado.");
    return this.wsocket.sendMessage(jid, content);
  }

  /**
   * Verifica si un JID existe en WhatsApp.
   * @param jid - El JID a verificar.
   */
  public async onWhatsApp(jid: string) {
    if (!this.wsocket) throw new Error("Wsocket no está conectado.");
    return this.wsocket.onWhatsApp(jid);
  }

  /**
   * Realiza el logout de la sesión en los servidores de WhatsApp.
   */
  public async logout() {
    if (!this.wsocket) return;
    return this.wsocket.logout();
  }

  /**
   * Cierra la conexión WebSocket de Baileys.
   */
  public async close() {
    if (!this.wsocket) return;
    return this.wsocket.ws.close();
  }

  /**
   * Obtiene la sesión actual de WhatsApp.
   */
  public getSession(): Session {
    if (!this.wsocket) throw new Error("Wsocket no está conectado.");
    return this.wsocket;
  }

  // --- Métodos del Ciclo de Vida (llamados por los manejadores) ---

  public async handleSuccessfulConnection(): Promise<void> {
    logger.info(`[SESIÓN: ${this.name}] Conexión establecida exitosamente.`);
    const number = this.wsocket.type === "md" ? jidNormalizedUser(this.wsocket.user.id).split("@")[0] : "-";

    await this.repository.update(this.id, {
      status: WHATSAPP_STATUS.CONNECTED,
      qrcode: "",
      number,
    });

    // Resetear contadores de reintentos al conectar
    sessionManager.deleteReconnectionAttempt(this.id);
    sessionManager.deleteQrRetry(this.id);

    this.emitSessionStatus();
  }

  public async handleQrCode(qr: string): Promise<void> {
    const retries = sessionManager.getQrRetry(this.id);
    if (retries >= MAX_QR_RETRIES) {
      logger.warn(`[SESIÓN: ${this.name}] Límite de reintentos de QR (${MAX_QR_RETRIES}) alcanzado. Abortando.`);
      await this.handleFatalDisconnection();
      return;
    }

    logger.info(`[SESIÓN: ${this.name}] Generando QR. Intento: ${retries + 1}`);
    await this.repository.update(this.id, { qrcode: qr, status: WHATSAPP_STATUS.QRCODE, number: "" });
    sessionManager.incrementQrRetry(this.id);

    this.emitSessionStatus();
  }

  public async handleFatalDisconnection(): Promise<void> {
    logger.info(`[SESIÓN: ${this.name}] Ejecutando limpieza completa de la sesión.`);
    await this.repository.update(this.id, { status: WHATSAPP_STATUS.PENDING, session: "", qrcode: "" });
    await this.repository.delete(this.id);
    await this.repository.clearSessionCache(this.id);

    this.emitSessionStatus();
    this.remove(false);
  }

  public remove(isLogout = true): void {
    if (isLogout && this.wsocket) {
      this.wsocket.logout();
      this.wsocket.ws.close();
    }
    sessionManager.removeSession(this.id);
    sessionManager.deleteReconnectionAttempt(this.id);
    sessionManager.deleteQrRetry(this.id);
  }

  // --- Métodos de Utilidad ---

  public async saveCreds(): Promise<void> {
    await this.authState.saveCreds();
  }

  private emitSessionStatus(): void {
    this.repository.find(this.id).then(updatedWhatsapp => {
      this.io.of(String(this.whatsapp.companyId)).emit(`company-${this.whatsapp.companyId}-whatsappSession`, {
        action: "update",
        session: updatedWhatsapp
      });
    });
  }
}
