interface FaqItem {
  q: string;
  a: string;
}

export function FaqSection({
  sectionHead,
  items,
}: {
  sectionHead: string;
  items: FaqItem[];
}) {
  return (
    <section id="faq" className="container py-2xl">
      <h2 className="text-section max-w-[30ch] text-ink">{sectionHead}</h2>
      <div className="mt-xl">
        {items.map((item, i) => (
          <details
            key={item.q}
            className={`faq-row border-t border-rule py-md ${
              i === items.length - 1 ? "border-b" : ""
            }`}
          >
            <summary className="flex items-center justify-between gap-md text-title text-ink">
              <span className="text-md font-medium">{item.q}</span>
              <span className="faq-icon shrink-0 text-lg text-muted">+</span>
            </summary>
            <p className="mt-sm max-w-[65ch] text-ink-2">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
