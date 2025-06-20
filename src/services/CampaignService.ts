// src/services/CampaignService.ts

import * as Sentry from "@sentry/node";
import { isArray, isEmpty, isNil } from "lodash";
import path from "path";
import moment from "moment";
import { addSeconds, differenceInSeconds } from "date-fns";
import sequelize from "../database";
import { QueryTypes, Op } from "sequelize";

// Helpers y Servicios
import { getIO } from "../libs/socket";
import GetWhatsappWbot from "../helpers/GetWhatsappWbot";
import { getMessageOptions } from "./WbotServices/SendWhatsAppMedia";
import { verifyMediaMessage, verifyMessage } from "./WbotServices/wbotMessageListener";
import ShowTicketService from "./TicketServices/ShowTicketService";

// Modelos
import Campaign from "../models/Campaign";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";
import CampaignSetting from "../models/CampaignSetting";
import CampaignShipping from "../models/CampaignShipping";
import Whatsapp from "../models/Whatsapp";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";

import logger from "../utils/logger";
import { campaignQueue } from "../queues/definitions";

// Tipos de datos para las campañas
interface CampaignSettings { messageInterval: number; longerIntervalAfter: number; greaterInterval: number; variables: any[]; }
interface PrepareContactData { contactId: number; campaignId: number; variables: any[]; }
interface DispatchCampaignData { campaignId: number; campaignShippingId: number; contactListItemId: number; }


class CampaignService {
  private isProcessingVerify: boolean = false;

  // =================================================================
  // MÉTODOS PÚBLICOS (expuestos para ser usados por los jobs)
  // =================================================================

  public async verifyAndQueueCampaigns(): Promise<void> {
    if (this.isProcessingVerify) return;
    this.isProcessingVerify = true;

    try {
      const campaigns: { id: number; scheduledAt: string }[] = await sequelize.query(
        `SELECT id, "scheduledAt" FROM "Campaigns" c
         WHERE "scheduledAt" BETWEEN NOW() AND NOW() + INTERVAL '3 hour' AND status = 'PROGRAMADA'`,
        { type: QueryTypes.SELECT }
      );

      if (campaigns.length > 0) {
        logger.info(`[Campañas] Verificación encontró ${campaigns.length} campañas programadas.`);
        for (const campaign of campaigns) {
          await sequelize.query(
            `UPDATE "Campaigns" SET status = 'EM_ANDAMENTO' WHERE id = ${campaign.id}`
          );
          const delay = moment(campaign.scheduledAt).diff(moment(), "milliseconds");
          campaignQueue.add("ProcessCampaign", { id: campaign.id }, { delay: Math.max(0, delay), priority: 3 });
          logger.info(`[Campañas] Campaña ${campaign.id} encolada para procesar.`);
        }
      }
    } catch (err) {
      Sentry.captureException(err);
      logger.error(`[Campañas] Error al verificar campañas: ${err.message}`);
    } finally {
      this.isProcessingVerify = false;
    }
  }

  public async processCampaign(campaignId: number): Promise<void> {
    try {
      const campaign = await this._getCampaign(campaignId);
      if (!campaign) return;

      const settings = await this._getSettings(campaign);
      const contacts = campaign.contactList.contacts;

      if (isArray(contacts) && contacts.length > 0) {
        let currentDelay = 0;
        for (let i = 0; i < contacts.length; i++) {
          const contact = contacts[i];
          const interval = i > settings.longerIntervalAfter ? settings.greaterInterval : settings.messageInterval;
          currentDelay += this._parseToMilliseconds(interval);

          campaignQueue.add(
            "PrepareContact",
            { contactId: contact.id, campaignId: campaign.id, variables: settings.variables },
            { delay: currentDelay, removeOnComplete: true, attempts: 2 }
          );
        }
        logger.info(`[Campañas] ${contacts.length} contactos de la campaña ${campaignId} han sido encolados para preparación.`);
      }
    } catch (err: any) {
      Sentry.captureException(err);
      logger.error(`[Campañas] Error procesando campaña ${campaignId}: ${err.message}`);
    }
  }

