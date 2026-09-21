import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  FileText, 
  CheckCircle2, 
  Loader2, 
  BookOpen, 
  AlertTriangle, 
  StopCircle, 
  Clock, 
  FileCode, 
  FileSpreadsheet, 
  Image as ImageIcon 
} from 'lucide-react';

export interface FileProgressItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'extracting' | 'completed' | 'error';
  statusText?: string;
  error?: string;
}

export interface UploadProgressAnimationProps {
  currentFileName?: string;
  currentFileIndex?: number;
  totalFiles?: number;
  allFileNames?: string[];
  progress?: number;
  filesProgress?: FileProgressItem[];
  onCancel?: () => void;
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

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) {
    return <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-500/30 shrink-0">PDF</span>;
  }
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    return <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-500/30 shrink-0">DOC</span>;
  }
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
    return <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-500/30 shrink-0">PPT</span>;
  }
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(lower)) {
    return <ImageIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
  }
  if (lower.endsWith('.csv')) {
    return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  }
  return <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
}

export function UploadProgressAnimation({
  currentFileName = "Documento de estudio",
  currentFileIndex = 1,
  totalFiles = 1,
  allFileNames = [],
  progress = 45,
  filesProgress = [],
  onCancel
}: UploadProgressAnimationProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [eyeState, setEyeState] = useState<'normal' | 'wink' | 'happy'>('normal');
  const [isStuck, setIsStuck] = useState(false);

  const lastProgressRef = useRef<number>(progress);
  const lastProgressTimeRef = useRef<number>(Date.now());
  const startTimeRef = useRef<number>(Date.now());

  // Track if progress is stuck on the same percentage
  useEffect(() => {
    const currentProg = Math.round(progress);
    if (Math.abs(currentProg - lastProgressRef.current) > 1) {
      lastProgressRef.current = currentProg;
      lastProgressTimeRef.current = Date.now();
      setIsStuck(false);
    }
  }, [progress]);

  // Periodic check for stuck progress
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const timeOnCurrentPercent = (now - lastProgressTimeRef.current) / 1000;
      const totalTime = (now - startTimeRef.current) / 1000;

      if (timeOnCurrentPercent >= 8 || totalTime >= 12) {
        setIsStuck(true);
      } else {
        setIsStuck(false);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

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

  // Derive display files list: use explicit filesProgress if provided, else synthesize from allFileNames
  const displayFiles: FileProgressItem[] = filesProgress.length > 0 
    ? filesProgress 
    : (allFileNames.length > 0 ? allFileNames : [currentFileName]).map((name, idx) => {
        const fileNum = idx + 1;
        const isDone = fileNum < currentFileIndex;
        const isCurrent = fileNum === currentFileIndex;
        return {
          id: `file_${idx}`,
          name,
          size: 0,
          progress: isDone ? 100 : (isCurrent ? boundedProgress : 0),
          status: isDone ? 'completed' : (isCurrent ? 'extracting' : 'pending'),
          statusText: isDone ? '¡Completado!' : (isCurrent ? `Procesando (${boundedProgress}%)...` : 'En cola de espera')
        };
      });

  const completedCount = displayFiles.filter(f => f.status === 'completed' || f.progress >= 100).length;
  const activeTotal = Math.max(totalFiles, displayFiles.length);

  return (
    <div className="w-full relative overflow-hidden bg-gradient-to-b from-[#18181b] to-[#101012] border-2 border-accent-systematic/50 rounded-2xl p-5 sm:p-7 shadow-[0_0_30px_rgba(255,77,0,0.15)] text-center select-none">
      {/* Background ambient particles */}
      <div className="absolute inset-0 pointer-events-none opacity-25 bg-[radial-gradient(#ff4d00_1px,transparent_1px)] [background-size:16px_16px]" />
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-accent-systematic/15 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Main Mascot & Header */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Animated Mascot: The Smart Glowing Notebook */}
        <div className="relative mb-4">
          <motion.div
            animate={{
              y: [0, -5, 0],
              rotate: [0, 1.5, -1.5, 0]
            }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="w-16 h-20 bg-gradient-to-br from-zinc-900 via-[#1f1f23] to-[#121214] border-2 border-accent-systematic/80 rounded-xl shadow-[0_0_24px_rgba(255,77,0,0.3)] flex flex-col items-center justify-center relative p-1.5"
          >
            {/* Book Spine */}
            <div className="absolute left-1 top-2 bottom-2 w-1 bg-accent-systematic rounded-full opacity-80" />

            {/* Glowing Face */}
            <div className="flex items-center gap-2 mb-1 pl-1">
              {eyeState === 'normal' && (
                <>
                  <div className="w-2.5 h-2.5 bg-accent-systematic rounded-full shadow-[0_0_8px_#ff4d00] animate-pulse" />
                  <div className="w-2.5 h-2.5 bg-accent-systematic rounded-full shadow-[0_0_8px_#ff4d00] animate-pulse" />
                </>
              )}
              {eyeState === 'wink' && (
                <>
                  <div className="w-2.5 h-0.5 bg-accent-systematic rounded-full shadow-[0_0_8px_#ff4d00]" />
                  <div className="w-2.5 h-2.5 bg-accent-systematic rounded-full shadow-[0_0_8px_#ff4d00]" />
                </>
              )}
              {eyeState === 'happy' && (
                <>
                  <div className="w-2.5 h-1.5 border-t-2 border-accent-systematic rounded-t-full shadow-[0_0_8px_#ff4d00]" />
                  <div className="w-2.5 h-1.5 border-t-2 border-accent-systematic rounded-t-full shadow-[0_0_8px_#ff4d00]" />
                </>
              )}
            </div>

            {/* Smile */}
            <div className="w-3.5 h-1.5 border-b-2 border-accent-systematic/80 rounded-b-full pl-1" />

            {/* Pages shimmer */}
            <div className="mt-1 w-8 h-0.5 bg-white/20 rounded-full" />
            <div className="mt-0.5 w-6 h-0.5 bg-white/10 rounded-full" />
          </motion.div>

          {/* Floating AI Sparkles */}
          <motion.div
            animate={{ scale: [1, 1.25, 1], rotate: [0, 15, 0] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            className="absolute -top-2 -right-2 text-accent-systematic"
          >
            <Sparkles className="w-5 h-5 fill-accent-systematic/40 drop-shadow-[0_0_8px_rgba(255,77,0,0.8)]" />
          </motion.div>
        </div>

        {/* Dynamic Fun Phrase */}
        <div className="min-h-[44px] flex flex-col items-center justify-center mb-4 max-w-lg mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={phraseIndex}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center"
            >
              <div className="flex items-center gap-2 text-white font-semibold text-sm sm:text-base mb-0.5">
                <span className="text-lg">{currentPhrase.emoji}</span>
                <span className="text-zinc-100">{currentPhrase.text}</span>
              </div>
              <span className="text-accent-systematic/90 font-mono text-[10.5px] uppercase tracking-wider font-bold">
                {currentPhrase.sub}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Global Progress Header Bar */}
        <div className="w-full max-w-xl mx-auto mb-4 bg-black/40 border border-white/10 rounded-xl p-3 shadow-inner text-left">
          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
            <span className="text-zinc-300 font-bold flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {activeTotal > 1 
                  ? `Progreso General (${completedCount} de ${activeTotal} completados)`
                  : 'Progreso de Carga y Extracción'}
              </span>
            </span>
            <span className="text-accent-systematic font-bold text-xs bg-accent-systematic/10 border border-accent-systematic/30 px-2 py-0.5 rounded">
              {boundedProgress}%
            </span>
          </div>

          <div className="w-full h-2 bg-zinc-900 border border-white/10 rounded-full overflow-hidden p-0.5">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent-systematic via-amber-400 to-emerald-400 shadow-[0_0_10px_rgba(255,77,0,0.4)]"
              initial={{ width: "5%" }}
              animate={{ width: `${boundedProgress}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* INDIVIDUAL DOCUMENT PROGRESS BARS: Exactly one per document */}
        <div className="w-full max-w-xl mx-auto space-y-2.5 mb-4 text-left">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold px-1 flex items-center justify-between">
            <span>Barras de carga individuales por documento:</span>
            <span className="text-zinc-500 font-normal">{displayFiles.length} archivo(s)</span>
          </div>

          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
            {displayFiles.map((file, idx) => {
              const filePct = Math.min(100, Math.max(0, Math.round(file.progress)));
              const isCompleted = file.status === 'completed' || filePct >= 100;
              const isError = file.status === 'error';
              const isPending = file.status === 'pending';
              const isRunning = file.status === 'uploading' || file.status === 'extracting';

              return (
                <div
                  key={file.id || idx}
                  className={`p-3 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                    isCompleted
                      ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                      : isError
                      ? 'bg-red-950/20 border-red-500/40'
                      : isRunning
                      ? 'bg-zinc-900/90 border-accent-systematic/60 shadow-[0_0_15px_rgba(255,77,0,0.15)] ring-1 ring-accent-systematic/30'
                      : 'bg-zinc-900/40 border-white/5 opacity-70'
                  }`}
                >
                  {/* File Info Top Line */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getFileIcon(file.name)}
                      <span className="font-mono text-xs font-semibold text-white truncate" title={file.name}>
                        {file.name}
                      </span>
                      {file.size > 0 && (
                        <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                          ({formatBytes(file.size)})
                        </span>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0">
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-500/40">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          100%
                        </span>
                      ) : isError ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-red-950/50 text-red-400 border border-red-500/40">
                          Error
                        </span>
                      ) : isRunning ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-accent-systematic/20 text-accent-systematic border border-accent-systematic/40 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin text-accent-systematic" />
                          {filePct}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 px-2 py-0.5 rounded bg-zinc-800/40 border border-white/5">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          En cola
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Individual Progress Bar Track */}
                  <div className="w-full h-2.5 bg-black/70 border border-white/10 rounded-full p-0.5 relative overflow-hidden mb-1 shadow-inner">
                    <motion.div
                      className={`h-full rounded-full transition-all duration-300 relative overflow-hidden ${
                        isCompleted
                          ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                          : isError
                          ? 'bg-red-500'
                          : isRunning
                          ? 'bg-gradient-to-r from-accent-systematic via-amber-400 to-emerald-400 shadow-[0_0_10px_rgba(255,77,0,0.5)]'
                          : 'bg-zinc-700'
                      }`}
                      style={{ width: `${Math.max(isPending ? 0 : 4, filePct)}%` }}
                    >
                      {isRunning && (
                        <div 
                          className="absolute inset-0 opacity-40" 
                          style={{
                            backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.35) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.35) 75%, transparent 75%, transparent)',
                            backgroundSize: '14px 14px',
                            animation: 'shimmer 1s linear infinite'
                          }}
                        />
                      )}
                    </motion.div>
                  </div>

                  {/* Subtitle Status Message for this document */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <span className="truncate pr-2 text-zinc-300">
                      {file.statusText || (isCompleted ? 'Texto extraído con éxito' : isPending ? 'Esperando turno de procesamiento...' : 'Cargando contenido...')}
                    </span>
                    <span className="shrink-0 text-zinc-500">
                      {isCompleted ? '✓ Listo' : `${filePct}%`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Warning banner and Abandon / Cancel button if stuck */}
        <AnimatePresence>
          {isStuck && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              className="w-full max-w-xl mx-auto mb-3.5 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-left overflow-hidden"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-bounce" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[11px] text-amber-300 font-bold uppercase tracking-wider mb-0.5">
                    ¿Documento extenso o escaneado?
                  </div>
                  <p className="text-[10px] text-zinc-300 leading-snug font-mono">
                    Los archivos PDF escaneados requieren procesamiento OCR en el servidor. Si prefieres no esperar, puedes cancelar la extracción en cualquier momento.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Controls: Cancel button */}
        {onCancel && (
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-lg ${
                isStuck
                  ? 'bg-red-600 hover:bg-red-500 text-white border border-red-400/50 shadow-red-950/50 scale-105 animate-pulse'
                  : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white border border-white/10'
              }`}
            >
              <StopCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span>{isStuck ? 'Abandonar carga ahora' : 'Cancelar procesamiento'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
