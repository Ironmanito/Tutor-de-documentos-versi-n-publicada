import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, FileText, CheckCircle2, Loader2, Zap, BookOpen } from 'lucide-react';

interface UploadProgressAnimationProps {
  currentFileName?: string;
  currentFileIndex?: number;
  totalFiles?: number;
  allFileNames?: string[];
  progress?: number;
}

const FUN_PHRASES = [
  { emoji: "📖", text: "Abriendo tu cuaderno y decodificando las páginas...", sub: "Extrayendo texto y estructura" },
  { emoji: "🔍", text: "Escaneando notas, apuntes y diagramas con IA...", sub: "Identificando conceptos clave" },
  { emoji: "⚡", text: "El tutor está absorbiendo todo el conocimiento...", sub: "Preparando preguntas inteligentes" },
  { emoji: "☕", text: "Toma un sorbo de café, ya casi estamos listos...", sub: "Indexando contenido a alta velocidad" },
  { emoji: "🧠", text: "Generando conexiones sinápticas entre tus temas...", sub: "Optimizando la retención de estudio" },
  { emoji: "🎯", text: "Afinando el temario para las sesiones de voz...", sub: "Cuestionarios y flashcards en camino" },
  { emoji: "🚀", text: "¡Últimos retoques! Guardando tus apuntes...", sub: "Sincronización en la nube" }
];