  public async prepareContactForCampaign(data: PrepareContactData): Promise<void> {
    const { contactId, campaignId, variables } = data;
    try {
      const campaign = await this._getCampaign(campaignId);
      const contact = await this._getContact(contactId);
      if (!campaign || !contact) {
        logger.warn(`[Campañas] No se encontró campaña o contacto. Campaña: ${campaignId}, Contacto: ${contactId}`);
        return;
      }

      const [record, created] = await CampaignShipping.findOrCreate({
        where: { campaignId, contactId },
        defaults: {
          number: contact.number,
          contactId,
          campaignId,
          message: this._getInitialMessage(campaign, variables, contact)
        }
      });

      if (!created && !record.deliveredAt) {
        await record.update({ message: this._getInitialMessage(campaign, variables, contact) });
      }

      if (!record.deliveredAt) {
        const nextJob = await campaignQueue.add(
          "DispatchCampaign",
          { campaignId, campaignShippingId: record.id, contactListItemId: contactId },
          { attempts: 2 }
        );
        await record.update({ jobId: String(nextJob.id) });
      }

      await this._verifyAndFinalizeCampaign(campaign);

    } catch (err: any) {
      Sentry.captureException(err);
      logger.error(`[Campañas] Error preparando contacto ${contactId} para campaña ${campaignId}: ${err.message}`);
    }
  }

  public async dispatchCampaignMessage(data: DispatchCampaignData): Promise<void> {
    const { campaignShippingId, campaignId } = data;
    try {
      const campaign = await this._getCampaign(campaignId);
      const campaignShipping = await CampaignShipping.findByPk(campaignShippingId, { include: ["contact"] });

      if (!campaign || !campaign.whatsapp || !campaignShipping) {
        logger.error(`[Campañas] Datos insuficientes para despacho. Campaña: ${campaignId}, Envío: ${campaignShippingId}`);
        return;
      }

      const wbot = await GetWhatsappWbot(campaign.whatsapp);
      const chatId = `${campaignShipping.number}@s.whatsapp.net`;

      if (campaign.openTicket === "enabled") {
        await this._dispatchWithMessageAndTicket(wbot, campaign, campaignShipping, chatId);
      } else {
        await this._dispatchSimpleMessage(wbot, campaign, campaignShipping, chatId);
      }

      await this._verifyAndFinalizeCampaign(campaign);

    } catch (err: any) {
      Sentry.captureException(err);
      await CampaignShipping.update({ deliveredAt: null, confirmationRequestedAt: null }, { where: { id: campaignShippingId } });
      logger.error(`[Campañas] Error al despachar mensaje de campaña ${campaignId}: ${err.message}`);
      throw err; // Lanza el error para que Bull pueda reintentarlo
    }
  }


  // =================================================================
  // MÉTODOS PRIVADOS (helpers internos)
  // =================================================================

  private async _dispatchSimpleMessage(wbot, campaign: Campaign, campaignShipping: CampaignShipping, chatId: string) {
    if (!campaign.mediaPath) {
      await wbot.sendMessage(chatId, { text: campaignShipping.message });
    } else {
      const filePath = path.resolve("public", `company${campaign.companyId}`, campaign.mediaPath);
      const options = await getMessageOptions(campaign.mediaName, filePath, String(campaign.companyId), campaignShipping.message);
      if (Object.keys(options).length) {
        await wbot.sendMessage(chatId, { ...options });
      }
    }
    await campaignShipping.update({ deliveredAt: moment().toDate() });
    logger.info(`[Campañas] Mensaje simple de campaña ${campaign.id} enviado a ${campaignShipping.contact.name}`);
  }

