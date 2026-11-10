export function PilotSection({
  headline,
  text,
  ctaLabel,
  ctaHref,
}: {
  headline: string;
  text: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <section className="bg-paper-2 py-2xl">
      <div className="container flex flex-col items-start justify-between gap-lg lg:flex-row lg:items-center">
        <div className="max-w-[52ch]">
          <h2 className="text-title text-ink">{headline}</h2>
          <p className="mt-sm text-ink-2">{text}</p>
        </div>
        <a href={ctaHref} className="key key--primary shrink-0">
          {ctaLabel}
        </a>
      </div>
    </section>
  );
}
