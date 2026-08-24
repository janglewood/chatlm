import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { env, requireEnv } from "../config/env.js";
import { logger } from "../logger.js";
import {
  handleIncomingMessage,
  handleBotAddedToChat,
  handleChatMigrated,
  resolveChatForQuestion,
} from "../ingestion/ingest.js";
import { getChatByTelegramId, getActiveChatsOwnedByUser } from "../db/chats.js";
import { handleQuestion } from "../query/answerQuestion.js";
import { formatReply } from "../query/formatReply.js";
import { RateLimitExceededError } from "../rateLimit/rateLimiter.js";
import { forgetChat } from "../dataRights/forgetChat.js";
import { isAddressedToBot } from "../telegram/botMention.js";
import { detectLanguage, t } from "../query/i18n.js";

requireEnv(["TELEGRAM_BOT_TOKEN"]);

export const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

function displayName(from) {
  if (!from) return "Unknown";
  const name = [from.first_name, from.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || from.username || String(from.id);
}

async function isChatAdminOrOwner(ctx, chat) {
  if (
    chat.owner_telegram_user_id != null &&
    String(chat.owner_telegram_user_id) === String(ctx.from.id)
  ) {
    return true;
  }
  try {
    const admins = await ctx.telegram.getChatAdministrators(
      chat.telegram_chat_id,
    );
    return admins.some((admin) => admin.user.id === ctx.from.id);
  } catch (err) {
    logger.warn({ err, chatId: chat.id }, "Could not verify chat admins");
    return false;
  }
}

async function replyWithAnswer(ctx, { chatId, questionText }) {
  // Threaded as a reply to the asker's own message: makes the answer
  // visually attach to their specific question (important once a group has
  // multiple people asking things close together), and Telegram notifies
  // the original sender about a reply even if they've muted general group
  // notifications — which a bare, unthreaded message wouldn't do.
  //
  // allow_sending_without_reply matters in practice, not just in theory: the
  // pipeline can take several seconds, and if the asker deletes their
  // question before it finishes, Telegram rejects a reply pointing at a
  // message that no longer exists (400 "message to be replied not found").
  // Without this flag that happened TWICE in a row live — the real answer
  // failed to send, and the fallback error message failed the exact same
  // way, since it reused these same options — and the whole thing silently
  // vanished into bot.catch() with no feedback at all. This tells Telegram
  // to fall back to a plain, unthreaded send instead of erroring.
  const replyOptions = {
    reply_parameters: {
      message_id: ctx.message.message_id,
      allow_sending_without_reply: true,
    },
  };
  // Same detection the answer pipeline itself uses (i18n.js) — these are
  // the two replies that can happen WITHOUT ever reaching handleQuestion
  // (rate-limited, or a hard failure before/during it), so they need their
  // own language decision instead of inheriting one from an answer object
  // that doesn't exist yet.
  const strings = t(detectLanguage(questionText));

  try {
    // The full pipeline (query expansion, embedding, retrieval, the answer
    // LLM call) easily takes several seconds now — Telegram's native
    // "typing..." indicator is the standard way to signal "working on it"
    // for a chat interface without cluttering the chat with a placeholder
    // message that then has to be edited or deleted. persistentChatAction
    // re-sends it for as long as the callback runs; Telegram's own typing
    // indicator expires after ~5s if not refreshed, hence the 4s interval.
    await ctx.persistentChatAction(
      "typing",
      async () => {
        const answer = await handleQuestion({
          chatId,
          telegramUserId: ctx.from.id,
          questionText,
        });
        await ctx.reply(formatReply(answer), {
          parse_mode: "HTML",
          ...replyOptions,
        });
      },
      { intervalDuration: 4000 },
    );
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      await ctx.reply(strings.rateLimited, replyOptions);
      return;
    }
    logger.error({ err }, "Failed to answer question");
    await ctx.reply(strings.genericError, replyOptions);
  }
}

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Привет! Я бот, который превращает историю вашего рабочего чата в базу знаний. " +
      "Добавьте меня в групповой чат, и я начну индексировать сообщения. " +
      "Задать вопрос можно здесь в личке или упомянув меня в группе.",
  );
});

