// src/lib/wbot/WhatsappRepository.ts

import Whatsapp from "../../models/Whatsapp";
import DeleteBaileysService from "../../services/BaileysServices/DeleteBaileysService";
import AppError from "../../errors/AppError";
import cacheLayer from "../cache";

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
}
