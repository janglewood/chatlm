interface Step {
  title: string;
  text: string;
}

export function HowItWorksSection({
  sectionHead,
  steps,
}: {
  sectionHead: string;
  steps: Step[];
}) {
  return (
    <section id="how-it-works" className="container py-2xl">
      <h2 className="text-section max-w-[30ch] text-ink">{sectionHead}</h2>
      <ol className="how-steps mt-xl grid gap-xl lg:grid-cols-3">
        {steps.map((step) => (
          <li key={step.title} className="how-steps__item">
            <h3 className="text-title text-ink">{step.title}</h3>
            <p className="mt-sm text-ink-2">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
