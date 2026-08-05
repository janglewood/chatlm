import cron from "node-cron";
import { env } from "../config/env.js";
import { runMtprotoSyncForAllChats } from "./sync.js";
import { logger } from "../logger.js";

/**
 * Registers the twice-daily MTProto sync job (MTPROTO_SYNC_CRON, default
 * 00:00 & 12:00). Returns the scheduled task so it can be stopped on
 * shutdown — its internal timer otherwise keeps the process alive.
 */
export function scheduleMtprotoSync() {
  const task = cron.schedule(env.MTPROTO_SYNC_CRON, () => {
    runMtprotoSyncForAllChats().catch((err) =>
      logger.error({ err }, "Scheduled MTProto sync run failed"),
    );
  });
  logger.info({ cron: env.MTPROTO_SYNC_CRON }, "MTProto sync scheduled");
  return task;
}
