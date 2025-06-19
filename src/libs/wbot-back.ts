import * as Sentry from "@sentry/node";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  WAMessage,
  WAMessageKey,
  WASocket,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  proto,
} from "@whiskeysockets/baileys";
import { FindOptions } from "sequelize/types";
import Whatsapp from "../models/Whatsapp";
import logger from "../utils/logger";
import MAIN_LOGGER from "@whiskeysockets/baileys/lib/Utils/logger";
import { useMultiFileAuthState } from "../helpers/useMultiFileAuthState";
import { Boom } from "@hapi/boom";
import AppError from "../errors/AppError";
import { getIO } from "./socket";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import cacheLayer from "./cache";
import ImportWhatsAppMessageService from "../services/WhatsappService/ImportWhatsAppMessageService";
import { add } from "date-fns";
import moment from "moment";
import { getTypeMessage, isValidMsg } from "../services/WbotServices/wbotMessageListener";
import { addLogs } from "../helpers/addLogs";
import NodeCache from 'node-cache';
import { Store } from "./store";

const msgRetryCounterCache = new NodeCache({
  stdTTL: 600,
  maxKeys: 1000,
  checkperiod: 300,
  useClones: false
});
const msgCache = new NodeCache({
  stdTTL: 60,
  maxKeys: 1000,
  checkperiod: 300,
  useClones: false
});

const loggerBaileys = MAIN_LOGGER.child({});
loggerBaileys.level = "info";

type Session = WASocket & {
  id?: number;
  store?: Store;
};

const sessions: Session[] = [];

const retriesQrCodeMap = new Map<number, number>();

// Mapa para rastrear los intentos de reconexión y los tiempos de espera para el backoff exponencial
const reconnectionAttempts = new Map<number, { count: number; nextAttemptAt: number }>();
const MAX_RECONNECTION_ATTEMPTS = 5; // Número máximo de intentos de reconexión automática
const INITIAL_RECONNECTION_DELAY_MS = 5000; // Retraso inicial de 5 segundos
const MAX_RECONNECTION_DELAY_MS = 300000; // Retraso máximo de 5 minutos (5 * 60 * 1000)

export default function msg() {
  return {
    get: (key: WAMessageKey) => {
      const { id } = key;
      if (!id) return;
      let data = msgCache.get(id);
      if (data) {
        try {
          let msg = JSON.parse(data as string);
          return msg?.message;
        } catch (error) {
          logger.error(error);
        }
      }
    },
    save: (msg: WAMessage) => {
      const { id } = msg.key;
      const msgtxt = JSON.stringify(msg);
      try {
        msgCache.set(id as string, msgtxt);
      } catch (error) {
        logger.error(error);
      }
    }
  }
}

export const getWbot = (whatsappId: number): Session => {
  const sessionIndex = sessions.findIndex(s => s.id === whatsappId);

  if (sessionIndex === -1) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
  return sessions[sessionIndex];
};

export const restartWbot = async (
  companyId: number
): Promise<void> => {
  try {
    const options: FindOptions = {
      where: {
        companyId,
      },
      attributes: ["id"],
    }

    const whatsapp = await Whatsapp.findAll(options);

    whatsapp.map(async c => {
      const sessionIndex = sessions.findIndex(s => s.id === c.id);
      if (sessionIndex !== -1) {
        sessions[sessionIndex].ws.close();
      }

    });

  } catch (err) {
    logger.error(err);
  }
};

export const removeWbot = async (
  whatsappId: number,
  isLogout = true
): Promise<void> => {
  try {
    const sessionIndex = sessions.findIndex(s => s.id === whatsappId);
    if (sessionIndex !== -1) {
      if (isLogout) {
        sessions[sessionIndex].logout();
        sessions[sessionIndex].ws.close();
      }

      sessions.splice(sessionIndex, 1);
    }
  } catch (err) {
    logger.error(err);
  }
};

export var dataMessages: any = {};

export const msgDB = msg();