export function UploadProgressAnimation({
  currentFileName = "Documento de estudio",
  currentFileIndex = 1,
  totalFiles = 1,
  allFileNames = [],
  progress = 45
}: UploadProgressAnimationProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [eyeState, setEyeState] = useState<'normal' | 'wink' | 'happy'>('normal');

  // Rotate fun phrases every 2.4s
  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % FUN_PHRASES.length);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  // Mascot eye blinking animation
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setEyeState('wink');
      setTimeout(() => setEyeState('happy'), 300);
      setTimeout(() => setEyeState('normal'), 800);
    }, 3200);
    return () => clearInterval(blinkInterval);
  }, []);

  const currentPhrase = FUN_PHRASES[phraseIndex];
  const boundedProgress = Math.min(Math.max(Math.round(progress), 5), 100);

  return (
    <div className="w-full relative overflow-hidden bg-gradient-to-b from-[#18181b] to-[#101012] border-2 border-accent-systematic/50 rounded-2xl p-6 sm:p-8 shadow-[0_0_30px_rgba(255,77,0,0.15)] text-center select-none">
      {/* Background ambient particles */}
      <div className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(#ff4d00_1px,transparent_1px)] [background-size:16px_16px]" />
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-accent-systematic/15 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Main Mascot & Scanner Area */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Animated Mascot: The Smart Glowing Notebook */}
        <div className="relative mb-5 flex items-center justify-center">
          {/* Pulsing Aura Rings */}
          <div className="absolute w-28 h-28 rounded-full bg-accent-systematic/10 animate-ping opacity-30" />
          <div className="absolute w-36 h-36 rounded-full border border-accent-systematic/20 animate-spin-slow opacity-40" />

          {/* Notebook Body */}
          <div className="relative w-24 h-28 bg-[#1f1f23] border-2 border-accent-systematic rounded-xl p-2 shadow-2xl flex flex-col justify-between overflow-hidden group">
            {/* Spiral Rings */}
            <div className="absolute left-1.5 top-2 bottom-2 flex flex-col justify-between z-20">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-400 border border-black shadow" />
              ))}
            </div>

            {/* Laser Scanner Bar sweeping up and down */}
            <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_8px_#22d3ee] z-30 animate-scanline" />

            {/* Top antenna with glowing light */}
            <div className="absolute -top-2 right-4 flex flex-col items-center">
              <span className="w-2 h-2 rounded-full bg-accent-systematic animate-pulse shadow-[0_0_6px_#ff4d00]" />
            </div>

            {/* Animated Face */}
            <div className="ml-3 mt-3 flex flex-col items-center justify-center flex-grow">
              <div className="flex items-center gap-3 text-cyan-300 font-mono text-base font-extrabold tracking-widest">
                {eyeState === 'normal' && (
                  <>
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse">●</span>
                  </>
                )}
                {eyeState === 'wink' && (
                  <>
                    <span>^</span>
                    <span>●</span>
                  </>
                )}
                {eyeState === 'happy' && (
                  <>
                    <span>^</span>
                    <span>^</span>
                  </>
                )}
              </div>
              {/* Cute smile */}
              <div className="w-4 h-1.5 border-b-2 border-cyan-400 rounded-full mt-1 opacity-80" />
            </div>

            {/* Notebook pages effect */}
            <div className="ml-3 space-y-1 z-10 opacity-40">
              <div className="h-0.5 w-12 bg-white/40 rounded" />
              <div className="h-0.5 w-10 bg-white/30 rounded" />
              <div className="h-0.5 w-14 bg-white/40 rounded" />
            </div>

            {/* Little corner bookmark */}
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-accent-systematic rotate-45 transform translate-x-1.5 translate-y-1.5" />
          </div>

          {/* Floating animated sparkles & chips */}
          <div className="absolute -top-2 -left-6 bg-accent-systematic/20 border border-accent-systematic/40 text-accent-systematic text-[9px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg animate-bounce">
            <Zap className="w-2.5 h-2.5" />
            <span>OCR 2.0</span>
          </div>

          <div className="absolute -bottom-1 -right-8 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg animate-pulse">
            <Sparkles className="w-2.5 h-2.5" />
            <span>IA Activa</span>
          </div>
        </div>

        {/* Dynamic Fun Quote with Animated Transition */}
        <div className="h-14 flex flex-col items-center justify-center mb-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={phraseIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center"
            >
              <div className="flex items-center gap-2 text-white font-semibold text-sm sm:text-base mb-0.5">
                <span className="text-lg">{currentPhrase.emoji}</span>
                <span className="text-zinc-100">{currentPhrase.text}</span>
              </div>
              <span className="text-accent-systematic/90 font-mono text-[10px] uppercase tracking-wider font-bold">
                {currentPhrase.sub}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* High-Tech Dynamic Progress Bar */}
        <div className="w-full max-w-md mx-auto mb-4">
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="text-zinc-400 flex items-center gap-1.5 truncate max-w-[240px]">
              <FileText className="w-3.5 h-3.5 text-accent-systematic shrink-0 animate-pulse" />
              <span className="truncate font-medium text-white">{currentFileName}</span>
            </span>
            <span className="text-accent-systematic font-bold text-sm bg-accent-systematic/10 border border-accent-systematic/30 px-2 py-0.5 rounded-md shadow-sm">
              {boundedProgress}%
            </span>
          </div>

          {/* Bar track */}
          <div className="w-full h-3.5 bg-black/60 border border-white/10 rounded-full p-0.5 relative overflow-hidden shadow-inner">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent-systematic via-amber-400 to-emerald-400 relative overflow-hidden shadow-[0_0_12px_rgba(255,77,0,0.4)]"
              initial={{ width: "5%" }}
              animate={{ width: `${boundedProgress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {/* Striped animated shimmer on top of bar */}
              <div 
                className="absolute inset-0 opacity-40" 
                style={{
                  backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.3) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.3) 75%, transparent 75%, transparent)',
                  backgroundSize: '16px 16px',
                  animation: 'shimmer 1s linear infinite'
                }}
              />
            </motion.div>
          </div>

          {/* Multi-file status footer */}
          {totalFiles > 1 && (
            <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span className="flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-amber-400" />
                Documento {currentFileIndex} de {totalFiles}
              </span>
              <span className="text-emerald-400 font-semibold">
                {currentFileIndex - 1} completado(s)
              </span>
            </div>
          )}
        </div>

        {/* Mini file list indicator if multiple files */}
        {allFileNames.length > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-md pt-2 border-t border-white/5">
            {allFileNames.map((name, idx) => {
              const isDone = idx < (currentFileIndex - 1);
              const isCurrent = idx === (currentFileIndex - 1);
              return (
                <span
                  key={idx}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9.5px] font-mono transition-all ${
                    isDone
                      ? 'bg-emerald-950/30 border border-emerald-500/30 text-emerald-300'
                      : isCurrent
                      ? 'bg-accent-systematic/20 border border-accent-systematic text-accent-systematic font-bold animate-pulse'
                      : 'bg-zinc-800/40 border border-white/5 text-zinc-500'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                  ) : isCurrent ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-accent-systematic" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                  )}
                  <span className="truncate max-w-[100px]">{name}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
