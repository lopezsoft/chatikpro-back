import {
  proto,
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
  initAuthCreds,
  BufferJSON
} from "@whiskeysockets/baileys";
import cacheLayer from "../libs/cache";
import Whatsapp from "../models/Whatsapp";

export const useCacheAuthState = async (
  whatsapp: Whatsapp
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  const writeData = (data: any, key: string) => {
    const redisKey = `sessions:${whatsapp.id}:${key}`;
    return cacheLayer.set(redisKey, JSON.stringify(data, BufferJSON.replacer));
  };

  const readData = async (key: string) => {
    try {
      const redisKey = `sessions:${whatsapp.id}:${key}`;
      const data = await cacheLayer.get(redisKey);
      if (data) {
        return JSON.parse(data, BufferJSON.reviver);
      }
      return null;
    } catch (error) {
      console.error(`Error leyendo datos de caché para la clave ${key}:`, error);
      return null;
    }
  };

  const removeData = (key: string) => {
    const redisKey = `sessions:${whatsapp.id}:${key}`;
    return cacheLayer.del(redisKey);
  };

  const creds: AuthenticationCreds =
    (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async id => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async data => {
          const tasks: Promise<any>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: async () => {
      await writeData(creds, "creds");
    }
  };
};
