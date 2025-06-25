import { WebhookModel } from "../../models/Webhook";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { ActionsWebhookService } from "./ActionsWebhookService";
import Whatsapp from "../../models/Whatsapp";
import { IConnections, INodes, RequestLocal } from "../../contracts/WBot";



const DispatchWebHookService = async ({
  companyId,
  hashId,
  data,
  req
}: RequestLocal): Promise<WebhookModel> => {
  try {
    const webhook = await WebhookModel.findOne({
      where: {
        company_id: companyId,
        hash_id: hashId
      }
    });

    const config = {
      ...webhook.config,
      lastRequest: {
        ...data
      }
    };

    const requestAll = webhook.requestAll + 1;

    const webhookUpdate = await WebhookModel.update(
      { config, requestAll },
      {
        where: { hash_id: hashId, company_id: companyId }
      }
    );

    if (webhook.config["details"]) {
      const flow = await FlowBuilderModel.findOne({
        where: {
          id: webhook.config["details"].idFlow
        }
      });
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];

      const nextStage = connections[0].source;

      const { count, rows } = await Whatsapp.findAndCountAll({
        where: {
          companyId: companyId
        }
      });

      const whatsappIds = [];
      rows.forEach(usuario => {
        whatsappIds.push(usuario.toJSON());
      });
      ActionsWebhookService(
        0,
        webhook.config["details"].idFlow,
        companyId,
        nodes,
        connections,
        nextStage,
        data,
        webhook.config["details"],
        hashId
      );
    }

    return webhook;
  } catch (error) {
    console.error("Erro ao inserir o usuário:", error);

    return error;
  }
};

export default DispatchWebHookService;
