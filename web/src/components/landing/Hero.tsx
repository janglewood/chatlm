import { GlyphField, type QAExample } from "./GlyphField";

interface Cta {
  label: string;
  href: string;
}

export function Hero({
  posture,
  headline,
  lead,
  primaryCta,
  secondaryCta,
  fieldExamples,
}: {
  posture: "stage" | "banner";
  headline: string;
  lead: string;
  primaryCta: Cta;
  secondaryCta: Cta;
  fieldExamples?: QAExample[];
}) {
  const minHeight = posture === "stage" ? "min-h-[calc(100dvh-180px)]" : "min-h-[64dvh]";

  return (
    <section className="overflow-hidden pt-lg">
      {/* cobalt's field sits behind the hero (never a boxed visual beside
          the text) — raw on the text side, resolving toward the edge. Its
          own box ends with the hero's viewport-filling area; the pb-3xl
          below is real empty space, not field the canvas reaches into, so
          the next section gets a true break rather than a measurement
          trick. */}
      <div className={`relative flex items-center ${minHeight}`}>
        {fieldExamples && (
          <GlyphField examples={fieldExamples} clearTo={posture === "stage" ? 0.42 : 0.66} />
        )}
        {/* pointer-events-none here: this wrapper is sized by .container
            (full hero width via max-width/gutter) even though the visible
            text fills only part of it — without this, its empty box would
            swallow hover/click before it ever reaches the field underneath.
            The two real controls opt back in explicitly. */}
        <div className="container relative pointer-events-none">
          <div className={posture === "stage" ? "w-full lg:w-[46%]" : "w-full lg:w-[64%]"}>
            <h1 className="text-display text-ink">{headline}</h1>
            <p className="lead mt-md text-ink-2">{lead}</p>
            <div className="mt-xl flex flex-wrap gap-sm">
              <a href={primaryCta.href} className="key key--primary pointer-events-auto">
                {primaryCta.label}
              </a>
              <a href={secondaryCta.href} className="key key--quiet pointer-events-auto">
                {secondaryCta.label}
              </a>
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="h-3xl" />
    </section>
  );
}
