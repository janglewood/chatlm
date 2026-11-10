// Minimal, non-validated link helpers for this design pass — the spec's
// buildBotLink (payload validation, A/B persistence, PostHog) is deferred
// engineering (specs/GTM_LANDINGS.md §A.5/§A.6).

const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME ?? "your_bot";
const FOUNDER_USERNAME = process.env.NEXT_PUBLIC_FOUNDER_USERNAME ?? "founder";

export function addToGroupLink(audience: string, variant: "a" | "b" = "a") {
  return `https://t.me/${BOT_USERNAME}?startgroup=${audience}-${variant}`;
}

export function tryInDmLink(audience: string, variant: "a" | "b" = "a") {
  return `https://t.me/${BOT_USERNAME}?start=${audience}-${variant}`;
}

export function founderLink() {
  return `https://t.me/${FOUNDER_USERNAME}`;
}
