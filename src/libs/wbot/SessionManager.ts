// src/lib/wbot/SessionManager.ts

import { Session } from "../../utils/types";
import AppError from "../../errors/AppError";

interface ReconnectionAttempt {
  count: number;
  nextAttemptAt: number;
}

export class SessionManager {
  private static instance: SessionManager;
  private sessions = new Map<number, Session>();
  private qrRetries = new Map<number, number>();
  private reconnectionAttempts = new Map<number, ReconnectionAttempt>();

  // El constructor es privado para forzar el uso de getInstance()
  private constructor() {}

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  // --- Métodos de Sesión ---
  public addSession(session: Session): void {
    this.sessions.set(session.id, session);
  }

  public getSession(id: number): Session {
    const session = this.sessions.get(id);
    if (!session) {
      throw new AppError("ERR_WAPP_NOT_INITIALIZED");
    }
    return session;
  }

  public removeSession(id: number): void {
    this.sessions.delete(id);
  }

  public getSessions(): Map<number, Session> {
    return this.sessions;
  }

  // --- Métodos de QR ---
  public getQrRetry(id: number): number {
    return this.qrRetries.get(id) || 0;
  }

  public incrementQrRetry(id: number): void {
    const retries = this.getQrRetry(id);
    this.qrRetries.set(id, retries + 1);
  }

  public deleteQrRetry(id: number): void {
    this.qrRetries.delete(id);
  }

  // --- Métodos de Reconexión ---
  public getReconnectionAttempt(id: number): ReconnectionAttempt {
    return this.reconnectionAttempts.get(id) || { count: 0, nextAttemptAt: Date.now() };
  }

  public setReconnectionAttempt(id: number, attempt: ReconnectionAttempt): void {
    this.reconnectionAttempts.set(id, attempt);
  }

  public deleteReconnectionAttempt(id: number): void {
    this.reconnectionAttempts.delete(id);
  }
}

// Exportamos una única instancia para toda la app
export const sessionManager = SessionManager.getInstance();
