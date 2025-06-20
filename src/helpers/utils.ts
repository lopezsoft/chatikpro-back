// src/helpers/utils.ts

/**
 * Convierte segundos a milisegundos.
 * @param seconds - El número de segundos.
 * @returns El equivalente en milisegundos.
 */
export function parseToMilliseconds(seconds: number): number {
  return seconds * 1000;
}

/**
 * Genera un valor entero aleatorio dentro de un rango.
 * @param min - El valor mínimo (inclusive).
 * @param max - El valor máximo (inclusive).
 * @returns Un número entero aleatorio.
 */
export function randomValue(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
