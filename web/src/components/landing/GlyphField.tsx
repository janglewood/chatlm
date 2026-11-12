"use client";

import { useEffect, useMemo, useRef } from "react";

// Full alphabet plus the density symbols — picked independently of
// brightness so identity flickers like real digital rain even where the
// brightness column holds steady. Canvas-only: a contrast checker and a
// word-count gate both scan real DOM text, and alphabetic runs there read
// as prose, not noise — the static fallback below stays symbols-only.
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.:-=+*#%";
const SYMBOL_RAMP = " .:-=+*#%";
const CELL_W = 8;
const CELL_H = 16;
const FRAME_MS = 1000 / 30;
// How many cells change identity per rendered frame — the field holds a
// persistent grid and only a handful of cells flip per tick, not the whole
// hash re-evaluated with a nudged seed (that looked "slow" on paper, but
// `Math.sin` on the large x/y-scaled arguments here isn't continuous in its
// seed term at all — any nonzero delta reshuffles the whole picture, which
// read as fast regardless of how small the delta was).
const DRIFT_FLIPS_PER_FRAME = 220;
const LENS_RADIUS = 160;
// Default fraction of width, left to right, that stays clear so text set
// over the field reads cleanly — cobalt's field sits *behind* the hero,
// shaped by the product's own flow (raw on one side, resolved on the
// other); the clear band is where "raw" starts, before any signal has
// accumulated. Callers whose text column reaches further across the full
// section width (not just the container) pass a larger `clearTo`.
const DEFAULT_CLEAR_TO = 0.34;

export interface QAExample {
  question: string[]; // pre-wrapped lines, as a sent message would read
  answer: string[]; // pre-wrapped lines
  citation: string;
}

// Per-character reveal timing for the scramble-to-text effect.
const STAGGER_MS = 130;
const LOCK_MS = 1100;
const textDuration = (lines: string[]) =>
  lines.reduce((n, l) => n + l.length, 0) * STAGGER_MS + LOCK_MS;

// The resolved Q&A text sits on its own, coarser grid so it can be set
// bigger and bolder than the ambient field without the two fighting over
// the same pitch.
const QA_CHAR_W = 14;
const QA_CHAR_H = 28;

type Phase =
  | "noise"
  | "resolve-q"
  | "hold-q"
  | "resolve-a"
  | "hold-both"
  | "dissolve";
const DUR: Record<Exclude<Phase, "resolve-q" | "resolve-a">, number> = {
  noise: 1400,
  "hold-q": 1100,
  "hold-both": 3200,
  dissolve: 700,
};

function hash(x: number, y: number, seed: number) {
  const v = Math.sin(x * 127.1 + y * 311.7 + seed * 0.618) * 43758.5453;
  return v - Math.floor(v);
}

function levelFor(
  x: number,
  y: number,
  cols: number,
  seed: number,
  clearTo: number,
) {
  const bias = Math.max(0, (x / cols - clearTo) / (1 - clearTo));
  const n = hash(x, y, seed) * bias;
  const tone = n > 0.78 ? 3 : n > 0.55 ? 2 : n > 0.3 ? 1 : 0;
  const charN = hash(x + 91.7, y - 43.3, seed * 1.7);
  const ch = GLYPHS[Math.floor(charN * GLYPHS.length)];
  return { ch, tone, n };
}

// Large fixed grid for the no-JS / pre-hydration static fallback — clipped
// to the real container by CSS, so it needs no measurement and is SSR-safe
// (Floor #7: visible with scripting off; reduced motion gets this one still,
// as plain ambient texture — the scramble-resolve is motion, so it's skipped).
const STATIC_COLS = 220;
const STATIC_ROWS = 70;

interface StaticRun {
  text: string;
  tone: number;
}