export const initWASocket = async (whatsapp: Whatsapp): Promise<Session> => {
  return new Promise((resolve, reject) => { // MODIFICADO: El ejecutor de la promesa ya no es async.
    (async () => { // IIFE para contener la lógica asíncrona.
      try { // MODIFICADO: El bloque try ahora envuelve todo el contenido del IIFE.
        const io = getIO();

        const whatsappUpdate = await Whatsapp.findOne({
          where: { id: whatsapp.id }
        });

        if (!whatsappUpdate) return;

        const { id, name, allowGroup, companyId } = whatsappUpdate;

        // const { version, isLatest } = await fetchLatestWaWebVersion({});
        const { version, isLatest } = await fetchLatestBaileysVersion();
        // const versionB = [2, 2410, 1]; // Constante no utilizada eliminada
        // logger.info(`using WA v${version.join(".")}, isLatest: ${isLatest}`);
        logger.info(`Versión: v${version.join(".")}, isLatest: ${isLatest}`);
        logger.info(`Starting session ${name}`);
        // let retriesQrCode = 0; // Variable no utilizada eliminada

        let wsocket: Session = null;
        const { state, saveCreds } = await useMultiFileAuthState(whatsapp);

        wsocket = makeWASocket({
          version,
          logger: loggerBaileys,
          printQRInTerminal: false,
          // auth: state as AuthenticationState,
          auth: {
            creds: state.creds,
            /** caching makes the store faster to send/recv messages */
            keys: makeCacheableSignalKeyStore(state.keys, logger),
          },
          generateHighQualityLinkPreview: true,
          linkPreviewImageThumbnailWidth: 192,
          // shouldIgnoreJid: jid => isJidBroadcast(jid),

          shouldIgnoreJid: (jid) => {
            //   // const isGroupJid = !allowGroup && isJidGroup(jid)
            return isJidBroadcast(jid) || (!allowGroup && isJidGroup(jid)) //|| jid.includes('newsletter')
          },
          browser: Browsers.appropriate("Desktop"),
          defaultQueryTimeoutMs: undefined,
          msgRetryCounterCache,
          markOnlineOnConnect: false,
          retryRequestDelayMs: 500,
          maxMsgRetryCount: 5,
          emitOwnEvents: true,
          fireInitQueries: true,
          transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
          connectTimeoutMs: 25_000,
          // keepAliveIntervalMs: 60_000,
          getMessage: msgDB.get,
          patchMessageBeforeSending(message) {
            if (message.deviceSentMessage?.message?.listMessage?.listType === proto.Message.ListMessage.ListType.PRODUCT_LIST) {
              message = JSON.parse(JSON.stringify(message));
              message.deviceSentMessage.message.listMessage.listType = proto.Message.ListMessage.ListType.SINGLE_SELECT;
            }
            if (message.listMessage?.listType == proto.Message.ListMessage.ListType.PRODUCT_LIST) {
              message = JSON.parse(JSON.stringify(message));

              message.listMessage.listType = proto.Message.ListMessage.ListType.SINGLE_SELECT;
            }
            return message; // Añadí este retorno que faltaba
          }
        });




        setTimeout(async () => {
          const wpp = await Whatsapp.findByPk(whatsapp.id);
          // console.log("Status:::::",wpp.status)
          if (wpp?.importOldMessages && wpp.status === "CONNECTED") {
            let dateOldLimit = new Date(wpp.importOldMessages).getTime();
            let dateRecentLimit = new Date(wpp.importRecentMessages).getTime();

            addLogs({
              fileName: `preparingImportMessagesWppId${whatsapp.id}.txt`, forceNewFile: true,
              text: `Esperando conexión para iniciar la importación de mensajes:
  Nombre de Whatsapp: ${wpp.name}
  Id de Whatsapp: ${wpp.id}
  Creación del archivo de logs: ${moment().format("DD/MM/YYYY HH:mm:ss")}
  Fecha de inicio de importación seleccionada: ${moment(dateOldLimit).format("DD/MM/YYYY HH:mm:ss")}
  Fecha final de importación seleccionada: ${moment(dateRecentLimit).format("DD/MM/YYYY HH:mm:ss")}
  `})

            const statusImportMessages = new Date().getTime();

            await wpp.update({
              statusImportMessages
            });
            wsocket.ev.on("messaging-history.set", async (messageSet: any) => {
              //if(messageSet.isLatest){

              const statusImportMessages = new Date().getTime();

              await wpp.update({
                statusImportMessages
              });
              const whatsappId = whatsapp.id;
              let filteredMessages = messageSet.messages
              let filteredDateMessages = []
              filteredMessages.forEach(msg => {
                const timestampMsg = Math.floor(msg.messageTimestamp["low"] * 1000)
                if (isValidMsg(msg) && dateOldLimit < timestampMsg && dateRecentLimit > timestampMsg) {
                  if (msg.key?.remoteJid.split("@")[1] != "g.us") {
                    addLogs({
                      fileName: `preparingImportMessagesWppId${whatsapp.id}.txt`, text: `Añadiendo mensaje para postprocesamiento:
  No es Mensaje de GRUPO >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  Fecha y hora del mensaje: ${moment(timestampMsg).format("DD/MM/YYYY HH:mm:ss")}
  Contacto del Mensaje : ${msg.key?.remoteJid}
  Tipo de mensaje : ${getTypeMessage(msg)}

  `})
                    filteredDateMessages.push(msg)
                  } else {
                    if (wpp?.importOldMessagesGroups) {
                      addLogs({
                        fileName: `preparingImportMessagesWppId${whatsapp.id}.txt`, text: `Añadiendo mensaje para postprocesamiento:
  Mensaje de GRUPO >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  Fecha y hora del mensaje: ${moment(timestampMsg).format("DD/MM/YYYY HH:mm:ss")}
  Contacto del Mensaje : ${msg.key?.remoteJid}
  Tipo de mensaje : ${getTypeMessage(msg)}

  `})
                      filteredDateMessages.push(msg)
                    }
                  }
                }

              });


              if (!dataMessages?.[whatsappId]) {
                dataMessages[whatsappId] = [];

                dataMessages[whatsappId].unshift(...filteredDateMessages);
              } else {
                dataMessages[whatsappId].unshift(...filteredDateMessages);
              }

              setTimeout(async () => {
                const wpp = await Whatsapp.findByPk(whatsappId);




                io.of(String(companyId))
                  .emit(`importMessages-${wpp.companyId}`, {
                    action: "update",
                    status: { this: -1, all: -1 }
                  });



                io.of(String(companyId))
                  .emit(`company-${companyId}-whatsappSession`, {
                    action: "update",
                    session: wpp
                  });
                //console.log(JSON.stringify(wpp, null, 2));
              }, 500);

              setTimeout(async () => {


                const wpp = await Whatsapp.findByPk(whatsappId);

                if (wpp?.importOldMessages) {
                  let isTimeStamp = !isNaN(
                    new Date(Math.floor(parseInt(wpp?.statusImportMessages))).getTime()
                  );

                  if (isTimeStamp) {
                    const ultimoStatus = new Date(
                      Math.floor(parseInt(wpp?.statusImportMessages))
                    ).getTime();
                    const dataLimite = +add(ultimoStatus, { seconds: +45 }).getTime();

                    if (dataLimite < new Date().getTime()) {
                      //console.log("Pronto para come?ar")
                      ImportWhatsAppMessageService(wpp.id)
                      wpp.update({
                        statusImportMessages: "Running"
                      })

                    } else {
                      //console.log("Aguardando inicio")
                    }
                  }
                }
                io.of(String(companyId))
                  .emit(`company-${companyId}-whatsappSession`, {
                    action: "update",
                    session: wpp
                  });
              }, 1000 * 45);

            });
          }

        }, 2500);
        // Escucha eventos de mensajes entrantes.
        wsocket.ev.on(
          "connection.update",
          async ({ connection, lastDisconnect, qr }) => {
            logger.info(
              `[SESIÓN: ${name} | ID: ${whatsapp.id}] Estado de conexión: ${connection || ""}. Razón: ${lastDisconnect?.error?.message || "N/A"}`
            );

            //================================================================================
            // CASO 1: Conexión exitosa
            //================================================================================
            if (connection === "open") {
              await whatsapp.update({
                status: "CONNECTED",
                qrcode: "",
                retries: 0,
                number: wsocket.type === "md"
                  ? jidNormalizedUser((wsocket as WASocket).user.id).split("@")[0]
                  : "-",
              });

              io.of(String(companyId)).emit(`company-${whatsapp.companyId}-whatsappSession`, {
                action: "update",
                session: whatsapp,
              });

              const sessionIndex = sessions.findIndex((s) => s.id === whatsapp.id);
              if (sessionIndex === -1) {
                wsocket.id = whatsapp.id;
                sessions.push(wsocket);
              }

              // Al conectar, reseteamos cualquier intento de reconexión previo.
              reconnectionAttempts.delete(id);
              retriesQrCodeMap.delete(id);

              // Resolvemos la promesa principal de initWASocket para notificar que el bot está listo.
              resolve(wsocket);
            }

            //================================================================================
            // CASO 2: La conexión se cierra
            //================================================================================
            if (connection === "close") {
              const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
              let shouldReconnect = false;

              // Usamos un switch para determinar la acción a tomar según el código de error.
              // Es mucho más legible y mantenible que un if/else complejo.
              switch (statusCode) {
                case DisconnectReason.connectionLost:
                case DisconnectReason.connectionClosed:
                case DisconnectReason.timedOut:
                case DisconnectReason.restartRequired:
                  // Estos son errores recuperables, activamos la reconexión.
                  shouldReconnect = true;
                  break;

                case DisconnectReason.loggedOut:
                  // Desconexión definitiva. La sesión ya no es válida.
                  logger.error(`[SESIÓN: ${name} | ID: ${id}] Desconexión por Logout. Se requiere nuevo QR.`);
                  // No se reconecta, se realiza una limpieza completa.
                  break;

                case DisconnectReason.badSession:
                  // La sesión es inválida. Suele requerir borrar la carpeta de sesión y escanear de nuevo.
                  logger.error(`[SESIÓN: ${name} | ID: ${id}] Sesión corrupta (badSession). Se requiere nuevo QR.`);
                  // No se reconecta, limpieza completa.
                  break;

                case DisconnectReason.connectionReplaced:
                  // Otra conexión reemplazó a esta. No hacer nada, la otra instancia tomará el control.
                  logger.warn(`[SESIÓN: ${name} | ID: ${id}] Conexión reemplazada.`);
                  break;

                case DisconnectReason.multideviceMismatch:
                  // Este error es ambiguo. A veces se soluciona reiniciando, pero si persiste,
                  // es un problema de credenciales. Lo trataremos como fatal para estar seguros.
                  logger.error(`[SESIÓN: ${name} | ID: ${id}] Multidevice Mismatch. Tratado como fatal. Se requiere nuevo QR.`);
                  break;

                default:
                  // Para cualquier otro código de error, asumimos que no es recuperable por seguridad.
                  logger.error(`[SESIÓN: ${name} | ID: ${id}] Desconexión con código no manejado: ${statusCode}.`);
                  break;
              }

              if (shouldReconnect) {
                // --- INICIO DE LÓGICA DE BACKOFF EXPONENCIAL ---
                const attemptInfo = reconnectionAttempts.get(id) || { count: 0, nextAttemptAt: Date.now() };

                if (attemptInfo.count >= MAX_RECONNECTION_ATTEMPTS) {
                  logger.error(`[SESIÓN: ${name} | ID: ${id}] Límite de ${MAX_RECONNECTION_ATTEMPTS} reintentos de reconexión alcanzado. Abortando.`);
                  // Si superamos los reintentos, realizamos la limpieza completa.
                  await handleFatalDisconnection();
                  return;
                }

                attemptInfo.count++;
                const delay = Math.min(INITIAL_RECONNECTION_DELAY_MS * Math.pow(2, attemptInfo.count - 1), MAX_RECONNECTION_DELAY_MS);
                attemptInfo.nextAttemptAt = Date.now() + delay;
                reconnectionAttempts.set(id, attemptInfo);

                logger.info(`[SESIÓN: ${name} | ID: ${id}] Intento de reconexión ${attemptInfo.count}/${MAX_RECONNECTION_ATTEMPTS}. Próximo intento en ${delay / 1000}s.`);

                // Programamos el reinicio.
                removeWbot(id, false);
                setTimeout(() => {
                  StartWhatsAppSession(whatsapp, companyId).catch(err => {
                    logger.error(`[SESIÓN: ${name} | ID: ${id}] Fallo crítico en StartWhatsAppSession durante el reintento: ${err.message}`);
                    // Si el propio servicio de reinicio falla, podríamos considerar terminar el proceso
                    // o realizar una limpieza completa aquí también.
                    handleFatalDisconnection();
                  });
                }, delay);
                // --- FIN DE LÓGICA DE BACKOFF EXPONENCIAL ---
              } else if (statusCode !== DisconnectReason.connectionReplaced) {
                // Si no debemos reconectar (y no fue una simple sustitución de conexión), es un error fatal.
                await handleFatalDisconnection();
              }
            }

            //================================================================================
            // CASO 3: Se genera un código QR
            //================================================================================
            if (qr !== undefined) {
              const retries = retriesQrCodeMap.get(id) || 0;

              if (retries >= 3) {
                logger.warn(`[SESIÓN: ${name} | ID: ${id}] Límite de reintentos de QR (3) alcanzado. Abortando.`);
                await handleFatalDisconnection(); // Usamos la función de limpieza centralizada.
                return;
              }

              logger.info(`[SESIÓN: ${name} | ID: ${id}] Generando QR. Intento: ${retries + 1}`);
              retriesQrCodeMap.set(id, retries + 1);

              await whatsapp.update({ qrcode: qr, status: "qrcode", number: "" });

              if (!sessions.some(s => s.id === id)) {
                wsocket.id = id;
                sessions.push(wsocket);
              }

              io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
                action: "update",
                session: whatsapp,
              });
            }

            // Función de ayuda para centralizar la limpieza en caso de error fatal.
            async function handleFatalDisconnection() {
              logger.info(`[SESIÓN: ${name} | ID: ${id}] Ejecutando limpieza completa de la sesión.`);
              await whatsapp.update({ status: "PENDING", session: "", qrcode: "" });
              await DeleteBaileysService(id);
              await cacheLayer.delFromPattern(`sessions:${id}:*`);
              io.of(String(companyId)).emit(`company-${id}-whatsappSession`, {
                action: "update",
                session: whatsapp,
              });
              removeWbot(id, false);
              reconnectionAttempts.delete(id);
              retriesQrCodeMap.delete(id);

              // Es crucial remover los listeners para evitar fugas de memoria.
              wsocket.ev.removeAllListeners("connection.update");

              // Rechazamos la promesa para que el código que llamó a initWASocket sepa que falló.
              reject(new Error("Fatal disconnection"));
            }
          }
        );
        wsocket.ev.on("creds.update", saveCreds);
        // wsocket.store = store;
        // store.bind(wsocket.ev);
      } catch (error) { // MODIFICADO: Bloque catch robustecido dentro del IIFE.
        Sentry.captureException(error);
        logger.error(`[initWASocket] Error durante la inicialización de la sesión para ${whatsapp.name} (ID: ${whatsapp.id}): ${error.message}`, error.stack);
        // Intenta actualizar el estado de WhatsApp a DISCONNECTED y notificar a la UI.
        try {
            const whatsappExists = await Whatsapp.findByPk(whatsapp.id);
            if (whatsappExists) { // Asegurarse de que el registro de WhatsApp aún existe.
                await Whatsapp.update({ status: "DISCONNECTED", qrcode: "", session: "" }, { where: { id: whatsapp.id } });
                const ioInstance = getIO(); // Obtener instancia de IO.
                // Emitir actualización a la UI.
                ioInstance.of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-whatsappSession`, {
                    action: "update",
                    // Usar .get({ plain: true }) para obtener un objeto simple si whatsapp es una instancia de Sequelize.
                    session: { ...(whatsapp.get ? whatsapp.get({ plain: true }) : whatsapp), status: "DISCONNECTED", qrcode: "", session: "" }
                });
            }
        } catch (dbUpdateError) {
            logger.error(`[initWASocket] Falló al actualizar el estado de WhatsApp a DISCONNECTED después de un error de inicialización: ${dbUpdateError.message}`);
        }
        reject(error); // Rechaza la promesa principal con el error.
      }
    })(); // Invoca el IIFE.
  }); // Cierra new Promise. El try-catch externo anterior ha sido eliminado/integrado.
};
