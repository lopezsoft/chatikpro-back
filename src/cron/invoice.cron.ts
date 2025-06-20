// src/cron/invoice.cron.ts

import { CronJob } from 'cron';
import moment from 'moment';
import { QueryTypes } from 'sequelize';
import * as Sentry from "@sentry/node";

import Company from '../models/Company';
import Plan from '../models/Plan';
import Whatsapp from '../models/Whatsapp';
import sequelize from '../database';
import logger from '../utils/logger';
import { sessionManager } from '../libs/wbot/SessionManager';

async function checkAndGenerateInvoices() {
  const companies = await Company.findAll();

  for (const company of companies) {
    try {
      const { status, dueDate, id: companyId, planId } = company;
      const vencimento = moment(dueDate).format("DD/MM/yyyy");
      const hoje = moment().format("DD/MM/yyyy");
      const diasDeAtraso = moment(hoje, "DD/MM/yyyy").diff(moment(vencimento, "DD/MM/yyyy"), 'days');

      if (status === true) {
        if (diasDeAtraso > 3) {
          logger.info(`EMPRESA: ${companyId} vencida hace más de 3 días. Desactivando...`);
          await company.update({ status: false });
          await deactivateWhatsappConnections(companyId);
        } else {
          await findOrCreateOpenInvoice(company);
        }
      }
    } catch (error) {
      logger.error(`Error procesando facturación para la empresa ${company.id}:`, error);
      Sentry.captureException(error);
    }
  }
}

async function deactivateWhatsappConnections(companyId: number) {
  logger.info(`Desactivando conexiones de WhatsApp para la empresa: ${companyId}`);
  try {
    const whatsapps = await Whatsapp.findAll({ where: { companyId } });
    for (const whatsapp of whatsapps) {
      if (whatsapp.session) {
        await whatsapp.update({ status: "DISCONNECTED", session: "" });

        // --> CAMBIO AQUÍ: Usamos el sessionManager para obtener y desloguear la sesión.
        try {
          const wbot = sessionManager.getSession(whatsapp.id);
          await wbot.logout();
          logger.info(`WhatsApp ${whatsapp.id} de la empresa ${companyId} ha sido desconectado.`);
        } catch (sessionError) {
          // Este catch maneja el caso donde la sesión no está activa en memoria, lo cual es esperado.
          logger.warn(`No se encontró una sesión activa en memoria para el WhatsApp ${whatsapp.id} al intentar desloguear. Se continuará igualmente.`);
        }
      }
    }
  } catch (error) {
    logger.error(`Error al desactivar conexiones de WhatsApp para la empresa ${companyId}:`, error);
    Sentry.captureException(error);
  }
}

async function findOrCreateOpenInvoice(company: Company) {
  // ... (el resto de la función permanece igual)
  const { id: companyId, dueDate, planId } = company;
  const date = moment(dueDate).format();
  const vencimento = moment(dueDate).format("DD/MM/yyyy");

  const plan = await Plan.findByPk(planId);
  if (!plan) {
    logger.warn(`Plan con ID ${planId} no encontrado para la empresa ${companyId}`);
    return;
  }

  const openInvoices: any[] = await sequelize.query(
    `SELECT * FROM "Invoices" WHERE "companyId" = :companyId AND "status" = 'open'`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );

  const existingInvoice = openInvoices.find(invoice => moment(invoice.dueDate).format("DD/MM/yyyy") === vencimento);

  if (existingInvoice) {
    return;
  }

  if (openInvoices.length > 0) {
    await sequelize.query(
      `UPDATE "Invoices" SET "dueDate" = :date WHERE "id" = :invoiceId`,
      { replacements: { date, invoiceId: openInvoices[0].id }, type: QueryTypes.UPDATE }
    );
    logger.info(`Factura ID: ${openInvoices[0].id} actualizada para la empresa ${companyId}.`);
  } else {
    const valuePlan = plan.amount.replace(",", ".");
    await sequelize.query(
      `INSERT INTO "Invoices" ("companyId", "dueDate", detail, status, value, users, connections, queues, "updatedAt", "createdAt")
       VALUES (:companyId, :date, :planName, 'open', :valuePlan, :users, :connections, :queues, :now, :now)`,
      {
        replacements: {
          companyId, date, planName: plan.name, valuePlan,
          users: plan.users, connections: plan.connections, queues: plan.queues,
          now: moment().format()
        },
        type: QueryTypes.INSERT
      }
    );
    logger.info(`Nueva factura generada para la empresa: ${companyId}.`);
  }
}

export function initializeInvoiceCron() {
  // Se ejecuta cada 30 minutos.
  const job = new CronJob('*/30 * * * *', checkAndGenerateInvoices);
  job.start();
  logger.info("Cron de facturación inicializado.");
}
