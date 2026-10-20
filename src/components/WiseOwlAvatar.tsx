import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Volume2, VolumeX, Lightbulb, Trophy, Star } from 'lucide-react';

export type OwlMood = 'idle' | 'happy' | 'thinking' | 'celebrating' | 'hint';

// ==========================================
// SINTETIZADOR DE AUDIO WEB (Cero assets externos)
// ==========================================
class OwlAudioSynth {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public playSuccessChime() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // Do, Mi, Sol, Do (C5, E5, G5, C6)
      notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + i * 0.08);

        gain.gain.setValueAtTime(0.001, this.ctx!.currentTime + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.18, this.ctx!.currentTime + i * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + i * 0.08 + 0.28);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(this.ctx!.currentTime + i * 0.08);
        osc.stop(this.ctx!.currentTime + i * 0.08 + 0.3);
      });
    } catch (_) {}
  }

  public playLevelUpChime() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const notes = [440, 554.37, 659.25, 880, 1108.73];
      notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + i * 0.1);

        gain.gain.setValueAtTime(0.001, this.ctx!.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.22, this.ctx!.currentTime + i * 0.1 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + i * 0.1 + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(this.ctx!.currentTime + i * 0.1);
        osc.stop(this.ctx!.currentTime + i * 0.1 + 0.45);
      });
    } catch (_) {}
  }

  public playEncouragementChime() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const notes = [392.00, 440.00]; // Sol -> La (tono suave y cálido)
      notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + i * 0.12);

        gain.gain.setValueAtTime(0.001, this.ctx!.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.12, this.ctx!.currentTime + i * 0.12 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + i * 0.12 + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(this.ctx!.currentTime + i * 0.12);
        osc.stop(this.ctx!.currentTime + i * 0.12 + 0.4);
      });
    } catch (_) {}
  }
}

export const owlAudio = new OwlAudioSynth();

// ==========================================
// COMPONENTE DE CONFETI EN CANVAS
// ==========================================
export const ConfettiCanvas: React.FC<{ active: boolean; onComplete?: () => void }> = ({ active, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#fbbf24', '#38bdf8', '#10b981', '#f43f5e', '#a855f7', '#fb7185', '#fde047'];
    const particles = Array.from({ length: 90 }).map(() => ({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
      y: window.innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.9) * 14,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 12,
      opacity: 1
    }));

    let animationId: number;
    let frames = 0;

    const loop = () => {
      frames++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // Gravedad
        p.rotation += p.vRot;
        p.opacity = Math.max(0, p.opacity - 0.012);

        if (p.opacity > 0 && p.y < canvas.height) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }
      });

      if (alive && frames < 140) {
        animationId = requestAnimationFrame(loop);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (onComplete) onComplete();
      }
    };

    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [active, onComplete]);

  if (!active) return null;

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 pointer-events-none z-50 w-full h-full"
    />
  );
};

// ==========================================
// AVATAR VECTORIAL DEL BÚHO SABIO ("ARCHIE")
// ==========================================
interface WiseOwlAvatarProps {
  mood?: OwlMood;
  speechText?: string;
  size?: 'sm' | 'md' | 'lg';
  showSoundToggle?: boolean;
  className?: string;
  onTap?: () => void;
}

