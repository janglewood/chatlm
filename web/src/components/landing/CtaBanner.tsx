export function CtaBanner({
  headline,
  ctaLabel,
  ctaHref,
}: {
  headline: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <section className="graphite py-4xl">
      <div className="container flex flex-col items-center gap-xl text-center">
        <h2
          className="text-display-s max-w-[20ch]"
          style={{ color: "var(--color-graphite-ink)" }}
        >
          {headline}
        </h2>
        <a href={ctaHref} className="key key--primary">
          {ctaLabel}
        </a>
      </div>
    </section>
  );
}
