import Link from "next/link";

export function NavBar({
  ctaLabel,
  ctaHref,
}: {
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <header className="sticky top-0 z-[var(--z-sticky-nav)] border-b border-rule bg-paper/95 backdrop-blur-sm">
      <div className="container flex h-[64px] items-center justify-between">
        <Link
          href="/"
          aria-label="chatllm — на главную"
          className="font-[family-name:var(--font-outlier)] text-md font-medium tracking-tight text-ink"
        >
          chatllm
        </Link>
        <a href={ctaHref} className="key key--primary">
          {ctaLabel}
        </a>
      </div>
    </header>
  );
}
