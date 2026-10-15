/**
 * Live Presentation Viewer
 * Full-screen presentation viewer that renders slides like a real presentation
 * Use this to preview presentations before exporting
 */

import { ru } from '@/locales';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Grid,
  ImageIcon,
  Layers,
  Maximize2,
  MessageSquare,
  Minimize2,
  Palette,
  Pause,
  Play,
  Presentation,
  RotateCcw,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { SlideWithImage } from '../../hooks/usePresentationAI';

// ============================================================================
// TYPES
// ============================================================================

interface LivePresentationViewerProps {
  slides: SlideWithImage[];
  theme?: PresentationThemeConfig;
  onClose?: () => void;
  startSlide?: number;
  autoPlay?: boolean;
  autoPlayInterval?: number;
}

interface PresentationThemeConfig {
  name: string;
  colors: {
    background: string;
    text: string;
    primary: string;
    secondary: string;
    accent: string;
  };
  fonts: {
    heading: string;
    body: string;
    code: string;
  };
}

// ============================================================================
// DEFAULT THEMES
// ============================================================================

const THEMES = {
  // === DARK THEMES ===
  dark: {
    name: '🌙 Тёмная',
    colors: {
      background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #0d0d1a 100%)',
      text: '#ffffff',
      primary: '#a855f7',
      secondary: '#6b7280',
      accent: '#ec4899',
    },
    fonts: {
      heading: '"Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },
  midnight: {
    name: '🌌 Полночь',
    colors: {
      background: 'linear-gradient(180deg, #020617 0%, #0f172a 50%, #1e1b4b 100%)',
      text: '#e0e7ff',
      primary: '#818cf8',
      secondary: '#6366f1',
      accent: '#c084fc',
    },
    fonts: {
      heading: '"Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },

  // === LIGHT THEMES ===
  light: {
    name: '☀️ Светлая',
    colors: {
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, #f1f5f9 100%)',
      text: '#1a1a2e',
      primary: '#6366f1',
      secondary: '#64748b',
      accent: '#ec4899',
    },
    fonts: {
      heading: '"Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },
  cream: {
    name: '🍦 Кремовая',
    colors: {
      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%)',
      text: '#78350f',
      primary: '#d97706',
      secondary: '#92400e',
      accent: '#ea580c',
    },
    fonts: {
      heading: '"Merriweather", serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },

  // === PROFESSIONAL ===
  corporate: {
    name: '🏢 Корпоративная',
    colors: {
      background: 'linear-gradient(135deg, #0a192f 0%, #112240 50%, #0a192f 100%)',
      text: '#e6f1ff',
      primary: '#64ffda',
      secondary: '#8892b0',
      accent: '#f06449',
    },
    fonts: {
      heading: '"Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },
  minimal: {
    name: '✨ Минимализм',
    colors: {
      background: '#fefefe',
      text: '#1d1d1f',
      primary: '#1d1d1f',
      secondary: '#86868b',
      accent: '#0071e3',
    },
    fonts: {
      heading: '"SF Pro Display", "Inter", system-ui, sans-serif',
      body: '"SF Pro Text", "Inter", system-ui, sans-serif',
      code: '"SF Mono", "Fira Code", monospace',
    },
  },

  // === CREATIVE ===
  creative: {
    name: '🎨 Креативная',
    colors: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f64f59 100%)',
      text: '#ffffff',
      primary: '#ffffff',
      secondary: 'rgba(255,255,255,0.7)',
      accent: '#ffd700',
    },
    fonts: {
      heading: '"Poppins", sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },
  sunset: {
    name: '🌅 Закат',
    colors: {
      background: 'linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)',
      text: '#ffffff',
      primary: '#ffffff',
      secondary: 'rgba(255,255,255,0.8)',
      accent: '#fef08a',
    },
    fonts: {
      heading: '"Poppins", sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },
  aurora: {
    name: '🌈 Аврора',
    colors: {
      background: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 33%, #ec4899 66%, #f97316 100%)',
      text: '#ffffff',
      primary: '#ffffff',
      secondary: 'rgba(255,255,255,0.85)',
      accent: '#fef08a',
    },
    fonts: {
      heading: '"Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },

  // === LUXURY ===
  luxury: {
    name: '👑 Люкс',
    colors: {
      background: 'linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 50%, #0c0c0c 100%)',
      text: '#d4af37',
      primary: '#d4af37',
      secondary: '#8b7355',
      accent: '#ffffff',
    },
    fonts: {
      heading: '"Playfair Display", serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },
  royal: {
    name: '💎 Королевская',
    colors: {
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
      text: '#e0e7ff',
      primary: '#c4b5fd',
      secondary: '#a5b4fc',
      accent: '#fbbf24',
    },
    fonts: {
      heading: '"Cinzel", serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },

  // === TECH ===
  tech: {
    name: '🤖 Техно',
    colors: {
      background: 'linear-gradient(135deg, #0a0a0a 0%, #111111 50%, #0a0a0a 100%)',
      text: '#00f5ff',
      primary: '#00f5ff',
      secondary: '#00a8b5',
      accent: '#ff00ff',
    },
    fonts: {
      heading: '"JetBrains Mono", monospace',
      body: '"Inter", system-ui, sans-serif',
      code: '"JetBrains Mono", monospace',
    },
  },
  matrix: {
    name: '💻 Матрица',
    colors: {
      background: '#000000',
      text: '#00ff00',
      primary: '#00ff00',
      secondary: '#008800',
      accent: '#ffffff',
    },
    fonts: {
      heading: '"Share Tech Mono", monospace',
      body: '"Share Tech Mono", monospace',
      code: '"Share Tech Mono", monospace',
    },
  },
  neon: {
    name: '💜 Неон',
    colors: {
      background: 'linear-gradient(135deg, #0f0f0f 0%, #1a0a2e 50%, #0f0f0f 100%)',
      text: '#ff00ff',
      primary: '#ff00ff',
      secondary: '#00ffff',
      accent: '#ffff00',
    },
    fonts: {
      heading: '"Orbitron", sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },

  // === NATURE ===
  nature: {
    name: '🌿 Природа',
    colors: {
      background: 'linear-gradient(135deg, #0d1f0d 0%, #1a3a1a 50%, #0d1f0d 100%)',
      text: '#90ee90',
      primary: '#90ee90',
      secondary: '#6b8e6b',
      accent: '#ffd700',
    },
    fonts: {
      heading: '"Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },
  ocean: {
    name: '🌊 Океан',
    colors: {
      background: 'linear-gradient(180deg, #0c4a6e 0%, #075985 50%, #0369a1 100%)',
      text: '#e0f2fe',
      primary: '#38bdf8',
      secondary: '#7dd3fc',
      accent: '#fef08a',
    },
    fonts: {
      heading: '"Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },
  forest: {
    name: '🌲 Лес',
    colors: {
      background: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)',
      text: '#dcfce7',
      primary: '#86efac',
      secondary: '#4ade80',
      accent: '#fef08a',
    },
    fonts: {
      heading: '"Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },

  // === SPECIAL ===
  retro: {
    name: '📺 Ретро',
    colors: {
      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fbbf24 100%)',
      text: '#451a03',
      primary: '#b45309',
      secondary: '#78350f',
      accent: '#dc2626',
    },
    fonts: {
      heading: '"Courier Prime", monospace',
      body: '"Courier Prime", monospace',
      code: '"Courier Prime", monospace',
    },
  },
  candy: {
    name: '🍬 Конфетная',
    colors: {
      background: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 50%, #f9a8d4 100%)',
      text: '#831843',
      primary: '#db2777',
      secondary: '#be185d',
      accent: '#7c3aed',
    },
    fonts: {
      heading: '"Quicksand", sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },
  fire: {
    name: '🔥 Огонь',
    colors: {
      background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%)',
      text: '#fef2f2',
      primary: '#fca5a5',
      secondary: '#f87171',
      accent: '#fbbf24',
    },
    fonts: {
      heading: '"Inter", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      code: '"Fira Code", monospace',
    },
  },
};

// ============================================================================
// SLIDE TRANSITIONS - Multiple animation styles
// ============================================================================

type TransitionType = 'slide' | 'fade' | 'zoom' | 'flip' | 'cube' | 'swipe';

const TRANSITION_VARIANTS: Record<
  TransitionType,
  {
    enter: (direction: number) => object;
    center: object;
    exit: (direction: number) => object;
  }
> = {
  slide: {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
      scale: 0.95,
    }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (direction: number) => ({
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0,
      scale: 0.95,
    }),
  },
  fade: {
    enter: () => ({ opacity: 0, scale: 1.05 }),
    center: { opacity: 1, scale: 1 },
    exit: () => ({ opacity: 0, scale: 0.95 }),
  },
  zoom: {
    enter: (direction: number) => ({
      opacity: 0,
      scale: direction > 0 ? 0.5 : 1.5,
      rotateY: direction > 0 ? -15 : 15,
    }),
    center: { opacity: 1, scale: 1, rotateY: 0 },
    exit: (direction: number) => ({
      opacity: 0,
      scale: direction < 0 ? 0.5 : 1.5,
      rotateY: direction < 0 ? -15 : 15,
    }),
  },
  flip: {
    enter: (direction: number) => ({
      opacity: 0,
      rotateY: direction > 0 ? 90 : -90,
      scale: 0.9,
    }),
    center: { opacity: 1, rotateY: 0, scale: 1 },
    exit: (direction: number) => ({
      opacity: 0,
      rotateY: direction < 0 ? 90 : -90,
      scale: 0.9,
    }),
  },
  cube: {
    enter: (direction: number) => ({
      opacity: 0,
      rotateY: direction > 0 ? 90 : -90,
      x: direction > 0 ? '50%' : '-50%',
      z: -200,
    }),
    center: { opacity: 1, rotateY: 0, x: 0, z: 0 },
    exit: (direction: number) => ({
      opacity: 0,
      rotateY: direction < 0 ? 90 : -90,
      x: direction < 0 ? '50%' : '-50%',
      z: -200,
    }),
  },
  swipe: {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
      rotate: direction > 0 ? 5 : -5,
    }),
    center: { x: 0, opacity: 1, rotate: 0 },
    exit: (direction: number) => ({
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0,
      rotate: direction < 0 ? 5 : -5,
    }),
  },
};

const contentVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  }),
};

// ============================================================================
// PARTICLE EFFECTS
// ============================================================================

function seededRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

// ============================================================================
// THEME CSS VARIABLE HELPERS
// ============================================================================

function applyPresentationThemeVars(el: HTMLElement, t: PresentationThemeConfig): void {
  el.style.setProperty('--pv-bg', t.colors.background);
  el.style.setProperty('--pv-text', t.colors.text);
  el.style.setProperty('--pv-primary', t.colors.primary);
  el.style.setProperty('--pv-secondary', t.colors.secondary);
  el.style.setProperty('--pv-accent', t.colors.accent);
  el.style.setProperty('--pv-font-heading', t.fonts.heading);
  el.style.setProperty('--pv-font-body', t.fonts.body);
  el.style.setProperty('--pv-font-code', t.fonts.code);
  el.style.setProperty('--pv-secondary-10', `${t.colors.secondary}10`);
  el.style.setProperty('--pv-secondary-40', `${t.colors.secondary}40`);
  el.style.setProperty('--pv-primary-20', `${t.colors.primary}20`);
  el.style.setProperty('--pv-primary-30', `${t.colors.primary}30`);
  el.style.setProperty('--pv-primary-40', `${t.colors.primary}40`);
  el.style.setProperty('--pv-title-shadow', `0 0 60px ${t.colors.primary}40`);
  el.style.setProperty('--pv-image-shadow', `0 25px 50px -12px ${t.colors.primary}30`);
}

interface PresentationProgressBarProps {
  percent: number;
}

const PresentationProgressBar = memo<PresentationProgressBarProps>(({ percent }) => {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    progressRef.current?.style.setProperty('--pv-progress-width', `${percent}%`);
  }, [percent]);

  return <div ref={progressRef} className="pv-progress-fill h-full" />;
});

PresentationProgressBar.displayName = 'PresentationProgressBar';

interface ThemePreviewSwatchProps {
  themeConfig: PresentationThemeConfig;
}

const ThemePreviewSwatch = memo<ThemePreviewSwatchProps>(({ themeConfig }) => {
  const swatchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (swatchRef.current) {
      applyPresentationThemeVars(swatchRef.current, themeConfig);
    }
  }, [themeConfig]);

  return <div ref={swatchRef} className="pv-bg-theme mb-1 h-6 w-full rounded" />;
});

ThemePreviewSwatch.displayName = 'ThemePreviewSwatch';

// ============================================================================
// PARTICLE EFFECTS
// ============================================================================

const ParticleEffect = memo(({ color, count = 20 }: { color: string; count?: number }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;

  useEffect(() => {
    containerRef.current?.style.setProperty('--pv-particle-color', color);
  }, [color]);

  const particles = Array.from({ length: count }, (_, id) => ({
    id,
    initialX: seededRandom(id + 1) * viewportWidth,
    targetX: seededRandom(id + 2) * viewportWidth,
    initialY: viewportHeight + 20,
    initialScale: seededRandom(id + 3) * 0.5 + 0.5,
    duration: seededRandom(id + 4) * 3 + 2,
    delay: seededRandom(id + 5) * 2,
  }));

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="pv-particle absolute h-2 w-2 rounded-full"
          initial={{
            x: particle.initialX,
            y: particle.initialY,
            scale: particle.initialScale,
          }}
          animate={{
            y: -20,
            x: particle.targetX,
            opacity: [0.6, 0.8, 0],
            scale: [1, 1.5, 0],
          }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            delay: particle.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
});

ParticleEffect.displayName = 'ParticleEffect';

// ============================================================================
// LASER POINTER
// ============================================================================

const LaserPointer = memo(({ x, y, visible }: { x: number; y: number; visible: boolean }) => {
  const dotRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dotRef.current) {
      dotRef.current.style.setProperty('--pv-laser-x', `${x - 8}px`);
      dotRef.current.style.setProperty('--pv-laser-y', `${y - 8}px`);
    }
    if (trailRef.current) {
      trailRef.current.style.setProperty('--pv-laser-trail-x', `${x - 16}px`);
      trailRef.current.style.setProperty('--pv-laser-trail-y', `${y - 16}px`);
    }
  }, [x, y]);

  if (!visible) return null;
  return (
    <>
      {/* Laser dot */}
      <motion.div
        ref={dotRef}
        className="pv-laser-positioned pointer-events-none fixed z-[9999]"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
      >
        <div className="h-4 w-4 rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
        <div className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
      </motion.div>
      {/* Trail effect */}
      <motion.div
        ref={trailRef}
        className="pv-laser-trail pointer-events-none fixed z-[9998] h-8 w-8 rounded-full"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 2, opacity: [0.5, 0] }}
        transition={{ duration: 0.5 }}
        key={`${x}-${y}`}
      />
    </>
  );
});

LaserPointer.displayName = 'LaserPointer';

// ============================================================================
// SPOTLIGHT EFFECT
// ============================================================================

const SpotlightEffect = memo(({ x, y, active }: { x: number; y: number; active: boolean }) => {
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (spotlightRef.current) {
      spotlightRef.current.style.setProperty('--pv-spotlight-x', `${x}px`);
      spotlightRef.current.style.setProperty('--pv-spotlight-y', `${y}px`);
    }
  }, [x, y]);

  if (!active) return null;
  return (
    <div ref={spotlightRef} className="pv-spotlight pointer-events-none fixed inset-0 z-[9990]" />
  );
});

SpotlightEffect.displayName = 'SpotlightEffect';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LivePresentationViewer({
  slides,
  theme: customTheme,
  onClose,
  startSlide = 0,
  autoPlay: initialAutoPlay = false,
  autoPlayInterval = 5000,
}: LivePresentationViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(startSlide);
  const [direction, setDirection] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showOverview, setShowOverview] = useState(false);
  const [autoPlay, setAutoPlay] = useState(initialAutoPlay);
  const [showSpeakerNotes, setShowSpeakerNotes] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [presentationTime, setPresentationTime] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [selectedThemeKey, setSelectedThemeKey] = useState<keyof typeof THEMES>('dark');
  const [transitionSpeed, setTransitionSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [soundEnabled, setSoundEnabled] = useState(false);

  // New advanced features
  const [transitionType, setTransitionType] = useState<TransitionType>('slide');
  const [laserPointer, setLaserPointer] = useState({ x: 0, y: 0, visible: false });
  const [spotlightMode, setSpotlightMode] = useState(false);
  const [spotlightPos, setSpotlightPos] = useState({ x: 0, y: 0 });
  const [showParticles, setShowParticles] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [drawingMode, setDrawingMode] = useState(false);
  const [annotations, setAnnotations] = useState<Array<{ x: number; y: number }>>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const theme: PresentationThemeConfig = customTheme ?? THEMES[selectedThemeKey] ?? THEMES.dark;
  const currentSlide = slides[currentIndex];

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      applyPresentationThemeVars(el, theme);
      el.style.setProperty('--pv-zoom', String(zoomLevel));
    }
  }, [theme, zoomLevel]);

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  const goToSlide = useCallback(
    (index: number) => {
      if (index >= 0 && index < slides.length) {
        setDirection(index > currentIndex ? 1 : -1);
        setCurrentIndex(index);
      }
    },
    [currentIndex, slides.length]
  );

  const nextSlide = useCallback(() => {
    if (currentIndex < slides.length - 1) {
      setDirection(1);
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, slides.length]);

  const prevSlide = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  // ============================================================================
  // FULLSCREEN
  // ============================================================================

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // ============================================================================
  // KEYBOARD NAVIGATION
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'Enter':
          e.preventDefault();
          nextSlide();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevSlide();
          break;
        case 'Escape':
          if (showOverview) {
            setShowOverview(false);
          } else if (isFullscreen) {
            document.exitFullscreen?.();
          } else {
            onClose?.();
          }
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'o':
        case 'O':
          setShowOverview(!showOverview);
          break;
        case 'n':
        case 'N':
          setShowSpeakerNotes(!showSpeakerNotes);
          break;
        case 'Home':
          goToSlide(0);
          break;
        case 'End':
          goToSlide(slides.length - 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    nextSlide,
    prevSlide,
    goToSlide,
    showOverview,
    isFullscreen,
    onClose,
    showSpeakerNotes,
    slides.length,
    toggleFullscreen,
  ]);

  // ============================================================================
  // AUTO PLAY
  // ============================================================================

  useEffect(() => {
    if (autoPlay && currentIndex < slides.length - 1) {
      const timer = setTimeout(nextSlide, autoPlayInterval);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoPlay, currentIndex, nextSlide, autoPlayInterval, slides.length]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // ============================================================================
  // CONTROLS VISIBILITY
  // ============================================================================

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (!showOverview && !showSettings) {
        setShowControls(false);
      }
    }, 3000);
  }, [showOverview, showSettings]);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // ============================================================================
  // PRESENTATION TIMER
  // ============================================================================

  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setPresentationTime((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resetTimer = () => {
    setPresentationTime(0);
  };

  const handleLaserMove = useCallback(
    (e: React.MouseEvent) => {
      if (laserPointer.visible) {
        setLaserPointer({ x: e.clientX, y: e.clientY, visible: true });
      }
      if (spotlightMode) {
        setSpotlightPos({ x: e.clientX, y: e.clientY });
      }
      if (drawingMode) {
        setAnnotations((prev) => [...prev, { x: e.clientX, y: e.clientY }]);
      }
    },
    [laserPointer.visible, spotlightMode, drawingMode]
  );

  const clearAnnotations = () => setAnnotations([]);

  // ============================================================================
  // RENDER SLIDE CONTENT
  // ============================================================================

  const renderSlideContent = (slide: SlideWithImage, _t: PresentationThemeConfig) => {
    const content = Array.isArray(slide.content) ? slide.content : [slide.content];

    switch (slide.type) {
      case 'title':
        return (
          <div className="relative flex h-full flex-col items-center justify-center px-12 text-center">
            {/* Decorative background elements */}
            <motion.div
              className="pointer-events-none absolute inset-0 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1 }}
            >
              <div className="pv-bg-primary absolute top-1/4 left-1/4 h-96 w-96 rounded-full opacity-20 blur-3xl" />
              <div className="pv-bg-accent absolute right-1/4 bottom-1/4 h-80 w-80 rounded-full opacity-15 blur-3xl" />
            </motion.div>

            <motion.div
              custom={0}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              className="mb-6"
            >
              <Presentation className="pv-text-primary mx-auto h-16 w-16 opacity-40" />
            </motion.div>

            <motion.h1
              custom={1}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              className="pv-title-shadow relative mb-8 text-5xl font-bold md:text-6xl lg:text-8xl"
            >
              {slide.title}
            </motion.h1>
            {content[0] && (
              <motion.p
                custom={2}
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                className="pv-subtitle max-w-4xl text-xl md:text-2xl lg:text-3xl"
              >
                {content[0]}
              </motion.p>
            )}

            {/* Slide number badge */}
            <motion.div
              custom={3}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              className="pv-bg-primary-muted absolute bottom-12 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm"
            >
              Слайд {slide.slideNumber}
            </motion.div>
          </div>
        );

      case 'image':
        return (
          <div className="flex h-full flex-col items-center justify-center px-12">
            <div className="mb-8 flex items-center gap-4">
              <motion.div
                custom={0}
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                className="pv-icon-bg rounded-xl p-3"
              >
                <ImageIcon className="pv-text-primary h-8 w-8" />
              </motion.div>
              {slide.title && (
                <motion.h2
                  custom={1}
                  variants={contentVariants}
                  initial="hidden"
                  animate="visible"
                  className="pv-heading text-center text-3xl font-bold md:text-4xl lg:text-5xl"
                >
                  {slide.title}
                </motion.h2>
              )}
            </div>
            <motion.div
              custom={2}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              className="flex max-h-[65vh] w-full flex-1 items-center justify-center"
            >
              {slide.generatedImageUrl ? (
                <motion.img
                  src={slide.generatedImageUrl}
                  alt={slide.title}
                  className="pv-image-shadow max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.3 }}
                />
              ) : (
                <div className="pv-image-placeholder flex aspect-video w-full max-w-4xl flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed">
                  <ImageIcon className="pv-text-secondary h-16 w-16 opacity-30" />
                  <span className="pv-text-secondary text-lg">Изображение будет здесь</span>
                </div>
              )}
            </motion.div>
          </div>
        );

      case 'quote':
        return (
          <div className="relative flex h-full flex-col items-center justify-center px-12 md:px-24">
            {/* Decorative quote marks */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 0.1, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="pv-text-primary absolute top-1/4 left-16 font-serif text-[180px] leading-none select-none"
            >
              "
            </motion.div>

            <motion.blockquote
              custom={0}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              className="pv-text pv-font-body relative z-10 max-w-4xl text-center text-2xl leading-relaxed italic md:text-3xl lg:text-4xl"
            >
              "{content[0]}"
            </motion.blockquote>
            {slide.title && (
              <motion.cite
                custom={1}
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                className="pv-text-primary mt-10 flex items-center gap-3 text-xl not-italic md:text-2xl"
              >
                <span className="pv-quote-divider h-0.5 w-12" />
                {slide.title}
              </motion.cite>
            )}
          </div>
        );

      case 'code':
        return (
          <div className="flex h-full flex-col px-12 py-8">
            {slide.title && (
              <motion.h2
                custom={0}
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                className="pv-heading mb-6 text-3xl font-bold md:text-4xl"
              >
                {slide.title}
              </motion.h2>
            )}
            <motion.div
              custom={1}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              className="flex-1 overflow-auto rounded-xl border border-zinc-700/50"
            >
              {/* Code editor header */}
              <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/80" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                  <div className="h-3 w-3 rounded-full bg-green-500/80" />
                </div>
                <span className="ml-2 text-xs text-zinc-500">code.tsx</span>
              </div>
              <pre className="pv-code-block-live overflow-x-auto p-6 text-sm md:text-base lg:text-lg">
                <code>{slide.codeSnippet?.code || content.join('\n')}</code>
              </pre>
            </motion.div>
          </div>
        );

      case 'content':
      default:
        return (
          <div className="flex h-full flex-col px-12 py-8 lg:px-20">
            {slide.title && (
              <motion.h2
                custom={0}
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                className="pv-heading mb-10 text-3xl font-bold md:text-4xl lg:text-5xl"
              >
                {slide.title}
              </motion.h2>
            )}
            <div className="flex flex-1 items-center">
              <ul className="w-full max-w-5xl space-y-4">
                {content.map((item, i) => (
                  <motion.li
                    key={i}
                    custom={i + 1}
                    variants={contentVariants}
                    initial="hidden"
                    animate="visible"
                    className="pv-list-item flex items-start gap-5 rounded-xl p-4 text-lg transition-colors hover:bg-white/5 md:text-xl lg:text-2xl"
                  >
                    <span className="pv-list-number flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold">
                      {i + 1}
                    </span>
                    <span className="pt-2">{item}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>
        );
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!currentSlide) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-900 text-white">
        <p>Нет слайдов для показа</p>
      </div>
    );
  }

  // Get current transition variant
  const currentTransition = TRANSITION_VARIANTS[transitionType];

  return (
    <div
      ref={containerRef}
      className="pv-root pv-zoomable relative h-full w-full overflow-hidden select-none"
      onMouseMove={(e) => {
        handleMouseMove();
        handleLaserMove(e);
      }}
      onClick={() => !showOverview && !drawingMode && nextSlide()}
    >
      {/* Particle Effects */}
      {showParticles && <ParticleEffect color={theme.colors.primary} count={30} />}

      {/* Laser Pointer */}
      <LaserPointer x={laserPointer.x} y={laserPointer.y} visible={laserPointer.visible} />

      {/* Spotlight Effect */}
      <SpotlightEffect x={spotlightPos.x} y={spotlightPos.y} active={spotlightMode} />

      {/* Drawing Annotations */}
      {annotations.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 z-50">
          <path
            d={annotations.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
            stroke={theme.colors.primary}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Slide Content */}
      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.div
          key={currentIndex}
          custom={direction}
          variants={currentTransition as never}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: 'spring', stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
          }}
          className="pv-slide-perspective absolute inset-0 flex items-center justify-center"
        >
          {renderSlideContent(currentSlide, theme)}
        </motion.div>
      </AnimatePresence>

      {/* Progress Bar */}
      <div className="absolute right-0 bottom-0 left-0 h-1 bg-white/10">
        <PresentationProgressBar percent={((currentIndex + 1) / slides.length) * 100} />
      </div>

      {/* Controls Overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0"
          >
            {/* Premium Top Bar */}
            <div className="pointer-events-auto absolute top-0 right-0 left-0 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4">
              <div className="flex items-center gap-2">
                {onClose && (
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                    }}
                    className="rounded-xl border border-red-500/30 bg-red-500/20 p-2.5 backdrop-blur-sm transition-all hover:bg-red-500/40"
                    title="Закрыть (Esc)"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <X className="h-5 w-5 text-red-400" />
                  </motion.button>
                )}

                {/* Slide Counter Badge */}
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 backdrop-blur-sm">
                  <Layers className="h-4 w-4 opacity-60" />
                  <span className="text-sm font-bold">{currentIndex + 1}</span>
                  <span className="text-sm opacity-50">/ {slides.length}</span>
                </div>

                {/* Current Slide Type */}
                <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 md:flex">
                  <Sparkles className="pv-text-primary h-4 w-4 opacity-60" />
                  <span className="text-xs font-medium capitalize opacity-70">
                    {currentSlide?.type}
                  </span>
                </div>

                {/* Presentation Timer */}
                <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 lg:flex">
                  <Clock className="h-4 w-4 text-cyan-400 opacity-60" />
                  <span className="font-mono text-sm font-bold text-cyan-400">
                    {formatTime(presentationTime)}
                  </span>
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsTimerRunning(!isTimerRunning);
                    }}
                    className={`rounded-lg p-1 transition-all ${isTimerRunning ? 'bg-cyan-500/20' : 'bg-orange-500/20'}`}
                    whileTap={{ scale: 0.9 }}
                  >
                    {isTimerRunning ? (
                      <Pause className="h-3 w-3 text-cyan-400" />
                    ) : (
                      <Play className="h-3 w-3 text-orange-400" />
                    )}
                  </motion.button>
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      resetTimer();
                    }}
                    className="rounded-lg bg-white/10 p-1 transition-all hover:bg-white/20"
                    whileTap={{ scale: 0.9 }}
                    title="Сбросить таймер"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </motion.button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Sound Toggle */}
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSoundEnabled(!soundEnabled);
                  }}
                  className={`hidden rounded-xl border p-2.5 backdrop-blur-sm transition-all md:flex ${
                    soundEnabled
                      ? 'border-cyan-500/50 bg-cyan-500/30'
                      : 'border-white/10 bg-white/10 hover:bg-white/20'
                  }`}
                  title="Звук"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {soundEnabled ? (
                    <Volume2 className="h-5 w-5 text-cyan-400" />
                  ) : (
                    <VolumeX className="h-5 w-5" />
                  )}
                </motion.button>

                {/* Speaker Notes Toggle */}
                {currentSlide?.speakerNotes && (
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSpeakerNotes(!showSpeakerNotes);
                    }}
                    className={`rounded-xl border p-2.5 backdrop-blur-sm transition-all ${
                      showSpeakerNotes
                        ? 'border-purple-500/50 bg-purple-500/30'
                        : 'border-white/10 bg-white/10 hover:bg-white/20'
                    }`}
                    title="Заметки (N)"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <MessageSquare className="h-5 w-5" />
                  </motion.button>
                )}

                {/* Settings */}
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSettings(!showSettings);
                  }}
                  className={`rounded-xl border p-2.5 backdrop-blur-sm transition-all ${
                    showSettings
                      ? 'border-orange-500/50 bg-orange-500/30'
                      : 'border-white/10 bg-white/10 hover:bg-white/20'
                  }`}
                  title="Настройки"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Settings2 className="h-5 w-5" />
                </motion.button>

                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOverview(!showOverview);
                  }}
                  className={`rounded-xl border p-2.5 backdrop-blur-sm transition-all ${
                    showOverview
                      ? 'border-purple-500/50 bg-purple-500/30'
                      : 'border-white/10 bg-white/10 hover:bg-white/20'
                  }`}
                  title="Обзор (O)"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Grid className="h-5 w-5" />
                </motion.button>

                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAutoPlay(!autoPlay);
                  }}
                  className={`rounded-xl border p-2.5 backdrop-blur-sm transition-all ${
                    autoPlay
                      ? 'border-green-500/50 bg-green-500/30'
                      : 'border-white/10 bg-white/10 hover:bg-white/20'
                  }`}
                  title={autoPlay ? 'Пауза' : 'Авто'}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {autoPlay ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </motion.button>

                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFullscreen();
                  }}
                  className="rounded-xl border border-white/10 bg-white/10 p-2.5 backdrop-blur-sm transition-all hover:bg-white/20"
                  title="Полный экран (F)"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-5 w-5" />
                  ) : (
                    <Maximize2 className="h-5 w-5" />
                  )}
                </motion.button>
              </div>
            </div>

            {/* Premium Navigation Arrows */}
            {currentIndex > 0 && (
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  prevSlide();
                }}
                className="group pointer-events-auto absolute top-1/2 left-6 -translate-y-1/2 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm transition-all hover:bg-white/20"
                title="Назад (←)"
                whileHover={{ scale: 1.1, x: -4 }}
                whileTap={{ scale: 0.95 }}
              >
                <ChevronLeft className="h-8 w-8 transition-colors group-hover:text-purple-400" />
              </motion.button>
            )}
            {currentIndex < slides.length - 1 && (
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  nextSlide();
                }}
                className="group pointer-events-auto absolute top-1/2 right-6 -translate-y-1/2 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm transition-all hover:bg-white/20"
                title="Вперёд (→)"
                whileHover={{ scale: 1.1, x: 4 }}
                whileTap={{ scale: 0.95 }}
              >
                <ChevronRight className="h-8 w-8 transition-colors group-hover:text-purple-400" />
              </motion.button>
            )}

            {/* Premium Keyboard Hints */}
            <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3">
              {[
                { key: '← →', label: 'Навигация' },
                { key: 'F', label: 'Экран' },
                { key: 'O', label: 'Обзор' },
                { key: 'N', label: 'Заметки' },
                { key: 'Esc', label: 'Выход' },
              ].map((hint) => (
                <div key={hint.key} className="flex items-center gap-1.5 text-xs opacity-60">
                  <kbd className="rounded-md border border-white/20 bg-white/10 px-2 py-1 font-mono text-[10px]">
                    {hint.key}
                  </kbd>
                  <span className="hidden sm:inline">{hint.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Speaker Notes Panel */}
      <AnimatePresence>
        {showSpeakerNotes && currentSlide.speakerNotes && (
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25 }}
            className="absolute right-0 bottom-0 left-0 max-h-[35vh] overflow-auto border-t border-white/10 bg-gradient-to-t from-black/95 via-black/90 to-black/80 p-6 backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto max-w-4xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-purple-500/20 p-2">
                  <MessageSquare className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Заметки докладчика</h4>
                  <p className="text-xs text-zinc-500">
                    Слайд {currentIndex + 1}: {currentSlide.title}
                  </p>
                </div>
                <button
                  onClick={() => setShowSpeakerNotes(false)}
                  className="ml-auto rounded-lg bg-white/10 p-2 transition-colors hover:bg-white/20"
                  title="Закрыть заметки"
                  aria-label="Закрыть заметки"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-base leading-relaxed whitespace-pre-wrap text-zinc-300">
                {currentSlide.speakerNotes}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Overview Grid */}
      <AnimatePresence>
        {showOverview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 overflow-auto bg-black/95 p-8 backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto max-w-7xl">
              {/* Header */}
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 p-3 shadow-lg shadow-purple-500/20">
                    <Grid className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Обзор презентации</h3>
                    <p className="text-sm text-zinc-500">
                      {slides.length} слайдов • Текущий: {currentIndex + 1}
                    </p>
                  </div>
                </div>
                <motion.button
                  onClick={() => setShowOverview(false)}
                  className="rounded-xl border border-white/10 bg-white/10 p-3 transition-all hover:bg-white/20"
                  title="Закрыть"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X className="h-5 w-5" />
                </motion.button>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {slides.map((slide, index) => (
                  <motion.button
                    key={index}
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: index * 0.03, type: 'spring', stiffness: 300 }}
                    whileHover={{ scale: 1.05, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      goToSlide(index);
                      setShowOverview(false);
                    }}
                    className={`group relative aspect-video overflow-hidden rounded-xl border-2 transition-all ${
                      index === currentIndex
                        ? 'border-purple-500 shadow-lg ring-4 shadow-purple-500/20 ring-purple-500/30'
                        : 'border-zinc-700/50 hover:border-zinc-500'
                    } pv-bg-theme`}
                  >
                    {/* Slide Preview */}
                    <div className="relative flex h-full w-full flex-col p-4">
                      {/* Current indicator */}
                      {index === currentIndex && (
                        <div className="absolute top-2 right-2 rounded-full bg-purple-500 px-2 py-1 text-[10px] font-bold text-white">
                          Текущий
                        </div>
                      )}

                      {/* Slide number */}
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 text-xs font-bold">
                          {index + 1}
                        </span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] capitalize">
                          {slide.type}
                        </span>
                      </div>

                      {/* Title */}
                      <span className="truncate text-left text-sm font-semibold transition-colors group-hover:text-purple-400">
                        {slide.title}
                      </span>

                      {/* Content preview */}
                      <span className="mt-1 truncate text-left text-[10px] opacity-50">
                        {Array.isArray(slide.content)
                          ? slide.content[0]?.slice(0, 40)
                          : slide.content?.slice(0, 40)}
                        ...
                      </span>

                      {/* Image indicator */}
                      {slide.generatedImageUrl && (
                        <div className="absolute right-2 bottom-2 rounded bg-green-500/20 p-1">
                          <ImageIcon className="h-3 w-3 text-green-400" />
                        </div>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', damping: 25 }}
            className="absolute top-0 right-0 bottom-0 w-80 overflow-auto border-l border-white/10 bg-black/95 p-6 backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-orange-500/20 p-2">
                  <Settings2 className="h-5 w-5 text-orange-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Настройки</h3>
              </div>
              <motion.button
                onClick={() => setShowSettings(false)}
                className="rounded-lg bg-white/10 p-2 transition-all hover:bg-white/20"
                whileTap={{ scale: 0.95 }}
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>

            <div className="space-y-6">
              {/* Transition Type */}
              <div>
                <label className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-400">
                  ✨ Тип анимации
                </label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['slide', 'fade', 'zoom', 'flip', 'cube', 'swipe'] as TransitionType[]).map(
                    (type) => (
                      <motion.button
                        key={type}
                        onClick={() => setTransitionType(type)}
                        className={`rounded-lg px-3 py-2 text-xs font-medium capitalize transition-all ${
                          transitionType === type
                            ? 'border border-purple-500/50 bg-purple-500/30 text-purple-300'
                            : 'border border-white/10 bg-white/10 text-zinc-400 hover:bg-white/20'
                        }`}
                        whileTap={{ scale: 0.95 }}
                      >
                        {type === 'slide'
                          ? `➡️ ${ru.presentation.transitions.slide}`
                          : type === 'fade'
                            ? `🌫️ ${ru.presentation.transitions.fade}`
                            : type === 'zoom'
                              ? `🔍 ${ru.presentation.transitions.zoom}`
                              : type === 'flip'
                                ? `🔄 ${ru.presentation.transitions.flip}`
                                : type === 'cube'
                                  ? `📦 ${ru.presentation.transitions.cube}`
                                  : `👆 ${ru.presentation.transitions.swipe}`}
                      </motion.button>
                    )
                  )}
                </div>
              </div>

              {/* Transition Speed */}
              <div>
                <label className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-400">
                  <Zap className="h-4 w-4 text-yellow-400" />
                  Скорость переходов
                </label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['slow', 'normal', 'fast'] as const).map((speed) => (
                    <motion.button
                      key={speed}
                      onClick={() => setTransitionSpeed(speed)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        transitionSpeed === speed
                          ? 'border border-yellow-500/50 bg-yellow-500/30 text-yellow-300'
                          : 'border border-white/10 bg-white/10 text-zinc-400 hover:bg-white/20'
                      }`}
                      whileTap={{ scale: 0.95 }}
                    >
                      {speed === 'slow'
                        ? '🐢 Медленно'
                        : speed === 'normal'
                          ? '⚡ Обычно'
                          : '🚀 Быстро'}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Presenter Tools */}
              <div>
                <label className="mb-3 block text-sm font-medium text-zinc-400">
                  🎯 Инструменты докладчика
                </label>
                <div className="space-y-2">
                  {/* Laser Pointer */}
                  <div className="flex items-center justify-between rounded-lg bg-white/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-red-400">🔴</span>
                      <span className="text-sm text-zinc-300">Лазерная указка</span>
                    </div>
                    <motion.button
                      onClick={() =>
                        setLaserPointer((prev) => ({ ...prev, visible: !prev.visible }))
                      }
                      className={`h-6 w-12 rounded-full transition-all ${
                        laserPointer.visible ? 'bg-red-500' : 'bg-zinc-700'
                      }`}
                      whileTap={{ scale: 0.95 }}
                    >
                      <motion.div
                        className="h-5 w-5 rounded-full bg-white shadow-lg"
                        animate={{ x: laserPointer.visible ? 26 : 2 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    </motion.button>
                  </div>

                  {/* Spotlight */}
                  <div className="flex items-center justify-between rounded-lg bg-white/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-400">💡</span>
                      <span className="text-sm text-zinc-300">Прожектор</span>
                    </div>
                    <motion.button
                      onClick={() => setSpotlightMode(!spotlightMode)}
                      className={`h-6 w-12 rounded-full transition-all ${
                        spotlightMode ? 'bg-yellow-500' : 'bg-zinc-700'
                      }`}
                      whileTap={{ scale: 0.95 }}
                    >
                      <motion.div
                        className="h-5 w-5 rounded-full bg-white shadow-lg"
                        animate={{ x: spotlightMode ? 26 : 2 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    </motion.button>
                  </div>

                  {/* Drawing Mode */}
                  <div className="flex items-center justify-between rounded-lg bg-white/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-blue-400">✏️</span>
                      <span className="text-sm text-zinc-300">Рисование</span>
                    </div>
                    <motion.button
                      onClick={() => setDrawingMode(!drawingMode)}
                      className={`h-6 w-12 rounded-full transition-all ${
                        drawingMode ? 'bg-blue-500' : 'bg-zinc-700'
                      }`}
                      whileTap={{ scale: 0.95 }}
                    >
                      <motion.div
                        className="h-5 w-5 rounded-full bg-white shadow-lg"
                        animate={{ x: drawingMode ? 26 : 2 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    </motion.button>
                  </div>

                  {/* Clear Annotations */}
                  {annotations.length > 0 && (
                    <motion.button
                      onClick={clearAnnotations}
                      className="w-full rounded-lg bg-red-500/20 p-2 text-sm text-red-400 transition-all hover:bg-red-500/30"
                      whileTap={{ scale: 0.98 }}
                    >
                      🗑️ Очистить рисунок
                    </motion.button>
                  )}

                  {/* Particles */}
                  <div className="flex items-center justify-between rounded-lg bg-white/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-pink-400">✨</span>
                      <span className="text-sm text-zinc-300">Частицы</span>
                    </div>
                    <motion.button
                      onClick={() => setShowParticles(!showParticles)}
                      className={`h-6 w-12 rounded-full transition-all ${
                        showParticles ? 'bg-pink-500' : 'bg-zinc-700'
                      }`}
                      whileTap={{ scale: 0.95 }}
                    >
                      <motion.div
                        className="h-5 w-5 rounded-full bg-white shadow-lg"
                        animate={{ x: showParticles ? 26 : 2 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Zoom Control */}
              <div>
                <label className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-400">
                  🔍 Масштаб: {Math.round(zoomLevel * 100)}%
                </label>
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={() => setZoomLevel((prev) => Math.max(0.5, prev - 0.1))}
                    className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
                    whileTap={{ scale: 0.95 }}
                  >
                    ➖
                  </motion.button>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={zoomLevel}
                    onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                    className="flex-1 accent-purple-500"
                    aria-label="Масштаб"
                    title="Масштаб презентации"
                  />
                  <motion.button
                    onClick={() => setZoomLevel((prev) => Math.min(2, prev + 0.1))}
                    className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
                    whileTap={{ scale: 0.95 }}
                  >
                    ➕
                  </motion.button>
                  <motion.button
                    onClick={() => setZoomLevel(1)}
                    className="rounded-lg bg-white/10 p-2 text-xs hover:bg-white/20"
                    whileTap={{ scale: 0.95 }}
                  >
                    100%
                  </motion.button>
                </div>
              </div>

              {/* Theme Selector */}
              <div>
                <label className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-400">
                  <Palette className="h-4 w-4 text-purple-400" />
                  Тема презентации
                </label>
                <div className="mt-2 grid max-h-48 grid-cols-2 gap-2 overflow-auto pr-1">
                  {Object.entries(THEMES).map(([key, t]) => (
                    <motion.button
                      key={key}
                      onClick={() => setSelectedThemeKey(key as keyof typeof THEMES)}
                      className={`rounded-lg p-2 text-left transition-all ${
                        selectedThemeKey === key
                          ? 'bg-white/10 ring-2 ring-purple-500'
                          : 'bg-white/5 hover:bg-white/10'
                      }`}
                      whileTap={{ scale: 0.98 }}
                    >
                      <ThemePreviewSwatch themeConfig={t} />
                      <span className="text-[10px] text-zinc-400">{t.name}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Mini Map Toggle */}
              <div className="flex items-center justify-between rounded-lg bg-white/5 p-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm text-zinc-300">Мини-карта</span>
                </div>
                <motion.button
                  onClick={() => setShowMiniMap(!showMiniMap)}
                  className={`h-6 w-12 rounded-full transition-all ${
                    showMiniMap ? 'bg-cyan-500' : 'bg-zinc-700'
                  }`}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.div
                    className="h-5 w-5 rounded-full bg-white shadow-lg"
                    animate={{ x: showMiniMap ? 26 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </motion.button>
              </div>

              {/* Sound Toggle */}
              <div className="flex items-center justify-between rounded-lg bg-white/5 p-3">
                <div className="flex items-center gap-2">
                  {soundEnabled ? (
                    <Volume2 className="h-4 w-4 text-green-400" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-zinc-500" />
                  )}
                  <span className="text-sm text-zinc-300">Звуковые эффекты</span>
                </div>
                <motion.button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`h-6 w-12 rounded-full transition-all ${
                    soundEnabled ? 'bg-green-500' : 'bg-zinc-700'
                  }`}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.div
                    className="h-5 w-5 rounded-full bg-white shadow-lg"
                    animate={{ x: soundEnabled ? 26 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </motion.button>
              </div>

              {/* Keyboard Shortcuts */}
              <div>
                <label className="mb-3 block text-sm font-medium text-zinc-400">
                  ⌨️ Горячие клавиши
                </label>
                <div className="space-y-2 text-xs">
                  {[
                    { key: '← →', desc: 'Навигация по слайдам' },
                    { key: 'Space', desc: 'Следующий слайд' },
                    { key: 'F', desc: 'Полный экран' },
                    { key: 'O', desc: 'Обзор слайдов' },
                    { key: 'N', desc: 'Заметки докладчика' },
                    { key: 'Esc', desc: 'Закрыть / Выход' },
                  ].map((shortcut) => (
                    <div
                      key={shortcut.key}
                      className="flex items-center justify-between rounded-lg bg-white/5 p-2"
                    >
                      <kbd className="rounded bg-zinc-800 px-2 py-1 font-mono text-zinc-400">
                        {shortcut.key}
                      </kbd>
                      <span className="text-zinc-500">{shortcut.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mini Map */}
      <AnimatePresence>
        {showMiniMap && showControls && !showOverview && !showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute right-6 bottom-20 flex gap-1 rounded-xl border border-white/10 bg-black/60 p-2 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {slides.map((_, index) => (
              <motion.button
                key={index}
                onClick={() => goToSlide(index)}
                className={`h-5 w-8 rounded transition-all ${
                  index === currentIndex
                    ? 'bg-purple-500 shadow-lg shadow-purple-500/50'
                    : index < currentIndex
                      ? 'bg-green-500/50'
                      : 'bg-white/20 hover:bg-white/40'
                }`}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                title={`Слайд ${index + 1}`}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LivePresentationViewer;
