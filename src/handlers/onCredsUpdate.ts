
import { BaileysClient } from "../libs/wbot/BaileysClient";

export async function onCredsUpdate(client: BaileysClient): Promise<void> {
  await client.saveCreds();
}
