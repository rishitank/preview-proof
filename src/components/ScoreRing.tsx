import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";

export function ScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const tone =
    clamped >= 80
      ? "var(--color-success)"
      : clamped >= 50
        ? "var(--color-warning)"
        : "var(--color-destructive)";

  const still = useReducedMotion();
  const progress = useMotionValue(still ? clamped : 0);
  const offset = useTransform(progress, (v) => circumference * (1 - v / 100));
  const shown = useTransform(progress, (v) => Math.round(v));

  useEffect(() => {
    if (still) {
      progress.set(clamped);
      return;
    }
    const controls = animate(progress, clamped, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [clamped, still, progress]);

  return (
    <div className="relative size-36 shrink-0">
      <span className="sr-only">{`Score: ${clamped} out of 100`}</span>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="10"
        />
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: offset, filter: `drop-shadow(0 0 6px ${tone})` }}
        />
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span className="font-display text-4xl font-bold leading-none tabular-nums">
          {shown}
        </motion.span>
        <span className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
          out of 100
        </span>
      </div>
    </div>
  );
}
