import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, Brain, Mic, Volume2, HelpCircle, ArrowLeft, ArrowRight, 
  Trash2, CheckCircle2, Award, Calendar, ChevronRight, FileText, 
  Lock, Unlock, Play, RefreshCw, Loader2, BookOpen, Clock, AlertCircle, Key 
} from 'lucide-react';
import { AudioStreamPlayer, AudioRecorder } from '../lib/audio';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

// Shared types
export interface OralQuestion {
  questionText: string;
  userAnswer?: string;
  feedback?: string;
  score?: number; // 0 to 100
  strengths?: string;
  toImprove?: string;
}

export interface OralExamSession {
  id: string;
  topicTitle: string;
  topicDescription: string;
  createdAt: string;
  questions: OralQuestion[];
  isCompleted: boolean;
  finalFeedback?: string;
  finalScore?: number; // 0 to 100
}

export interface SuggestedOralTopic {
  id: string;
  title: string;
  description: string;
  questions: string[];
}

interface SetupProps {
  studyText: string;
  suggestedTopics: SuggestedOralTopic[];
  onSetSuggestedTopics: (topics: SuggestedOralTopic[]) => void;
  sessions: OralExamSession[];
  onStartNewSession: (topic: SuggestedOralTopic) => void;
  onSelectExistingSession: (session: OralExamSession) => void;
  onDeleteSession: (id: string) => void;
  onEnd: () => void;
  isGenerating: boolean;
  onSetIsGenerating: (val: boolean) => void;
  getFetchHeaders: () => Record<string, string>;
}

