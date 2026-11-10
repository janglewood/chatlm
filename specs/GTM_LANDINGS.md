# GTM_LANDINGS.md — target audiences, landing pages and attribution

Spec for implementation in Claude Code. Everything lives in **this repository** (`chatllm`):

- **Part A — landing pages** — a `web/` folder at the repo root (Next.js, ported from `../saas-template/apps/web`). **In scope now.**
- **Part B — attribution and onboarding in the bot** — existing bot code in `src/`. **Deferred**, see the note at the top of Part B.

The goal is not "a nice website" but a **measurable funnel per audience**: landing visit → `/start` in the bot → bot + tech account added to a group → people ask questions in the chat. After the test we keep the audience with the best conversion and invest in it.

The production domain is not chosen yet — everywhere below it is referred to as `{DOMAIN}` and comes from `NEXT_PUBLIC_SITE_URL`. Nothing in the code may hardcode a domain.

> **Language note:** this spec is in English, but the product UI and all landing copy are **Russian only**. Russian strings quoted below are the actual starting copy — use them verbatim.

## 0. Fixed decisions (do not revisit during implementation)

| Decision | Value |
|---|---|
| URL structure | Paths on a single domain: `{DOMAIN}/schools`, `{DOMAIN}/clubs`, `{DOMAIN}/teams`. **Not** subdomains and not separate domains (keeps domain SEO authority in one place) |
| Code location | One repository, `chatllm`: the bot stays at the root (as today), the landing is a self-contained package in `web/` with its own `package.json`. Not a monorepo — no workspaces, no turbo |
| History backfill | One service ("tech") Telegram account that the admin adds to the chat **together with the bot**. JSON-export import is out of scope |
| Payments | Not built. Landing says "free during the pilot" |
| Consent / `/optout` / 152-FZ compliance | Not built in this task (deferred) |
| Firebase auth, lava.top, NestJS API from the template | **Not used** by the landing. Only `apps/web` is ported from the template → `web/` |
| Language | UI and copy — Russian only |

## 1. Target audiences

Selection criteria: the chat has **many repeated questions**, the answers **already exist in its history**, and the chat owner **has budget and a measurable pain**.

### 1.1. Online schools and courses — `schools` (primary hypothesis)

- **Buyer:** school owner, producer, head of curators. **Users:** students in the cohort chat + curators.
- **Context:** each cohort has its own Telegram chat of 50–500 people, lives 1–6 months, cohorts repeat.
- **Pain:** curators answer the same questions 10 times a day ("where is the stream recording", "when is the homework deadline", "how do I get the certificate", "where is the spreadsheet link"). The answer was already given in the chat but can't be found. Curator time = the school's money.
- **Promise:** "The bot answers students instead of the curator — based on what was already said in the chat, with a link to the message."
- **Customer value metric:** how many questions the bot closed without a curator.
- **Objections to address on the page:** "the bot will answer wrong" → it answers only from chat history, cites the source, and honestly says "not found"; "why is a stranger account in our chat" → the service account only reads history and never posts.

### 1.2. Communities and private clubs — `clubs` (second hypothesis)

- **Buyer:** founder/moderator of a paid club, professional community, or subscription chat. **Users:** members, especially newcomers.
- **Context:** a long-lived chat with hundreds to thousands of members and years of history; valuable expertise is buried in the feed.
- **Pain:** newcomers ask questions that were discussed 100 times; old-timers get annoyed; the club's core value (accumulated expertise) is invisible and inaccessible.
- **Promise:** "All of your club's expertise — one question away. Newcomers find answers on their own."
- **Customer value metric:** fewer repeats in the feed, newcomers ramp up faster.
- **Objections:** "members won't like being indexed" → only this chat is indexed, data is not used to train models, and it can be deleted with `/forget_chat`.

### 1.3. Teams that work in Telegram — `teams` (third hypothesis)

