import { WhatsappRepository } from "../../libs/wbot/WhatsappRepository";
import Whatsapp from "../../models/Whatsapp";

interface Request {
  companyId: number;
  session?: number | string;
}

const ListWhatsAppsService = async ({ companyId, session }: Request): Promise<Whatsapp[]> => {
  const repository = new WhatsappRepository();
  const excludeSessionData = session !== undefined && session == 0;

  return await repository.findAllByCompany(companyId, excludeSessionData);
};

export default ListWhatsAppsService;
