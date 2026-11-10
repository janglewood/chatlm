// Hallmark · content fork of /schools: same shape/tokens/composition
// (schools and clubs share one register per the user's own call), copy
// swapped per spec §1.2/§A.3.
// Hero B (deferred A/B wiring, §A.6): «Новички перестанут спрашивать то,
// что обсуждали сто раз» / «Бот сам находит в истории чата, кто и когда уже
// ответил на вопрос».
import type { Metadata } from "next";
import { NavBar } from "@/components/landing/NavBar";
import { Hero } from "@/components/landing/Hero";
import { PainsSection } from "@/components/landing/PainsSection";
import { DemoMockup } from "@/components/landing/DemoMockup";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { UseCasesSection } from "@/components/landing/UseCasesSection";
import { PilotSection } from "@/components/landing/PilotSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { CtaBanner } from "@/components/landing/CtaBanner";
import { Footer } from "@/components/landing/Footer";
import { addToGroupLink, tryInDmLink, founderLink } from "@/lib/links";
import type { QAExample } from "@/components/landing/GlyphField";

export const metadata: Metadata = {
  title: "Бот для клубов и комьюнити — вся экспертиза в ответ на один вопрос",
  description:
    "Бот ищет по смыслу в многолетней истории чата и отвечает участникам со ссылкой на автора и дату.",
};

const addHref = addToGroupLink("clubs");
const dmHref = tryInDmLink("clubs");
const founderHref = founderLink();

const fieldExamples: QAExample[] = [
  {
    question: ["Мария: кто делал сайт", "на Тильде?"],
    answer: ["Бот: Денис, контакт", "в закреплённом"],
    citation: "— по сообщению от Денис, 4 мар.",
  },
  {
    question: ["Игорь: какой бухсервис", "посоветовали для ИП?"],
    answer: ["Бот: «Точка» и", "«Контур.Эльба»"],
    citation: "— по сообщению от Виктор, 20 фев.",
  },
  {
    question: ["Света: что обсуждали", "про налоги в этом году?"],
    answer: ["Бот: разбор УСН", "в теме «Бухгалтерия»"],
    citation: "— по сообщению от Денис, 15 янв.",
  },
  {
    question: ["Олег: кого хвалили", "за рекламный таргет?"],
    answer: ["Бот: студию «Вектор»,", "смотри тему"],
    citation: "— по сообщению от Мария, 2 мар.",
  },
  {
    question: ["Павел: что решили", "по доставке?"],
    answer: ["Бот: доставка", "с понедельника"],
    citation: "— по сообщению от Олег, 1 мар.",
  },
];

export default function ClubsPage() {
  return (
    <>
      <NavBar ctaLabel="Добавить в чат" ctaHref={addHref} />
      <Hero
        posture="stage"
        headline="Вся экспертиза вашего клуба — в ответ на один вопрос"
        lead="Бот ищет по смыслу в многолетней истории чата и отвечает участникам со ссылкой на автора и дату."
        primaryCta={{ label: "Добавить в чат", href: addHref }}
        secondaryCta={{ label: "Попробовать в личке", href: dmHref }}
        fieldExamples={fieldExamples}
      />
      <PainsSection
        sectionHead="Новички спрашивают то, что обсуждали сто раз"
        pains={[
          {
            title: "Вопрос уже обсуждали",
            text: "Новичок задаёт вопрос, на который в чате уже отвечали десятки раз — старожилы раздражаются, а ответ приходится искать заново.",
          },
          {
            title: "Экспертиза есть, но её не видно",
            text: "Годы обсуждений хранят ценные рекомендации и разборы, но они похоронены в ленте и недоступны без ручного поиска.",
          },
          {
            title: "Старожилы устают отвечать одно и то же",
            text: "Каждый повторный вопрос — это чьё-то время и терпение, хотя ответ давно есть в истории чата.",
          },
        ]}
      />
      <DemoMockup
        sectionHead="Отвечает со ссылкой на автора, а не наугад"
        lead="Бот ищет по смыслу в истории чата и показывает, кто и когда уже отвечал на этот вопрос."
        question="Какой бухгалтерский сервис тут советовали для ИП?"
        answer="В чате чаще всего рекомендовали «Точку» и «Контур.Эльбу» — обе удобны для ИП на упрощёнке."
        citation="— по сообщению от Дмитрий, 4 мар."
      />
      <HowItWorksSection
        sectionHead="Как подключить"
        steps={[
          {
            title: "Добавьте бота и служебный аккаунт",
            text: "Служебный аккаунт только читает историю переписки и никогда не пишет в чат.",
          },
          {
            title: "Бот загрузит историю",
            text: "Обычно это занимает до 12 часов.",
          },
          {
            title: "Участники спрашивают бота",
            text: "В личных сообщениях или по упоминанию прямо в чате клуба.",
          },
        ]}
      />
      <UseCasesSection
        sectionHead="Что уже умеет отвечать"
        items={[
          "Кто делал сайт на Тильде и сколько это стоило?",
          "Какие подрядчики по рекламе тут хвалили?",
          "Что обсуждали про налоги в этом году?",
        ]}
      />
      <PilotSection
        headline="Бесплатный пилот"
        text="Подключим и настроим вместе с вами — бесплатно на пилоте."
        ctaLabel="Написать основателю"
        ctaHref={founderHref}
      />
      <FaqSection
        sectionHead="Вопросы про бота"
        items={[
          {
            q: "Участникам не понравится, что их сообщения индексируют?",
            a: "Индексируется только этот чат, данные не используются для обучения моделей, и их можно удалить командой /forget_chat.",
          },
          {
            q: "Почему в чате появляется незнакомый аккаунт?",
            a: "Это служебный аккаунт для загрузки истории — он только читает переписку и никогда не пишет в чат.",
          },
          {
            q: "Данные чата используются для обучения моделей?",
            a: "Нет. История чата используется только для ответов в этом же чате.",
          },
          {
            q: "Как удалить данные?",
            a: "Командой /forget_chat — бот удалит всю загруженную историю этого чата.",
          },
          {
            q: "Сколько это стоит?",
            a: "На пилоте — бесплатно.",
          },
        ]}
      />
      <CtaBanner
        headline="Откройте экспертизу клуба для всех"
        ctaLabel="Добавить в чат"
        ctaHref={addHref}
      />
      <Footer
        variant="statement"
        closingLine="Бот отвечает только по истории вашего чата, с указанием источника."
        contactLabel="Написать основателю"
        contactHref={founderHref}
      />
    </>
  );
}
