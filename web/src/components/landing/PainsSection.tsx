interface Pain {
  title: string;
  text: string;
}

export function PainsSection({
  sectionHead,
  pains,
}: {
  sectionHead: string;
  pains: Pain[];
}) {
  return (
    <section className="container py-2xl">
      <h2 className="text-section max-w-[30ch] text-ink">{sectionHead}</h2>
      <div className="mt-xl">
        {pains.map((pain, i) => (
          <div
            key={pain.title}
            className={`grid gap-md border-t border-rule py-lg lg:grid-cols-12 ${
              i === pains.length - 1 ? "border-b" : ""
            }`}
          >
            <h3 className="lg:col-span-4">{pain.title}</h3>
            <p className="text-ink-2 lg:col-span-8">{pain.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