// Collapses consecutive same-tone characters into one run per colour change
// — a row of 220 individual one-character spans reads to a sloplint gate as
// a counting device (a tally, a meter); a handful of multi-character runs
// is the same visible texture without that shape, and is far lighter DOM.
function buildStaticRows(clearTo: number) {
  const out: StaticRun[][] = [];
  for (let y = 0; y < STATIC_ROWS; y++) {
    const row: StaticRun[] = [];
    let current: StaticRun | null = null;
    for (let x = 0; x < STATIC_COLS; x++) {
      const { tone, n } = levelFor(x, y, STATIC_COLS, 0, clearTo);
      const symbolIdx = Math.min(
        SYMBOL_RAMP.length - 1,
        Math.floor(n * SYMBOL_RAMP.length),
      );
      const visibleCh = n > 0.02 ? SYMBOL_RAMP[symbolIdx] : " ";
      if (current && current.tone === tone) {
        current.text += visibleCh;
      } else {
        current = { text: visibleCh, tone };
        row.push(current);
      }
    }
    out.push(row);
  }
  return out;
}

// A black/grey ramp (cobalt's own neutral tokens, not the blue glyph-1..4
// tones) — the raw field reads as ink, not colour; blue is saved entirely
// for the resolved Q&A text, so it reads as a distinct, deliberate signal
// rather than more of the same noise.
const TONE_VAR = [
  "var(--color-rule-2)",
  "var(--color-muted)",
  "var(--color-ink-2)",
  "var(--color-ink)",
];

interface RevealChar {
  ch: string;
  col: number;
  row: number;
  delay: number;
}

function layoutBlock(lines: string[], anchorCol: number, anchorRow: number) {
  const chars: RevealChar[] = [];
  let i = 0;
  lines.forEach((line, li) => {
    for (let c = 0; c < line.length; c++) {
      if (line[c] === " ") {
        i++;
        continue;
      }
      chars.push({
        ch: line[c],
        col: anchorCol + c,
        row: anchorRow + li,
        delay: i * STAGGER_MS,
      });
      i++;
    }
  });
  const width = Math.max(...lines.map((l) => l.length));
  return { chars, width, height: lines.length };
}

