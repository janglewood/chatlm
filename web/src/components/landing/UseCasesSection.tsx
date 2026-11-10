export function UseCasesSection({
  sectionHead,
  items,
}: {
  sectionHead: string;
  items: string[];
}) {
  return (
    <section className="bg-paper-2 py-2xl">
      <div className="container">
        <h2 className="text-section max-w-[30ch] text-ink">{sectionHead}</h2>
        <ul className="mt-xl">
          {items.map((item, i) => (
            <li
              key={item}
              className={`flex items-center gap-lg border-t border-rule py-md ${
                i === items.length - 1 ? "border-b" : ""
              }`}
            >
              <span className="font-outlier text-sm text-muted">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-title text-ink">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
