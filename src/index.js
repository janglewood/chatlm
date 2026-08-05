import http from "node:http";
import { env } from "./config/env.js";
import { logger } from "./logger.js";
import { checkDatabaseConnection, pool } from "./db/pool.js";
import { bot, launchBot, WEBHOOK_PATH } from "./bot/index.js";
import { scheduleMtprotoSync } from "./mtproto/schedule.js";
import { disconnectMtprotoClient } from "./mtproto/client.js";

async function main() {
  await checkDatabaseConnection();

  const webhookHandler = bot.webhookCallback(WEBHOOK_PATH);

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      pool
        .query("SELECT 1")
        .then(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
        })
        .catch((err) => {
          logger.error({ err }, "Health check DB query failed");
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "error" }));
        });
      return;
    }

    if (!env.USE_POLLING && req.url === WEBHOOK_PATH) {
      webhookHandler(req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(env.PORT, () => logger.info({ port: env.PORT }, "HTTP server listening"));

  await launchBot();
  const mtprotoSyncTask = scheduleMtprotoSync();

  // bot.stop() is wired up inside launchBot() itself; this handles the rest
  // of the process's open handles (cron timer, HTTP server, DB pool) so
  // SIGINT/SIGTERM actually let it exit instead of hanging indefinitely.
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    mtprotoSyncTask.stop();
    await disconnectMtprotoClient();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    logger.info("Shutdown complete");
  }
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