- **Buyer:** owner or operations director of a 5–50 person business, department head. **Users:** employees, especially new hires.
- **Context:** work chats used instead of a corporate messenger and wiki — agencies, construction and renovation, logistics, e-commerce, manufacturing, service companies. Decisions, agreements, contractor contacts and "how to do X" instructions live only in the chat.
- **Pain:** "we discussed this, go find it" doesn't work; a new hire pesters colleagues for a month; nobody maintains a Notion/Confluence wiki because everything is already in the chat. Knowledge leaves with every employee who quits.
- **Promise:** "A company knowledge base that builds itself — from your work chats in Telegram. No Notion, no moving to another messenger."
- **Customer value metric:** new-hire onboarding time, number of questions answered without interrupting colleagues.
- **Search demand link:** the Yandex Wordstat clusters "база знаний для сотрудников" (~640/mo), "корпоративная база знаний" (~470), "база знаний с ии" (~400) — the warmest search demand of the three audiences.
- **Objections:** "work data leaves the company" → data is isolated per chat, not used to train models, deleted on `/forget_chat`; "we already have Notion" → the bot doesn't replace the wiki, it surfaces what never made it into the wiki; "a service account in a work chat" → read-only, never posts.
- **Specifics:** B2B has higher security expectations and a longer decision cycle — give more weight to the data/privacy block and the `/privacy` link; the primary CTA for this audience is "Обсудить пилот" (contact the founder), "Добавить в чат" is secondary.

### 1.4. Deferred (no pages now)

- **Residential building / dacha community chats (ЖК / СНТ)** — strong virality, low willingness to pay. A growth-channel candidate rather than a paying segment.

The audience config (§A.3) must allow adding a new audience as a single object, with no new layout work.

---

# Part A — landing pages (`web/` in this repository)

## A.1. Port the template into `web/`

1. Copy **only** `../saas-template/apps/web` into `chatllm/web/` (without `node_modules`, `.next`, `.env.local`). Do not bring over the rest of the template (`apps/api`, `packages/shared`, `turbo.json`, `pnpm-workspace.yaml`).
2. `web/package.json`: rename the package to `chatlm-web`; remove the `@saas-template/shared` and `firebase` dependencies; remove the `packageManager` field (pnpm). Package manager is **yarn**, same as the bot; `web/yarn.lock` is this package's own lockfile.
3. Delete from `web/src` everything the landing doesn't need: `app/app/*`, `app/login/*`, `components/auth/*`, `components/app/*`, `components/paywall/*`, `components/pricing/*`, `components/shared/FeedbackWidget.tsx` (calls the removed API), `lib/auth/*`, `lib/paywall/*`, `lib/billing.ts`, `lib/firebase.ts`, `lib/api-client.ts`, `lib/feedback.ts`. Remove their usages from `app/layout.tsx` and `app/page.tsx` (including `RedirectIfAuthed`). `@saas-template/shared` is imported only by deleted files — no references to it may remain after cleanup.
4. Keep and reuse: the Tailwind theme, `components/landing/*` (Header, Hero, HowItWorks, Features, Faq, CtaBanner, Footer, Reveal, Parallax), `lib/analytics/*` (PostHog), `lib/useIsMobile.ts`.
5. Isolation from the bot:
   - the bot's root `package.json` is **not changed** (except optional convenience scripts `web:dev` / `web:build` that run `yarn --cwd web dev|build`);
   - the root `yarn test` (`node --test test/`) must not pick up files from `web/`;
   - add `.next/`, `web/.env.local`, `*.tsbuildinfo` to the root `.gitignore`;
   - Railway deploys the bot from the root and must not build `web/`: verify Nixpacks isn't confused by `web/` (if needed, add `web/` to `.railwayignore` / set the service's watch paths to exclude `web/**`).
6. Docs: `web/README.md` (what it is, how to run it, how to add an audience, env vars); a short "Landing" section in the root `README.md` linking to `web/README.md`.
7. `yarn --cwd web build` and `yarn --cwd web lint` pass; the root `yarn test` is still green.

