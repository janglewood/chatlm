// Hallmark · job: sign up · hero: Stage · signature: Demo (chat citation mockup)
// Hero B (deferred A/B wiring, §A.6): «Хватит отвечать на "где запись эфира?"
// в десятый раз» / «Бот читает историю чата потока и отвечает студентам сам —
// с цитатой и датой исходного сообщения».
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
  title: "Бот для онлайн-школ — отвечает студентам вместо куратора",
  description:
    "Подключите бота к чату потока — он находит ответ в истории переписки и ссылается на сообщение, где это уже говорили.",
};

const addHref = addToGroupLink("schools");
const dmHref = tryInDmLink("schools");
const founderHref = founderLink();

const fieldExamples: QAExample[] = [
  {
    question: ["Студент: когда дедлайн", "по ДЗ-2?"],
    answer: ["Бот: 15 ноября, 23:59"],
    citation: "— по сообщению от Анна, 10 ноя.",
  },
  {
    question: ["Студент: где ссылка", "на таблицу заданий?"],
    answer: ["Бот: в закреплённом", "сообщении канала"],
    citation: "— по сообщению от Игорь, 3 ноя.",
  },
  {
    question: ["Студент: где запись", "вчерашнего эфира?"],
    answer: ["Бот: в закреплённом", "сообщении, до 30 июня"],
    citation: "— по сообщению от Анна, 12 окт.",
  },
  {
    question: ["Студент: как получить", "сертификат?"],
    answer: ["Бот: после сдачи", "всех домашних заданий"],
    citation: "— по сообщению от Игорь, 28 сен.",
  },
  {
    question: ["Студент: во сколько", "завтра эфир?"],
    answer: ["Бот: в 19:00", "по Москве"],
    citation: "— по сообщению от Анна, 5 ноя.",
  },
];

export default function SchoolsPage() {
  return (
    <>
      <NavBar ctaLabel="Добавить в чат" ctaHref={addHref} />
      <Hero
        posture="stage"
        headline="Бот, который отвечает студентам вместо куратора"
        lead="Подключите к чату потока — он найдёт ответ в истории переписки и сошлётся на сообщение, где это уже говорили."
        primaryCta={{ label: "Добавить в чат", href: addHref }}
        secondaryCta={{ label: "Попробовать в личке", href: dmHref }}
        fieldExamples={fieldExamples}
      />
      <PainsSection
        sectionHead="Куратор отвечает на одно и то же по десять раз в день"
        pains={[
          {
            title: "Вопрос уже был",
            text: "«Где запись эфира», «когда дедлайн по ДЗ», «как получить сертификат» — ответ уже прозвучал в чате, но студенты спрашивают снова.",
          },
          {
            title: "Ответ есть, но его не найти",
            text: "Сообщение потерялось в ленте несколько дней назад. Поиск по Telegram не помогает, если не знаешь точных слов.",
          },
          {
            title: "Время куратора — это деньги школы",
            text: "Каждый повторный вопрос — минуты куратора, которые можно потратить на проверку работ, а не на поиск старого сообщения.",
          },
        ]}
      />
      <DemoMockup
        sectionHead="Отвечает с цитатой, а не наугад"
        lead="Бот ищет по смыслу в истории чата и показывает, где и когда это уже говорили."
        question="Где взять запись вчерашнего эфира?"
        answer="Запись вчерашнего эфира — в закреплённом сообщении канала, доступна до 30 июня."
        citation="— по сообщению от Анна (куратор), 12 окт."
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
            title: "Студенты спрашивают бота",
            text: "В личных сообщениях или по упоминанию прямо в чате потока.",
          },
        ]}
      />
      <UseCasesSection
        sectionHead="Что уже умеет отвечать"
        items={[
          "Когда дедлайн по ДЗ-3?",
          "Где ссылка на таблицу с заданиями?",
          "Как получить сертификат?",
          "Во сколько завтра эфир?",
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
            q: "Бот отвечает правильно?",
            a: "Бот отвечает только по тому, что уже было сказано в чате, и указывает сообщение-источник. Если ответа в истории нет, он честно говорит «не нашёл», а не придумывает.",
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
        headline="Подключите бота к чату потока"
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
