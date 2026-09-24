import { motion, useReducedMotion } from "motion/react";

/** Slow-drifting colour orbs behind a faint grid. Decorative only. */
export function Backdrop() {
  const still = useReducedMotion();
  const drift = (x: number[], y: number[], duration: number) =>
    still
      ? {}
      : {
          animate: { x, y },
          transition: {
            duration,
            repeat: Infinity,
            repeatType: "mirror" as const,
            ease: "easeInOut" as const,
          },
        };

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-background" />
      <motion.div
        className="absolute -left-40 -top-48 size-[42rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--orb-1), transparent 65%)" }}
        {...drift([0, 80, -30], [0, 40, 90], 22)}
      />
      <motion.div
        className="absolute -right-48 -top-40 size-[38rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--orb-2), transparent 65%)" }}
        {...drift([0, -70, 20], [0, 60, -20], 26)}
      />
      <motion.div
        className="absolute left-1/3 top-[55vh] size-[34rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--orb-3), transparent 65%)" }}
        {...drift([0, 60, -60], [0, -50, 30], 30)}
      />
      <div className="bg-grid absolute inset-0" />
    </div>
  );
}