export function OralEvaluatorSetup({
  studyText,
  suggestedTopics,
  onSetSuggestedTopics,
  sessions,
  onStartNewSession,
  onSelectExistingSession,
  onDeleteSession,
  onEnd,
  isGenerating,
  onSetIsGenerating,
  getFetchHeaders
}: SetupProps) {
  const [selectedReviewSession, setSelectedReviewSession] = useState<OralExamSession | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<OralExamSession | null>(null);

  const handleDeleteTopic = (topicIdToDelete: string) => {
    const updated = suggestedTopics.filter(t => t.id !== topicIdToDelete);
    onSetSuggestedTopics(updated);
  };

  const handleClearAllTopics = () => {
    onSetSuggestedTopics([]);
  };

  const generateOralTopics = async () => {
    if (!studyText || !studyText.trim()) {
      alert("Por favor asegúrate de haber subido y seleccionado al menos una fuente activa en tu cuaderno antes de generar los temas.");
      return;
    }
    onSetIsGenerating(true);
    try {
      const existingTitles = suggestedTopics.map(t => t.title);
      const res = await fetch("/api/generate-oral-topics", {
        method: "POST",
        headers: getFetchHeaders(),
        body: JSON.stringify({ 
          studyText,
          excludeTitles: existingTitles
        })
      });
      if (res.ok) {
        const data = await res.json();
        let rawText = data.text || '[]';
        // Remove markdown formatting if present
        rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
        const firstBracket = rawText.indexOf('[');
        const lastBracket = rawText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          rawText = rawText.substring(firstBracket, lastBracket + 1);
        }

        let parsed: any[] = [];
        try {
          const parsedData = JSON.parse(rawText);
          if (Array.isArray(parsedData)) {
            parsed = parsedData;
          } else if (parsedData && Array.isArray(parsedData.topics)) {
            parsed = parsedData.topics;
          } else if (parsedData && Array.isArray(parsedData.items)) {
            parsed = parsedData.items;
          }
        } catch (e) {
          console.error("JSON parse error:", e);
        }

        const newTopics: SuggestedOralTopic[] = parsed
          .filter((t: any) => t && (t.title || t.topicTitle) && Array.isArray(t.questions) && t.questions.length > 0)
          .map((t: any, idx: number) => ({
            id: t.id || `topic_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
            title: String(t.title || t.topicTitle),
            description: String(t.description || t.topicDescription || ''),
            questions: t.questions.map((q: any) => String(q.questionText || q))
          }));

        if (newTopics.length > 0) {
          // Append new topics to existing list, avoiding duplicate IDs
          const existingIds = new Set(suggestedTopics.map(st => st.id));
          const uniqueNewTopics = newTopics.filter(nt => !existingIds.has(nt.id));
          const updatedList = [...suggestedTopics, ...uniqueNewTopics];
          onSetSuggestedTopics(updatedList);
        } else {
          alert("No se pudieron generar nuevos temas de evaluación. Por favor intenta nuevamente.");
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(`Ocurrió un error al sugerir los temas: ${errJson.error || 'Error del servidor'}`);
      }
    } catch (err) {
      console.error("Error generating oral topics:", err);
      alert("No se pudo conectar con el servidor para sugerir los temas.");
    } finally {
      onSetIsGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-10 animate-in fade-in duration-300">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/5">
        <div>
          <span className="font-mono text-[10px] text-accent-systematic uppercase tracking-widest block mb-1">
            Evaluador Oral Inteligente
          </span>
          <h2 className="text-3xl font-extrabold font-display uppercase tracking-tight text-ink">
            Evaluación Oral por Temas
          </h2>
          <p className="text-ink-muted text-xs leading-relaxed max-w-xl mt-1">
            Elige un tema sugerido de tus PDFs. El tutor IA te formulará 5 preguntas orales y calificará tus respuestas en tiempo real para evaluar tu comprensión.
          </p>
        </div>
        <button
          onClick={onEnd}
          className="self-start md:self-center bg-bg-systematic border border-white/10 hover:border-accent-systematic text-ink hover:text-white font-mono text-[10px] uppercase tracking-widest py-3 px-6 transition-all duration-200 cursor-pointer flex items-center gap-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al cuaderno
        </button>
      </div>

      {/* Suggested Topics Grid */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold font-display uppercase tracking-tight text-ink flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-systematic" />
            Ideas de Evaluación Sugeridas
          </h3>
          {suggestedTopics.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleClearAllTopics}
                className="text-red-400/80 hover:text-red-400 text-xs font-mono uppercase tracking-wider flex items-center gap-1 bg-transparent border-none cursor-pointer transition-colors"
                title="Eliminar todas las propuestas sugeridas"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Borrar todas
              </button>
              <button
                onClick={generateOralTopics}
                disabled={isGenerating}
                className="text-accent-systematic hover:text-white text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 bg-transparent border-none cursor-pointer disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isGenerating && "animate-spin")} />
                {isGenerating ? "Generando..." : "+ Sugerir más ideas"}
              </button>
            </div>
          )}
        </div>

        {suggestedTopics.length === 0 ? (
          <div className="bg-panel-systematic border border-white/5 p-12 text-center flex flex-col items-center justify-center shadow-[6px_6px_0px_#161616]">
            <Brain className="w-12 h-12 text-accent-systematic/40 mb-4 animate-pulse" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-ink mb-2">¿Listo para ser evaluado?</h4>
            <p className="text-ink-muted text-xs leading-relaxed max-w-md mb-6">
              El tutor inteligente puede analizar tus apuntes para estructurar diferentes temas de examen oral y formular 5 preguntas para cada uno.
            </p>
            <button
              onClick={generateOralTopics}
              disabled={isGenerating}
              className="bg-accent-systematic hover:bg-white text-black font-mono text-xs uppercase tracking-widest py-4 px-10 border-none transition-all duration-200 active:scale-[0.98] flex items-center gap-2 font-bold cursor-pointer disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  Estructurando temas...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-black" />
                  Sugerir Temas de Evaluación
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {suggestedTopics.map((topic, idx) => (
              <div 
                key={topic.id || idx}
                className="bg-panel-systematic border border-white/5 p-6 hover:border-accent-systematic/50 transition-all duration-300 flex flex-col justify-between shadow-[6px_6px_0px_#161616] relative group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest bg-accent-systematic/10 border border-accent-systematic/20 px-2 py-0.5">
                      Idea de Examen 0{idx + 1}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[9px] text-ink-muted flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" />
                        {topic.questions?.length || 5} Preguntas
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTopic(topic.id);
                        }}
                        title="Borrar esta propuesta de examen"
                        className="text-ink-muted hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-colors cursor-pointer bg-transparent border-none flex items-center gap-1 font-mono text-[10px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Eliminar</span>
                      </button>
                    </div>
                  </div>
                  <h4 className="font-bold text-base text-ink mb-2 uppercase tracking-tight leading-snug">
                    {topic.title}
                  </h4>
                  <p className="text-ink-muted text-xs leading-relaxed mb-4">
                    {topic.description}
                  </p>

                  <div className="bg-bg-systematic/50 border border-white/5 p-3.5 space-y-2 mb-6">
                    <span className="text-[9px] font-mono font-bold text-ink-muted block uppercase tracking-wider">
                      Preguntas a responder:
                    </span>
                    <ul className="space-y-1.5">
                      {topic.questions.slice(0, 3).map((q, qidx) => (
                        <li key={qidx} className="text-[11px] text-ink-muted leading-tight flex items-start gap-1.5">
                          <span className="text-accent-systematic font-mono font-bold">{qidx + 1}.</span>
                          <span className="line-clamp-1">{q}</span>
                        </li>
                      ))}
                      {topic.questions.length > 3 && (
                        <li className="text-[10px] font-mono text-accent-systematic/80 pl-4 italic">
                          + {topic.questions.length - 3} preguntas más en el examen...
                        </li>
                      )}
                    </ul>
                  </div>
                </div>

                <button
                  onClick={() => onStartNewSession(topic)}
                  className="w-full bg-accent-systematic hover:bg-white text-black font-mono text-xs uppercase tracking-widest py-3 font-bold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Play className="w-3.5 h-3.5 fill-black" />
                  Iniciar Examen Oral
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial de Evaluaciones */}
      <div className="space-y-4 pt-4">
        <h3 className="text-lg font-bold font-display uppercase tracking-tight text-ink flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent-systematic" />
          Historial de Evaluaciones Realizadas
        </h3>

        {sessions.length === 0 ? (
          <div className="border border-white/5 bg-panel-systematic/30 p-8 text-center text-ink-muted text-xs">
            Aún no has completado ninguna evaluación oral en este cuaderno. ¡Comienza una para guardar tu progreso!
          </div>
        ) : (
          <div className="border border-white/5 bg-panel-systematic divide-y divide-white/5 shadow-[6px_6px_0px_#161616]">
            {sessions.map((session) => (
              <div 
                key={session.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.01] transition-all"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <h4 className="font-bold text-sm text-ink uppercase tracking-tight">
                      {session.topicTitle}
                    </h4>
                    {session.isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 px-2 py-0.5 rounded uppercase tracking-wider">
                        Completado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-amber-400 bg-amber-950/20 border border-amber-900/30 px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                        En curso
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-muted font-mono">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(session.createdAt).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      5 Preguntas
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-auto">
                  {session.isCompleted && (
                    <div className="text-right">
                      <span className="text-[10px] text-ink-muted font-mono block uppercase">Nota Promedio</span>
                      <span className={cn(
                        "text-xl font-black font-mono",
                        (session.finalScore || 0) >= 70 ? "text-emerald-400" : (session.finalScore || 0) >= 40 ? "text-amber-400" : "text-red-400"
                      )}>
                        {session.finalScore}/100
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (session.isCompleted) {
                          setSelectedReviewSession(session);
                        } else {
                          onSelectExistingSession(session);
                        }
                      }}
                      className="bg-bg-systematic border border-white/10 hover:border-accent-systematic text-ink hover:text-white font-mono text-[9px] uppercase tracking-wider py-2 px-4 transition-all cursor-pointer flex items-center gap-1"
                    >
                      {session.isCompleted ? "Revisar Reporte" : "Continuar Examen"}
                      <ChevronRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        setSessionToDelete(session);
                      }}
                      className="p-2 border border-white/5 hover:border-red-500/50 text-ink-muted hover:text-red-400 bg-transparent cursor-pointer transition-all"
                      title="Eliminar del historial"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Modal */}
      <AnimatePresence>
        {selectedReviewSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReviewSession(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-4xl bg-panel-systematic border border-white/10 p-6 md:p-8 max-h-[85vh] overflow-y-auto shadow-2xl flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                  <div>
                    <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest block">
                      Reporte de Evaluación Oral
                    </span>
                    <h3 className="text-xl font-bold font-display uppercase tracking-tight text-ink mt-1">
                      {selectedReviewSession.topicTitle}
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-ink-muted font-mono block uppercase">Calificación Final</span>
                    <span className="text-3xl font-black font-mono text-accent-systematic">
                      {selectedReviewSession.finalScore}/100
                    </span>
                  </div>
                </div>

                <div className="bg-bg-systematic/50 border border-white/5 p-4 rounded-xl mb-6">
                  <h5 className="text-xs font-bold uppercase text-ink flex items-center gap-1.5 mb-2 font-mono">
                    <Award className="w-4 h-4 text-accent-systematic" />
                    Conclusión del Evaluador IA:
                  </h5>
                  <p className="text-xs text-ink-muted leading-relaxed italic">
                    "{selectedReviewSession.finalFeedback || 'Has finalizado el examen oral estructurado. Revisa el desglose de preguntas abajo para identificar tus fortalezas y puntos de mejora.'}"
                  </p>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase text-ink font-mono tracking-wider">
                    Desglose de Preguntas (5)
                  </h4>
                  <div className="space-y-4">
                    {selectedReviewSession.questions.map((q, idx) => (
                      <div key={idx} className="bg-bg-systematic border border-white/5 p-4 space-y-3 shadow-inner">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-wider block font-bold">
                              Pregunta {idx + 1} de 5
                            </span>
                            <p className="text-xs font-semibold text-ink leading-relaxed">
                              {q.questionText}
                            </p>
                          </div>
                          <span className={cn(
                            "font-mono text-xs font-bold px-2 py-0.5 rounded",
                            (q.score || 0) >= 70 ? "text-emerald-400 bg-emerald-950/20 border border-emerald-900/30" : (q.score || 0) >= 40 ? "text-amber-400 bg-amber-950/20 border border-amber-900/30" : "text-red-400 bg-red-950/20 border border-red-900/30"
                          )}>
                            {q.score ?? 0}/100
                          </span>
                        </div>

                        {q.userAnswer ? (
                          <div className="space-y-3 pt-3 border-t border-white/5">
                            <div>
                              <span className="text-[9px] font-mono font-bold text-ink-muted block uppercase tracking-wider mb-1">
                                Tu respuesta oral:
                              </span>
                              <p className="text-xs text-ink-muted leading-relaxed pl-3 border-l-2 border-accent-systematic/40 italic bg-white/[0.01] py-1.5 px-2">
                                "{q.userAnswer}"
                              </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                              {q.strengths ? (
                                <div className="bg-emerald-950/10 border border-emerald-900/20 p-3 shadow-inner">
                                  <span className="text-[9px] font-mono font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider mb-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    Fortalezas
                                  </span>
                                  <p className="text-xs text-ink-muted leading-relaxed">
                                    {q.strengths}
                                  </p>
                                </div>
                              ) : (
                                <div className="bg-emerald-950/5 border border-emerald-900/10 p-3 opacity-60">
                                  <span className="text-[9px] font-mono font-bold text-ink-muted flex items-center gap-1.5 uppercase tracking-wider mb-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-ink-muted" />
                                    Fortalezas
                                  </span>
                                  <p className="text-xs text-ink-muted leading-relaxed italic">
                                    No se registraron fortalezas destacadas.
                                  </p>
                                </div>
                              )}

                              {q.toImprove ? (
                                <div className="bg-amber-950/10 border border-amber-900/25 p-3 shadow-inner">
                                  <span className="text-[9px] font-mono font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider mb-1.5">
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                                    Temas a Mejorar / Repasar
                                  </span>
                                  <p className="text-xs text-ink-muted leading-relaxed">
                                    {q.toImprove}
                                  </p>
                                </div>
                              ) : (
                                <div className="bg-emerald-950/10 border border-emerald-900/20 p-3 shadow-inner">
                                  <span className="text-[9px] font-mono font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider mb-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    Temas a Mejorar / Repasar
                                  </span>
                                  <p className="text-xs text-ink-muted leading-relaxed">
                                    ¡Respuesta impecable! No se identificaron temas o detalles pendientes de mejora.
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="bg-bg-systematic/50 border border-white/5 p-2.5">
                              <span className="text-[9px] font-mono font-bold text-accent-systematic block uppercase tracking-wider mb-1">
                                Feedback de Evaluación General:
                              </span>
                              <p className="text-xs text-ink-muted leading-relaxed">
                                {q.feedback || "Sin comentarios adicionales."}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] text-red-400 italic pl-2">
                            No se registró respuesta para esta pregunta.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-white/5 flex justify-end">
                <button
                  onClick={() => setSelectedReviewSession(null)}
                  className="bg-accent-systematic hover:bg-white text-black font-mono text-xs uppercase tracking-widest py-3 px-8 font-bold cursor-pointer transition-all"
                >
                  Cerrar Reporte
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Session Delete Confirmation Modal */}
      <AnimatePresence>
        {sessionToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSessionToDelete(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-panel-systematic border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10 p-6"
            >
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/5">
                <span className="text-xl">⚠️</span>
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
                  Eliminar Evaluación
                </h3>
              </div>

              <div className="space-y-4 font-sans text-xs text-ink-muted leading-relaxed">
                <p>
                  ¿Estás seguro de que deseas eliminar esta evaluación del historial?
                </p>
                <p className="text-amber-400 font-semibold bg-amber-950/20 border border-amber-900/30 p-2.5 rounded-lg text-[11px]">
                  Se borrarán de forma permanente todas las respuestas registradas, grabaciones, transcripciones y calificaciones de esta sesión.
                </p>
              </div>

              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={() => setSessionToDelete(null)}
                  className="px-4 py-2 rounded border border-white/10 hover:border-white/20 text-ink-muted hover:text-white font-mono text-[9px] uppercase tracking-wider cursor-pointer bg-transparent transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    onDeleteSession(sessionToDelete.id);
                    setSessionToDelete(null);
                  }}
                  className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer border-none transition-all shadow-lg shadow-red-900/20"
                >
                  Eliminar Sesión
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SessionProps {
  session: OralExamSession;
  studyText: string;
  onUpdateSession: (updated: OralExamSession) => void;
  onEnd: () => void;
  WebSocketSessionClass: any;
}

export function OralEvaluatorSession({
  session,
  studyText,
  onUpdateSession,
  onEnd,
  WebSocketSessionClass
}: SessionProps) {
  const [isConnecting, setIsConnecting] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentKeyConcept, setCurrentKeyConcept] = useState<{ text: string; category?: string; suggestedKeywords?: string[] } | null>(null);
  const [keyConceptsHistory, setKeyConceptsHistory] = useState<string[]>([]);
  
  // Find current question index (first question that has no userAnswer)
  const currentQuestionIdx = session.questions.findIndex(q => q.userAnswer === undefined);
  const effectiveIdx = currentQuestionIdx === -1 ? 4 : currentQuestionIdx;
  
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(effectiveIdx);
  const [localSession, setLocalSession] = useState<OralExamSession>(session);

  const socketSessionRef = useRef<any>(null);
  const playerRef = useRef<AudioStreamPlayer | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);

  useEffect(() => {
    let isMounted = true;

    const startSession = async () => {
      try {
        // Request mic access first
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStream.getTracks().forEach(track => track.stop());
        } catch (micErr) {
          console.error("Microphone access failed for oral exam:", micErr);
          if (isMounted) {
            setError("No se pudo acceder al micrófono. Por favor permite el acceso al micrófono en tu navegador e intenta de nuevo.");
            setIsConnecting(false);
          }
          return;
        }

        playerRef.current = new AudioStreamPlayer(24000);
        
        const socket = new WebSocketSessionClass({
          mode: 'oral_exam',
          text: studyText,
          selectedTopicTitle: session.topicTitle,
          questions: session.questions.map(q => q.questionText)
        });
        
        const socketPromise = Promise.resolve(socket);

        socket.setCallbacks({
          onopen: () => {
            if (!isMounted) return;
            setIsConnecting(false);
            
            recorderRef.current = new AudioRecorder((base64) => {
              socketPromise.then(s => {
                s.sendRealtimeInput({
                  audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                });
              });
            });
            
            recorderRef.current.start().catch((err: any) => {
              console.error("Error starting recording in oral exam:", err);
              if (isMounted) {
                setError("No se pudo iniciar el grabador de audio. Por favor verifica los permisos.");
                setIsConnecting(false);
              }
            });
          },
          onmessage: (message: any) => {
            if (!isMounted) return;
            
            // Check for tool call
            if (message.toolCall) {
              const functionCalls = message.toolCall.functionCalls;
              if (functionCalls) {
                const responses: any[] = [];
                for (const call of functionCalls) {
                  if (call.name === 'submitOralAnswer') {
                    const args = call.args as any;
                    if (args && args.questionIndex !== undefined) {
                      const qidx = args.questionIndex;
                      const score = args.score;
                      const feedback = args.feedback;
                      const userAnswerTranscript = args.userAnswerTranscript;
                      const strengths = args.strengths;
                      const toImprove = args.toImprove;

                      // Update state locally & trigger save
                      setLocalSession(prev => {
                        const updatedQuestions = [...prev.questions];
                        updatedQuestions[qidx] = {
                          ...updatedQuestions[qidx],
                          userAnswer: userAnswerTranscript,
                          feedback: feedback,
                          score: score,
                          strengths: strengths,
                          toImprove: toImprove
                        };

                        const isAllAnswered = updatedQuestions.every(q => q.userAnswer !== undefined);
                        let finalScore = prev.finalScore;
                        let finalFeedback = prev.finalFeedback;
                        
                        if (isAllAnswered) {
                          const total = updatedQuestions.reduce((sum, q) => sum + (q.score || 0), 0);
                          finalScore = Math.round(total / 5);
                          
                          if (finalScore >= 90) {
                            finalFeedback = "¡Excelente nivel! Has demostrado un dominio absoluto de todos los conceptos claves evaluados de manera oral. Tu argumentación es sólida, fluida y con un uso terminológico impecable.";
                          } else if (finalScore >= 70) {
                            finalFeedback = "¡Muy buen desempeño! Se aprecia una comprensión profunda de la materia. Has estructurado correctamente tus respuestas verbales, aunque restan pequeños matices conceptuales para pulir.";
                          } else if (finalScore >= 40) {
                            finalFeedback = "Examen aprobado con observaciones. Comprendes los lineamientos generales del tema, pero te cuesta profundizar de manera estructurada en tus explicaciones orales. Te sugerimos repasar los puntos señalados.";
                          } else {
                            finalFeedback = "Examen reprobado. Presentas dificultades para conceptualizar e hilar ideas orales basadas en el contenido. Te recomendamos repasar exhaustivamente los apuntes y volver a rendir este módulo.";
                          }
                        }

                        const nextSession = {
                          ...prev,
                          questions: updatedQuestions,
                          isCompleted: isAllAnswered,
                          finalScore,
                          finalFeedback
                        };

                        // Notify parent component to save in history/DB
                        setTimeout(() => {
                          onUpdateSession(nextSession);
                        }, 50);

                        // Advance UI question step if not yet complete
                        if (qidx < 4) {
                          setActiveQuestionIndex(qidx + 1);
                        }

                        return nextSession;
                      });
                    }
                    
                    responses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: "Respuesta y calificación registradas exitosamente en la interfaz." }
                    });
                  } else if (call.name === 'displayKeyConcept') {
                    const args = call.args as any;
                    if (args && args.keyConcept) {
                      const conceptText = args.keyConcept;
                      const cat = args.category || 'Idea Principal';
                      const suggestedKws = Array.isArray(args.suggestedKeywords) ? args.suggestedKeywords : [];
                      setCurrentKeyConcept({ 
                        text: conceptText, 
                        category: cat,
                        suggestedKeywords: suggestedKws
                      });
                      setKeyConceptsHistory(prev => [conceptText, ...prev.filter(c => c !== conceptText)].slice(0, 10));
                    }
                    responses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: "Palabra o idea principal mostrada en pantalla correctamente." }
                    });
                  }
                }
                if (responses.length > 0) {
                  socketPromise.then(s => {
                    s.sendToolResponse({ functionResponses: responses });
                  });
                }
              }
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setIsSpeaking(true);
              playerRef.current?.addPCM16(base64Audio);
            }
            
            if (message.serverContent?.interrupted) {
              playerRef.current?.interrupt();
              setIsSpeaking(false);
            }
            
            if (message.serverContent?.turnComplete) {
              setIsSpeaking(false);
            }
          },
          onclose: () => {
            console.log("WebSocket oral exam proxy closed.");
          },
          onerror: (err: any) => {
            console.error("Live API Error in oral exam:", err);
            if (isMounted) {
              setError(err?.message || "Se perdió la conexión con el evaluador por voz.");
            }
          }
        });

        socketSessionRef.current = socketPromise;
      } catch (err) {
        console.error("Failed to start oral exam session:", err);
        if (isMounted) {
          setError("No se pudo iniciar la evaluación. Verifica los permisos de tu micrófono.");
          setIsConnecting(false);
        }
      }
    };

    startSession();

    return () => {
      isMounted = false;
      recorderRef.current?.stop();
      playerRef.current?.stop();
      socketSessionRef.current?.then((s: any) => s.close());
    };
  }, [studyText, session.topicTitle, WebSocketSessionClass]);

  // Sync active question index with actual progress
  useEffect(() => {
    const answeredCount = localSession.questions.filter(q => q.userAnswer !== undefined).length;
    if (answeredCount < 5) {
      setActiveQuestionIndex(answeredCount);
    }
  }, [localSession.questions]);

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start justify-center min-h-[75vh] p-4 sm:p-6 animate-in fade-in duration-300">
      
      {/* Left Stepper Sidebar - Questions List */}
      <div className="w-full lg:w-1/2 bg-panel-systematic border border-white/5 p-6 shadow-[6px_6px_0px_#161616] space-y-6">
        <div>
          <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest block font-bold">
            Progreso del Examen
          </span>
          <h4 className="font-bold text-lg text-ink uppercase tracking-tight font-display mt-0.5">
            {localSession.topicTitle}
          </h4>
        </div>

        <div className="space-y-4">
          {localSession.questions.map((q, idx) => {
            const isCompleted = q.userAnswer !== undefined;
            const isActive = idx === activeQuestionIndex && !localSession.isCompleted;
            const isPending = !isCompleted && !isActive;

            return (
              <div 
                key={idx}
                className={cn(
                  "p-4 border transition-all duration-300 flex flex-col gap-2",
                  isCompleted ? "border-emerald-950 bg-emerald-950/5" :
                  isActive ? "border-accent-systematic bg-accent-systematic/5 ring-1 ring-accent-systematic/20" :
                  "border-white/5 bg-panel-systematic/10 opacity-50"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-bold",
                      isCompleted ? "bg-emerald-500 text-black" :
                      isActive ? "bg-accent-systematic text-black animate-pulse" :
                      "bg-white/10 text-ink-muted"
                    )}>
                      {idx + 1}
                    </span>
                    <span className="font-mono text-[9px] text-ink-muted uppercase tracking-wider block font-bold">
                      Pregunta {idx + 1} de 5
                    </span>
                  </div>
                  {isCompleted && (
                    <span className="font-mono text-[10px] font-bold text-emerald-400">
                      {q.score}/100
                    </span>
                  )}
                </div>

                <p className={cn(
                  "text-xs leading-relaxed font-sans",
                  isActive ? "text-ink font-semibold" : "text-ink-muted"
                )}>
                  {q.questionText}
                </p>

                {isCompleted && (
                  <div className="text-[11px] space-y-2.5 mt-1.5 pt-2 border-t border-white/5 animate-in fade-in duration-300">
                    <div>
                      <span className="font-mono text-[9px] font-bold text-ink-muted uppercase">Tu respuesta:</span>
                      <p className="text-ink-muted italic pl-2 border-l border-accent-systematic/40 leading-relaxed">
                        "{q.userAnswer}"
                      </p>
                    </div>
                    {q.strengths && (
                      <div>
                        <span className="font-mono text-[9px] font-bold text-emerald-400 flex items-center gap-1 uppercase tracking-wider">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Fortalezas:
                        </span>
                        <p className="text-ink-muted pl-4 leading-relaxed">
                          {q.strengths}
                        </p>
                      </div>
                    )}
                    {q.toImprove && (
                      <div>
                        <span className="font-mono text-[9px] font-bold text-amber-400 flex items-center gap-1 uppercase tracking-wider">
                          <AlertCircle className="w-3 h-3 text-amber-400" /> Temas a mejorar:
                        </span>
                        <p className="text-ink-muted pl-4 leading-relaxed">
                          {q.toImprove}
                        </p>
                      </div>
                    )}
                    <div>
                      <span className="font-mono text-[9px] font-bold text-accent-systematic uppercase tracking-wider">Evaluación:</span>
                      <p className="text-ink-muted pl-2 leading-relaxed">
                        {q.feedback}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Interaction Panel */}
      <div className="w-full lg:w-1/2 bg-panel-systematic border border-white/5 p-8 shadow-[6px_6px_0px_#161616] sticky top-24">
        {error ? (
          <div className="bg-red-950/20 border border-red-900/30 text-red-400 p-6 rounded-2xl w-full text-center">
            <p className="font-semibold mb-4 text-sm">{error}</p>
            <button
              onClick={onEnd}
              className="mt-4 bg-red-950/40 hover:bg-red-900/40 text-red-200 border border-red-900/30 px-5 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Volver al historial
            </button>
          </div>
        ) : localSession.isCompleted ? (
          /* Report Screen */
          <div className="flex flex-col items-center justify-center space-y-6 text-center py-6 animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 rounded-full bg-accent-systematic/10 border-2 border-accent-systematic flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(255,77,0,0.15)]">
              <Award className="w-12 h-12 text-accent-systematic" />
            </div>

            <div className="space-y-1">
              <span className="font-mono text-[10px] text-accent-systematic uppercase tracking-widest font-bold block">
                Examen Oral Finalizado
              </span>
              <h3 className="text-2xl font-black uppercase tracking-tight text-ink">
                ¡Evaluación Completada!
              </h3>
            </div>

            <div className="bg-bg-systematic border border-white/5 py-4 px-10 rounded-xl">
              <span className="text-[10px] text-ink-muted font-mono block uppercase">Calificación General</span>
              <span className="text-4xl font-black font-mono text-white tracking-tighter">
                {localSession.finalScore}/100
              </span>
            </div>

            <p className="text-xs text-ink-muted leading-relaxed max-w-md px-4 italic bg-bg-systematic/50 border border-white/5 p-4 rounded-lg">
              "{localSession.finalFeedback}"
            </p>

            <button
              onClick={onEnd}
              className="bg-accent-systematic hover:bg-white text-black font-mono text-xs uppercase tracking-widest py-4 px-10 border border-none transition-all font-bold cursor-pointer"
            >
              Finalizar y Guardar Reporte
            </button>
          </div>
        ) : (
          /* Running Session Screen */
          <div className="flex flex-col items-center w-full">
            <div className="relative w-44 h-44 mb-6 flex items-center justify-center">
              {/* Pulsing rings */}
              <div className={cn(
                "absolute inset-0 rounded-full bg-accent-systematic/10 transition-all duration-500",
                isConnecting ? "animate-ping" : isSpeaking ? "animate-pulse scale-150 opacity-20" : "scale-110"
              )} />
              <div className={cn(
                "absolute inset-4 rounded-full bg-accent-systematic/15 transition-all duration-300",
                isSpeaking ? "animate-pulse scale-125 opacity-35" : "scale-100"
              )} />
              
              {/* Orb */}
              <div className={cn(
                "relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-500 border border-white/10",
                isConnecting ? "bg-bg-systematic text-ink-muted" : "bg-accent-systematic text-black shadow-[4px_4px_0px_#000000]"
              )}>
                {isConnecting ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : isSpeaking ? (
                  <Volume2 className="w-8 h-8 text-black animate-bounce" />
                ) : (
                  <Mic className="w-8 h-8 text-black" />
                )}
              </div>
            </div>

            {/* Speaking/Listening Voice wave effect */}
            {!isConnecting && (
              <div className="flex items-end justify-center gap-1.5 h-8 mb-6">
                <div className={cn("w-1 bg-accent-systematic rounded-full transition-all duration-300", isSpeaking ? "animate-wave-1 h-6" : "h-2")} />
                <div className={cn("w-1 bg-accent-systematic rounded-full transition-all duration-300", isSpeaking ? "animate-wave-2 h-8" : "h-3")} />
                <div className={cn("w-1 bg-accent-systematic/80 rounded-full transition-all duration-300", isSpeaking ? "animate-wave-3 h-5" : "h-2.5")} />
                <div className={cn("w-1 bg-accent-systematic rounded-full transition-all duration-300", isSpeaking ? "animate-wave-4 h-7" : "h-3")} />
                <div className={cn("w-1 bg-accent-systematic/60 rounded-full transition-all duration-300", isSpeaking ? "animate-wave-5 h-4" : "h-1.5")} />
              </div>
            )}

            <div className="text-center mb-4 min-h-[60px] flex flex-col justify-center">
              <h3 className="text-xl font-black uppercase tracking-tight text-ink mb-1">
                {isConnecting ? "Sincronizando..." : isSpeaking ? "El Evaluador está hablando" : "Evaluador Escuchando..."}
              </h3>
              <p className="text-ink-muted text-xs px-4 font-sans max-w-sm mx-auto leading-relaxed">
                {isConnecting 
                  ? "Conectando al canal de voz de nivel académico..." 
                  : isSpeaking 
                    ? "Escucha la pregunta o retroalimentación con atención." 
                    : "Responde oralmente la pregunta en voz alta. Sé claro e hila ideas."}
              </p>
            </div>

            {/* Display of current main idea / key word in written text */}
            <AnimatePresence mode="wait">
              {currentKeyConcept && (
                <motion.div
                  key={currentKeyConcept.text}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="w-full bg-gradient-to-r from-amber-500/10 via-accent-systematic/15 to-amber-500/10 border border-accent-systematic/40 rounded-xl text-center my-3 shadow-[0_0_20px_rgba(255,77,0,0.15)] relative overflow-hidden"
                >
                  <div className="p-3.5">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-accent-systematic animate-pulse" />
                      <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-accent-systematic">
                        {currentKeyConcept.category || "Idea Principal / Pregunta"}
                      </span>
                    </div>
                    <p className="text-base sm:text-lg font-black text-white uppercase tracking-tight leading-snug font-display">
                      "{currentKeyConcept.text}"
                    </p>
                  </div>

                  {/* Suggested Keywords Guide Badges */}
                  {currentKeyConcept.suggestedKeywords && currentKeyConcept.suggestedKeywords.length > 0 && (
                    <div className="bg-black/60 border-t border-accent-systematic/30 p-2.5 text-left">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-amber-300">
                          Palabras clave sugeridas a mencionar en tu respuesta:
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {currentKeyConcept.suggestedKeywords.map((kw, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-200 font-mono text-[10px] font-bold px-2 py-0.5 rounded shadow-sm"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Key words history pills */}
            {keyConceptsHistory.length > 0 && (
              <div className="w-full mb-4 bg-bg-systematic/60 border border-white/5 p-2.5 rounded-lg text-left">
                <span className="font-mono text-[8px] text-ink-muted uppercase tracking-widest block mb-1.5 font-bold">
                  Palabras e Ideas Clave del Examen:
                </span>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {keyConceptsHistory.map((concept, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 bg-white/5 border border-white/10 text-white font-mono text-[9px] px-2 py-0.5 rounded"
                    >
                      <span className="text-accent-systematic font-bold">▪</span>
                      {concept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="w-full bg-bg-systematic border border-white/5 p-4 rounded-xl mb-6 text-center space-y-1 bg-accent-systematic/5">
              <span className="font-mono text-[8px] text-accent-systematic uppercase tracking-widest font-bold block">
                Pregunta Actual ({activeQuestionIndex + 1}/5)
              </span>
              <p className="text-xs text-ink leading-relaxed font-semibold">
                "{localSession.questions[activeQuestionIndex]?.questionText}"
              </p>
            </div>

            <div className="w-full bg-bg-systematic rounded-full h-1.5 mb-6 overflow-hidden border border-white/5">
              <div 
                className="bg-accent-systematic h-full transition-all duration-500 rounded-full"
                style={{ width: `${(activeQuestionIndex / 5) * 100}%` }}
              />
            </div>

            <button
              onClick={onEnd}
              className="bg-bg-systematic border border-white/10 hover:border-red-500/40 hover:text-red-400 text-ink font-mono text-[9px] uppercase tracking-widest py-3 px-8 transition-all duration-200 cursor-pointer"
            >
              Salir del Examen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