// Bot added to (or removed from) a group — no consent step, see
// MVP_SCOPE.md risk #2. Real backfill happens via the MTProto sync job.
bot.on("my_chat_member", async (ctx) => {
  const update = ctx.myChatMember;
  const wasOut = ["left", "kicked"].includes(update.old_chat_member.status);
  const isIn = ["member", "administrator"].includes(
    update.new_chat_member.status,
  );

  if (wasOut && isIn) {
    await handleBotAddedToChat({
      telegramChatId: update.chat.id,
      chatTitle: update.chat.title,
      ownerTelegramUserId: update.from.id,
    });
  }
});

// Basic-group-to-supergroup upgrade. Unlike joining/leaving, the bot's own
// membership doesn't change here, so my_chat_member never fires for it —
// this is delivered as an ordinary (textless) service message instead, on
// whichever side of the migration the bot could see. Always calls next():
// this filter is intentionally broader than message("text") below it, and
// must fall through for every message that isn't itself a migration event.
bot.on("message", async (ctx, next) => {
  const migrateToChatId = ctx.message.migrate_to_chat_id;
  const migrateFromChatId = ctx.message.migrate_from_chat_id;

  if (migrateToChatId) {
    await handleChatMigrated({
      oldTelegramChatId: ctx.chat.id,
      newTelegramChatId: migrateToChatId,
    });
  } else if (migrateFromChatId) {
    await handleChatMigrated({
      oldTelegramChatId: migrateFromChatId,
      newTelegramChatId: ctx.chat.id,
    });
  }

  return next();
});

// `/forget_chat` — delete-on-request (API_CONTRACTS.md §4). Kept even though
// the consent flow it originally paired with was cut for MVP.
bot.command("forget_chat", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply(
      "Эта команда работает в групповом чате, данные которого нужно удалить.",
    );
    return;
  }

  await ctx.reply(
    "Вы уверены, что хотите удалить ВСЕ проиндексированные данные этого чата? Это необратимо.",
    Markup.inlineKeyboard([
      Markup.button.callback(
        "Да, удалить всё",
        `forget_confirm:${ctx.chat.id}`,
      ),
      Markup.button.callback("Отмена", "forget_cancel"),
    ]),
  );
});

bot.action(/^forget_confirm:(-?\d+)$/, async (ctx) => {
  const telegramChatId = Number(ctx.match[1]);
  const chat = await getChatByTelegramId(telegramChatId);

  if (!chat) {
    await ctx.answerCbQuery();
    await ctx.editMessageText("Чат не найден.");
    return;
  }

  const authorized = await isChatAdminOrOwner(ctx, chat);
  if (!authorized) {
    await ctx.answerCbQuery("Только администратор чата может это сделать.", {
      show_alert: true,
    });
    return;
  }

  await ctx.answerCbQuery();
  await ctx.editMessageText("Удаляю данные...");
  await forgetChat({ chatId: chat.id, requestedByTelegramUserId: ctx.from.id });
  await ctx.editMessageText(
    "Все проиндексированные данные этого чата удалены.",
  );
});

bot.action("forget_cancel", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("Отменено.");
});