All paths below in Part A like `src/...`, `app/...`, `lib/...` are relative to `web/`.

## A.2. Routes

| Path | Purpose |
|---|---|
| `/` | Generic page: short offer + audience picker «Я из онлайн-школы» / «У меня клуб или комьюнити» / «Мы работаем в Telegram командой» (link cards to the audience pages, generated from the config). Used for organic and unsegmented traffic |
| `/schools` | Landing for the `schools` audience |
| `/clubs` | Landing for the `clubs` audience |
| `/teams` | Landing for the `teams` audience |
| `/privacy` | Data policy: what is indexed, where it's stored, who has access, how to delete it (`/forget_chat`). Static text |

Implementation: dynamic segment `app/[audience]/page.tsx` with `generateStaticParams()` over the config keys and `notFound()` for unknown ones. All pages are statically generated (SSG), no server-side requests.

## A.3. Audience config

File `web/src/content/audiences.ts`. All copy differences between pages live **only here** — components contain no audience-specific text.

```ts
export type AudienceKey = "schools" | "clubs" | "teams";
export type VariantKey = "a" | "b";

export interface AudienceContent {
  key: AudienceKey;
  seo: { title: string; description: string };
  hero: Record<VariantKey, { headline: string; subheadline: string }>; // A/B on hero only
  pains: { title: string; text: string }[];            // exactly 3
  demo: { question: string; answer: string; citation: string }; // for the chat mockup
  howItWorks: { title: string; text: string }[];        // 3 steps
  useCases: string[];                                    // 4–6 example questions
  faq: { q: string; a: string }[];
  selectorLabel: string;                                 // card label on `/`
  primaryCta: "add_to_group" | "contact_founder";        // primary hero CTA (teams → contact_founder)
}

export const AUDIENCES: Record<AudienceKey, AudienceContent> = { /* ... */ };
```

Starting copy (edited later without code changes):

**schools**
- hero A: «Бот, который отвечает студентам вместо куратора» / «Подключите к чату потока — он найдёт ответ в истории переписки и сошлётся на сообщение, где это уже говорили».
- hero B: «Хватит отвечать на “где запись эфира?” в десятый раз» / «Бот читает историю чата потока и отвечает студентам сам — с цитатой и датой исходного сообщения».
- demo: question «Где взять запись вчерашнего эфира?» → answer with a link and the line «— по сообщению от Анна (куратор), 12 окт.».
- useCases: «Когда дедлайн по ДЗ-3?», «Где ссылка на таблицу с заданиями?», «Как получить сертификат?», «Во сколько завтра эфир?».

**clubs**
- hero A: «Вся экспертиза вашего клуба — в ответ на один вопрос» / «Бот ищет по смыслу в многолетней истории чата и отвечает участникам со ссылкой на автора и дату».
- hero B: «Новички перестанут спрашивать то, что обсуждали сто раз» / «Бот сам находит в истории чата, кто и когда уже ответил на вопрос».
- demo: question «Какой бухгалтерский сервис тут советовали для ИП?» → answer with two recommendations and a citation.
- useCases: «Кто делал сайт на Тильде и сколько это стоило?», «Какие подрядчики по рекламе тут хвалили?», «Что обсуждали про налоги в этом году?».

