// Asumo que este archivo es src/server.ts

import gracefulShutdown from "http-graceful-shutdown";
import cluster from "cluster";
import os from "os";

import app from "./app"; // --> USAMOS ESTA APP CONFIGURADA
import { initIO } from "./libs/socket";
import logger from "./utils/logger";
import Company from "./models/Company";

// --> CAMBIO: Importamos los nuevos orquestadores
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import { startAllQueues } from "./queues";
import { initializeAllCrons } from "./cron";

const PORT = process.env.PORT || 4000;
const clusterWorkerSize = os.cpus().length;

// Función de inicialización para ser reutilizada
const runInitializers = async () => {
  try {
    const companies = await Company.findAll();
    const sessionPromises = companies.map(c => StartAllWhatsAppsSessions(c.id));
    await Promise.allSettled(sessionPromises); // Usamos allSettled para más robustez

    // Iniciar colas y tareas programadas
    startAllQueues();
    initializeAllCrons();
  } catch (error) {
    logger.error("Error durante la inicialización principal:", error);
  }
};

if (clusterWorkerSize > 1 && cluster.isMaster) {
  logger.info(`Master ${process.pid} is running`);
  logger.info(`Forking for ${clusterWorkerSize} CPUs`);

  for (let i = 0; i < clusterWorkerSize; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died. Forking a new worker...`);
    cluster.fork();
  });

} else {
  // Este bloque es ejecutado por cada worker Y también en modo no-cluster.
  const server = app.listen(PORT, async () => {
    logger.info(`Server started on port: ${PORT} with worker ${process.pid}`);

    // --> CAMBIO CLAVE: Solo el worker 1 (o si no estamos en modo cluster) ejecuta las inicializaciones.
    if (!cluster.isWorker || cluster.worker.id === 1) {
      logger.info(`Worker ${process.pid} is designated as the main initializer.`);
      await runInitializers();
    }
  });

  // Manejo de errores y cierre para cada worker
  process.on("uncaughtException", err => {
    logger.error("UNCAUGHT EXCEPTION:", err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, p) => {
    logger.error("UNHANDLED REJECTION:", reason, p);
    process.exit(1);
  });

  initIO(server);
  gracefulShutdown(server);
}
