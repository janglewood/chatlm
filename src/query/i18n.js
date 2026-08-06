// Minimal bilingual (ru/en) support for the reply "chrome" our own code
// generates (headings, refusal text, citation phrasing) — deliberately not a
// full i18n framework. The model already answers in whatever language the
// question was asked in (see promptTemplate.js); this just keeps the
// surrounding template strings consistent with that, instead of always
// being Russian regardless of the chat's actual language.
//
// Detection is a crude but effective heuristic (any Cyrillic character →
// Russian, everything else → English) — good enough for the ru/en split
// that actually matters for this product's target market, with English as
// the sane fallback for any other language.
export function detectLanguage(text) {
  return /[а-яёА-ЯЁ]/.test(text) ? "ru" : "en";
}

const STRINGS = {
  ru: {
    noInfo: "Не нашёл информации по этому вопросу.",
    citedFrom: (author, date) => `— по сообщению от ${author}, ${date}`,
    alsoFound: "Также нашлось:",
    mightHelp: "Возможно, вам поможет:",
    dateLocale: "ru-RU",
    rateLimited:
      "Вы достигли дневного лимита бесплатных вопросов для этого чата. Обновите тариф для безлимитного доступа.",
    genericError: "Произошла ошибка при обработке вопроса. Попробуйте позже.",
  },
  en: {
    noInfo: "Couldn't find information on that.",
    citedFrom: (author, date) => `— from a message by ${author}, ${date}`,
    alsoFound: "Also found:",
    mightHelp: "This might help:",
    dateLocale: "en-US",
    rateLimited: "You've reached today's free question limit for this chat. Upgrade for unlimited access.",
    genericError: "Something went wrong answering that. Please try again later.",
  },
};

export function t(lang) {
  return STRINGS[lang] ?? STRINGS.en;
}
