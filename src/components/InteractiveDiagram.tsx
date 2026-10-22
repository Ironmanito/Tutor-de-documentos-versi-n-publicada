import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2, 
  Lightbulb, ArrowRight, CheckCircle2, XCircle, HelpCircle, 
  Compass, Award, RefreshCw, BookOpen, Layers, Flame, Target
} from 'lucide-react';
import { WiseOwlAvatar, OwlMood, owlAudio, ConfettiCanvas } from './WiseOwlAvatar';

export type DifficultyLevel = 'facil' | 'medio' | 'dificil';

export interface DiagramNode {
  id: string;
  label: string;
  category: string;
  shortDesc: string;
  practicalExplanation?: string;
  kidExplanation?: string; // Retrocompatibilidad
  funFact?: string;
  emoji: string;
  color?: string;
  parentId?: string;
  quickQuiz?: {
    question: string;
    options: string[];
    correctIndex: number;
    hint?: string;
  };
}

export interface DiagramConnection {
  from: string;
  to: string;
  label: string;
}

export interface DiagramData {
  centralTopic: {
    id: string;
    label: string;
    emoji: string;
    summary: string;
    practicalExample?: string;
    kidExample?: string;
  };
  nodes: DiagramNode[];
  connections: DiagramConnection[];
}

interface InteractiveDiagramProps {
  studyText: string;
  activeTitle?: string;
  isGameMode?: boolean;
  initialDifficulty?: DifficultyLevel;
  cachedDiagram?: DiagramData | null;
  isGenerating?: boolean;
  onBack?: () => void;
  onGoToReader?: () => void;
  onAddGems?: (amount: number) => void;
  onDiagramGenerated?: (diagram: DiagramData, diff: DifficultyLevel) => void;
}

