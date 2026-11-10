// Hallmark · job: none (an index page) · hero posture: Index — the audience
// picker is the page's lead, the head stays small above it
import type { Metadata } from "next";
import { NavBar } from "@/components/landing/NavBar";
import { AudiencePicker } from "@/components/landing/AudiencePicker";
import { Footer } from "@/components/landing/Footer";
import { addToGroupLink, founderLink } from "@/lib/links";

export const metadata: Metadata = {
  title: "chatllm — бот, который отвечает по истории вашего чата",
  description:
    "Подключите бота к чату в Telegram — он находит ответ в истории переписки и ссылается на сообщение, где это уже говорили.",
};

const homeAddHref = addToGroupLink("home");
const founderHref = founderLink();

export default function HomePage() {
  return (
    <>
      <NavBar ctaLabel="Добавить в чат" ctaHref={homeAddHref} />
      {/* Hallmark · waive 94: 2 sections (hero, footer) — the home page's
          one job is routing to an audience page, per spec §A.2; an added
          section would pad toward a count, not serve the page. */}
      <AudiencePicker
        cards={[
          {
            href: "/schools",
            label: "Я из онлайн-школы",
            text: "Бот отвечает студентам вместо куратора — по истории чата потока.",
          },
          {
            href: "/clubs",
            label: "У меня клуб или комьюнити",
            text: "Вся экспертиза клуба — в ответ на один вопрос, со ссылкой на автора.",
          },
          {
            href: "/teams",
            label: "Мы работаем в Telegram командой",
            text: "База знаний компании, которая собирается сама — из рабочих чатов.",
          },
        ]}
      >
        <div>
          <h1 className="text-display max-w-[16ch] text-ink">
            Бот, который отвечает по истории вашего чата
          </h1>
          <p className="lead mt-md max-w-[46ch] text-ink-2">
            Находит ответ в переписке и ссылается на сообщение, где это уже
            говорили. Выберите, что ближе вам.
          </p>
        </div>
      </AudiencePicker>
      <Footer
        variant="statement"
        closingLine="Бот отвечает только по истории вашего чата, с указанием источника."
        contactLabel="Написать основателю"
        contactHref={founderHref}
      />
    </>
  );
}
