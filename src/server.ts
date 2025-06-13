import 'dotenv/config';
import gracefulShutdown from "http-graceful-shutdown";
import https from 'https';
import fs from 'fs';
import app from "./app"; // Asumo que 'app' es tu aplicación Express
import { initIO } from "./libs/socket";
import logger from "./utils/logger";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import Company from "./models/Company";
import BullQueue from './libs/queue';
import { startQueueProcess } from "./queues";
import { Server } from 'http';

const PORT = process.env.PORT || 3000; // Puerto por defecto si no está en .env
const USE_HTTPS = process.env.CERTIFICADOS === "true";

/**
 * Registra los manejadores para excepciones no capturadas y rechazos de promesas no manejados.
 * Estos se deben registrar una sola vez.
 */
function registerGlobalErrorHandlers() {
  process.on("uncaughtException", err => {
    logger.error("UNCAUGHT EXCEPTION:", {
      message: err.message,
      stack: err.stack
    });
    console.error(
      `${new Date().toUTCString()} uncaughtException:`,
      err.message
    ); // Mantener por si logger falla
    console.error(err.stack);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("UNHANDLED REJECTION:", { reason, promise });
    console.error(
      `${new Date().toUTCString()} unhandledRejection:`,
      reason,
      promise
    ); // Mantener por si logger falla
    process.exit(1);
  });
  logger.info("Manejadores de errores globales registrados.");
}

/**
 * Lógica a ejecutar una vez que el servidor está escuchando.
 * Incluye inicio de sesiones de WhatsApp y procesamiento de colas.
 */
async function postListenSetup() {
  try {
    logger.info("Iniciando configuración post-arranque del servidor...");
    const companies = await Company.findAll({
      where: { status: true },
      attributes: ["id"]
    });

    // Iniciar todas las sesiones de WhatsApp en paralelo
    const sessionPromises = companies.map(company =>
      StartAllWhatsAppsSessions(company.id)
    );
    await Promise.all(sessionPromises);
    logger.info(
      "Todas las promesas de inicio de sesión de WhatsApp han sido procesadas."
    );

    await startQueueProcess();
    logger.info("Proceso de cola principal iniciado.");

    if (process.env.REDIS_URI_ACK && process.env.REDIS_URI_ACK !== "") {
      BullQueue.process(); // Asume que esto es para procesar trabajos de la cola
      logger.info(
        "Procesador de BullQueue para ACKs (si está configurado) iniciado."
      );
    }
    logger.info("Configuración post-arranque del servidor completada.");
  } catch (error) {
    logger.error(
      "Error durante la configuración post-arranque del servidor:",
      error
    );
    // Considerar si este error debe detener el servidor.
    // Por ahora, solo lo registra y el servidor sigue funcionando.
    // process.exit(1);
  }
}

/**
 * Función principal para crear, configurar e iniciar el servidor.
 */
async function startServer() {
  let serverInstance: https.Server | Server; // Contendrá la instancia del servidor (http o https)

  if (USE_HTTPS) {
    logger.info("Configurando servidor HTTPS...");
    const { SSL_KEY_FILE, SSL_CRT_FILE, SSL_CA_FILE } = process.env;

    if (!SSL_KEY_FILE || !SSL_CRT_FILE || !SSL_CA_FILE) {
      logger.error(
        "Error: Variables de entorno SSL_KEY_FILE, SSL_CRT_FILE o SSL_CA_FILE no encontradas para HTTPS."
      );
      process.exit(1);
    }

    let httpsOptions: https.ServerOptions;
    try {
      httpsOptions = {
        key: fs.readFileSync(SSL_KEY_FILE),
        cert: fs.readFileSync(SSL_CRT_FILE),
        ca: fs.readFileSync(SSL_CA_FILE) // Para CA bundle o autenticación de cliente
      };
      logger.info("Certificados SSL cargados correctamente.");
    } catch (readFilesError) {
      logger.error(
        "Error al leer los archivos de certificado SSL:",
        readFilesError
      );
      process.exit(1);
    }

    const httpsServer = https.createServer(httpsOptions, app);

    // Manejar errores de 'listen' como puerto en uso
    httpsServer.on("error", err => {
      logger.error(`Error al iniciar el servidor HTTPS: ${err.message}`);
      process.exit(1);
    });

    serverInstance = httpsServer.listen(PORT, async () => {
      logger.info(`Servidor HTTPS iniciado y escuchando en el puerto: ${PORT}`);
      await postListenSetup(); // Ejecutar tareas después de que el servidor esté escuchando
    });
  } else {
    logger.info("Configurando servidor HTTP...");
    // Para HTTP, app.listen() de Express crea y arranca el servidor.
    const httpServer = app.listen(PORT, async () => {
      logger.info(`Servidor HTTP iniciado y escuchando en el puerto: ${PORT}`);
      await postListenSetup(); // Ejecutar tareas después de que el servidor esté escuchando
    });

    // Manejar errores de 'listen' como puerto en uso
    httpServer.on("error", err => {
      logger.error(`Error al iniciar el servidor HTTP: ${err.message}`);
      process.exit(1);
    });
    serverInstance = httpServer;
  }

  // Asegurarse de que la instancia del servidor se haya creado antes de continuar
  if (!serverInstance) {
    logger.error("La instancia del servidor no pudo ser creada. Abortando.");
    process.exit(1);
  }

  // initIO y gracefulShutdown se configuran con la instancia del servidor que está escuchando.
  initIO(serverInstance);
  logger.info("Socket.IO inicializado y adjuntado al servidor.");

  gracefulShutdown(serverInstance, {
    signals: "SIGINT SIGTERM", // Señales comunes para el apagado
    timeout: 30000, // 30 segundos para cerrar conexiones existentes
    onShutdown: async signal => {
      logger.info(
        `Apagado del servidor iniciado debido a la señal: ${signal}. Limpiando conexiones...`
      );
      // Aquí puedes agregar lógica de limpieza adicional si es necesario antes de que el servidor se cierre.
      // Por ejemplo, cerrar conexiones a bases de datos, guardar estado, etc.
    },
    finally: () => {
      logger.info("Servidor completamente apagado. ¡Adiós!");
    }
  });
  logger.info("Manejo de apagado elegante (graceful shutdown) configurado.");
}

// --- PUNTO DE ENTRADA DE LA APLICACIÓN ---

// 1. Registrar manejadores de errores globales lo antes posible.
registerGlobalErrorHandlers();

// 2. Iniciar el servidor.
startServer().catch(error => {
  // Este catch es para errores inesperados durante la fase de *configuración inicial* de startServer,
  // no para errores de tiempo de ejecución del servidor (esos los manejan los manejadores globales o los 'error' events del servidor).
  logger.fatal("Error fatal durante el arranque del servidor (fuera del listen):", error);
  process.exit(1);
});
