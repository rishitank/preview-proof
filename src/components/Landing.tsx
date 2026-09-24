import { motion } from "motion/react";
import {
  Bot,
  FileCode2,
  Gauge,
  Image as ImageIcon,
  Link2,
  ScanSearch,
  SearchCheck,
  Share2,
  Sparkles,
  Wand2,
} from "lucide-react";

const reveal = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
};

const STEPS = [
  {
    Icon: ScanSearch,
    title: "Fetch like a bot",
    body: "We request your page the way Slack, X and LinkedIn do: no JavaScript, a strict time limit, and redirects followed.",
  },
  {
    Icon: Share2,
    title: "See every preview",
    body: "Google, X, LinkedIn, Slack and iMessage/WhatsApp cards rendered from your real tags, with each platform's fallbacks.",
  },
  {
    Icon: Wand2,
    title: "Fix it in one paste",
    body: "Each issue comes with the exact HTML and a prompt you can paste straight into Lovable, or copy everything at once.",
  },
];

const CHECKS = [
  { Icon: Bot, label: "Pages that are blank until JavaScript runs" },
  { Icon: ImageIcon, label: "Preview image: present, loads, is an image, not too heavy" },
  { Icon: FileCode2, label: "Title and description: present, not placeholders, right length" },
  { Icon: Share2, label: "Open Graph and X card tags" },
  { Icon: SearchCheck, label: "noindex in meta tags or X-Robots-Tag" },
  { Icon: Link2, label: "Canonical URL and redirects" },
  { Icon: Gauge, label: "Slow first responses that make bots give up" },
  { Icon: Sparkles, label: "Stock template images and default titles" },
];

export function Landing() {
  return (
    <div className="space-y-20 pt-6">
      <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-24">
        <motion.h2
          {...reveal}
          id="how-heading"
          className="text-center text-3xl font-bold sm:text-4xl"
        >
          How it works
        </motion.h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ Icon, title, body }, i) => (
            <motion.div
              key={title}
              {...reveal}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="surface-card p-6"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-gradient-brand text-primary-foreground shadow-soft">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="what-we-check" aria-labelledby="checks-heading" className="scroll-mt-24">
        <motion.h2
          {...reveal}
          id="checks-heading"
          className="text-center text-3xl font-bold sm:text-4xl"
        >
          What we check
        </motion.h2>
        <motion.p {...reveal} className="mx-auto mt-2 max-w-xl text-center text-muted-foreground">
          The things that quietly turn a share into a bare blue link.
        </motion.p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {CHECKS.map(({ Icon, label }, i) => (
            <motion.li
              key={label}
              {...reveal}
              transition={{ duration: 0.4, delay: (i % 2) * 0.06 }}
              className="surface-card flex items-center gap-3 p-4"
            >
              <Icon className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="text-sm font-medium">{label}</span>
            </motion.li>
          ))}
        </ul>
      </section>
    </div>
  );
}
