import React, { useState, useEffect, useRef } from 'react';
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
  ImageIcon
} from 'lucide-react';
import { telemetry } from '../lib/telemetry';

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

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  fileName?: string;
  availableFiles?: AvailableDocument[];
  initialActiveFileName?: string;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  isOpen,
  onClose,
  title,
  content,
  fileName,
  availableFiles,
  initialActiveFileName,
}) => {
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1); // -1 means "Todos los archivos combinados"
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'huge'>('normal');
  const [theme, setTheme] = useState<'dark' | 'sepia' | 'light'>('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Presentation slide state
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [isFullscreenSlide, setIsFullscreenSlide] = useState(false);
  const [viewFormat, setViewFormat] = useState<'auto' | 'slides' | 'text'>('auto');

  const containerRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const maxScrollRef = useRef<number>(0);
  const hasCopiedRef = useRef<boolean>(false);

  // Initialize or reset active file
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
      // Telemetry on close
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
          className={`w-full max-w-5xl h-[94vh] max-h-[900px] rounded-2xl border shadow-2xl flex flex-col overflow-hidden transition-colors duration-300 ${themeClasses[theme]}`}
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-inherit flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isPptxFile 
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
                  : 'bg-accent-systematic/20 text-accent-systematic border-accent-systematic/30'
              }`}>
                {isPptxFile ? <Presentation className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${
                    isPptxFile ? 'text-amber-400' : 'text-accent-systematic'
                  }`}>
                    {isPptxFile ? 'Presentación PowerPoint' : 'Lector de Documentos'}
                  </span>
                  {activeFileIndex >= 0 && (
                    <span className="text-[10px] font-mono opacity-50">
                      (Archivo {activeFileIndex + 1} de {availableFiles?.length})
                    </span>
                  )}
                  {hasSlides && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/30">
                      {availableSlides.length} Diapositivas con Imágenes
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

              {/* Selector de tamaño de fuente (en modo texto) */}
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

          {/* Barra de progreso de lectura superior */}
          {!isSlideModeActive && (
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
              {/* Carrusel / Canvas de Diapositiva Principal */}
              <div className="flex-grow flex flex-col p-4 sm:p-6 overflow-y-auto justify-between gap-4">
                {currentSlide ? (
                  <div className={`w-full rounded-2xl border p-6 sm:p-8 flex flex-col justify-between min-h-[380px] shadow-lg relative overflow-hidden transition-all duration-200 ${slideThemeClasses[theme]}`}>
                    {/* Header de Diapositiva */}
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

                    {/* Imágenes incrustadas extraídas del PPTX */}
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

                    {/* Contenido textual de la diapositiva */}
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

                    {/* Notas del profesor / orador (si existen) */}
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

                {/* Controles de Navegación de Diapositivas */}
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

              {/* Tira lateral de miniaturas de diapositivas */}
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
                : '📖 Modo de Lectura Académico'}
            </span>
            <span>
              {hasSlides && isSlideModeActive 
                ? `${Math.round(((currentSlideIndex + 1) / availableSlides.length) * 100)}% de presentación` 
                : `Progreso: ${scrollProgress}%`}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
