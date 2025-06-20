// src/lib/wbot/WhatsappRepository.ts

import Whatsapp from "../../models/Whatsapp";
import DeleteBaileysService from "../../services/BaileysServices/DeleteBaileysService";
import AppError from "../../errors/AppError";
import cacheLayer from "../cache";
import { FindOptions } from "sequelize/types";
import Queue from "../../models/Queue";
import Prompt from "../../models/Prompt";

// Interfaz que define el contrato del repositorio
export interface IWhatsappRepository {
  find(id: number): Promise<Whatsapp | null>;
  update(id: number, data: Partial<Whatsapp>): Promise<void>;
  delete(id: number): Promise<void>;
  clearSessionCache(id: number): Promise<void>;
}



// Implementación concreta usando Sequelize
export class WhatsappRepository implements IWhatsappRepository {
  public async find(id: number): Promise<Whatsapp | null> {
    const whatsapp = await Whatsapp.findByPk(id);
    if (!whatsapp) {
      throw new AppError("ERR_WAPP_NOT_FOUND");
    }
    return whatsapp;
  }

  public async update(id: number, data: Partial<Whatsapp>): Promise<void> {
    const whatsapp = await this.find(id);
    if (whatsapp) {
      await whatsapp.update(data);
    }
  }

  public async delete(id: number): Promise<void> {
    await DeleteBaileysService(id);
  }

  public async clearSessionCache(id: number): Promise<void> {
    await cacheLayer.delFromPattern(`sessions:${id}:*`);
  }

  public async findAllByCompany(companyId: number, excludeSession = false): Promise<Whatsapp[]> {
    const options: FindOptions = {
      where: { companyId },
      include: [
        {
          model: Queue,
          as: "queues",
          attributes: ["id", "name", "color", "greetingMessage"]
        },
        {
          model: Prompt,
          as: "prompt",
        }
      ]
    };

    if (excludeSession) {
      options.attributes = { exclude: ["session"] };
    }

    return Whatsapp.findAll(options);
  }
}


