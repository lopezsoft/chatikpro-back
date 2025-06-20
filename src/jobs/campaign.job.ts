// src/jobs/campaign.job.ts

import { Job } from "bull";
import CampaignService from "../services/CampaignService";

export async function handleVerifyCampaigns(job: Job): Promise<void> {
  await CampaignService.verifyAndQueueCampaigns();
}

export async function handleProcessCampaign(job: Job): Promise<void> {
  const { id } = job.data;
  await CampaignService.processCampaign(id);
}

export async function handlePrepareContact(job: Job): Promise<void> {
  await CampaignService.prepareContactForCampaign(job.data);
}

export async function handleDispatchCampaign(job: Job): Promise<void> {
  await CampaignService.dispatchCampaignMessage(job.data);
}