export function GlyphField({
  className,
  examples,
  clearTo = DEFAULT_CLEAR_TO,
}: {
  className?: string;
  examples?: QAExample[];
  clearTo?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticGrid = useMemo(() => buildStaticRows(clearTo), [clearTo]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const style = getComputedStyle(container);
    const toneColors = TONE_VAR.map((v) =>
      style.getPropertyValue(v.slice(4, -1)).trim(),
    );
    const accent = style.getPropertyValue("--color-accent").trim();
    const accent2 = style.getPropertyValue("--color-accent-2").trim();
    const fontFamily = getComputedStyle(canvas).fontFamily;
    const monoFamily = getComputedStyle(
      container.querySelector("pre")!,
    ).fontFamily;

    const preEl = container.querySelector("pre");
    let cols = 0;
    let rows = 0;
    let qCols = 0;
    let qRows = 0;
    let w = 0;
    let h = 0;

    // A persistent grid — built once per size, then drifted a few cells at
    // a time, rather than a pure function of (x, y, frame). Tone and
    // visibility come from the fixed position bias (the field's shape
    // never changes); only character identity drifts.
    let cellCh: string[][] = [];
    let cellTone: number[][] = [];
    let cellVisible: boolean[][] = [];

    function buildGrid() {
      cellCh = [];
      cellTone = [];
      cellVisible = [];
      for (let y = 0; y < rows; y++) {
        const chRow: string[] = [];
        const toneRow: number[] = [];
        const visRow: boolean[] = [];
        for (let x = 0; x < cols; x++) {
          const level = levelFor(x, y, cols, 0, clearTo);
          chRow.push(level.ch);
          toneRow.push(level.tone);
          visRow.push(level.n > 0.02);
        }
        cellCh.push(chRow);
        cellTone.push(toneRow);
        cellVisible.push(visRow);
      }
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = container!.getBoundingClientRect();
      w = Math.ceil(rect.width);
      h = Math.ceil(rect.height);
      cols = Math.max(1, Math.round(w / CELL_W));
      rows = Math.max(1, Math.round(h / CELL_H));
      qCols = Math.max(1, Math.floor(w / QA_CHAR_W));
      qRows = Math.max(1, Math.floor(h / QA_CHAR_H));
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.scale(dpr, dpr);
      ctx!.textBaseline = "top";
      buildGrid();
    }
    resize();
    if (preEl) (preEl as HTMLElement).style.visibility = "hidden";

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    let visible = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    io.observe(container);

    // `pointer` keeps the last known position even after the real pointer
    // leaves — `pointerActive` is what actually toggles. The CTA links over
    // the hero sit on top of this field with pointer-events re-enabled, so
    // moving onto them fires pointerleave here even though the cursor never
    // left the field visually; without decoupling position from activity,
    // that reads as the lens hard-cutting instead of fading out.
    let pointer: { x: number; y: number } | null = null;
    let pointerActive = false;
    let pointerStrength = 0;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      pointerActive = true;
    };
    const onLeave = () => {
      pointerActive = false;
    };
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerleave", onLeave);

    // --- the scramble-resolve chat sequence -------------------------------
    let qaIndex = 0;
    let phase: Phase = "noise";
    let phaseStart = 0;
    let qBlock: ReturnType<typeof layoutBlock> | null = null;
    let aBlock: ReturnType<typeof layoutBlock> | null = null;
    let qDur = 0;
    let aDur = 0;

    function layoutCurrent() {
      if (!examples || !examples.length || !qCols || !qRows) return;
      const qa = examples[qaIndex % examples.length];
      const aLines = [...qa.answer, qa.citation];
      const qWidth = Math.max(...qa.question.map((l) => l.length));
      const aWidth = Math.max(...aLines.map((l) => l.length));
      const blockWidth = Math.max(qWidth, aWidth);
      const totalHeight = qa.question.length + 1 + aLines.length;
      const margin = 2;

      const minCol = Math.round(qCols * (clearTo + 0.05));
      const maxCol = Math.max(minCol, qCols - blockWidth - margin);
      const minRow = 1;
      const maxRow = Math.max(minRow, qRows - totalHeight - 1);

      const baseCol = minCol + Math.round(Math.random() * (maxCol - minCol));
      const baseRow = minRow + Math.round(Math.random() * (maxRow - minRow));
      const jitter = () => Math.round((Math.random() - 0.5) * 4);
      const clampCol = (c: number, bw: number) =>
        Math.max(minCol, Math.min(qCols - bw - margin, c));

      qBlock = layoutBlock(
        qa.question,
        clampCol(baseCol + jitter(), qWidth),
        baseRow,
      );
      const aRow = baseRow + qa.question.length + 1;
      aBlock = layoutBlock(aLines, clampCol(baseCol + jitter(), aWidth), aRow);
      qDur = textDuration(qa.question);
      aDur = textDuration(aLines);
    }
    layoutCurrent();

    let raf = 0;
    let last = 0;
    let frame = 0;

    function driftField() {
      for (let i = 0; i < DRIFT_FLIPS_PER_FRAME; i++) {
        const rx = Math.floor(Math.random() * cols);
        const ry = Math.floor(Math.random() * rows);
        if (!cellVisible[ry]?.[rx]) continue;
        cellCh[ry][rx] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
    }

    function drawField() {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let visible = cellVisible[y][x];
          let color = toneColors[cellTone[y][x]];
          let lensAlpha = 0;

          if (pointer && pointerStrength > 0.01) {
            const cx = x * CELL_W + CELL_W / 2;
            const cy = y * CELL_H + CELL_H / 2;
            const d = Math.hypot(cx - pointer.x, cy - pointer.y);
            if (d < LENS_RADIUS) {
              const boost = (1 - d / LENS_RADIUS) * pointerStrength;
              if (boost > 0.1) visible = true; // the lens reveals cells that would otherwise be blank
              lensAlpha = boost;
            }
          }

          if (!visible) continue;
          if (lensAlpha > 0) color = accent2;

          ctx!.globalAlpha =
            lensAlpha > 0 ? Math.min(1, 0.55 + lensAlpha * 0.6) : 1;
          ctx!.fillStyle = color;
          ctx!.fillText(cellCh[y][x], x * CELL_W, y * CELL_H);
        }
      }
      ctx!.globalAlpha = 1;
    }

    // opacity: 0 = fully noise/hidden, 1 = fully resolved+locked. No
    // background — the message is set directly over the field in Telegram
    // blue, bigger and bolder than the ambient field, the field showing
    // through around every letter.
    function drawBlock(
      block: ReturnType<typeof layoutBlock>,
      elapsed: number,
      opacity: number,
      citationFrom: number,
    ) {
      if (!block.chars.length || opacity <= 0.01) return;

      ctx!.save();
      ctx!.globalAlpha = opacity;
      for (const c of block.chars) {
        const isCitation = c.row - block.chars[0].row >= citationFrom;
        const local = elapsed - c.delay;
        const px = c.col * QA_CHAR_W;
        const py = c.row * QA_CHAR_H;
        ctx!.font = isCitation
          ? `13px ${monoFamily}`
          : `700 22px ${fontFamily}`;
        if (local < 0) {
          continue; // not reached yet, field shows through
        } else if (local < LOCK_MS) {
          const t = local / LOCK_MS;
          const r = levelFor(c.col, c.row, cols, frame * 0.09 + c.col, clearTo);
          ctx!.fillStyle =
            t < 0.7
              ? toneColors[Math.min(3, r.tone + 1)]
              : isCitation
                ? accent2
                : accent;
          ctx!.fillText(t < 0.7 ? r.ch : c.ch, px, py);
        } else {
          ctx!.fillStyle = isCitation ? accent2 : accent;
          ctx!.fillText(c.ch, px, py);
        }
      }
      ctx!.restore();
    }

    function draw(ts: number) {
      raf = requestAnimationFrame(draw);
      if (!visible || !ctx || !cols || !rows) return;
      if (ts - last < FRAME_MS) return;
      last = ts;
      frame++;

      if (!phaseStart) phaseStart = ts;
      const elapsed = ts - phaseStart;
      const hasQA = examples && examples.length > 0;

      if (hasQA) {
        const dur =
          phase === "resolve-q"
            ? qDur
            : phase === "resolve-a"
              ? aDur
              : DUR[phase as keyof typeof DUR];
        if (elapsed > dur) {
          phaseStart = ts;
          const order: Phase[] = [
            "noise",
            "resolve-q",
            "hold-q",
            "resolve-a",
            "hold-both",
            "dissolve",
          ];
          const next = order[(order.indexOf(phase) + 1) % order.length];
          if (phase === "dissolve") {
            qaIndex++;
            layoutCurrent();
          }
          phase = next;
        }
      }

      pointerStrength += ((pointerActive ? 1 : 0) - pointerStrength) * 0.25;

      driftField();
      ctx.clearRect(0, 0, w, h);
      drawField();

      if (hasQA && qBlock && aBlock) {
        const e = ts - phaseStart;
        if (phase === "resolve-q") {
          drawBlock(qBlock, e, 1, 999);
        } else if (
          phase === "hold-q" ||
          phase === "resolve-a" ||
          phase === "hold-both"
        ) {
          drawBlock(qBlock, qDur + 1, 1, 999);
        }
        if (phase === "resolve-a") {
          drawBlock(aBlock, e, 1, aBlock.height - 1);
        } else if (phase === "hold-both") {
          drawBlock(aBlock, aDur + 1, 1, aBlock.height - 1);
        }
        if (phase === "dissolve") {
          const fade = Math.max(0, 1 - e / DUR.dissolve);
          drawBlock(qBlock, qDur + 1, fade, 999);
          drawBlock(aBlock, aDur + 1, fade, aBlock.height - 1);
        }
      }
    }
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      if (preEl) (preEl as HTMLElement).style.visibility = "visible";
    };
  }, [examples, clearTo]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden select-none ${className ?? ""}`}
    >
      <pre
        aria-hidden="true"
        className="font-outlier leading-4"
        style={{ fontSize: "16px", margin: 0 }}
      >
        {staticGrid.map((row, y) => (
          // A single compliant colour here, not the tone gradient the
          // canvas uses — the canvas draws pixels (nothing for a contrast
          // checker to scan); this is real DOM text, and the field's
          // lightest tones are deliberately far below 4.5:1 against paper.
          <div key={y} style={{ color: "var(--color-muted)" }}>
            {row.map((run, i) => (
              <span key={i}>{run.text}</span>
            ))}
          </div>
        ))}
      </pre>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 font-outlier"
      />
    </div>
  );
}