bot.on(message("text"), async (ctx) => {
  if (ctx.message.text.startsWith("/")) return; // commands are handled above

  // DM: always treated as a question. No chat-membership tracking in MVP
  // (brief §4 scopes out team roles), so we can only resolve "which chat"
  // when the asker personally connected exactly one chat — see
  // MVP_SCOPE.md's DM-question note.
  if (ctx.chat.type === "private") {
    const ownedChats = await getActiveChatsOwnedByUser(ctx.from.id);

    if (ownedChats.length === 0) {
      await ctx.reply(
        "Я пока не подключён ни к одному вашему чату. Добавьте меня в групповой чат сначала.",
      );
      return;
    }

    if (ownedChats.length > 1) {
      await ctx.reply(
        "У вас несколько подключённых чатов — задайте вопрос, упомянув меня в нужной группе.",
      );
      return;
    }

    await replyWithAnswer(ctx, {
      chatId: ownedChats[0].id,
      questionText: ctx.message.text,
    });
    return;
  }

  if (!["group", "supergroup"].includes(ctx.chat.type)) return;

  // Defensive: the Bot API doesn't normally deliver a bot its own outgoing
  // messages, but this is a one-line safety net against ever ingesting one
  // if that assumption doesn't hold in some mode/edge case.
  if (ctx.from?.id === ctx.botInfo?.id) return;

  const botUsername = ctx.botInfo?.username;

  // A message that @mentions the bot is a question directed at it, not chat
  // content — see telegram/botMention.js. Handle it as a question and don't
  // ingest it: it carries no fact worth indexing, and doing so just adds
  // noise (e.g. it can resurface as a "related" citation to a later,
  // similar question).
  if (isAddressedToBot(ctx.message.text, botUsername)) {
    const chat = await resolveChatForQuestion({
      telegramChatId: ctx.chat.id,
      chatTitle: ctx.chat.title,
    });
    const question = ctx.message.text
      .replace(new RegExp(`@${botUsername}`, "gi"), "")
      .trim();
    if (question) {
      await replyWithAnswer(ctx, { chatId: chat.id, questionText: question });
    }
    return;
  }

  await handleIncomingMessage({
    telegramChatId: ctx.chat.id,
    chatTitle: ctx.chat.title,
    telegramMessageId: ctx.message.message_id,
    telegramUserId: ctx.from?.id,
    authorDisplayName: displayName(ctx.from),
    text: ctx.message.text,
    sentAt: new Date(ctx.message.date * 1000),
  });
});

bot.catch((err, ctx) => {
  logger.error(
    { err, updateType: ctx.updateType },
    "Unhandled error in bot handler",
  );
});

/**
 * Starts receiving updates in polling mode (local dev) or webhook mode
 * (prod), per USE_POLLING — see ENV_SETUP.md.
 */
export async function launchBot() {
  // Registered before launching: bot.launch() in polling mode doesn't
  // resolve until the bot stops, so these must be in place first or a
  // SIGINT/SIGTERM while polling would fall through to Node's default
  // (abrupt, non-graceful) handling instead of bot.stop().
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  if (env.USE_POLLING) {
    // Intentionally not awaited — bot.launch() is long-running for the life
    // of the polling loop, and callers (src/index.js) need to continue on
    // to schedule the MTProto cron job right after this returns.
    bot
      .launch()
      .then(() => logger.info("Bot stopped"))
      .catch((err) => {
        // A dead polling loop (e.g. Telegram 409 Conflict from an overlapping
        // deploy) must not be swallowed here: the HTTP server and DB pool
        // stay healthy either way, so a bare log leaves a zombie process that
        // Railway's healthcheck sees as fine forever while the bot never
        // receives another update. Exiting lets restartPolicyType:
        // ON_FAILURE (railway.json) actually recover it.
        logger.error({ err }, "Bot polling crashed");
        process.exit(1);
      });
    logger.info("Bot launched in polling mode");
  } else {
    await bot.telegram.setWebhook(`${env.TELEGRAM_WEBHOOK_URL}${WEBHOOK_PATH}`);
    logger.info({ url: env.TELEGRAM_WEBHOOK_URL }, "Webhook registered");
    // The HTTP server that mounts bot.webhookCallback(WEBHOOK_PATH) is wired
    // up in src/index.js so it can share the same process/port as health checks.
  }
}

export const WEBHOOK_PATH = "/telegram/webhook";
