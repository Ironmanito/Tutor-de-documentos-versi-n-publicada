import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Search, 
  BookOpen, 
  Copy, 
  Check, 
  Clock, 
  Layers,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  FileText,
  Sparkles,
  Presentation,
  ImageIcon,
  Award,
  Target,
  HelpCircle,
  AlertCircle,
  RotateCcw,
  Flame,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { telemetry } from '../lib/telemetry';
import { WiseOwlAvatar, OwlMood, owlAudio, ConfettiCanvas } from './WiseOwlAvatar';

export interface SlideData {
  slideNumber: number;
  title: string;
  content: string;
  notes?: string;
  images: string[];
}

export interface AvailableDocument {
  name: string;
  content: string;
  slides?: SlideData[];
}

export interface CheckpointQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  keyConcept: string;
}

export interface MicroCapsule {
  id: number;
  title: string;
  text: string;
  wordCount: number;
  minReadSeconds: number;
  checkpoint: CheckpointQuestion;
}

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  fileName?: string;
  availableFiles?: AvailableDocument[];
  initialActiveFileName?: string;
  isGameMode?: boolean;
  gameDifficulty?: 'facil' | 'medio' | 'dificil';
  onAddGems?: (amount: number) => void;
}

/**
 * Algoritmo de Segmentación Inteligente en Micro-Cápsulas con Checkpoints Cognitivos
 */
