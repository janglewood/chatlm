import { logger } from "../logger.js";

const DEBOUNCE_MS = 5000;
const timers = new Map();

/**
 * Minimal in-process debounce, keyed per chat. At MVP scale (ARCHITECTURE.md
 * §5) a full job queue (BullMQ/pg-boss) is unnecessary — this just keeps a
 * burst of messages in a busy chat from triggering one embedding-provider
 * call per message.
 */
export function debounce(key, fn) {
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      fn().catch((err) => logger.error({ err, key }, "Debounced job failed"));
    }, DEBOUNCE_MS),
  );
}
