import type { Transition, Variants } from "framer-motion";

export const eccEaseOut: Transition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
};

/** Landing hero brand presence. */
export const brandReveal: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  },
};

export const enterTransition = eccEaseOut;
export const layoutTransition: Transition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1],
};

export const eccLayout: Transition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1],
};

/** Map node entrance */
export const mapNodeEnter: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: eccEaseOut },
};

/** Intelligence feed item ingress (from bottom) */
export const feedIngress: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: eccEaseOut },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

/** Subtle live beacon pulse on feed header when WS connected */
export const feedLivePulse: Variants = {
  idle: { opacity: 0.45, scale: 1 },
  live: {
    opacity: [0.45, 1, 0.45],
    scale: [1, 1.15, 1],
    transition: {
      duration: 2.4,
      ease: "easeInOut",
      repeat: Infinity,
    },
  },
};

/** Wizard stage crossfade + horizontal slide */
export const stageTransition: Variants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir >= 0 ? 24 : -24,
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: eccLayout,
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir >= 0 ? -24 : 24,
    transition: { duration: 0.18 },
  }),
};

/** Rail active underline grow */
export const railUnderline: Variants = {
  inactive: { scaleX: 0, opacity: 0 },
  active: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] },
  },
};

export const reducedMotionVariants = {
  mapNodeEnter: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.15 } },
  } satisfies Variants,
  feedIngress: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.15 } },
    exit: { opacity: 0, transition: { duration: 0.1 } },
  } satisfies Variants,
  stageTransition: {
    enter: { opacity: 0 },
    center: { opacity: 1, transition: { duration: 0.15 } },
    exit: { opacity: 0, transition: { duration: 0.1 } },
  } satisfies Variants,
  feedLivePulse: {
    idle: { opacity: 0.7 },
    live: { opacity: 1 },
  } satisfies Variants,
  railUnderline: {
    inactive: { opacity: 0 },
    active: { opacity: 1, transition: { duration: 0.1 } },
  } satisfies Variants,
};