export const WiseOwlAvatar: React.FC<WiseOwlAvatarProps> = ({
  mood = 'idle',
  speechText,
  size = 'md',
  showSoundToggle = true,
  className = '',
  onTap
}) => {
  const [isBlinking, setIsBlinking] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(owlAudio.enabled);

  // Efecto de parpadeo natural cada pocos segundos
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 180);
    }, 3800 + Math.random() * 2000);

    return () => clearInterval(blinkInterval);
  }, []);

  const sizeStyles = {
    sm: { width: 72, height: 72, viewBox: "0 0 160 160" },
    md: { width: 110, height: 110, viewBox: "0 0 160 160" },
    lg: { width: 160, height: 160, viewBox: "0 0 160 160" }
  }[size];

  const handleToggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !soundEnabled;
    setSoundEnabled(next);
    owlAudio.enabled = next;
    if (next) owlAudio.playSuccessChime();
  };

  return (
    <div className={`relative inline-flex flex-col items-center select-none ${className}`}>
      {/* Speech Bubble / Globo de diálogo amable */}
      <AnimatePresence>
        {speechText && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.9 }}
            className="mb-2 max-w-[240px] px-3.5 py-2 rounded-2xl bg-gradient-to-r from-amber-500/20 to-emerald-500/20 border border-amber-400/30 backdrop-blur-md shadow-xl text-ink text-center relative"
          >
            <p className="text-xs font-semibold leading-snug text-amber-200">
              {speechText}
            </p>
            {/* Triangulito de globo */}
            <div className="w-2.5 h-2.5 bg-zinc-900 border-r border-b border-amber-400/30 transform rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Personaje Búho SVG con Microanimaciones */}
      <motion.div
        animate={
          mood === 'happy'
            ? { y: [0, -8, 0, -6, 0], rotate: [0, -3, 3, 0] }
            : mood === 'thinking'
            ? { rotate: [-4, -4], y: [-2, -2] }
            : mood === 'celebrating'
            ? { y: [0, -12, 0, -8, 0], scale: [1, 1.08, 1], rotate: [0, -5, 5, 0] }
            : { y: [0, -3, 0] }
        }
        transition={
          mood === 'idle'
            ? { repeat: Infinity, duration: 3.2, ease: "easeInOut" }
            : { duration: 0.8, ease: "easeOut" }
        }
        onClick={onTap}
        className="cursor-pointer relative group"
        title="Archie el Búho Sabio — Tu compañero de estudio"
      >
        {/* Resplandor áurico según el humor */}
        <div 
          className={`absolute inset-0 rounded-full blur-xl opacity-40 transition-all duration-500 ${
            mood === 'celebrating' || mood === 'happy'
              ? 'bg-amber-400'
              : mood === 'thinking'
              ? 'bg-sky-400'
              : 'bg-emerald-500/30'
          }`}
        />

        <svg
          width={sizeStyles.width}
          height={sizeStyles.height}
          viewBox={sizeStyles.viewBox}
          className="relative drop-shadow-2xl"
        >
          <defs>
            {/* Gradientes del cuerpo */}
            <linearGradient id="owlBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>

            <linearGradient id="owlBellyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="100%" stopColor="#fde047" />
            </linearGradient>

            <linearGradient id="capGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#18181b" />
              <stop offset="100%" stopColor="#09090b" />
            </linearGradient>

            <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>

            {/* Sombra suave */}
            <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Patitas apoyadas */}
          <ellipse cx="65" cy="142" rx="10" ry="5" fill="#f59e0b" />
          <ellipse cx="95" cy="142" rx="10" ry="5" fill="#f59e0b" />

          {/* Cuerpo principal (Ovalado esponjoso) */}
          <ellipse cx="80" cy="94" rx="46" ry="48" fill="url(#owlBodyGrad)" filter="url(#softShadow)" />

          {/* Pechuga suave con plumas decorativas */}
          <ellipse cx="80" cy="106" rx="30" ry="32" fill="url(#owlBellyGrad)" />
          {/* Pequeñas uves de pluma en la pechuga */}
          <path d="M 72 96 Q 76 100 80 96" stroke="#ca8a04" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 80 96 Q 84 100 88 96" stroke="#ca8a04" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 68 108 Q 72 112 76 108" stroke="#ca8a04" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 76 108 Q 80 112 84 108" stroke="#ca8a04" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 84 108 Q 88 112 92 108" stroke="#ca8a04" strokeWidth="2" fill="none" strokeLinecap="round" />

          {/* Alas laterales */}
          <path
            d={
              mood === 'happy' || mood === 'celebrating'
                ? "M 36 84 C 22 72, 16 98, 38 108 Z" // Alita levantada
                : "M 36 78 C 24 88, 26 116, 38 120 Z"
            }
            fill="#1e40af"
          />
          <path
            d={
              mood === 'happy' || mood === 'celebrating'
                ? "M 124 84 C 138 72, 144 98, 122 108 Z" // Alita levantada
                : "M 124 78 C 136 88, 134 116, 122 120 Z"
            }
            fill="#1e40af"
          />

          {/* Plumas de las orejitas (Penínsulas simpáticas) */}
          <polygon points="46,48 58,66 38,62" fill="#1d4ed8" />
          <polygon points="114,48 102,66 122,62" fill="#1d4ed8" />

          {/* Discos faciales (Alrededor de los ojos) */}
          <circle cx="62" cy="74" r="22" fill="#ffffff" filter="url(#softShadow)" />
          <circle cx="98" cy="74" r="22" fill="#ffffff" filter="url(#softShadow)" />

          {/* OJOS GRANDES Y EXPRESIVOS */}
          {isBlinking ? (
            // Ojos parpadeando (Línea curva feliz)
            <>
              <path d="M 50 74 Q 62 82 74 74" stroke="#0f172a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
              <path d="M 86 74 Q 98 82 110 74" stroke="#0f172a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            </>
          ) : mood === 'happy' || mood === 'celebrating' ? (
            // Ojos de alegría (Medias lunas sonrientes)
            <>
              <path d="M 50 74 Q 62 62 74 74" stroke="#0f172a" strokeWidth="4" fill="none" strokeLinecap="round" />
              <path d="M 86 74 Q 98 62 110 74" stroke="#0f172a" strokeWidth="4" fill="none" strokeLinecap="round" />
            </>
          ) : (
            // Ojos redondos abiertos con pupilas y destellos
            <>
              {/* Iris Ámbar/Miel */}
              <circle cx="62" cy="74" r="14" fill="#f59e0b" />
              <circle cx="98" cy="74" r="14" fill="#f59e0b" />

              {/* Pupila Negra (mueve la mirada según humor) */}
              <circle cx={mood === 'thinking' ? 64 : 62} cy={mood === 'thinking' ? 70 : 74} r="9.5" fill="#0f172a" />
              <circle cx={mood === 'thinking' ? 100 : 98} cy={mood === 'thinking' ? 70 : 74} r="9.5" fill="#0f172a" />

              {/* Destellos de luz en los ojos (Efecto Anime / Tierno) */}
              <circle cx={mood === 'thinking' ? 66 : 65} cy={mood === 'thinking' ? 68 : 71} r="3.5" fill="#ffffff" />
              <circle cx={mood === 'thinking' ? 62 : 59} cy={mood === 'thinking' ? 73 : 77} r="1.8" fill="#ffffff" />

              <circle cx={mood === 'thinking' ? 102 : 101} cy={mood === 'thinking' ? 68 : 71} r="3.5" fill="#ffffff" />
              <circle cx={mood === 'thinking' ? 98 : 95} cy={mood === 'thinking' ? 73 : 77} r="1.8" fill="#ffffff" />
            </>
          )}

          {/* Pico Naranja triangular */}
          <polygon points="80,78 74,90 86,90" fill="#f97316" filter="url(#softShadow)" />

          {/* BIRRETE DE GRADUACIÓN / SABIDURÍA (Tocado universitario) */}
          <g transform="translate(0, -6)">
            {/* Base del birrete */}
            <path d="M 64 42 Q 80 39 96 42 L 94 48 Q 80 45 66 48 Z" fill="#09090b" />
            {/* Rombo superior inclinado */}
            <polygon points="80,24 118,36 80,44 42,36" fill="url(#capGrad)" stroke="#27272a" strokeWidth="1" />
            {/* Botón dorado central */}
            <circle cx="80" cy="34" r="3.5" fill="url(#goldGrad)" />
            {/* Cinta y pompón colgante */}
            <path d="M 80 34 Q 96 36 102 46 L 104 56" stroke="#fbbf24" strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="104" cy="57" r="3" fill="#f59e0b" />
          </g>
        </svg>

        {/* Insignia o medalla pequeña flotante */}
        {mood === 'celebrating' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="absolute -top-2 -right-2 bg-amber-400 text-black p-1.5 rounded-full shadow-lg"
          >
            <Trophy className="w-3.5 h-3.5" />
          </motion.div>
        )}
      </motion.div>

      {/* Botón discreto de activar/desactivar sonido de juegos */}
      {showSoundToggle && (
        <button
          onClick={handleToggleSound}
          className="mt-1.5 px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-ink-muted hover:text-amber-300 text-[10px] font-mono flex items-center gap-1 transition-colors border border-white/5 cursor-pointer"
          title={soundEnabled ? "Sonidos de juego activados" : "Sonidos silenciados"}
        >
          {soundEnabled ? <Volume2 className="w-3 h-3 text-emerald-400" /> : <VolumeX className="w-3 h-3 text-neutral-500" />}
          <span>{soundEnabled ? "Audio ON" : "Audio OFF"}</span>
        </button>
      )}
    </div>
  );
};
