import Link from "next/link";
import type { ReactNode } from "react";

interface Card {
  href: string;
  label: string;
  text: string;
}

export function AudiencePicker({
  children,
  cards,
}: {
  children: ReactNode;
  cards: Card[];
}) {
  return (
    <section className="container flex min-h-[calc(100dvh-64px)] flex-col justify-center gap-xl py-2xl">
      {children}
      <div className="grid gap-lg lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="cut group flex flex-col justify-between gap-xl p-xl transition-[border-color] duration-(--dur-short) ease-out hover:border-accent-edge"
            style={{ minHeight: 240 }}
          >
            <h3 className="text-title text-ink">{card.label}</h3>
            <p className="text-ink-2">{card.text}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
