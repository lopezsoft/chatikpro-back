// Define la estructura de datos que necesita este servicio
import { MessageUpsertType, proto, WAMessage, WASocket } from "@whiskeysockets/baileys";
import OpenAI from "openai";
import Ticket from "../models/Ticket";
import QueueIntegrations from "../models/QueueIntegrations";
import { Session } from "../utils/types";


export interface TokenPayload {
  id: string;
  username: string;
  profile: string;
  companyId: number;
  iat: number;
  exp: number;
}

export interface MessagePayload {
  msg: WAMessage;
  wbot: Session;
  companyId: number;
  isImported: boolean;
}

export interface NumberPhrase {
  number: string,
  name: string,
  email: string
}

export interface RequestLocal {
  companyId: number;
  hashId: string;
  data: any;
  req: Request;
}

export interface IConnections {
  source: string;
  sourceHandle: null | string;
  target: string;
  targetHandle: null | string;
  id: string;
}

export interface IArrayOption {
  number: number
  value: string
}

export interface INodes {
  id: string;
  position: { x: number; y: number };
  data: {
    label: string;
    sec?: string
    message?: string
    arrayOption?: IArrayOption[]
    typebotIntegration?: QueueIntegrations
  };
  type: string;
  style: { backgroundColor: string; color: string };
  width: number;
  height: number;
  selected: boolean;
  positionAbsolute: { x: number; y: number };
  dragging: boolean;
}

export interface webhookCustom {
  config: null | {
    lastRequest: {};
    keys: {};
  };
}

export interface IAddContact {
  companyId: number;
  name: string;
  phoneNumber: string;
  email?: string;
  dataMore?: any;
}

export interface TicketData {
  status?: string;
  userId?: number | null;
  queueId?: number | null;
  isBot?: boolean;
  queueOptionId?: number;
  sendFarewellMessage?: boolean;
  amountUsedBotQueues?: number;
  lastMessage?: string;
  integrationId?: number;
  useIntegration?: boolean;
  unreadMessages?: number;
  msgTransfer?: string;
  isTransfered?: boolean;
}

interface Response {
  ticket: Ticket;
  oldStatus: string;
  oldUserId: number | undefined;
}

export interface IMessagePayload {
  msg: WAMessage;
  wbot: WASocket;
  companyId: number;
}


export interface ImessageUpsert {
  messages: proto.IWebMessageInfo[];
  type: MessageUpsertType;
}

export interface IMe {
  name: string;
  id: string;
}

export interface ISessionOpenAi extends OpenAI {
  id?: number;
}

export interface MessageData {
  wid: string;
  ticketId: number;
  body: string;
  contactId?: number;
  fromMe?: boolean;
  read?: boolean;
  mediaType?: string;
  mediaUrl?: string;
  ack?: number;
  queueId?: number;
  channel?: string;
  ticketTrakingId?: number;
  isPrivate?: boolean;
  ticketImported?: any;
  isForwarded?: boolean;
}
export interface Request {
  messageData: MessageData;
  companyId: number;
}

export interface Root {
  object: string;
  entry: Entry[];
}

export interface Entry {
  id: string;
  time: number;
  messaging: Messaging[];
}

export interface Messaging {
  sender: Sender;
  recipient: Recipient;
  timestamp: number;
  message: MessageX;
}

export interface Sender {
  id: string;
}

export interface Recipient {
  id: string;
}

export interface MessageX {
  mid: string;
  text: string;
  reply_to: ReplyTo;
}

export interface ReplyTo {
  mid: string;
}

export interface IOpenAi {
  name: string;
  prompt: string;
  voice: string;
  voiceKey: string;
  voiceRegion: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  queueId: number;
  maxMessages: number;
}

