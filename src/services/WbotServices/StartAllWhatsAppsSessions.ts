import { from, of } from 'rxjs';
import { concatMap, filter, catchError, tap } from 'rxjs/operators';
import ListWhatsAppsService from "../WhatsappService/ListWhatsAppsService";
import { StartWhatsAppSession } from "./StartWhatsAppSession";
import * as Sentry from "@sentry/node";
import logger from "../../utils/logger";
import Whatsapp from '../../models/Whatsapp';

// Función helper que envuelve nuestra promesa en un Observable
// y maneja el éxito/error de forma aislada.
const startSessionObservable = (whatsapp: Whatsapp, companyId: number) => {
  // 'from(Promise)' convierte la promesa en un observable
  return from(StartWhatsAppSession(whatsapp, companyId)).pipe(
    // catchError atrapa errores SOLO de esta promesa, permitiendo que el flujo principal continúe
    catchError(error => {
      logger.error(`Error al iniciar la sesión para ${whatsapp.name}: ${error}`);
      Sentry.captureException(error);
      // Devolvemos un Observable 'of(null)' para que el flujo principal no se detenga.
      return of(null);
    })
  );
};

export const StartAllWhatsAppsSessions = async (
  companyId: number
): Promise<void> => {
  logger.info(`Iniciando el proceso de arranque de sesiones para la compañía ${companyId} con RxJS.`);

  const whatsapps = await ListWhatsAppsService({ companyId });
  if (whatsapps.length === 0) {
    logger.info("No hay sesiones que iniciar.");
    return;
  }

  // 1. Creamos un flujo (Observable) a partir del array de whatsapps.
  from(whatsapps).pipe(
    // 2. Filtramos solo las que nos interesan (igual que antes).
    filter(w => w.channel === "whatsapp" && w.status !== "DISCONNECTED"),

    // 3. Usamos un operador de "aplanamiento" para ejecutar la tarea asíncrona.
    // concatMap: Inicia una sesión y espera a que termine antes de empezar la siguiente.
    // ¡Ideal para no sobrecargar el sistema al inicio!
    tap(w => logger.info(`[RxJS] Iniciando procesamiento para: ${w.name}`)),
    concatMap(whatsapp => startSessionObservable(whatsapp, companyId))

    // ALTERNATIVA: Si quisieras iniciar hasta 3 a la vez (paralelismo controlado):
    // mergeMap(whatsapp => startSessionObservable(whatsapp, companyId), 3)

  ).subscribe({
    next: (result) => {
      // El resultado de startSessionObservable (si no hay error) es undefined.
      // Podemos ignorar el 'next' o usarlo para logging si devolviéramos algo.
      logger.info("[RxJS] Una sesión ha completado su proceso de inicio.");
    },
    error: (err) => {
      // Este error solo se ejecutaría si hay un fallo en el propio flujo (muy raro).
      logger.error("[RxJS] Error fatal en el flujo de inicio de sesiones.", err);
      Sentry.captureException(err);
    },
    complete: () => {
      // Se llama cuando todas las sesiones del flujo han sido procesadas.
      logger.info("[RxJS] Proceso de inicio de todas las sesiones completado.");
    }
  });

  // Nota: La suscripción es "fire-and-forget". La función principal retorna void
  // inmediatamente mientras RxJS maneja el flujo en segundo plano.
};