export const InteractiveDiagram: React.FC<InteractiveDiagramProps> = ({
  studyText,
  activeTitle,
  isGameMode = true,
  initialDifficulty = 'medio',
  cachedDiagram,
  isGenerating = false,
  onBack,
  onGoToReader,
  onAddGems,
  onDiagramGenerated
}) => {
  const [diagram, setDiagram] = useState<DiagramData | null>(cachedDiagram || null);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(initialDifficulty);
  const [isLoading, setIsLoading] = useState(!cachedDiagram && isGenerating);
  const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [owlMood, setOwlMood] = useState<OwlMood>('happy');
  const [owlSpeech, setOwlSpeech] = useState<string>('Selecciona un nodo para analizar relaciones y desafiar tu retención.');
  const [showConfetti, setShowConfetti] = useState(false);

  // Estados del Mini-Quiz dentro de la tarjeta
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [solvedNodes, setSolvedNodes] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Sincronizar diagrama si cachedDiagram cambia
  useEffect(() => {
    if (cachedDiagram) {
      setDiagram(cachedDiagram);
      setIsLoading(false);
    }
  }, [cachedDiagram]);

  // Cargar o regenerar diagrama según dificultad
  const fetchDiagram = async (diffToUse: DifficultyLevel = difficulty) => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const savedKey = localStorage.getItem('user_gemini_api_key');
      if (savedKey) {
        headers['x-gemini-api-key'] = savedKey;
      }
      const res = await fetch('/api/generate-diagram', {
        method: 'POST',
        headers,
        body: JSON.stringify({ studyText, title: activeTitle, difficulty: diffToUse })
      });
      const data = await res.json();
      if (data.diagram) {
        setDiagram(data.diagram);
        onDiagramGenerated?.(data.diagram, diffToUse);
        setOwlMood('happy');
        const diffLabels = { facil: 'Introductorio', medio: 'Universitario Estándar', dificil: 'Exigente / Examen' };
        setOwlSpeech(`Mapa conceptual generado (Nivel: ${diffLabels[diffToUse]}).`);
      }
    } catch (err) {
      console.error("Error generando diagrama:", err);
      setOwlMood('thinking');
      setOwlSpeech('Se produjo una demora en la generación. Probemos nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (studyText && !cachedDiagram && !isGenerating) {
      fetchDiagram(difficulty);
    }
  }, [studyText, activeTitle]);

  const handleDifficultyChange = (newDiff: DifficultyLevel) => {
    if (newDiff === difficulty || isLoading) return;
    setDifficulty(newDiff);
    fetchDiagram(newDiff);
  };

  const handleNodeClick = (node: DiagramNode) => {
    setSelectedNode(node);
    setSelectedOption(null);
    setQuizSubmitted(false);
    setOwlMood('thinking');
    setOwlSpeech(`Analizando: "${node.label}". Revisa su definición y comprueba tu retención.`);
  };

  const handleSelectQuizOption = (index: number) => {
    if (quizSubmitted) return;
    setSelectedOption(index);
  };

  const handleVerifyQuiz = () => {
    if (!selectedNode?.quickQuiz || selectedOption === null) return;
    setQuizSubmitted(true);
    const isCorrect = selectedOption === selectedNode.quickQuiz.correctIndex;

    if (isCorrect) {
      setOwlMood('celebrating');
      setOwlSpeech('¡Respuesta exacta! Excelente comprensión del marco conceptual.');
      owlAudio.playSuccessChime();
      setShowConfetti(true);
      if (onAddGems) onAddGems(15);
      setSolvedNodes(prev => new Set([...prev, selectedNode.id]));
    } else {
      setOwlMood('hint');
      setOwlSpeech(selectedNode.quickQuiz.hint || 'Revisa la relación causal del concepto y vuelve a probar.');
      owlAudio.playEncouragementChime();
    }
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(Math.max(0.65, prev + delta), 1.5));
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  if (isLoading || isGenerating || !diagram) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[480px] p-8 text-center bg-zinc-950/40 border border-white/5 rounded-2xl space-y-6">
        <WiseOwlAvatar mood="thinking" size="lg" speechText="Estructurando mapa conceptual en segundo plano... Puedes continuar leyendo tus apuntes o explorando mientras finaliza." />
        <div className="flex items-center gap-3 text-amber-300 font-mono text-xs uppercase tracking-wider">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Generando en segundo plano ({difficulty.toUpperCase()})...</span>
        </div>
        <div className="flex items-center gap-3 pt-2 flex-wrap justify-center">
          {onGoToReader && (
            <button
              onClick={onGoToReader}
              className="px-5 py-2.5 bg-accent-systematic hover:bg-white text-black font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              <span>📖 Ir al Lector de Apuntes</span>
            </button>
          )}
          {onBack && (
            <button
              onClick={onBack}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Volver al Inicio
            </button>
          )}
          {!isGenerating && !isLoading && !diagram && (
            <button
              onClick={() => fetchDiagram(difficulty)}
              className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-mono font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Reintentar Estructuración 🔄
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-gradient-to-b from-[#0b0d13] via-[#0f121a] to-[#08090d] border border-white/10 rounded-2xl shadow-2xl flex flex-col ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'min-h-[640px]'
      }`}
    >
      <ConfettiCanvas active={showConfetti} onComplete={() => setShowConfetti(false)} />

      {/* Barra Superior con Controles y Selector de Dificultad */}
      <div className="p-4 bg-zinc-950/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between z-20 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white transition-colors cursor-pointer"
            >
              ← Volver
            </button>
          )}
          <div>
            <span className="font-mono text-[9px] text-amber-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              <span>MAPA CONCEPTUAL &bull; ACTIVE RECALL</span>
            </span>
            <h3 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span>{diagram.centralTopic.emoji}</span>
              <span>{diagram.centralTopic.label}</span>
            </h3>
          </div>
        </div>

        {/* Selector de Dificultad Académica y Zoom */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de Dificultad: Fácil | Medio | Difícil */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
            <span className="text-[9px] font-mono font-bold uppercase px-2 text-neutral-400 flex items-center gap-1">
              <Target className="w-3 h-3 text-amber-400" />
              <span>Nivel:</span>
            </span>
            {(['facil', 'medio', 'dificil'] as const).map(lvl => (
              <button
                key={lvl}
                onClick={() => handleDifficultyChange(lvl)}
                disabled={isLoading}
                className={`px-2.5 py-1 rounded-lg text-[9.5px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  difficulty === lvl
                    ? lvl === 'facil'
                      ? 'bg-emerald-500 text-black shadow-sm'
                      : lvl === 'medio'
                      ? 'bg-amber-400 text-black shadow-sm'
                      : 'bg-rose-500 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white bg-transparent'
                }`}
                title={`Nivel ${lvl.toUpperCase()}`}
              >
                {lvl === 'facil' ? 'Fácil' : lvl === 'medio' ? 'Medio' : 'Difícil'}
              </button>
            ))}
          </div>

          {/* Controles de Zoom */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
            <button
              onClick={() => handleZoom(-0.15)}
              className="p-1.5 hover:bg-white/10 text-neutral-300 rounded-lg transition-colors cursor-pointer"
              title="Alejar (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono px-2 text-neutral-400">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => handleZoom(0.15)}
              className="p-1.5 hover:bg-white/10 text-neutral-300 rounded-lg transition-colors cursor-pointer"
              title="Acercar (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 hover:bg-white/10 text-neutral-300 rounded-lg transition-colors cursor-pointer ml-1"
              title="Restablecer (100%)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 transition-colors cursor-pointer"
            title="Pantalla Completa"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Lienzo del Mapa Visual (Nodos y Conexiones) */}
      <div className="flex-grow relative overflow-auto p-8 flex items-center justify-center min-h-[500px]">
        {/* Fondo punteado sutil tipo blueprint */}
        <div 
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #38bdf8 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        />

        <motion.div 
          style={{ scale: zoom }}
          className="relative transition-transform duration-200 flex flex-col items-center justify-center gap-12 max-w-4xl w-full my-auto"
        >
          {/* NODO CENTRAL PRINCIPAL */}
          <motion.div
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.98 }}
            className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/20 via-zinc-900 to-zinc-950 border-2 border-amber-400/50 shadow-[0_0_40px_rgba(251,191,36,0.2)] text-center max-w-md cursor-pointer relative z-10"
            onClick={() => {
              setSelectedNode({
                id: diagram.centralTopic.id,
                label: diagram.centralTopic.label,
                category: 'central',
                shortDesc: diagram.centralTopic.summary,
                practicalExplanation: diagram.centralTopic.practicalExample || diagram.centralTopic.kidExample || "Núcleo estructurante del cual derivan las hipótesis y variables del documento.",
                emoji: diagram.centralTopic.emoji,
                color: '#fbbf24'
              });
              setOwlMood('happy');
              setOwlSpeech(`Núcleo temático: todas las variables del apunte se articulan a partir de este eje.`);
            }}
          >
            <span className="text-4xl mb-2 block filter drop-shadow">{diagram.centralTopic.emoji}</span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-amber-300 font-bold block mb-1">EJE TEMÁTICO CENTRAL</span>
            <h2 className="text-xl font-extrabold text-white tracking-tight leading-snug">
              {diagram.centralTopic.label}
            </h2>
            <p className="text-xs text-neutral-300 mt-2 line-clamp-2 leading-relaxed">
              {diagram.centralTopic.summary}
            </p>
          </motion.div>

          {/* LÍNEAS DE CONEXIÓN Y NODOS HIJOS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full relative z-10">
            {diagram.nodes.map((node, idx) => {
              const isSolved = solvedNodes.has(node.id);
              const isSelected = selectedNode?.id === node.id;
              const nodeColor = node.color || '#38bdf8';

              return (
                <motion.div
                  key={node.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleNodeClick(node)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer relative backdrop-blur-md shadow-lg flex flex-col justify-between ${
                    isSelected
                      ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_25px_rgba(251,191,36,0.25)]'
                      : isSolved
                      ? 'border-emerald-500/60 bg-emerald-500/10'
                      : 'border-white/10 hover:border-white/30 bg-zinc-950/70'
                  }`}
                  style={{
                    borderLeftColor: nodeColor,
                    borderLeftWidth: '5px'
                  }}
                >
                  {/* Etiqueta de categoría y estado */}
                  <div className="flex items-center justify-between mb-3">
                    <span 
                      className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold"
                      style={{ backgroundColor: `${nodeColor}25`, color: nodeColor }}
                    >
                      {node.category.toUpperCase()}
                    </span>

                    {isSolved ? (
                      <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Verificado</span>
                      </span>
                    ) : node.quickQuiz ? (
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>+15 💎</span>
                      </span>
                    ) : null}
                  </div>

                  {/* Título y Emoji */}
                  <div className="flex items-start gap-3 mb-2">
                    <span className="text-2xl shrink-0 p-1.5 rounded-xl bg-white/5 border border-white/5">{node.emoji}</span>
                    <div>
                      <h4 className="text-sm font-bold text-white leading-snug group-hover:text-amber-300 transition-colors">
                        {node.label}
                      </h4>
                      <p className="text-neutral-400 text-xs mt-1 line-clamp-2 leading-relaxed">
                        {node.shortDesc}
                      </p>
                    </div>
                  </div>

                  {/* Relación con el tema central */}
                  {diagram.connections.find(c => c.to === node.id) && (
                    <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-1.5 text-[10.5px] text-neutral-400 font-mono">
                      <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="truncate">
                        {diagram.connections.find(c => c.to === node.id)?.label}
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* AVATAR FLOTANTE DE ARCHIE (Mentor Académico) */}
      <div className="absolute bottom-4 right-4 z-30">
        <WiseOwlAvatar
          mood={owlMood}
          speechText={owlSpeech}
          size="md"
          onTap={() => {
            setOwlMood('happy');
            setOwlSpeech(`Mentoría activa (Nivel ${difficulty.toUpperCase()}). Haz clic en los nodos para profundizar.`);
            owlAudio.playSuccessChime();
          }}
        />
      </div>

      {/* MODAL / TARJETA EXPLICATIVA AL TOCAR CUALQUIER NODO */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedNode(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-zinc-950 border border-white/15 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden"
              style={{ borderTop: `6px solid ${selectedNode.color || '#38bdf8'}` }}
            >
              {/* Botón cerrar */}
              <button
                onClick={() => setSelectedNode(null)}
                className="absolute top-4 right-4 text-neutral-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              >
                ✕
              </button>

              {/* Cabecera del concepto */}
              <div className="flex items-center gap-3.5 mb-4">
                <span className="text-4xl p-2.5 rounded-2xl bg-white/5 border border-white/10">{selectedNode.emoji}</span>
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-amber-400 font-bold">
                    EXPLORADOR CONCEPTUAL &bull; {selectedNode.category.toUpperCase()} &bull; [{difficulty.toUpperCase()}]
                  </span>
                  <h3 className="text-xl font-black text-white tracking-tight">
                    {selectedNode.label}
                  </h3>
                </div>
              </div>

              {/* Definición Académica Formal */}
              <div className="mb-4 p-3.5 rounded-2xl bg-white/5 border border-white/5">
                <span className="font-mono text-[9px] uppercase text-neutral-400 font-bold block mb-1">
                  📖 Definición Conceptual
                </span>
                <p className="text-xs text-neutral-200 leading-relaxed">
                  {selectedNode.shortDesc}
                </p>
              </div>

              {/* Enfoque Práctico / Analogía Operativa */}
              {(selectedNode.practicalExplanation || selectedNode.kidExplanation) && (
                <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-sky-500/10 to-indigo-500/10 border border-sky-500/30">
                  <span className="font-mono text-[9px] uppercase text-sky-300 font-bold flex items-center gap-1.5 mb-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-yellow-300" />
                    <span>Enfoque Práctico / Analogía Intuitiva</span>
                  </span>
                  <p className="text-xs text-neutral-100 font-medium leading-relaxed">
                    {selectedNode.practicalExplanation || selectedNode.kidExplanation}
                  </p>
                </div>
              )}

              {/* Dato Relevante / Aplicación Técnica */}
              {selectedNode.funFact && (
                <div className="mb-5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5">
                  <span className="text-base shrink-0">💡</span>
                  <div>
                    <span className="font-mono text-[8.5px] uppercase text-amber-300 font-bold block">
                      Aplicación de Campo / Dato Relevante
                    </span>
                    <p className="text-[11.5px] text-amber-100 leading-relaxed">
                      {selectedNode.funFact}
                    </p>
                  </div>
                </div>
              )}

              {/* Punto de Control Cognitivo (Mini-Quiz para Gemas) */}
              {selectedNode.quickQuiz && (
                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-emerald-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Punto de Control Cognitivo (+15 💎)</span>
                    </span>
                    {solvedNodes.has(selectedNode.id) && (
                      <span className="text-[10px] font-mono text-emerald-300 font-bold">¡Validado!</span>
                    )}
                  </div>

                  <p className="text-xs font-semibold text-white mb-3">
                    {selectedNode.quickQuiz.question}
                  </p>

                  <div className="space-y-2 mb-3">
                    {selectedNode.quickQuiz.options.map((option, idx) => {
                      const isSelected = selectedOption === idx;
                      const isCorrect = idx === selectedNode.quickQuiz!.correctIndex;

                      return (
                        <button
                          key={idx}
                          disabled={quizSubmitted}
                          onClick={() => handleSelectQuizOption(idx)}
                          className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between cursor-pointer ${
                            quizSubmitted
                              ? isCorrect
                                ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-200'
                                : isSelected
                                ? 'bg-rose-500/25 border border-rose-400 text-rose-200'
                                : 'bg-white/5 border border-white/5 text-neutral-400'
                              : isSelected
                              ? 'bg-amber-500/20 border border-amber-400 text-amber-200 font-semibold'
                              : 'bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300'
                          }`}
                        >
                          <span>{option}</span>
                          {quizSubmitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                          {quizSubmitted && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {!quizSubmitted ? (
                    <button
                      disabled={selectedOption === null}
                      onClick={handleVerifyQuiz}
                      className="w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-black font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md"
                    >
                      Validar Comprensión
                    </button>
                  ) : (
                    <div className="text-center pt-1">
                      <span className="text-xs font-mono font-bold text-neutral-300">
                        {selectedOption === selectedNode.quickQuiz.correctIndex
                          ? "🎉 ¡Concepto asimilado! +15 Gemas acumuladas."
                          : "💡 Puedes revisar el apunte y volver a intentar."}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