function generateMicroCapsules(
  rawText: string,
  difficulty: 'facil' | 'medio' | 'dificil' = 'medio'
): MicroCapsule[] {
  if (!rawText || !rawText.trim()) return [];

  const targetWords = difficulty === 'facil' ? 110 : difficulty === 'medio' ? 170 : 230;
  const minReadSec = difficulty === 'facil' ? 5 : difficulty === 'medio' ? 7 : 10;

  // Separar en párrafos iniciales
  const rawParagraphs = rawText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Si algún bloque es desproporcionadamente largo, segmentarlo por oraciones
  const blocks: string[] = [];
  for (const para of rawParagraphs) {
    const words = para.split(/\s+/).length;
    if (words > targetWords * 1.8) {
      const sentences = para.match(/[^.!?]+[.!?]+(\s|$)/g) || [para];
      let accum = '';
      for (const s of sentences) {
        if ((accum + s).split(/\s+/).length > targetWords && accum.trim().length > 0) {
          blocks.push(accum.trim());
          accum = s;
        } else {
          accum += ' ' + s;
        }
      }
      if (accum.trim().length > 0) blocks.push(accum.trim());
    } else {
      blocks.push(para);
    }
  }

  // Agrupar bloques pequeños hasta alcanzar el tamaño óptimo de cápsula
  const capsulesData: string[] = [];
  let currentChunk = '';
  for (const b of blocks) {
    const currentWords = currentChunk.split(/\s+/).filter(Boolean).length;
    const bWords = b.split(/\s+/).filter(Boolean).length;
    if (currentWords > 0 && currentWords + bWords > targetWords * 1.4) {
      capsulesData.push(currentChunk.trim());
      currentChunk = b;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${b}` : b;
    }
  }
  if (currentChunk.trim().length > 0) {
    capsulesData.push(currentChunk.trim());
  }

  // Construir las cápsulas con preguntas de Active Recall
  return capsulesData.map((chunk, idx) => {
    const words = chunk.split(/\s+/).filter(Boolean).length;
    const sentences = chunk
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 15);

    // Título descriptivo
    const firstLine = chunk.split('\n')[0].replace(/^[#*•\-\d.\s]+/, '').trim();
    const title = firstLine.length > 5 && firstLine.length < 65
      ? firstLine
      : `Cápsula ${idx + 1}: ${sentences[0]?.substring(0, 45) || 'Conceptos Nucleares'}...`;

    // Extraer oración clave (definición, causa, método o postulado)
    const keySentence = sentences.find(s => 
      /\b(es|son|define|significa|permite|produce|causa|principio|objetivo|función|requiere|método|consiste|fundamento|consecuencia)\b/i.test(s)
    ) || sentences[0] || chunk.substring(0, 100);

    const cleanKey = keySentence.replace(/^[#*•\-\d.\s]+/, '').trim();
    const correctStatement = cleanKey.length > 120 ? cleanKey.substring(0, 115) + '...' : cleanKey;

    let distractor1: string;
    let distractor2: string;

    if (difficulty === 'facil') {
      distractor1 = "Afirma que el concepto analizado carece de toda relevancia y debe descartarse.";
      distractor2 = "Sostiene exactamente lo inverso: niega la relación explicada en el fragmento.";
    } else if (difficulty === 'dificil') {
      distractor1 = "Sugiere que el fenómeno opera de forma puramente contingente sin sujeción a ningún principio previo.";
      distractor2 = "Limita la validez del postulado exclusivamente a casos marginales, rechazando su aplicación nuclear.";
    } else {
      distractor1 = "Establece que las variables actúan de manera desacoplada sin interrelación directa.";
      distractor2 = "Indica que el resultado obtenido es independiente del proceso o factor descripto.";
    }

    const questionText = difficulty === 'dificil'
      ? `¿Cuál es la premisa conceptual o implicancia teórica que se desprende de esta sección?`
      : difficulty === 'medio'
        ? `¿Qué afirmación refleja con mayor fidelidad el postulado desarrollado en este bloque?`
        : `¿Cuál es la idea principal que explica este fragmento?`;

    // Barajar opciones determinísticamente por índice de cápsula
    const rawOptions = [
      { text: correctStatement, correct: true },
      { text: distractor1, correct: false },
      { text: distractor2, correct: false }
    ];
    const shift = idx % 3;
    const shuffled = [
      rawOptions[shift % 3],
      rawOptions[(shift + 1) % 3],
      rawOptions[(shift + 2) % 3]
    ];
    const correctIndex = shuffled.findIndex(o => o.correct);

    return {
      id: idx + 1,
      title,
      text: chunk,
      wordCount: words,
      minReadSeconds: minReadSec,
      checkpoint: {
        question: questionText,
        options: shuffled.map(o => o.text),
        correctIndex,
        explanation: `Concepto nuclear: "${correctStatement}"`,
        keyConcept: cleanKey.substring(0, 80)
      }
    };
  });
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  isOpen,
  onClose,
  title,
  content,
  fileName,
  availableFiles,
  initialActiveFileName,
  isGameMode = true,
  gameDifficulty = 'medio',
  onAddGems
}) => {
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'huge'>('normal');
  const [theme, setTheme] = useState<'dark' | 'sepia' | 'light'>('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Selector de Modo de Lectura: Microlecturas con Checkpoints vs Continuo
  const [readingMode, setReadingMode] = useState<'continuous' | 'microlecture'>(
    isGameMode ? 'microlecture' : 'continuous'
  );
  const [difficulty, setDifficulty] = useState<'facil' | 'medio' | 'dificil'>(gameDifficulty);

  // Presentation slide state
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [viewFormat, setViewFormat] = useState<'auto' | 'slides' | 'text'>('auto');

  // Estados de Microlecturas & Checkpoints Cognitivos
  const [currentCapsuleIndex, setCurrentCapsuleIndex] = useState(0);
  const [dwellSeconds, setDwellSeconds] = useState(0);
  const [solvedCapsules, setSolvedCapsules] = useState<Set<number>>(new Set());
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isOptionCorrect, setIsOptionCorrect] = useState<boolean | null>(null);
  const [showSpeedWarning, setShowSpeedWarning] = useState(false);
  const [owlMood, setOwlMood] = useState<OwlMood>('idle');
  const [owlSpeech, setOwlSpeech] = useState<string>('Lee la cápsula con atención para asimilar el concepto clave.');
  const [showConfetti, setShowConfetti] = useState(false);
  const [isCompletedAll, setIsCompletedAll] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const maxScrollRef = useRef<number>(0);
  const hasCopiedRef = useRef<boolean>(false);

  // Sincronizar dificultad si cambia prop
  useEffect(() => {
    if (gameDifficulty) setDifficulty(gameDifficulty);
  }, [gameDifficulty]);

  // Sincronizar archivo activo
  useEffect(() => {
    if (availableFiles && availableFiles.length > 0) {
      if (initialActiveFileName) {
        const foundIdx = availableFiles.findIndex(f => f.name === initialActiveFileName);
        setActiveFileIndex(foundIdx >= 0 ? foundIdx : -1);
      } else if (fileName) {
        const foundIdx = availableFiles.findIndex(f => f.name === fileName);
        setActiveFileIndex(foundIdx >= 0 ? foundIdx : -1);
      } else {
        setActiveFileIndex(availableFiles.length === 1 ? 0 : -1);
      }
    } else {
      setActiveFileIndex(-1);
    }
  }, [availableFiles, initialActiveFileName, fileName, isOpen]);

  // Reset slide index on file change
  useEffect(() => {
    setCurrentSlideIndex(0);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [activeFileIndex]);

  // Current displayed active document
  const currentDoc: AvailableDocument | null = 
    activeFileIndex >= 0 && availableFiles && availableFiles[activeFileIndex]
      ? availableFiles[activeFileIndex]
      : null;

  const currentTitle = currentDoc ? currentDoc.name : title || 'Cuaderno de Estudio';
  const currentContent = currentDoc ? currentDoc.content : content;
  
  // Slides present?
  const isPptxFile = currentTitle.toLowerCase().endsWith('.pptx') || currentTitle.toLowerCase().endsWith('.ppt');
  const availableSlides = currentDoc?.slides || [];
  const hasSlides = availableSlides.length > 0;
  const isSlideModeActive = (viewFormat === 'slides') || (viewFormat === 'auto' && hasSlides);

  // Micro-Cápsulas generadas dinámicamente
  const microCapsules = useMemo(() => {
    return generateMicroCapsules(currentContent, difficulty);
  }, [currentContent, difficulty]);

  const currentCapsule = microCapsules[currentCapsuleIndex] || null;

  // Reset al cambiar documento o dificultad
  useEffect(() => {
    setCurrentCapsuleIndex(0);
    setSolvedCapsules(new Set());
    setSelectedOption(null);
    setIsOptionCorrect(null);
    setShowSpeedWarning(false);
    setDwellSeconds(0);
    setIsCompletedAll(false);
    setOwlMood('idle');
    setOwlSpeech('Lee la cápsula con atención para asimilar el concepto clave.');
  }, [activeFileIndex, difficulty, currentContent]);

  // Timer de lectura pausada / Anti-skimming
  useEffect(() => {
    if (!isOpen || readingMode !== 'microlecture' || isCompletedAll || isSlideModeActive) return;
    const interval = setInterval(() => {
      setDwellSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, readingMode, currentCapsuleIndex, isCompletedAll, isSlideModeActive]);

  // Word count and reading time
  const wordCount = currentContent ? currentContent.trim().split(/\s+/).filter(Boolean).length : 0;
  const estimatedReadingTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  useEffect(() => {
    if (isOpen) {
      startTimeRef.current = Date.now();
      maxScrollRef.current = 0;
      hasCopiedRef.current = false;
      setScrollProgress(0);
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
      telemetry.recordViewChange(`lectura_${currentTitle}`);
      telemetry.recordFileConsulted(currentTitle);
    } else {
      const durationMs = Date.now() - startTimeRef.current;
      if (durationMs > 2000) {
        const minutes = durationMs / 60000;
        const wpm = minutes > 0 ? Math.round(wordCount * (maxScrollRef.current / 100) / minutes) : 0;
        telemetry.recordDocumentReading({
          fileName: currentTitle,
          durationMs,
          wpm: Math.min(600, Math.max(0, wpm)),
          scrollDepthPct: maxScrollRef.current,
          textCopied: hasCopiedRef.current
        });
      }
    }
  }, [isOpen, currentTitle, wordCount]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const scrollable = scrollHeight - clientHeight;
    if (scrollable > 0) {
      const pct = Math.min(100, Math.max(0, Math.round((scrollTop / scrollable) * 100)));
      setScrollProgress(pct);
      if (pct > maxScrollRef.current) {
        maxScrollRef.current = pct;
      }
    }
  };

  const handleCopyText = () => {
    if (!currentContent) return;
    navigator.clipboard.writeText(currentContent).then(() => {
      setIsCopied(true);
      hasCopiedRef.current = true;
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const nextSlide = () => {
    if (currentSlideIndex < availableSlides.length - 1) {
      setCurrentSlideIndex(prev => prev + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
    }
  };

  // Manejo de interacción de Checkpoints Cognitivos
  const handleSelectCheckpointOption = (optionIdx: number) => {
    if (!currentCapsule) return;
    if (solvedCapsules.has(currentCapsule.id)) return;

    // Protección Anti-Scroll Acelerado (Speed-check)
    if (dwellSeconds < currentCapsule.minReadSeconds) {
      setShowSpeedWarning(true);
      setOwlMood('thinking');
      setOwlSpeech(`¡Pausa cognitiva! ⏳ Tómate al menos ${currentCapsule.minReadSeconds} segundos para procesar el contenido antes de responder.`);
      try {
        navigator.vibrate?.(100);
      } catch (_) {}
      return;
    }

    setShowSpeedWarning(false);
    setSelectedOption(optionIdx);
    const correct = optionIdx === currentCapsule.checkpoint.correctIndex;
    setIsOptionCorrect(correct);

    const latencyMs = dwellSeconds * 1000;
    telemetry.recordQuestionDecision(latencyMs, 0, correct ? 100 : 0);
    telemetry.recordEvent('lectura', {
      tipo: 'checkpoint_cognitivo',
      documento: currentTitle,
      capsulaId: currentCapsule.id,
      correcto: correct,
      tiempoLecturaSeg: dwellSeconds,
      palabras: currentCapsule.wordCount
    }, latencyMs);

    if (correct) {
      owlAudio.playSuccessChime();
      setShowConfetti(true);
      setOwlMood('celebrating');
      setOwlSpeech('¡Excelente retención! 🎯 Has fijado el concepto clave con precisión (+5 💎).');
      onAddGems?.(5);
      setSolvedCapsules(prev => new Set(prev).add(currentCapsule.id));
    } else {
      owlAudio.playEncouragementChime();
      setOwlMood('hint');
      setOwlSpeech(`No exactamente. Pista: ${currentCapsule.checkpoint.explanation}. ¡Inténtalo de nuevo!`);
    }
  };

  const handleNextCapsule = () => {
    if (currentCapsuleIndex < microCapsules.length - 1) {
      setCurrentCapsuleIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsOptionCorrect(null);
      setShowSpeedWarning(false);
      setDwellSeconds(0);
      setOwlMood('idle');
      setOwlSpeech('Nueva cápsula lista. Tómate unos segundos para comprender el núcleo del fragmento.');
    } else {
      setIsCompletedAll(true);
      owlAudio.playLevelUpChime();
      setShowConfetti(true);
      onAddGems?.(10); // Bonus 10 gemas al completar todo el apunte
      setOwlMood('celebrating');
      setOwlSpeech('¡Felicitaciones! Has completado todos los puntos de control con máxima retención.');
    }
  };

  const handlePrevCapsule = () => {
    if (currentCapsuleIndex > 0) {
      setCurrentCapsuleIndex(prev => prev - 1);
      setSelectedOption(null);
      setIsOptionCorrect(null);
      setShowSpeedWarning(false);
      setDwellSeconds(0);
      setOwlMood('idle');
      setOwlSpeech('Revisando cápsula anterior.');
    }
  };

  if (!isOpen) return null;

  // Split paragraphs and highlight search terms
  const paragraphs = currentContent ? currentContent.split(/\n\s*\n/).filter(p => p.trim().length > 0) : [];

  const themeClasses = {
    dark: 'bg-[#0e1015] text-zinc-200 border-white/10 shadow-black/80',
    sepia: 'bg-[#fbf7ee] text-[#433422] border-[#d8ccb8] shadow-amber-950/20',
    light: 'bg-[#ffffff] text-[#1c1c1e] border-zinc-200 shadow-zinc-400/20'
  };

  const slideThemeClasses = {
    dark: 'bg-zinc-900/90 text-zinc-100 border-zinc-800',
    sepia: 'bg-[#f4ebd9] text-[#3d2e1c] border-[#dccbb1]',
    light: 'bg-slate-50 text-slate-900 border-slate-200 shadow-sm'
  };

  const textClasses = {
    normal: 'text-sm md:text-base leading-relaxed',
    large: 'text-base md:text-lg leading-relaxed',
    huge: 'text-lg md:text-xl leading-loose'
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-amber-400/40 text-amber-200 px-1 py-0.5 rounded font-semibold">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const currentSlide = hasSlides ? availableSlides[currentSlideIndex] : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-5xl h-[94vh] max-h-[920px] rounded-2xl border shadow-2xl flex flex-col overflow-hidden transition-colors duration-300 ${themeClasses[theme]}`}
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-inherit flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isPptxFile 
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
                  : readingMode === 'microlecture'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                    : 'bg-accent-systematic/20 text-accent-systematic border-accent-systematic/30'
              }`}>
                {isPptxFile ? <Presentation className="w-5 h-5" /> : readingMode === 'microlecture' ? <Target className="w-5 h-5 text-amber-300" /> : <BookOpen className="w-5 h-5" />}
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${
                    isPptxFile ? 'text-amber-400' : readingMode === 'microlecture' ? 'text-amber-300' : 'text-accent-systematic'
                  }`}>
                    {isPptxFile ? 'Presentación PowerPoint' : readingMode === 'microlecture' ? 'Microlecturas • Checkpoints Activos' : 'Lector de Documentos'}
                  </span>
                  {activeFileIndex >= 0 && (
                    <span className="text-[10px] font-mono opacity-50">
                      (Archivo {activeFileIndex + 1} de {availableFiles?.length})
                    </span>
                  )}
                  {readingMode === 'microlecture' && !isSlideModeActive && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/30">
                      {microCapsules.length} hitos
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-bold truncate max-w-md" title={currentTitle}>
                  {currentTitle}
                </h3>
                <div className="flex items-center gap-3 text-xs opacity-60">
                  {hasSlides && isSlideModeActive ? (
                    <span className="flex items-center gap-1 font-mono text-amber-400 font-bold">
                      <Presentation className="w-3.5 h-3.5" /> Diapositiva {currentSlideIndex + 1} de {availableSlides.length}
                    </span>
                  ) : readingMode === 'microlecture' ? (
                    <>
                      <span className="flex items-center gap-1 font-mono text-amber-300 font-bold">
                        <Target className="w-3.5 h-3.5" /> Hito {currentCapsuleIndex + 1} de {microCapsules.length}
                      </span>
                      <span>•</span>
                      <span>{wordCount.toLocaleString()} palabras</span>
                      <span>•</span>
                      <span className="font-mono text-[10px] text-emerald-400 font-semibold">
                        {solvedCapsules.size}/{microCapsules.length} superados
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> ~{estimatedReadingTimeMin} min de lectura
                      </span>
                      <span>•</span>
                      <span>{wordCount.toLocaleString()} palabras</span>
                      <span>•</span>
                      <span className="font-mono text-[10px] text-accent-systematic font-semibold">
                        {scrollProgress}% leído
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Controles de lectura y vistas */}
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap justify-end">
              {/* Selector de Modo: Microlectura Guiada vs Continuo (para documentos de texto) */}
              {!isSlideModeActive && (
                <div className="flex items-center bg-black/20 border border-inherit rounded-lg p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setReadingMode('microlecture')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all ${
                      readingMode === 'microlecture'
                        ? 'bg-amber-400 text-black font-black shadow-md'
                        : 'hover:opacity-80 text-neutral-300'
                    }`}
                    title="Modo Microlecturas con Checkpoints Cognitivos y Retención Activa"
                  >
                    <span>🎯</span>
                    <span>Paso a Paso</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReadingMode('continuous')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all ${
                      readingMode === 'continuous'
                        ? 'bg-accent-systematic text-black font-bold shadow-md'
                        : 'hover:opacity-80 text-neutral-300'
                    }`}
                    title="Modo Lectura Continua tradicional (Scroll)"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Continuo</span>
                  </button>
                </div>
              )}

              {/* Selector de Dificultad para Microlecturas */}
              {readingMode === 'microlecture' && !isSlideModeActive && (
                <div className="flex items-center bg-black/20 border border-inherit rounded-lg p-0.5 text-xs font-mono">
                  {(['facil', 'medio', 'dificil'] as const).map(lvl => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDifficulty(lvl)}
                      className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                        difficulty === lvl
                          ? 'bg-amber-400 text-black font-black shadow-sm'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                      title={`Nivel ${lvl.toUpperCase()}`}
                    >
                      {lvl === 'facil' ? 'Fácil' : lvl === 'medio' ? 'Medio' : 'Difícil'}
                    </button>
                  ))}
                </div>
              )}

              {/* Toggle vista de Diapositivas vs Texto plano para PPTX */}
              {hasSlides && (
                <div className="flex items-center bg-black/20 border border-inherit rounded-lg p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewFormat('slides')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-all ${
                      isSlideModeActive
                        ? 'bg-amber-500 text-black font-bold shadow'
                        : 'hover:opacity-80 text-neutral-300'
                    }`}
                    title="Ver diapositivas visuales originales"
                  >
                    <Presentation className="w-3.5 h-3.5" /> Diapositivas
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewFormat('text')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-all ${
                      !isSlideModeActive
                        ? 'bg-accent-systematic text-black font-bold shadow'
                        : 'hover:opacity-80 text-neutral-300'
                    }`}
                    title="Ver transcripción continua de texto"
                  >
                    <FileText className="w-3.5 h-3.5" /> Texto
                  </button>
                </div>
              )}

              {/* Buscador toggle */}
              <button
                type="button"
                onClick={() => setShowSearch(!showSearch)}
                className={`p-2 rounded-lg border border-inherit transition-all cursor-pointer ${
                  showSearch ? 'bg-accent-systematic text-black font-bold' : 'hover:opacity-80'
                }`}
                title="Buscar y resaltar palabras clave en el texto"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* Selector de tamaño de fuente */}
              {!isSlideModeActive && (
                <div className="flex items-center border border-inherit rounded-lg overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setFontSize('normal')}
                    className={`px-2.5 py-1.5 font-medium transition-all ${
                      fontSize === 'normal' ? 'bg-accent-systematic text-black font-bold' : 'hover:opacity-80'
                    }`}
                    title="Texto Normal"
                  >
                    A
                  </button>
                  <button
                    type="button"
                    onClick={() => setFontSize('large')}
                    className={`px-2.5 py-1.5 font-medium transition-all ${
                      fontSize === 'large' ? 'bg-accent-systematic text-black font-bold' : 'hover:opacity-80'
                    }`}
                    title="Texto Grande"
                  >
                    A+
                  </button>
                  <button
                    type="button"
                    onClick={() => setFontSize('huge')}
                    className={`px-2.5 py-1.5 font-medium transition-all ${
                      fontSize === 'huge' ? 'bg-accent-systematic text-black font-bold' : 'hover:opacity-80'
                    }`}
                    title="Texto Enorme"
                  >
                    A++
                  </button>
                </div>
              )}

              {/* Selector de Tema */}
              <div className="flex items-center border border-inherit rounded-lg overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`px-2.5 py-1.5 font-medium transition-all ${
                    theme === 'dark' ? 'bg-zinc-800 text-white font-bold' : 'hover:opacity-80'
                  }`}
                  title="Modo Oscuro"
                >
                  🌙
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('sepia')}
                  className={`px-2.5 py-1.5 font-medium transition-all ${
                    theme === 'sepia' ? 'bg-[#d8ccb8] text-[#433422] font-bold' : 'hover:opacity-80'
                  }`}
                  title="Modo Sepia / Papel"
                >
                  📜
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`px-2.5 py-1.5 font-medium transition-all ${
                    theme === 'light' ? 'bg-zinc-200 text-black font-bold' : 'hover:opacity-80'
                  }`}
                  title="Modo Claro"
                >
                  ☀️
                </button>
              </div>

              {/* Botón copiar texto */}
              <button
                type="button"
                onClick={handleCopyText}
                className="p-2 rounded-lg border border-inherit hover:opacity-80 transition-all cursor-pointer"
                title="Copiar texto completo"
              >
                {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>

              {/* Botón cerrar */}
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg border border-inherit hover:bg-red-500/20 hover:text-red-400 transition-all cursor-pointer ml-1"
                title="Cerrar visor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Pestañas de archivos (si hay más de 1 archivo disponible) */}
          {availableFiles && availableFiles.length > 1 && (
            <div className="px-4 py-2 border-b border-inherit flex items-center gap-2 overflow-x-auto bg-black/10 shrink-0 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveFileIndex(-1);
                  if (containerRef.current) containerRef.current.scrollTop = 0;
                }}
                className={`px-3 py-1.5 rounded-lg border font-mono whitespace-nowrap transition-all ${
                  activeFileIndex === -1
                    ? 'bg-accent-systematic text-black font-bold border-accent-systematic'
                    : 'border-inherit hover:opacity-80'
                }`}
              >
                📚 Todos los Apuntes ({availableFiles.length})
              </button>
              {availableFiles.map((file, idx) => {
                const isPpt = file.name.toLowerCase().endsWith('.pptx') || file.name.toLowerCase().endsWith('.ppt');
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActiveFileIndex(idx);
                      if (containerRef.current) containerRef.current.scrollTop = 0;
                    }}
                    className={`px-3 py-1.5 rounded-lg border font-mono whitespace-nowrap truncate max-w-[220px] transition-all flex items-center gap-1.5 ${
                      activeFileIndex === idx
                        ? isPpt 
                          ? 'bg-amber-500 text-black font-bold border-amber-500' 
                          : 'bg-accent-systematic text-black font-bold border-accent-systematic'
                        : 'border-inherit hover:opacity-80'
                    }`}
                    title={file.name}
                  >
                    {isPpt ? <Presentation className="w-3.5 h-3.5" /> : <span>📄</span>}
                    <span>{file.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Barra de progreso de lectura superior (en modo continuo) */}
          {!isSlideModeActive && readingMode === 'continuous' && (
            <div className="w-full h-1 bg-black/20 overflow-hidden shrink-0">
              <div 
                className="h-full bg-accent-systematic transition-all duration-150"
                style={{ width: `${scrollProgress}%` }}
              />
            </div>
          )}

          {/* Buscador desplegable */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-inherit px-4 py-2.5 flex items-center gap-2 shrink-0 bg-black/10"
              >
                <Search className="w-4 h-4 opacity-50 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Escribe para buscar y resaltar en el contenido..."
                  className="w-full bg-transparent text-xs outline-none placeholder:opacity-40"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs opacity-50 hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* CUERPO PRINCIPAL */}
          {hasSlides && isSlideModeActive ? (
            /* MODO PRESENTACIÓN VISUAL CON IMÁGENES Y DIAPOSITIVAS */
            <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
              <div className="flex-grow flex flex-col p-4 sm:p-6 overflow-y-auto justify-between gap-4">
                {currentSlide ? (
                  <div className={`w-full rounded-2xl border p-6 sm:p-8 flex flex-col justify-between min-h-[380px] shadow-lg relative overflow-hidden transition-all duration-200 ${slideThemeClasses[theme]}`}>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-inherit pb-3">
                        <span className="text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Diapositiva #{currentSlide.slideNumber} de {availableSlides.length}
                        </span>
                        <span className="text-xs opacity-50 font-mono">
                          {currentTitle}
                        </span>
                      </div>
                      
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-amber-300">
                        {highlightText(currentSlide.title, searchQuery)}
                      </h2>
                    </div>

                    {currentSlide.images && currentSlide.images.length > 0 && (
                      <div className="my-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {currentSlide.images.map((imgSrc, imgIdx) => (
                          <div key={imgIdx} className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/40 max-h-[220px] flex items-center justify-center p-1">
                            <img 
                              src={imgSrc} 
                              alt={`Diagrama Diapositiva ${currentSlide.slideNumber} (#${imgIdx + 1})`}
                              className="max-h-[210px] w-auto object-contain rounded-lg shadow-md"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 backdrop-blur-sm text-[10px] text-white px-2 py-1 rounded flex items-center gap-1">
                              <ImageIcon className="w-3 h-3 text-amber-400" /> Imagen original
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="my-3 space-y-3">
                      {currentSlide.content.split('\n').filter(Boolean).map((line, lIdx) => {
                        const isBullet = line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().startsWith('*');
                        return (
                          <p key={lIdx} className={`text-sm sm:text-base leading-relaxed ${isBullet ? 'pl-4 relative text-zinc-100 font-medium' : 'opacity-90'}`}>
                            {isBullet && <span className="absolute left-0 text-amber-400 font-bold">•</span>}
                            {highlightText(line.replace(/^[-•*]\s*/, ''), searchQuery)}
                          </p>
                        );
                      })}
                    </div>

                    {currentSlide.notes && (
                      <div className="mt-4 p-3 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs text-purple-200">
                        <span className="font-bold text-purple-400 flex items-center gap-1 mb-1">
                          <Sparkles className="w-3.5 h-3.5" /> Notas del Orador / Profesor:
                        </span>
                        <p className="italic opacity-90">{currentSlide.notes}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full opacity-60">
                    <p>No se encontró información para esta diapositiva.</p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 p-2 bg-black/20 rounded-xl border border-inherit">
                  <button
                    type="button"
                    onClick={prevSlide}
                    disabled={currentSlideIndex === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold border border-inherit transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" /> Diapositiva Anterior
                  </button>

                  <div className="flex items-center gap-1.5 overflow-x-auto max-w-sm px-2">
                    {availableSlides.map((_, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => setCurrentSlideIndex(sIdx)}
                        className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all shrink-0 ${
                          currentSlideIndex === sIdx
                            ? 'bg-amber-500 text-black shadow-md scale-110'
                            : 'bg-white/5 hover:bg-white/10 border border-white/5 opacity-70'
                        }`}
                      >
                        {sIdx + 1}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={nextSlide}
                    disabled={currentSlideIndex >= availableSlides.length - 1}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold border border-amber-500/30 transition-all"
                  >
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="w-full md:w-64 border-t md:border-t-0 md:border-l border-inherit p-3 overflow-y-auto space-y-2 bg-black/15 shrink-0 max-h-48 md:max-h-full">
                <div className="flex items-center justify-between pb-2 border-b border-inherit text-xs font-mono opacity-70">
                  <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> Diapositivas</span>
                  <span>{availableSlides.length} total</span>
                </div>
                {availableSlides.map((slide, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => setCurrentSlideIndex(sIdx)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex flex-col gap-1 ${
                      currentSlideIndex === sIdx
                        ? 'bg-amber-500/20 border-amber-500/50 text-white shadow-sm'
                        : 'border-white/5 bg-white/5 hover:bg-white/10 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="font-bold text-amber-400">#{slide.slideNumber}</span>
                      {slide.images.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-amber-200 flex items-center gap-0.5">
                          <ImageIcon className="w-2.5 h-2.5" /> {slide.images.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold truncate leading-tight">
                      {slide.title || `Diapositiva ${slide.slideNumber}`}
                    </p>
                    <p className="text-[10px] opacity-60 line-clamp-1">
                      {slide.content.replace(/\n/g, ' ')}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : readingMode === 'microlecture' ? (
            /* MODO MICROLECTURA GUIADA CON CHECKPOINTS COGNITIVOS */
            <div className="flex-grow flex flex-col overflow-hidden relative">
              <ConfettiCanvas active={showConfetti} onComplete={() => setShowConfetti(false)} />

              {isCompletedAll ? (
                /* PANTALLA DE META ALCANZADA / LECTURA COMPLETA */
                <div className="flex-grow flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
                  <div className="w-20 h-20 rounded-3xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-4xl shadow-xl animate-bounce">
                    🏆
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 block mb-1">
                      Retención Activa Exitosa
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-black text-white">
                      ¡Lectura Atenta y Completa!
                    </h2>
                    <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                      Has completado todas las micro-cápsulas de aprendizaje y superado cada punto de control cognitivo sin caer en el scroll pasivo.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 w-full">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-xl block mb-0.5">💎</span>
                      <span className="text-sm font-bold font-mono text-amber-300">
                        +{microCapsules.length * 5 + 10}
                      </span>
                      <span className="text-[9px] block text-neutral-400 uppercase">Gemas Ganadas</span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-xl block mb-0.5">🎯</span>
                      <span className="text-sm font-bold font-mono text-emerald-400">
                        {microCapsules.length}/{microCapsules.length}
                      </span>
                      <span className="text-[9px] block text-neutral-400 uppercase">Checkpoints</span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-xl block mb-0.5">🧠</span>
                      <span className="text-sm font-bold font-mono text-sky-400">
                        100%
                      </span>
                      <span className="text-[9px] block text-neutral-400 uppercase">Retención</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2 w-full justify-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCompletedAll(false);
                        setReadingMode('continuous');
                      }}
                      className="px-5 py-2.5 rounded-xl border border-white/20 hover:bg-white/10 text-xs font-bold uppercase tracking-wider font-mono transition-all cursor-pointer"
                    >
                      Repasar en Modo Continuo 📜
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCompletedAll(false);
                        setCurrentCapsuleIndex(0);
                        setSolvedCapsules(new Set());
                        setSelectedOption(null);
                        setIsOptionCorrect(null);
                        setDwellSeconds(0);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black uppercase tracking-wider font-mono transition-all shadow-lg shadow-amber-400/20 cursor-pointer"
                    >
                      Reiniciar Desafío 🔄
                    </button>
                  </div>
                </div>
              ) : currentCapsule ? (
                /* CÁPSULA ACTIVA */
                <div className="flex-grow flex flex-col justify-between overflow-y-auto p-4 sm:p-8 space-y-6">
                  {/* Header de la Cápsula: Barra de hitos y dwell timer */}
                  <div className="space-y-3 pb-3 border-b border-inherit">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-black uppercase tracking-wider px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Cápsula #{currentCapsule.id} de {microCapsules.length}
                        </span>
                        <span className="text-[10px] font-mono opacity-50">
                          ~{currentCapsule.wordCount} palabras
                        </span>
                      </div>

                      {/* Timer de lectura pausada */}
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full border flex items-center gap-1.5 transition-all ${
                          dwellSeconds >= currentCapsule.minReadSeconds
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse'
                        }`}>
                          <Clock className="w-3 h-3" />
                          <span>
                            {dwellSeconds}s {dwellSeconds < currentCapsule.minReadSeconds ? `(Mín: ${currentCapsule.minReadSeconds}s)` : '✓ Asimilado'}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Eslabones de Progreso Visual */}
                    <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                      {microCapsules.map((cap, cIdx) => {
                        const isSolved = solvedCapsules.has(cap.id);
                        const isCurrent = cIdx === currentCapsuleIndex;
                        return (
                          <button
                            key={cap.id}
                            type="button"
                            onClick={() => {
                              if (isSolved || cIdx <= currentCapsuleIndex) {
                                setCurrentCapsuleIndex(cIdx);
                                setSelectedOption(null);
                                setIsOptionCorrect(null);
                                setShowSpeedWarning(false);
                                setDwellSeconds(0);
                              }
                            }}
                            className={`h-2 flex-grow min-w-[20px] rounded-full transition-all ${
                              isCurrent
                                ? 'bg-amber-400 ring-2 ring-amber-400/50 shadow-md'
                                : isSolved
                                  ? 'bg-emerald-400'
                                  : 'bg-white/10'
                            }`}
                            title={`Cápsula ${cap.id}${isSolved ? ' (Superada)' : ''}`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Texto de la Cápsula (Microlectura enfocada) */}
                  <div className="space-y-4 max-w-3xl mx-auto w-full">
                    <h3 className="text-lg sm:text-xl font-extrabold tracking-tight text-amber-200">
                      {currentCapsule.title}
                    </h3>
                    <div className={`${textClasses[fontSize]} space-y-4 leading-relaxed opacity-95 text-justify`}>
                      {currentCapsule.text.split('\n\n').map((p, pIdx) => (
                        <p key={pIdx}>
                          {highlightText(p, searchQuery)}
                        </p>
                      ))}
                    </div>
                  </div>

                  {/* Alerta de Lectura Acelerada / Anti-Skimming */}
                  <AnimatePresence>
                    {showSpeedWarning && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="max-w-2xl mx-auto w-full p-3.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs flex items-center gap-3 shadow-lg"
                      >
                        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
                        <div className="flex-grow">
                          <span className="font-bold block">¡Pausa Cognitiva!</span>
                          <span>Tómate al menos {currentCapsule.minReadSeconds} segundos para procesar el contenido antes de validar el checkpoint.</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* CAJA DEL CHECKPOINT COGNITIVO */}
                  <div className="max-w-2xl mx-auto w-full p-5 sm:p-6 rounded-2xl border border-amber-400/30 bg-black/40 backdrop-blur-md shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-amber-400" />
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
                          Punto de Control &bull; Active Recall
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        +5 💎 al acertar
                      </span>
                    </div>

                    {/* Archie Mentor Académico */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                      <WiseOwlAvatar 
                        mood={owlMood} 
                        speechText="" 
                        size="sm" 
                        showSoundToggle={false} 
                        className="shrink-0 scale-90"
                      />
                      <div className="text-xs text-neutral-300 leading-snug">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-amber-400 font-bold block mb-0.5">
                          Archie &bull; Mentor Académico
                        </span>
                        <p>{owlSpeech}</p>
                      </div>
                    </div>

                    {/* Pregunta del Checkpoint */}
                    <div className="pt-1">
                      <h4 className="text-sm sm:text-base font-bold text-white mb-3">
                        {currentCapsule.checkpoint.question}
                      </h4>

                      {/* Opciones */}
                      <div className="space-y-2.5">
                        {currentCapsule.checkpoint.options.map((optText, optIdx) => {
                          const isChosen = selectedOption === optIdx;
                          const isCorrectOpt = optIdx === currentCapsule.checkpoint.correctIndex;
                          const isSolved = solvedCapsules.has(currentCapsule.id);

                          let btnStyle = "border-white/10 bg-white/5 hover:bg-white/10 hover:border-amber-400/40 text-neutral-200";

                          if (isSolved && isCorrectOpt) {
                            btnStyle = "bg-emerald-500/20 border-emerald-400 text-emerald-200 font-medium shadow-md shadow-emerald-500/10";
                          } else if (isChosen && isOptionCorrect === false) {
                            btnStyle = "bg-rose-500/20 border-rose-400 text-rose-200";
                          }

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => handleSelectCheckpointOption(optIdx)}
                              disabled={isSolved}
                              className={`w-full text-left p-3.5 rounded-xl border text-xs sm:text-sm transition-all flex items-start gap-3 cursor-pointer ${btnStyle} ${
                                isSolved ? 'cursor-default' : ''
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-mono text-[10px] font-bold border mt-0.5 ${
                                isSolved && isCorrectOpt
                                  ? 'bg-emerald-400 text-black border-emerald-400'
                                  : isChosen && isOptionCorrect === false
                                    ? 'bg-rose-400 text-black border-rose-400'
                                    : 'border-white/20 bg-white/5'
                              }`}>
                                {isSolved && isCorrectOpt ? '✓' : isChosen && isOptionCorrect === false ? '✕' : String.fromCharCode(65 + optIdx)}
                              </span>
                              <span className="flex-grow leading-relaxed">{optText}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Barra de navegación de cápsula */}
                    <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={handlePrevCapsule}
                        disabled={currentCapsuleIndex === 0}
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold font-mono uppercase tracking-wider border border-inherit transition-all cursor-pointer"
                      >
                        ❮ Anterior
                      </button>

                      <button
                        type="button"
                        onClick={handleNextCapsule}
                        disabled={!solvedCapsules.has(currentCapsule.id)}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black font-mono uppercase tracking-wider transition-all flex items-center gap-2 ${
                          solvedCapsules.has(currentCapsule.id)
                            ? 'bg-amber-400 hover:bg-amber-300 text-black shadow-lg shadow-amber-400/25 cursor-pointer'
                            : 'bg-white/5 border border-white/10 text-neutral-500 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <span>
                          {currentCapsuleIndex === microCapsules.length - 1
                            ? 'Finalizar Lectura 🏅'
                            : 'Siguiente Cápsula ❯'}
                        </span>
                        {!solvedCapsules.has(currentCapsule.id) && <span className="text-[10px]">🔒</span>}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-60 py-20">
                  <BookOpen className="w-12 h-12 mb-3 stroke-[1.5]" />
                  <p className="text-sm">No hay contenido de texto disponible para generar micro-cápsulas.</p>
                </div>
              )}
            </div>
          ) : (
            /* MODO TEXTO CONTINUO CLÁSICO */
            <div
              ref={containerRef}
              onScroll={handleScroll}
              className="flex-grow overflow-y-auto p-6 sm:p-10 md:p-12 space-y-6 font-sans selection:bg-accent-systematic/30"
            >
              {paragraphs.length > 0 ? (
                paragraphs.map((p, idx) => (
                  <p 
                    key={idx} 
                    className={`${textClasses[fontSize]} text-justify tracking-normal`}
                  >
                    {highlightText(p, searchQuery)}
                  </p>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-60 py-20">
                  <BookOpen className="w-12 h-12 mb-3 stroke-[1.5]" />
                  <p className="text-sm">No hay contenido de texto disponible para este documento.</p>
                  <p className="text-xs mt-1">Asegúrate de haber subido un archivo o cargado un cuaderno con texto.</p>
                </div>
              )}
            </div>
          )}

          {/* Footer de lectura */}
          <div className="px-5 py-2.5 border-t border-inherit flex items-center justify-between text-[11px] opacity-60 shrink-0 font-mono">
            <span>
              {hasSlides && isSlideModeActive 
                ? `🎨 Modo Presentación Interactiva (Diapositiva ${currentSlideIndex + 1}/${availableSlides.length})` 
                : readingMode === 'microlecture'
                  ? `🎯 Modo Microlectura Guiada (Cápsula ${currentCapsuleIndex + 1} de ${microCapsules.length})`
                  : '📖 Modo de Lectura Continuo'}
            </span>
            <span>
              {hasSlides && isSlideModeActive 
                ? `${Math.round(((currentSlideIndex + 1) / availableSlides.length) * 100)}% de presentación` 
                : readingMode === 'microlecture'
                  ? `${solvedCapsules.size} de ${microCapsules.length} checkpoints superados`
                  : `Progreso: ${scrollProgress}%`}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
