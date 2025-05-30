import { verify } from "jsonwebtoken";
import authConfig from "../../config/auth";
import * as Yup from "yup";
import { Request, Response } from "express";
// import { getIO } from "../../libs/socket";
import AppError from "../../errors/AppError";
import Plan from "../../models/Plan";

import ListPlansService from "../../services/PlanService/ListPlansService";
import CreatePlanService from "../../services/PlanService/CreatePlanService";
import UpdatePlanService from "../../services/PlanService/UpdatePlanService";
import ShowPlanService from "../../services/PlanService/ShowPlanService";
import FindAllPlanService from "../../services/PlanService/FindAllPlanService";
import DeletePlanService from "../../services/PlanService/DeletePlanService";

interface TokenPayload {
  id: string;
  username: string;
  profile: string;
  companyId: number;
  iat: number;
  exp: number;
}

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
};

type StorePlanData = {
  name: string;
  id?: number | string;
  users: number | 0;
  connections: number | 0;
  queues: number | 0;
  amount: string | "0";
};

type UpdatePlanData = {
  name: string;
  id?: number | string;
  users?: number;
  connections?: number;
  queues?: number;
  amount?: string;
  useWhatsapp?: boolean;
  useFacebook?: boolean;
  useInstagram?: boolean;
  useCampaigns?: boolean;
  useSchedules?: boolean;
  useInternalChat?: boolean;
  useExternalApi?: boolean;
  useKanban?: boolean;
  trial?: boolean;
  trialDays?: number;
  recurrence?: string;
  useOpenAi?: boolean;
  useIntegrations?: boolean;
};

// Swagger documentation

/**
 * @swagger
 * tags:
 *   name: Plans
 *   description: API for managing plans
 */
/**
 * @swagger
 * /plans:
 *  get: 
 *  summary: List all plans by search param and page number
 *  tags: [Plans]
 *  parameters:
 *    - in: query
 *      name: searchParam
 *      description: Search parameter (name, description, etc.)
 *      required: false
 *      schema:
 *        type: string
 *    - in: query
 *      name: pageNumber
 *      description: Page number for pagination
 *      required: false
 *      schema:
 *        type: integer
 *  responses:
 *    200:
 *      description: OK
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            properties:
 *             plans:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string     
 *                   description:
 *                     type: string
 *                   useOpenAi:
 *                     type: boolean
 *                   useIntegrations:
 *                     type: boolean
 *                   useKanban:
 *                     type: boolean
 *                   users:
 *                     type: integer
 *                   connections:
 *                     type: integer
 *                   queues:
 *                     type: integer
 *                   amount:
 *                     type: string
 *                   useWhatsapp:
 *                     type: boolean
 *                   useFacebook:
 *                     type: boolean
 *                   useInstagram:
 *                     type: boolean
 *                   useCampaigns:
 *                     type: boolean
 *                   useSchedules:
 *                     type: boolean
 *                   useInternalChat:
 *                     type: boolean
 *                   useExternalApi:
 *                     type: boolean
 *                   trial:
 *                     type: boolean
 *                   trialDays:
 *                     type: integer
 *                   recurrence:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   updatedAt:
 *                     type: string
 *                     format: date-time  
 *                   deletedAt:
 *                     type: string
 *                     format: date-time
 *             count:
 *               type: integer
 *             hasMore:
 *               type: boolean
 *    400:
 *      description: Bad Request
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            properties:
 *              error:
 *                type: string
 *                description: Error message
 *    500:
 *      description: Internal Server Error
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            properties:
 *              error:
 *                type: string
 *                description: Error message  
 */
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;

  const { plans, count, hasMore } = await ListPlansService({
    searchParam,
    pageNumber
  });

  return res.json({ plans, count, hasMore });
};

/**
 * @swagger
 * /plans:
 *  post: 
 *  summary: Create a new plan
 *  tags: [Plans]
 *  requestBody:
 *    required: true
 *    content:
 *      application/json:
 *        schema:
 *          type: object
 *          properties:
 *            name:
 *              type: string
 *            users:
 *              type: integer
 *            connections:
 *              type: integer
 *            queues:
 *              type: integer
 *            amount:
 *              type: string
 *            useWhatsapp:
 *              type: boolean
 *            useFacebook:
 *              type: boolean
 *            useInstagram:
 *              type: boolean
 *            useCampaigns:
 *              type: boolean
 *            useSchedules:
 *              type: boolean
 *            useInternalChat:
 *              type: boolean
 *            useExternalApi:
 *              type: boolean
 *            trial:
 *              type: boolean
 *            trialDays:
 *              type: integer
 *            recurrence:
 *              type: string
 */

export const list = async (req: Request, res: Response): Promise<Response> => {
  const plans: Plan[] = await FindAllPlanService();

  return res.status(200).json(plans);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const newPlan: StorePlanData = req.body;

  const schema = Yup.object().shape({
    name: Yup.string().required(),
    users: Yup.number().required(),
    connections: Yup.number().required(),
    queues: Yup.number().required(),
    amount: Yup.string().required(),
    useFacebook: Yup.boolean(),
    useInstagram: Yup.boolean(),
    useWhatsapp: Yup.boolean(),
    useCampaigns: Yup.boolean(),
    useExternalApi: Yup.boolean(),
    useInternalChat: Yup.boolean(),
    useSchedules: Yup.boolean(),
    trial: Yup.boolean(),
    trialDays: Yup.number(),
    recurrence: Yup.string().required(),
    useKanban: Yup.boolean()
  });

  try {
    await schema.validate(newPlan);
  } catch (err) {
    throw new AppError(err.message);
  }

  const plan = await CreatePlanService(newPlan);

  return res.status(200).json(plan);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const plan = await ShowPlanService(id);

  return res.status(200).json(plan);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const planData: UpdatePlanData = req.body;
  const { id } = req.params;

  const schema = Yup.object().shape({
    name: Yup.string().required(),
    users: Yup.number().required(),
    connections: Yup.number().required(),
    queues: Yup.number().required(),
    amount: Yup.string().required(),
    useFacebook: Yup.boolean(),
    useInstagram: Yup.boolean(),
    useWhatsapp: Yup.boolean(),
    useCampaigns: Yup.boolean(),
    useExternalApi: Yup.boolean(),
    useInternalChat: Yup.boolean(),
    useSchedules: Yup.boolean(),
    trial: Yup.boolean(),
    trialDays: Yup.number(),
    recurrence: Yup.string().required(),
    useKanban: Yup.boolean()
  });

  try {
    await schema.validate(planData);
  } catch (err) {
    throw new AppError(err.message);
  }

  const {
    name,
    users,
    connections,
    queues,
    amount,
    useWhatsapp,
    useFacebook,
    useInstagram,
    useCampaigns,
    useSchedules,
    useInternalChat,
    useExternalApi,
    trial,
    trialDays,
    recurrence,
    useKanban,
    useIntegrations,
    useOpenAi
  } = planData;

  const plan = await UpdatePlanService({
    id,
    name,
    users,
    connections,
    queues,
    amount,
    useWhatsapp,
    useFacebook,
    useInstagram,
    useCampaigns,
    useSchedules,
    useInternalChat,
    useExternalApi,
    useKanban,
    useIntegrations,
    useOpenAi
  });
  return res.status(200).json(plan);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;

  const plan = await DeletePlanService(id);

  return res.status(200).json(plan);
};
