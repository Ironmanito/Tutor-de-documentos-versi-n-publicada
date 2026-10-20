import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, ChevronRight, ChevronLeft, Volume2, VolumeX, Sparkles, 
  BookOpen, Target, Compass, Mic, Mail, Award, CheckCircle2, Loader2
} from 'lucide-react';
import { WiseOwlAvatar, OwlMood, owlAudio, ConfettiCanvas } from './WiseOwlAvatar';
import { AudioStreamPlayer } from '../lib/audio';

interface TourStep {
  id: number;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  owlMood: OwlMood;
  owlSpeech: string;
  icon: React.ReactNode;
  accentColor: string;
  previewCard: {
    title: string;
    items: string[];
    highlight: string;
  };
}

interface InteractiveTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddGems?: (amount: number) => void;
  onOpenDocumentViewer?: () => void;
  onOpenDiagram?: () => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 0,
    badge: "01. BIENVENIDA Y TEORÍA SOCIAL",
    title: "Aprende Más en Menos Tiempo",
    subtitle: "Tutor Académico con Inteligencia Artificial y Active Recall",
    description: "Olvídate de leer pasivamente páginas interminables de apuntes de Teoría Social sin retener los paradigmas sociológicos. Esta plataforma convierte cualquier texto en una experiencia guiada de alta retención.",
    owlMood: "happy",
    owlSpeech: "¡Hola! Soy Archie, tu mentor pedagógico. Te mostraré en 60 segundos cómo dominar Teoría Social y cualquier materia universitaria con retención garantizada.",
    icon: <Sparkles className="w-6 h-6 text-amber-400" />,
    accentColor: "border-amber-400/40 text-amber-300",
    previewCard: {
      title: "Arquitectura Cognitiva",
      items: [
        "🧠 Creado para universitarios y estudiantes de alta exigencia.",
        "💎 Gamificación inteligente con recompensas en gemas.",
        "📊 Diagnóstico psicopedagógico en tiempo real."
      ],
      highlight: "Enfoque 100% activo: no más memorización mecánica."
    }
  },
  {
    id: 1,
    badge: "02. CARGA MULTIMODAL",
    title: "Sube Cualquier Formato",
    subtitle: "PDF, Word, Fotos de Cuadernos, PowerPoint y Google Docs",
    description: "Arrastra archivos de cátedra o saca fotos de tus notas manuscritas de Teoría Social. El motor OCR inteligente procesa y estructura el texto al instante, organizando tus cuadernos de estudio.",
    owlMood: "explaining" as OwlMood,
    owlSpeech: "Puedes subir textos de Durkheim, Weber o Marx, diapositivas de clases o fotos de tu carpeta. La IA ordenará los conceptos clave automáticamente.",
    icon: <BookOpen className="w-6 h-6 text-sky-400" />,
    accentColor: "border-sky-400/40 text-sky-300",
    previewCard: {
      title: "Formatos Soportados",
      items: [
        "📄 Documentos PDF, Word (.docx) y textos de Teoría Social.",
        "🖼️ Fotos de apuntes y carpetas con extracción óptica OCR.",
        "📊 Presentaciones PowerPoint (.pptx) con esquemas teóricos.",
        "☁️ Importación directa desde enlaces de Google Drive y Docs."
      ],
      highlight: "Tus documentos se guardan localmente para acceder sin conexión."
    }
  },
  {
    id: 2,
    badge: "03. MICROLECTURAS & CHECKPOINTS",
    title: "Adiós al Scroll Compulsivo",
    subtitle: "Puntos de Control Cognitivo Obligatorios",
    description: "El mayor enemigo del estudio es el scroll acelerado sin lectura. El sistema fragmenta el material de Teoría Social en micro-cápsulas de 2 minutos que exigen responder un checkpoint antes de avanzar.",
    owlMood: "thinking",
    owlSpeech: "Dividimos autores como Marx y Weber en bocados digeribles. Al terminar cada fragmento, verificamos tu comprensión activa para sumar gemas 💎.",
    icon: <Target className="w-6 h-6 text-emerald-400" />,
    accentColor: "border-emerald-400/40 text-emerald-300",
    previewCard: {
      title: "Mecanismo de Retención Activa",
      items: [
        "🎯 Cápsulas breves de 100 a 200 palabras según la dificultad.",
        "⏱️ Guarda anti-skimming: exige asimilación real de conceptos.",
        "❓ Pregunta relámpago de causa-efecto (ej. acción social o burocracia).",
        "💎 +5 Gemas al superar cada hito y desbloquear el siguiente bloque."
      ],
      highlight: "Aumenta la comprensión lectora hasta un 85%."
    }
  },
  {
    id: 3,
    badge: "04. MAPA CONCEPTUAL EN 2DO PLANO",
    title: "Visualiza Relaciones Lógicas",
    subtitle: "Generación Asíncrona con Niveles Fácil, Medio y Difícil",
    description: "Explora un árbol visual interactivo con variables sociológicas, instituciones y analogías prácticas del mundo real. Y lo mejor: se genera en segundo plano mientras tú sigues leyendo tus apuntes.",
    owlMood: "happy",
    owlSpeech: "Tocas 'Generar Mapa' de Teoría Social y sigues leyendo. Apenas termina en segundo plano, te avisamos con sonido para explorarlo.",
    icon: <Compass className="w-6 h-6 text-amber-400" />,
    accentColor: "border-amber-400/40 text-amber-300",
    previewCard: {
      title: "Exploración de Nodos",
      items: [
        "🗺️ Nodos conectados: Hechos Sociales, Poder, Acción y Estructuras.",
        "💡 Analogías prácticas para entender paradigmas complejos.",
        "🎯 Mini-quiz activo en cada nodo para fijar la teoría.",
        "⚡ Selector de rigor académico: Fácil | Medio | Difícil."
      ],
      highlight: "Caché instantánea: abre en 0 ms una vez generado."
    }
  },
  {
    id: 4,
    badge: "05. EVALUACIÓN ORAL Y VOZ",
    title: "Rinde Exámenes por Voz",
    subtitle: "Feedback Pedagógico Inmediato",
    description: "Practica defendiendo los temas oralmente con el micrófono. Archie escucha tu explicación de las teorías sociológicas, evalúa la precisión conceptual y te califica del 1 al 10 en tiempo real.",
    owlMood: "explaining" as OwlMood,
    owlSpeech: "Habla con naturalidad respondiendo a mis preguntas de examen oral. Te daré consejos precisos para rendir con seguridad en tus mesas universitarias.",
    icon: <Mic className="w-6 h-6 text-purple-400" />,
    accentColor: "border-purple-400/40 text-purple-300",
    previewCard: {
      title: "Simulación de Examen",
      items: [
        "🎙️ Reconocimiento de voz fluido y transcripción en directo.",
        "📐 Calificación inmediata con devolución conceptual rigurosa.",
        "📈 Medición de seguridad, titubeos y dominio de la materia.",
        "🔄 5 preguntas por tema con nivel de dificultad graduable."
      ],
      highlight: "Pierde el miedo escénico antes de rendir frente al docente."
    }
  },
  {
    id: 5,
    badge: "06. REPORTE AUTOMÁTICO POR CORREO",
    title: "Métricas y Análisis Conductual",
    subtitle: "Informe Detallado Directo a tu Casilla",
    description: "Al finalizar cada sesión de estudio, el sistema emite automáticamente un informe exhaustivo con el progreso, tiempo de lectura real, fatiga y recomendaciones psicopedagógicas.",
    owlMood: "happy",
    owlSpeech: "Configuras tu correo una sola vez y recibirás el diagnóstico psicopedagógico completo de cada sesión para monitorear tu evolución.",
    icon: <Mail className="w-6 h-6 text-rose-400" />,
    accentColor: "border-rose-400/40 text-rose-300",
    previewCard: {
      title: "Telemetría Educativa",
      items: [
        "📬 Envío automático al desconectar o pausar la sesión.",
        "⏱️ Tiempo neto de estudio activo vs tiempo pasivo.",
        "🎯 Precisión en checkpoints y exámenes orales.",
        "💡 Consejos de estudio personalizados redactados por la IA."
      ],
      highlight: "Ideal para seguimiento propio o para docentes y tutores."
    }
  },
  {
    id: 6,
    badge: "¡TOUR COMPLETADO! 🏅",
    title: "¡Todo Listo para Comenzar!",
    subtitle: "Tienes las herramientas para aprender sin límites",
    description: "Has completado la inducción guiada del Tutor Académico. Para premiar tu interés, te obsequiamos tus primeras gemas de recompensa.",
    owlMood: "celebrating",
    owlSpeech: "¡Felicitaciones! Has recibido +15 Gemas 💎 de bienvenida. ¡Abre tu apunte de Teoría Social o sube tus textos para comenzar tu sesión!",
    icon: <Award className="w-6 h-6 text-amber-400" />,
    accentColor: "border-amber-400/40 text-amber-300",
    previewCard: {
      title: "Tus Próximos Pasos",
      items: [
        "1. Selecciona tu cuaderno de Teoría Social o sube un documento.",
        "2. Lee con las microlecturas guiadas para activar tu memoria.",
        "3. Revisa el mapa conceptual interactivo y rinde una evaluación oral.",
        "4. ¡Disfruta aprendiendo con Archie como tu mentor!"
      ],
      highlight: "Recompensa de +15 Gemas 💎 acreditada."
    }
  }
];