  private async _dispatchWithMessageAndTicket(wbot, campaign: Campaign, campaignShipping: CampaignShipping, chatId: string) {
    const [contact] = await Contact.findOrCreate({
      where: { number: campaignShipping.number, companyId: campaign.companyId },
      defaults: { name: campaignShipping.contact.name, number: campaignShipping.number, email: campaignShipping.contact.email, companyId: campaign.companyId }
    });

    let ticket = await Ticket.findOne({
      where: { contactId: contact.id, companyId: campaign.companyId, whatsappId: campaign.whatsappId, status: ["open", "pending"] }
    });

    if (!ticket) {
      ticket = await Ticket.create({
        contactId: contact.id,
        companyId: campaign.companyId,
        whatsappId: campaign.whatsappId,
        queueId: campaign.queueId,
        userId: campaign.userId,
        status: campaign.statusTicket || 'pending'
      });
    }

    const fullTicket = await ShowTicketService(ticket.id, campaign.companyId);
    let sentMessage;

    if (!campaign.mediaPath) {
      sentMessage = await wbot.sendMessage(chatId, { text: campaignShipping.message });
      await verifyMessage(sentMessage, fullTicket, contact, null, true, false);
    } else {
      const filePath = path.resolve("public", `company${campaign.companyId}`, campaign.mediaPath);
      const options = await getMessageOptions(campaign.mediaName, filePath, String(campaign.companyId), campaignShipping.message);
      if (Object.keys(options).length) {
        sentMessage = await wbot.sendMessage(chatId, { ...options });
        await verifyMediaMessage(sentMessage, fullTicket, contact, null, false, true, wbot);
      }
    }

    await campaignShipping.update({ deliveredAt: moment().toDate() });
    logger.info(`[Campañas] Mensaje con ticket de campaña ${campaign.id} enviado a ${campaignShipping.contact.name}`);
  }

  private _getInitialMessage(campaign: Campaign, variables: any[], contact: ContactListItem): string {
    const messages = this._getCampaignValidMessages(campaign);
    if (messages.length === 0) return "";
    const randomIndex = this._randomValue(0, messages.length - 1);
    const message = this._getProcessedMessage(messages[randomIndex], variables, contact);
    return `\u200c ${message}`;
  }

  private async _getCampaign(id: number): Promise<Campaign | null> {
    return Campaign.findByPk(id, {
      include: [
        { model: ContactList, as: "contactList", include: ["contacts"] },
        { model: Whatsapp, as: "whatsapp" }
      ]
    });
  }

  private async _getContact(id: number): Promise<ContactListItem | null> {
    return ContactListItem.findByPk(id);
  }

  private async _getSettings(campaign: Campaign): Promise<CampaignSettings> {
    const settings = await CampaignSetting.findAll({ where: { companyId: campaign.companyId }, attributes: ["key", "value"] });
    const result: CampaignSettings = { messageInterval: 20, longerIntervalAfter: 20, greaterInterval: 60, variables: [] };
    settings.forEach(s => {
      if (s.key in result) result[s.key] = JSON.parse(s.value);
    });
    return result;
  }

  private _getCampaignValidMessages(campaign: Campaign): string[] {
    const messages: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const msg = campaign[`message${i}`];
      if (!isEmpty(msg) && !isNil(msg)) {
        messages.push(msg);
      }
    }
    return messages;
  }

  private _getProcessedMessage(msg: string, variables: any[], contact: ContactListItem): string {
    let finalMessage = msg;
    if (contact) {
      finalMessage = finalMessage.replace(/{nome}/g, contact.name);
      finalMessage = finalMessage.replace(/{email}/g, contact.email || '');
      finalMessage = finalMessage.replace(/{numero}/g, contact.number);
    }
    if (isArray(variables)) {
      variables.forEach(variable => {
        if (finalMessage.includes(`{${variable.key}}`)) {
          const regex = new RegExp(`{${variable.key}}`, "g");
          finalMessage = finalMessage.replace(regex, variable.value);
        }
      });
    }
    return finalMessage;
  }

  private async _verifyAndFinalizeCampaign(campaign: Campaign) {
    const totalContacts = await ContactListItem.count({ where: { contactListId: campaign.contactListId }});
    const deliveredCount = await CampaignShipping.count({ where: { campaignId: campaign.id, deliveredAt: { [Op.ne]: null } } });

    if (totalContacts > 0 && totalContacts === deliveredCount) {
      await campaign.update({ status: "FINALIZADA", completedAt: moment().toDate() });
      const io = getIO();
      io.of(String(campaign.companyId)).emit(`company-${campaign.companyId}-campaign`, { action: "update", record: campaign });
      logger.info(`[Campañas] Campaña ${campaign.id} finalizada.`);
    }
  }

  private _randomValue(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private _parseToMilliseconds(seconds: number): number {
    return seconds * 1000;
  }
}

export default new CampaignService();
