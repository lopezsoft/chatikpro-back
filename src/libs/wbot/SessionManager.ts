import AppError from "../../errors/AppError";
import { BaileysClient } from "./BaileysClient";

/**
 * Define la estructura para llevar la cuenta de los intentos de reconexión.
 */
interface ReconnectionAttempt {
  count: number;
  nextAttemptAt: number;
}

/**
 * Gestiona todas las instancias activas de BaileysClient y su estado (sesiones, reintentos, etc.).
 * Utiliza un patrón Singleton para asegurar una única instancia en toda la aplicación.
 */
export class SessionManager {
  private static instance: SessionManager;

  private sessions = new Map<number, BaileysClient>();
  private qrRetries = new Map<number, number>();
  private reconnectionAttempts = new Map<number, ReconnectionAttempt>();

  private constructor() {}

  /**
   * Obtiene la instancia única del SessionManager.
   */
  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  // --- Métodos de Sesión ---

  /**
   * Añade una instancia de cliente al pool de sesiones.
   * @param client La instancia de BaileysClient a añadir.
   */
  public addSession(client: BaileysClient): void {
    this.sessions.set(client.id, client);
  }

  /**
   * Obtiene una sesión activa por su ID.
   * @param id El ID de la conexión de WhatsApp.
   * @returns La instancia de BaileysClient correspondiente.
   */
  public getSession(id: number): BaileysClient {
    const client = this.sessions.get(id);
    if (!client) {
      throw new AppError("ERR_WAPP_NOT_INITIALIZED");
    }
    return client;
  }

  /**
   * Elimina una sesión del pool.
   * @param id El ID de la sesión de WhatsApp a eliminar.
   */
  public removeSession(id: number): void {
    this.sessions.delete(id);
  }

  /**
   * Obtiene un mapa de todas las sesiones activas.
   * @returns Un Map con todas las instancias de BaileysClient activas.
   */
  public getSessions(): Map<number, BaileysClient> {
    return this.sessions;
  }

  // --- Métodos de Reintentos de QR ---

  /**
   * Obtiene el número de reintentos de QR para una sesión.
   * @param id El ID de la sesión.
   */
  public getQrRetry(id: number): number {
    return this.qrRetries.get(id) || 0;
  }

  /**
   * Incrementa en uno el contador de reintentos de QR.
   * @param id El ID de la sesión.
   */
  public incrementQrRetry(id: number): void {
    const retries = this.getQrRetry(id) + 1;
    this.qrRetries.set(id, retries);
  }

  /**
   * Elimina el contador de reintentos de QR para una sesión (usado al conectar con éxito).
   * @param id El ID de la sesión.
   */
  public deleteQrRetry(id: number): void {
    this.qrRetries.delete(id);
  }

  // --- Métodos de Intentos de Reconexión ---

  /**
   * Obtiene la información del intento de reconexión actual para una sesión.
   * @param id El ID de la sesión.
   */
  public getReconnectionAttempt(id: number): ReconnectionAttempt {
    return this.reconnectionAttempts.get(id) || { count: 0, nextAttemptAt: Date.now() };
  }

  /**
   * Actualiza la información del intento de reconexión.
   * @param id El ID de la sesión.
   * @param attempt La nueva información del intento.
   */
  public setReconnectionAttempt(id: number, attempt: ReconnectionAttempt): void {
    this.reconnectionAttempts.set(id, attempt);
  }

  /**
   * Elimina el contador de intentos de reconexión (usado al conectar con éxito).
   * @param id El ID de la sesión.
   */
  public deleteReconnectionAttempt(id: number): void {
    this.reconnectionAttempts.delete(id);
  }
}

export const sessionManager = SessionManager.getInstance();
