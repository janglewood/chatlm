import { runMtprotoSyncForAllChats } from "../src/mtproto/sync.js";
import { disconnectMtprotoClient } from "../src/mtproto/client.js";
import { pool } from "../src/db/pool.js";

// Manual one-shot trigger for testing the MTProto sync without waiting for
// the twice-daily cron — see TASK_BREAKDOWN.md #4.
runMtprotoSyncForAllChats()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectMtprotoClient();
    await pool.end();
  });
