// src/services/MessageHandling/MessageValidator.ts

import { WAMessage } from "@whiskeysockets/baileys";
import { isValidMsg } from "../../handlers/MessageClassifier";

/**
 * Valida si un mensaje entrante es relevante y debe ser procesado por el sistema.
 */
class MessageValidator {
  /**
   * @param msg - El objeto del mensaje de Baileys.
   * @returns `true` si el mensaje es válido, `false` si debe ser ignorado.
   */
  public validate(msg: WAMessage): boolean {
    // La lógica ahora es una simple llamada a la función centralizada.
    return isValidMsg(msg);
  }
}

export default new MessageValidator();
