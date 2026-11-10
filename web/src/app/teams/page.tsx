// Hallmark · job: hire · hero: Banner (formal/corporate register, deliberately
// denser than schools/clubs' Stage — same cobalt theme and austere tone, a
// different composition per the mirror test) · footer: colophon
// Hero B (deferred A/B wiring, §A.6): «"Мы же это обсуждали" — теперь
// найдётся за секунду» / «Договорённости, контакты подрядчиков и инструкции
// из рабочих чатов — по одному вопросу, со ссылкой на сообщение. Без Notion
// и без переезда из Telegram».
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
import { addToGroupLink, founderLink } from "@/lib/links";
import type { QAExample } from "@/components/landing/GlyphField";

export const metadata: Metadata = {
  title: "База знаний компании из рабочих чатов в Telegram",
  description:
    "Сотрудники спрашивают, бот находит ответ в переписке и показывает, кто и когда это решил. Без Notion и без переезда из Telegram.",
};

const addHref = addToGroupLink("teams");
const founderHref = founderLink();

const fieldExamples: QAExample[] = [
  {
    question: ["Игорь: скидку дали", "«СтройМаркету»?"],
    answer: ["Бот: 7% при заказе", "от 300 тыс."],
    citation: "— по сообщению от Игорь, 3 сен.",
  },
  {
    question: ["Анна: кто отвечает", "за доставку в регионы?"],
    answer: ["Бот: Павел,", "направление «Юг»"],
    citation: "— по сообщению от Павел, 21 авг.",
  },
  {
    question: ["Олег: номер прораба", "на объекте на Лесной?"],
    answer: ["Бот: контакт", "у Сергея в теме"],
    citation: "— по сообщению от Сергей, 14 авг.",
  },
  {
    question: ["Мария: как оформить", "возврат клиенту?"],
    answer: ["Бот: форма", "в закреплённом"],
    citation: "— по сообщению от Игорь, 9 авг.",
  },
  {
    question: ["Денис: что решили", "по срокам запуска?"],
    answer: ["Бот: запуск", "переносится на март"],
    citation: "— по сообщению от Анна, 30 июл.",
  },
];

export default function TeamsPage() {
  return (
    <>
      <NavBar ctaLabel="Обсудить пилот" ctaHref={founderHref} />
      <Hero
        posture="banner"
        headline="База знаний компании, которая собирается сама"
        lead="Подключите бота к рабочим чатам в Telegram — сотрудники спрашивают, бот находит ответ в переписке и показывает, кто и когда это решил."
        primaryCta={{ label: "Обсудить пилот", href: founderHref }}
        secondaryCta={{ label: "Добавить в чат", href: addHref }}
        fieldExamples={fieldExamples}
      />
      <PainsSection
        sectionHead="Знания живут только в переписке — и уходят вместе с сотрудниками"
        pains={[
          {
            title: "Новичок месяц дёргает коллег",
            text: "Вопросы, ответы на которые уже есть в чате, но найти их без контекста невозможно.",
          },
          {
            title: "Договорённости теряются в ленте",
            text: "Потом спорят, кто что обещал — а переписка с ответом давно ушла вниз.",
          },
          {
            title: "Знания уходят вместе с сотрудником",
            text: "Никто не ведёт wiki, потому что всё и так «есть в чате» — пока человек не увольняется.",
          },
        ]}
      />
      <DemoMockup
        sectionHead="Отвечает со ссылкой на сообщение, а не наугад"
        lead="Бот ищет по смыслу в переписке рабочих чатов и указывает, кто и когда это решил."
        question="Какой размер скидки согласовали с «СтройМаркетом»?"
        answer="Договорились на 7% при заказе от 300 тыс."
        citation="— по сообщению от Игорь (закупки), 3 сент."
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
            title: "Сотрудники спрашивают бота",
            text: "В личных сообщениях или по упоминанию прямо в рабочем чате.",
          },
        ]}
      />
      <UseCasesSection
        sectionHead="Что уже умеет отвечать"
        items={[
          "Кто у нас отвечает за доставку в регионы?",
          "Какой номер у прораба на объекте на Лесной?",
          "Как оформить возврат клиенту?",
          "Что решили по срокам запуска?",
        ]}
      />
      <PilotSection
        headline="Бесплатный пилот"
        text="Подключим и настроим вместе с вами — бесплатно на пилоте."
        ctaLabel="Обсудить пилот"
        ctaHref={founderHref}
      />
      <FaqSection
        sectionHead="Вопросы про бота"
        items={[
          {
            q: "Рабочие данные не уйдут из компании?",
            a: "Данные изолированы по чатам, не используются для обучения моделей и удаляются командой /forget_chat.",
          },
          {
            q: "Чем это отличается от Notion или Confluence?",
            a: "Бот не заменяет wiki — он находит то, что в неё так и не попало, прямо в переписке.",
          },
          {
            q: "Кто видит ответы бота?",
            a: "Только участники того же чата, в котором задан вопрос.",
          },
          {
            q: "Можно подключить несколько рабочих чатов?",
            a: "Да, бот подключается к каждому чату отдельно, данные между ними не смешиваются.",
          },
          {
            q: "Сколько это стоит?",
            a: "На пилоте — бесплатно.",
          },
        ]}
      />
      <CtaBanner
        headline="Обсудим пилот для вашей команды"
        ctaLabel="Обсудить пилот"
        ctaHref={founderHref}
      />
      <Footer
        variant="colophon"
        closingLine="Сервис для рабочих чатов в Telegram — данные изолированы по чатам и удаляются командой /forget_chat."
        contactLabel="Обсудить пилот"
        contactHref={founderHref}
      />
    </>
  );
}
