// src/jobs/user.job.ts

import { Job } from "bull";
import { Op } from "sequelize";
import User from "../models/User";

export async function handleLoginStatus(job: Job): Promise<void> {
  const thresholdTime = new Date();
  thresholdTime.setMinutes(thresholdTime.getMinutes() - 5);

  await User.update({ online: false }, {
    where: {
      updatedAt: { [Op.lt]: thresholdTime },
      online: true,
    },
  });
}