export const InteractiveTourModal: React.FC<InteractiveTourModalProps> = ({
  isOpen,
  onClose,
  onAddGems,
  onOpenDocumentViewer,
  onOpenDiagram
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [hasAwardedGems, setHasAwardedGems] = useState(false);
  const [isLoadingVoice, setIsLoadingVoice] = useState(false);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  const playerRef = useRef<AudioStreamPlayer | null>(null);
  const audioCacheRef = useRef<Record<number, string>>({});
  const activeStepRef = useRef<number>(0);
  const voiceEnabledRef = useRef<boolean>(true);

  activeStepRef.current = currentStep;
  voiceEnabledRef.current = voiceEnabled;

  const step = TOUR_STEPS[currentStep] || TOUR_STEPS[0];

  // Inicializar reproductor de audio PCM 24kHz
  const getPlayer = () => {
    if (!playerRef.current) {
      playerRef.current = new AudioStreamPlayer(24000);
    }
    return playerRef.current;
  };

  // Pre-cargar audio de pasos siguientes en segundo plano
  const prefetchStepAudio = async (stepIndex: number) => {
    if (stepIndex >= TOUR_STEPS.length || audioCacheRef.current[stepIndex]) return;
    try {
      const text = TOUR_STEPS[stepIndex].owlSpeech;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const savedKey = typeof window !== 'undefined' ? localStorage.getItem('user_gemini_api_key') : null;
      if (savedKey) headers["x-gemini-api-key"] = savedKey;

      const res = await fetch('/api/speak-live', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, voiceName: 'Zephyr' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audioPcmBase64) {
          audioCacheRef.current[stepIndex] = data.audioPcmBase64;
        }
      }
    } catch (_) {}
  };

  // Reproducir locución de Archie con el motor de voz Live (Zephyr)
  const speakCurrentStepLive = async (stepIndex: number) => {
    const player = getPlayer();
    player.interrupt();
    setIsPlayingVoice(false);

    if (!voiceEnabledRef.current) return;

    // Si ya está en caché, reproducir al instante
    const cached = audioCacheRef.current[stepIndex];
    if (cached) {
      setIsLoadingVoice(false);
      player.addPCM16(cached);
      setIsPlayingVoice(true);
      // Pre-cargar el siguiente paso
      prefetchStepAudio(stepIndex + 1);
      return;
    }

    setIsLoadingVoice(true);
    try {
      const text = TOUR_STEPS[stepIndex].owlSpeech;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const savedKey = typeof window !== 'undefined' ? localStorage.getItem('user_gemini_api_key') : null;
      if (savedKey) headers["x-gemini-api-key"] = savedKey;

      const res = await fetch('/api/speak-live', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, voiceName: 'Zephyr' })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.audioPcmBase64) {
        audioCacheRef.current[stepIndex] = data.audioPcmBase64;
        // Solo reproducir si el usuario aún se encuentra en este paso y la voz sigue activa
        if (activeStepRef.current === stepIndex && voiceEnabledRef.current) {
          player.interrupt();
          player.addPCM16(data.audioPcmBase64);
          setIsPlayingVoice(true);
        }
      }
    } catch (err) {
      console.warn("[InteractiveTourModal] Error al obtener voz Live de Gemini:", err);
    } finally {
      if (activeStepRef.current === stepIndex) {
        setIsLoadingVoice(false);
      }
      // Pre-cargar el paso siguiente de forma preventiva
      prefetchStepAudio(stepIndex + 1);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      playerRef.current?.stop();
      setIsPlayingVoice(false);
      setIsLoadingVoice(false);
      setShowConfetti(false);
      return;
    }

    // Efecto de campana según el avance
    if (currentStep === 0) {
      owlAudio.playLevelUpChime();
    } else if (currentStep === TOUR_STEPS.length - 1) {
      owlAudio.playLevelUpChime();
      setShowConfetti(true);
      // Detener confeti a los 3.5 segundos para no invadir la lectura
      const timer = setTimeout(() => setShowConfetti(false), 3500);
      if (!hasAwardedGems) {
        onAddGems?.(15);
        setHasAwardedGems(true);
      }
      return () => clearTimeout(timer);
    } else {
      owlAudio.playEncouragementChime();
    }

    // Disparar voz Live de Gemini
    speakCurrentStepLive(currentStep);

    return () => {
      playerRef.current?.interrupt();
      setIsPlayingVoice(false);
    };
  }, [isOpen, currentStep]);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    voiceEnabledRef.current = next;

    if (!next) {
      playerRef.current?.interrupt();
      setIsPlayingVoice(false);
      setIsLoadingVoice(false);
    } else {
      speakCurrentStepLive(currentStep);
    }
  };

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleFinish = () => {
    playerRef.current?.stop();
    setIsPlayingVoice(false);
    setIsLoadingVoice(false);
    setShowConfetti(false);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('has_seen_tour', 'true');
      } catch (_) {}
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
        onClick={handleFinish}
      >
        <ConfettiCanvas active={showConfetti} onComplete={() => setShowConfetti(false)} />

        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 15 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-4xl bg-gradient-to-b from-[#12141c] via-[#0e1017] to-[#0a0b10] border border-amber-400/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header del Tour */}
          <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-xl shrink-0">
                🦉
              </div>
              <div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-amber-400 font-bold block">
                  Tutorial Interactivo &bull; Conoce a tu Tutor
                </span>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <span>Paso {currentStep + 1} de {TOUR_STEPS.length}</span>
                  {isLoadingVoice && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-300 font-normal px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-400/20">
                      <Loader2 className="w-3 h-3 animate-spin" /> Conectando voz Live...
                    </span>
                  )}
                  {isPlayingVoice && !isLoadingVoice && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Voz Live: Zephyr
                    </span>
                  )}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Botón Silenciar / Activar Voz Live */}
              <button
                type="button"
                onClick={toggleVoice}
                className={`p-2 rounded-xl border text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                  voiceEnabled
                    ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                    : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                }`}
                title={voiceEnabled ? 'Silenciar voz Live de Archie' : 'Activar voz Live de Archie (Zephyr)'}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="hidden sm:inline text-[10px] font-bold uppercase">
                  {voiceEnabled ? 'Voz Live' : 'Mudo'}
                </span>
              </button>

              {/* Botón Cerrar */}
              <button
                type="button"
                onClick={handleFinish}
                className="p-2 rounded-xl border border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                title="Saltar o cerrar tour"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Barra de Progreso por Eslabones */}
          <div className="flex items-center gap-1.5 px-6 py-2.5 bg-black/40 border-b border-white/5 overflow-x-auto shrink-0">
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentStep(idx)}
                className={`h-1.5 flex-grow min-w-[24px] rounded-full transition-all cursor-pointer ${
                  idx === currentStep
                    ? 'bg-amber-400 ring-2 ring-amber-400/40 shadow-sm'
                    : idx < currentStep
                      ? 'bg-emerald-400'
                      : 'bg-white/10 hover:bg-white/20'
                }`}
                title={`Ir a paso ${idx + 1}: ${s.title}`}
              />
            ))}
          </div>

          {/* CUERPO PRINCIPAL */}
          <div className="p-5 sm:p-8 overflow-y-auto flex-grow flex flex-col justify-between space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              
              {/* Columna Izquierda: Información del Paso */}
              <div className="md:col-span-7 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono font-bold tracking-widest text-amber-300 uppercase">
                  {step.icon}
                  <span>{step.badge}</span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
                  {step.title}
                </h2>

                <p className="text-xs sm:text-sm font-semibold text-neutral-300">
                  {step.subtitle}
                </p>

                <p className="text-xs text-neutral-400 leading-relaxed text-justify">
                  {step.description}
                </p>

                {/* Globo de Diálogo de Archie */}
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex items-start gap-3.5 shadow-lg">
                  <WiseOwlAvatar 
                    mood={step.owlMood} 
                    speechText="" 
                    size="sm" 
                    showSoundToggle={false} 
                    className="shrink-0 scale-90 -mt-1" 
                  />
                  <div className="text-xs text-neutral-200 flex-grow">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-amber-300 font-bold block">
                        Archie &bull; Tu Mentor (Gemini Live)
                      </span>
                      {isLoadingVoice && (
                        <span className="text-[9px] font-mono text-amber-400 animate-pulse">
                          Cargando audio...
                        </span>
                      )}
                    </div>
                    <p className="italic leading-relaxed">
                      "{step.owlSpeech}"
                    </p>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Tarjeta Visual Ilustrativa */}
              <div className="md:col-span-5">
                <div className="p-5 sm:p-6 rounded-2xl bg-black/40 border border-white/10 shadow-xl space-y-4 relative overflow-hidden">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                      {step.previewCard.title}
                    </span>
                    <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                      Función Clave
                    </span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-neutral-300">
                    {step.previewCard.items.map((item, iIdx) => (
                      <li key={iIdx} className="flex items-start gap-2 leading-relaxed">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-3 border-t border-white/10">
                    <span className="font-mono text-[10px] text-amber-300 font-bold block">
                      ⚡ {step.previewCard.highlight}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Footer con Botones de Navegación */}
          <div className="p-4 sm:p-5 border-t border-white/10 bg-black/30 flex items-center justify-between gap-3 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-20 disabled:pointer-events-none text-xs font-bold font-mono uppercase tracking-wider border border-white/10 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFinish}
                className="px-4 py-2.5 rounded-xl hover:bg-white/5 text-neutral-400 hover:text-white text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer"
              >
                Saltar Tour
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black font-mono uppercase tracking-wider transition-all shadow-lg shadow-amber-400/20 cursor-pointer flex items-center gap-1.5"
              >
                <span>{currentStep === TOUR_STEPS.length - 1 ? '¡Comenzar Ahora! 🚀' : 'Siguiente'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
