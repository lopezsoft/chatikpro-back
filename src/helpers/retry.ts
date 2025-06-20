// src/helpers/retry.ts
import logger from "../utils/logger";

// Función para pausar la ejecución por un número de milisegundos
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Interfaz para las opciones de reintento
interface RetryOptions {
  retries: number;      // Número máximo de intentos
  initialDelayMs: number; // Tiempo de espera inicial en milisegundos
}

/**
 * Ejecuta una función asíncrona y la reintenta con una estrategia de backoff exponencial si falla.
 * @param operation La función asíncrona a ejecutar. Debe ser una función que devuelve una Promesa.
 * @param options Opciones de configuración para los reintentos.
 * @returns El resultado de la operación si tiene éxito.
 * @throws El último error si todos los reintentos fallan.
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = { retries: 3, initialDelayMs: 1000 }
): Promise<T> {

  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      // Intentamos ejecutar la operación. Si tiene éxito, retornamos el resultado.
      return await operation();
    } catch (error) {
      // Si la operación falla, entramos al catch.

      // Si es el último intento, nos rendimos y lanzamos el error.
      if (attempt === options.retries) {
        logger.error(`[Reintento] Último intento (${attempt}) fallido. Rindiéndose.`);
        throw error;
      }

      // Solo reintentamos si el error es de tipo 'ECONNRESET' u otro error de red.
      // Puedes añadir más códigos de error aquí si es necesario.
      if (error.original?.code !== 'ECONNRESET') {
        logger.error(`[Reintento] Error no recuperable, no se reintentará: ${error.message}`);
        throw error;
      }

      // Calculamos el tiempo de espera exponencial.
      const delayTime = options.initialDelayMs * Math.pow(2, attempt - 1);

      logger.warn(`[Reintento] Intento ${attempt} fallido con error ECONNRESET. Reintentando en ${delayTime / 1000}s...`);

      // Esperamos antes del siguiente intento.
      await delay(delayTime);
    }
  }
}