**teams**
- hero A: «База знаний компании, которая собирается сама» / «Подключите бота к рабочим чатам в Telegram — сотрудники спрашивают, бот находит ответ в переписке и показывает, кто и когда это решил».
- hero B: «“Мы же это обсуждали” — теперь найдётся за секунду» / «Договорённости, контакты подрядчиков и инструкции из рабочих чатов — по одному вопросу, со ссылкой на сообщение. Без Notion и без переезда из Telegram».
- demo: question «Какой размер скидки согласовали с “СтройМаркетом”?» → answer «Договорились на 7% при заказе от 300 тыс.» with the citation «— по сообщению от Игорь (закупки), 3 сент.».
- useCases (no examples about passwords or credentials — a bad security signal): «Кто у нас отвечает за доставку в регионы?», «Какой номер у прораба на объекте на Лесной?», «Как оформить возврат клиенту?», «Что решили по срокам запуска?».
- pains: «Новичок месяц дёргает коллег вопросами, ответы на которые уже есть в чате»; «Договорённости теряются в ленте — потом спорят, кто что обещал»; «Знания уходят вместе с сотрудником».
- Extra FAQ: «Чем это отличается от Notion/Confluence?», «Кто видит ответы бота?» (only members of the same chat), «Можно подключить несколько рабочих чатов?».

Shared "How to connect" block (same for all audiences, text lives in the config):
1. «Добавьте в чат бота @{BOT_USERNAME} и служебный аккаунт @{TECH_ACCOUNT_USERNAME}» — with a note that the account only reads history and never posts.
2. «Бот загрузит историю переписки — обычно до 12 часов».
3. «Участники спрашивают бота в личке или упоминанием в чате».

FAQ (minimum, shared + audience-specific): what the bot can see; why the service account is needed; is data used to train models (no); how to delete data (`/forget_chat`); what if the bot doesn't know the answer (says so honestly, suggests related messages); how much it costs (free during the pilot).

## A.4. Audience page sections (in order)

1. **Header** — logo, anchors, CTA button.
2. **Hero** — headline/subheadline for the assigned variant; primary CTA per `primaryCta` in the config («Добавить в чат» for `schools`/`clubs`, «Обсудить пилот» → founder contact for `teams`); the secondary CTA is the other one of the pair.
3. **Pains** — 3 pain cards.
4. **Demo** — static mockup of a Telegram conversation: question → bot answer with citation (author + date). HTML/CSS only, no screenshot images. This is the key selling block: it shows the citations.
5. **HowItWorks** — 3 connection steps (§A.3).
6. **UseCases** — example questions as chips.
7. **Pilot** — «Бесплатный пилот: подключим и настроим вместе с вами» + «Написать основателю» CTA.
8. **Faq**.
9. **CtaBanner** — repeats the primary CTA.
10. **Footer** — `/privacy` link, contact.

The template's Pricing block is not shown on audience pages.

## A.5. CTAs and deep links

All links are built by a single function `buildBotLink(...)` in `web/src/lib/botLink.ts`:

| CTA | Link | When |
|---|---|---|
| «Добавить в чат» (primary) | `https://t.me/{BOT_USERNAME}?startgroup={payload}` | Opens the group picker, adds the bot; the bot receives the payload in the group |
| «Попробовать в личке» (secondary, mobile) | `https://t.me/{BOT_USERNAME}?start={payload}` | User meets the bot in a DM first |
| «Написать основателю» / «Обсудить пилот» | `https://t.me/{FOUNDER_USERNAME}` | Pilot / questions |

**Payload format** (parsed identically by the bot, §B.2):

```
{audience}-{variant}[-{campaign}]
```

