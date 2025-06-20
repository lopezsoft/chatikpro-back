import "./bootstrap"; // Asegúrate que dotenv se carga aquí o muy temprano
import "reflect-metadata";
import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import * as Sentry from "@sentry/node";
import { config as dotenvConfig } from "dotenv"; // dotenvConfig se llama más abajo

// Ya no se necesita bodyParser
// import bodyParser from 'body-parser';

import "./database";
import uploadConfig from "./config/upload";
import AppError from "./errors/AppError";
import routes from "./routes";
import logger from "./utils/logger";
import BullQueue from "./libs/queue"; // Asumo que es una exportación default o un objeto
// import BullBoard from 'bull-board'; // Corregido: bull-board/api y bull-board/express
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

import basicAuth from 'basic-auth';

import { setupSwagger } from './config/swagger';
import { messageQueue, sendScheduledMessages } from "./queues/definitions";

// Carga de variables de entorno (si no se hace en ./bootstrap)
// Es buena práctica hacerlo lo más pronto posible.
dotenvConfig();

// Inicializar Sentry (después de cargar dotenv)
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
  logger.info("Sentry inicializado.");
} else {
  logger.info("Sentry DSN no encontrado, Sentry no se inicializará.");
}

const app = express();

// Middleware de autenticación para Bull Board
export const isBullAuth = (req: Request, res: Response, next: NextFunction) => {
  const user = basicAuth(req);

  if (!user || user.name !== process.env.BULL_USER || user.pass !== process.env.BULL_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Acceso restringido"');
    return res.status(401).send('Autenticación requerida.');
  }
  next();
};

app.set("queues", { // Para acceso en otros módulos si es necesario
  messageQueue,
  sendScheduledMessages
});

const allowedOrigins: string[] = [];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
// Podrías añadir más orígenes desde variables de entorno si es necesario
// ej: process.env.OTHER_ALLOWED_ORIGINS?.split(',').forEach(o => allowedOrigins.push(o));


// Configuración de Bull Board (usando la API más reciente de @bull-board)
if (String(process.env.BULL_BOARD).toLocaleLowerCase() === 'true' && process.env.REDIS_URI_ACK) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const activeQueues = BullQueue.queues
    .filter(q => q && q.bull) // Filtrar colas nulas o sin 'bull'
    .map(queue => new BullAdapter(queue.bull));

  if (activeQueues.length > 0) {
    createBullBoard({
      queues: activeQueues,
      serverAdapter: serverAdapter,
    });
    app.use('/admin/queues', isBullAuth, serverAdapter.getRouter());
    logger.info(`Bull Board UI disponible en /admin/queues`);
  } else {
    logger.warn("Bull Board habilitado pero no se encontraron colas activas para mostrar.");
  }
}


// Middleware Globales
app.use(Sentry.Handlers.requestHandler()); // Debe ser uno de los primeros
app.use(compression());

// Reemplazo de bodyParser con middleware incorporado de Express
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Permitir solicitudes sin 'origin' (como Postman, apps móviles, o curl) o si el origen está en la lista
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origen no permitido por CORS'));
      }
    }
  })
);
app.use(cookieParser());
// app.use(express.json()); // Esta línea es eliminada ya que se configuró arriba con 'limit'

app.use("/public", express.static(uploadConfig.directory));

// Documentación Swagger
setupSwagger(app);

// Rutas Principales de la Aplicación
app.use(routes);

// Manejador de Errores de Sentry (después de las rutas, antes del manejador personalizado)
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// Middleware de Manejo de Errores Personalizado (debe ser el último)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, { statusCode: err.statusCode, path: req.path });
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Para errores inesperados, Sentry ya los habrá capturado si está configurado.
  // Aquí simplemente logueamos y devolvemos un error genérico.
  logger.error("Error interno del servidor:", { message: err.message, stack: err.stack, path: req.path });
  return res.status(500).json({ error: "Error interno del servidor." });
});

export default app;
