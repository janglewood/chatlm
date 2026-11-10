export function DemoMockup({
  sectionHead,
  lead,
  question,
  answer,
  citation,
}: {
  sectionHead: string;
  lead?: string;
  question: string;
  answer: string;
  citation: string;
}) {
  return (
    <section className="container py-2xl">
      <div className="grid gap-xl lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 className="text-section text-ink">{sectionHead}</h2>
          {lead ? <p className="lead mt-md text-ink-2">{lead}</p> : null}
        </div>
        <div className="cut lg:col-span-7">
          <div className="flex flex-col gap-sm p-xl" style={{ minHeight: 420 }}>
            <div className="flex justify-end">
              <p className="max-w-[34ch] rounded-[var(--radius-card)] bg-paper-2 px-md py-sm text-md text-ink">
                {question}
              </p>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[44ch] rounded-[var(--radius-card)] border border-rule bg-paper px-md py-sm">
                <p className="text-md text-ink">{answer}</p>
                <p className="mt-sm font-[family-name:var(--font-outlier)] text-sm text-muted">
                  {citation}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