- `audience` ∈ config keys (`schools`, `clubs`, `teams`) or `home` for `/`.
- `variant` ∈ `a`, `b`.
- `campaign` — optional, from `utm_campaign` in the page URL: lowercase, keep only `[a-z0-9]`, truncate to 32 chars.
- The result must satisfy Telegram's constraint `^[A-Za-z0-9_-]{1,64}$`. The function guarantees this and is unit-tested.
- Example: `schools-b-direct1`.
- Until Part B ships, the bot simply ignores the payload (the current `/start` handler doesn't read it) — the links already work, and the labels start being recorded once Part B is implemented. Until then, measure conversion up to the click via `cta_clicked` in PostHog.
- Unit tests for `buildBotLink` live in `web/` (add `vitest` as a dev dependency and a `test` script to `web/package.json`).

Env vars (`web/.env.local`, documented in `web/.env.example`):
`NEXT_PUBLIC_BOT_USERNAME`, `NEXT_PUBLIC_TECH_ACCOUNT_USERNAME`, `NEXT_PUBLIC_FOUNDER_USERNAME`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SITE_URL` (`https://{DOMAIN}`).

## A.6. A/B variants

- The variant is assigned client-side on first visit: if the URL has `?v=a|b`, use it (for manual checks and fixed campaigns); otherwise 50/50 random. Persist in `localStorage` (`chatlm_variant_{audience}`) inside `try/catch`; if storage is unavailable, pick randomly on every load.
- No text flicker: render the hero text only after the variant is determined, with a same-height skeleton placeholder until then.
- **Only the hero** varies. All other sections are identical — otherwise the test can't be read.

## A.7. Analytics (PostHog)

Use the existing `lib/analytics/posthog.ts` (`track`). Autocapture stays off. Events:

| Event | When | Properties |
|---|---|---|
| `landing_viewed` | page mount | `audience`, `variant`, `utm_source`, `utm_medium`, `utm_campaign`, `referrer` |
| `cta_clicked` | click on any CTA | `audience`, `variant`, `cta` (`add_to_group` / `try_in_dm` / `contact_founder`), `placement` (`hero` / `pilot` / `banner` / `header`), `payload` |
| `audience_selected` | click on a card on `/` | `audience` |
| `faq_opened` | FAQ item expanded | `audience`, `question_index` |

No personal data in any property. Without a PostHog key everything is a no-op (template behavior).

## A.8. SEO and technical requirements

- Unique `title`/`description` from the config, OpenGraph tags, `canonical` = `NEXT_PUBLIC_SITE_URL + path`.
- `sitemap.xml` and `robots.txt` via `app/sitemap.ts` / `app/robots.ts`.
- `<html lang="ru">`.
- Mobile-first: most traffic from Telegram channel placements will be on phones. Check at 375px width: no horizontal scroll, CTA visible on the first screen.
- Lighthouse (mobile): Performance ≥ 90, Accessibility ≥ 90.
- Deploy: Vercel or Cloudflare Pages from this same GitHub repo, Root Directory = `web`; builds trigger only on changes in `web/**` (Ignored Build Step / watch paths) so bot changes don't rebuild the site. Domain `{DOMAIN}` (+ `www` → apex redirect).

## A.9. Definition of done (Part A)

- [ ] `/`, `/schools`, `/clubs`, `/teams`, `/privacy` build statically; unknown audience → 404.
- [ ] `teams` has «Обсудить пилот» as the primary CTA; `schools`/`clubs` have «Добавить в чат».
- [ ] Adding a new audience = a new object in `audiences.ts` + a key in `AudienceKey`, no component changes.
- [ ] All CTAs point to correct deep links, the payload passes validation; unit tests for `buildBotLink` (including junk `utm_campaign`, Cyrillic input, length > 64).
- [ ] Hero variant is stable across reloads and can be overridden with `?v=`.
- [ ] PostHog events arrive with the listed properties (check in PostHog Live events).
- [ ] No leftovers of Firebase/lava.top/API/`@saas-template/shared` in `web/` code or dependencies; `yarn --cwd web build`, `lint` and `test` are green.
- [ ] No domain is hardcoded; everything derives from `NEXT_PUBLIC_SITE_URL`.
- [ ] Bot untouched: root `yarn test` is green, the Railway bot deploy does not build `web/`.

---

# Part B — attribution and onboarding in the bot (`src/`)

> **⏸ DEFERRED.** Do not implement in the current iteration. This section is kept as a locked design: the payload format (§B.2) is already used by the landings (§A.5), so it must not change without a matching change to Part A.

## B.1. Data changes

New migration `migrations/1700000000005_acquisition.js`:

```sql
-- Log of every /start, with or without payload — raw funnel data.
CREATE TABLE bot_starts (
  id                 BIGSERIAL PRIMARY KEY,
  telegram_user_id   BIGINT NOT NULL,
  telegram_chat_id   BIGINT NOT NULL,      -- = user id for DMs, group id for startgroup
  chat_type          TEXT NOT NULL,        -- 'private' | 'group' | 'supergroup'
  payload            TEXT,                 -- raw payload, NULL if /start had no parameter
  audience           TEXT,                 -- parsed parts; NULL if payload invalid/empty
  variant            TEXT,
  campaign           TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_starts_user ON bot_starts (telegram_user_id, created_at DESC);

-- First-touch chat attribution + tech account tracking.
ALTER TABLE chats
  ADD COLUMN acquisition_payload      TEXT,
  ADD COLUMN acquisition_audience     TEXT,
  ADD COLUMN acquisition_variant      TEXT,
  ADD COLUMN acquisition_campaign     TEXT,
  ADD COLUMN tech_account_present     BOOLEAN,      -- NULL = not checked
  ADD COLUMN tech_account_reminded_at TIMESTAMPTZ;
```

`down` drops the table and columns. Update `specs/DATA_MODEL.md`.

## B.2. Payload parsing

`src/acquisition/payload.js`, pure function `parseStartPayload(raw)`:

- Input: a string or `undefined`. Output: `{ payload, audience, variant, campaign }`, all fields `null` if the payload is empty or malformed.
- Format: `^(?<audience>[a-z]+)-(?<variant>[a-z])(?:-(?<campaign>[a-z0-9]{1,32}))?$`.
- `audience` is validated by format only, not against a closed list (a new audience on the site must not require a bot deploy).
- Unit tests in `test/payload.test.js` (existing `node --test test/` runner): valid with and without campaign, empty, `undefined`, junk, too-long campaign, uppercase.

## B.3. `/start` handling

Replace the current `bot.command("start", ...)` handler in `src/bot/index.js`:

1. Always insert a row into `bot_starts` (`ctx.payload` from Telegraf, `ctx.chat.type`).
2. **DM (`private`)** — greeting depends on `audience`:
   - texts in `src/acquisition/onboardingTexts.js`, keys `schools`, `clubs`, `teams`, `default`; unknown audience → `default`;
   - each greeting contains: one value sentence for the audience; two-step instructions "add the bot and the service account @{TECH_ACCOUNT_USERNAME}"; an inline «Добавить в чат» button with URL `https://t.me/{botUsername}?startgroup={same payload}` (so attribution survives the DM → group hop); the line «Можете задать вопрос прямо здесь».
3. **Group (`group`/`supergroup`)** — this is an arrival via `startgroup`:
   - `getOrCreateChat(...)` for the group (same as in `my_chat_member`);
   - set first-touch attribution (§B.4);
   - reply in the group with a short «Подключён. Добавьте в чат @{TECH_ACCOUNT_USERNAME}, чтобы я загрузил историю» — **only if** the tech account is not in the chat (§B.5); otherwise «Подключён, история загрузится в течение ~12 часов».

Take `botUsername` from `src/telegram/botIdentity.js` (already exists), not from env.

## B.4. First-touch chat attribution

`src/acquisition/attributeChat.js`, `attributeChat({ chatId, telegramChatId, ownerTelegramUserId, groupPayload })`:

1. If the chat already has `acquisition_payload` set — do nothing (first-touch).
2. If there's a valid `groupPayload` (from `/start` in the group) — record it.
3. Otherwise find the latest valid `bot_starts` row for `ownerTelegramUserId` with `chat_type = 'private'` no older than **7 days** and record it.
4. Otherwise leave it `NULL` (organic / unknown).

Called from two places: `/start` in a group (with `groupPayload`) and the `my_chat_member` handler after `handleBotAddedToChat` (without it). Telegram doesn't guarantee the order of these two updates — the function must be idempotent and correct in any order (write with `UPDATE ... WHERE acquisition_payload IS NULL`). Strictly first-touch: if `my_chat_member` already recorded DM attribution and then a group `/start` arrives with a **different** payload, keep the first one and log the mismatch at `info`.

## B.5. Tech account check

- New env vars: `TECH_ACCOUNT_USERNAME` (for copy) and `TECH_ACCOUNT_USER_ID` (for the check). Add to `src/config/env.js` (optional), `.env.example`, `specs/ENV_SETUP.md`, README (Railway section). If unset, checks and reminders are disabled and copy omits the service-account step.
- `src/acquisition/techAccount.js`, `checkTechAccountPresent(telegram, telegramChatId)` → `bot.telegram.getChatMember(chatId, TECH_ACCOUNT_USER_ID)`; present if status ∈ `member`, `administrator`, `creator`, `restricted`. Treat API errors as "unknown" (don't throw, store `NULL`).
- Call when the bot is added to a chat (after `my_chat_member`) and store in `chats.tech_account_present`.
- **Reminders:** if the tech account is missing — one message in the group on connect (see §B.3) and a re-check at the start of every MTProto sync run (`src/mtproto/sync.js`): chats still missing the account are skipped with a `warn` log, and the chat owner (`owner_telegram_user_id`) gets a DM reminder **at most once per 24 hours** (tracked in `tech_account_reminded_at`). If the owner never started a DM with the bot, sending fails with 403 — expected, ignore it.

## B.6. Funnel report

Script `scripts/funnel-report.js`, command `yarn funnel:report [--days 30]`. Prints a table to the console grouped by `audience` × `variant`:

| Column | Definition |
|---|---|
| `starts_dm` | unique `telegram_user_id` with a DM `/start` in the period |
| `chats_added` | chats with this attribution, `created_at` in the period, `deleted_at IS NULL` |
| `chats_with_tech` | of those, `tech_account_present = true` |
| `chats_active` | of those, chats with ≥ 1 question in `usage_counters` in the period |
| `questions` | sum of `question_count` for those chats in the period |

A `(none)` row for chats without attribution. Read-only DB access, no external calls.

## B.7. Definition of done (Part B)

- [ ] Migration applies and rolls back (`yarn migrate:up` / `yarn migrate:down`).
- [ ] `/start schools-b-direct1` in a DM → row in `bot_starts`, schools greeting, «Добавить в чат» button carrying the same payload.
- [ ] Adding the bot via `startgroup` → chat attribution set, exactly one connect/service-account message in the group.
- [ ] Owner adds the bot manually after doing `/start clubs-a` in a DM within the last 7 days → attribution `clubs/a`.
- [ ] Re-adding the bot / repeated `/start` doesn't overwrite first-touch.
- [ ] Without `TECH_ACCOUNT_*` env vars the bot behaves as before, with no mention of the service account.
- [ ] `yarn test` green; new tests for `parseStartPayload` and for the attribution-selection logic in `attributeChat` (extract the selection into a pure function).
- [ ] `yarn funnel:report` prints the table on a test DB (`scripts/seed-test-chat.js` can be extended).

---

## Implementation order

**Current iteration (Part A only):**

1. **A.1** — port `apps/web` from the template into `web/`, clean up, isolate from the bot.
2. **A.2–A.5** — routes, config for the three audiences, sections, deep links.
3. **A.6–A.8** — A/B, analytics, SEO, deploy.

**Next iteration (Part B):** B.1–B.2 → B.3–B.4 → B.5 → B.6. The parts are coupled only by the payload format (§A.5 = §B.2).

## Out of scope

All of Part B (bot attribution, tech account check, funnel report), JSON-export history import, payments (Telegram Stars / YooKassa), consent and `/optout`, auto-reply to repeated questions, digests, auto-FAQ, blog/SEO articles, pages for residential chats, MAX messenger support, choosing the domain.
