export function Footer({
  variant,
  closingLine,
  contactLabel,
  contactHref,
}: {
  variant: "statement" | "colophon";
  closingLine: string;
  contactLabel: string;
  contactHref: string;
}) {
  if (variant === "colophon") {
    return (
      <footer className="border-t border-rule py-xl">
        <div className="container">
          <p className="max-w-[70ch] text-sm text-muted">
            chatllm. {closingLine}{" "}
            <a href={contactHref} className="text-ink underline">
              {contactLabel}
            </a>
            . 2026.
          </p>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-rule py-2xl">
      <div className="container flex flex-col gap-lg lg:flex-row lg:items-end lg:justify-between">
        <p className="text-title max-w-[36ch] text-ink">{closingLine}</p>
        <div className="flex flex-col items-start gap-sm text-sm text-muted lg:items-end">
          <a href={contactHref} className="text-ink-2">
            {contactLabel}
          </a>
          <span>chatllm · 2026</span>
        </div>
      </div>
    </footer>
  );
}
