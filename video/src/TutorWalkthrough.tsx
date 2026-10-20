import React from 'react';
import { 
  AbsoluteFill, 
  interpolate, 
  spring, 
  useCurrentFrame, 
  useVideoConfig,
  Sequence
} from 'remotion';

// ==========================================
// ESCENA 1: INTRODUCCIÓN & GANCHO (Frames 0 - 270 / 9 seg)
// ==========================================
const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, from: 0.8, to: 1, config: { damping: 12 } });
  const opacity = interpolate(frame, [0, 20, 240, 260], [0, 1, 1, 0]);

  return (
    <AbsoluteFill className="bg-[#0b0c10] text-white flex flex-col items-center justify-center p-16 font-sans">
      <div style={{ opacity, transform: `scale(${scale})` }} className="text-center space-y-6 max-w-4xl">
        <div className="w-28 h-28 mx-auto rounded-3xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-6xl shadow-2xl">
          🦉
        </div>
        <span className="font-mono text-xl uppercase tracking-widest text-amber-400 font-bold block">
          Tutor Académico Inteligente &bull; Active Recall
        </span>
        <h1 className="text-6xl font-black tracking-tight leading-tight">
          Aprende Más en Menos Tiempo.<br />
          <span className="text-amber-300">Sin Scroll Compulsivo.</span>
        </h1>
        <p className="text-2xl text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          Transforma cualquier PDF, apunte o diapositiva en una experiencia interactiva de alta retención.
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// ESCENA 2: MICROLECTURAS & CHECKPOINTS (Frames 270 - 570 / 10 seg)
// ==========================================
const SceneMicrolectures: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20, 280, 300], [0, 1, 1, 0]);
  const translateY = interpolate(frame, [0, 20], [30, 0]);

  return (
    <AbsoluteFill className="bg-[#0c0e14] text-white flex flex-col items-center justify-center p-16 font-sans">
      <div style={{ opacity, transform: `translateY(${translateY}px)` }} className="max-w-5xl w-full space-y-8">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎯</span>
            <span className="font-mono text-xl uppercase text-emerald-400 font-bold tracking-widest">
              01. Microlecturas & Checkpoints Cognitivos
            </span>
          </div>
          <span className="text-lg font-mono text-neutral-400">Paso 1 de 5</span>
        </div>

        <div className="grid grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <h2 className="text-4xl font-extrabold text-white leading-tight">
              Cápsulas de 2 Minutos con Validación Obligatoria
            </h2>
            <p className="text-lg text-neutral-300 leading-relaxed">
              El material se divide en fragmentos digeribles. No puedes avanzar haciendo scroll pasivo: debes responder un checkpoint de causa-efecto para desbloquear la siguiente cápsula.
            </p>
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 font-mono text-sm">
              💎 +5 Gemas al acertar &bull; Retención activa al 85%
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-950/90 border border-emerald-400/40 shadow-2xl space-y-4">
            <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
              <span>Cápsula #3 de 8</span>
              <span className="text-emerald-400 font-bold">⏱️ Lectura: 14s (✓ Asimilado)</span>
            </div>
            <p className="text-sm text-neutral-300 leading-relaxed italic bg-black/40 p-4 rounded-xl border border-white/5">
              "El principio establece que las variables interdependientes condicionan el equilibrio del sistema..."
            </p>
            <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-200 text-sm font-semibold flex items-center gap-2">
              <span>✓ Respuesta Correcta (+5 💎) &bull; Siguiente Cápsula Desbloqueada ➔</span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// ESCENA 3: MAPA CONCEPTUAL EN 2DO PLANO (Frames 570 - 870 / 10 seg)
// ==========================================
const SceneDiagram: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20, 280, 300], [0, 1, 1, 0]);

  return (
    <AbsoluteFill className="bg-[#0b0d13] text-white flex flex-col items-center justify-center p-16 font-sans">
      <div style={{ opacity }} className="max-w-5xl w-full space-y-8">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🗺️</span>
            <span className="font-mono text-xl uppercase text-amber-400 font-bold tracking-widest">
              02. Mapa Conceptual & Desafíos Gamificados
            </span>
          </div>
          <span className="text-lg font-mono text-neutral-400">Paso 2 de 5</span>
        </div>

        <div className="grid grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <h2 className="text-4xl font-extrabold text-white leading-tight">
              Estructura Visual Generada en Segundo Plano
            </h2>
            <p className="text-lg text-neutral-300 leading-relaxed">
              Tocas generar y sigues leyendo tus apuntes. Apenas termina, una notificación con sonido te avisa. Explora nodos con analogías prácticas y niveles Fácil, Medio o Difícil.
            </p>
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-300 font-mono text-sm">
              ⚡ Sin esperas de carga &bull; Guarda de timeout de 8.5s
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-950/90 border border-amber-400/40 shadow-2xl space-y-4 flex flex-col items-center justify-center min-h-[280px]">
            <div className="w-16 h-16 rounded-2xl bg-amber-400 text-black flex items-center justify-center text-3xl font-bold shadow-lg">
              🧠
            </div>
            <span className="text-lg font-bold text-white uppercase">Núcleo Conceptual</span>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30">⚡ Dinámica</span>
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">🔬 Variables</span>
              <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-400/30">📊 Aplicación</span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// ESCENA 4: EVALUACIÓN ORAL Y REPORTE (Frames 870 - 1170 / 10 seg)
// ==========================================
const SceneOralExam: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20, 280, 300], [0, 1, 1, 0]);

  return (
    <AbsoluteFill className="bg-[#0e0f17] text-white flex flex-col items-center justify-center p-16 font-sans">
      <div style={{ opacity }} className="max-w-5xl w-full space-y-8">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎙️</span>
            <span className="font-mono text-xl uppercase text-purple-400 font-bold tracking-widest">
              03. Evaluación Oral & Reporte por Correo
            </span>
          </div>
          <span className="text-lg font-mono text-neutral-400">Paso 3 de 5</span>
        </div>

        <div className="grid grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <h2 className="text-4xl font-extrabold text-white leading-tight">
              Habla con tu Tutor y Recibe tu Informe
            </h2>
            <p className="text-lg text-neutral-300 leading-relaxed">
              Responde las 5 preguntas por voz. Archie analiza tu seguridad y precisión en tiempo real. Al finalizar la sesión, recibes el diagnóstico conductual completo en tu email.
            </p>
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-400/30 text-purple-300 font-mono text-sm">
              📬 Reporte automático de telemetría y retención al cerrar
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-950/90 border border-purple-400/40 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
              <span className="text-2xl">🦉</span>
              <div>
                <span className="text-xs font-mono text-purple-400 font-bold uppercase block">Archie Evaluador</span>
                <span className="text-sm text-white font-bold">"Pregunta 3 de 5: ¿Cuál es el factor determinante?"</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-purple-500/20 text-purple-200 text-xs font-mono">
              🎙️ Tu respuesta fue calificada con 9.5/10. "Excelente solidez conceptual".
            </div>
            <div className="text-xs font-mono text-emerald-400 text-center font-bold">
              ✉️ Informe psicopedagógico enviado a tu correo.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// ESCENA 5: OUTRO & LLAMADO A LA ACCIÓN (Frames 1170 - 1350 / 6 seg)
// ==========================================
const SceneOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, from: 0.9, to: 1 });
  const opacity = interpolate(frame, [0, 20], [0, 1]);

  return (
    <AbsoluteFill className="bg-[#0b0c10] text-white flex flex-col items-center justify-center p-16 font-sans">
      <div style={{ opacity, transform: `scale(${scale})` }} className="text-center space-y-6 max-w-3xl">
        <div className="w-24 h-24 mx-auto rounded-3xl bg-amber-400 text-black flex items-center justify-center text-5xl font-black shadow-2xl animate-bounce">
          🚀
        </div>
        <h2 className="text-5xl font-black text-white tracking-tight">
          Comienza a Estudiar de Verdad.
        </h2>
        <p className="text-2xl text-amber-300 font-mono font-bold">
          tutor-de-documentos.onrender.com
        </p>
        <p className="text-base text-neutral-400 max-w-xl mx-auto">
          Compatible con teléfonos, tablets y computadoras. 100% gratuito con Archie como tu mentor.
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// COMPOSICIÓN PRINCIPAL DE VIDEO
// ==========================================
export const TutorWalkthrough: React.FC = () => {
  return (
    <AbsoluteFill className="bg-black">
      <Sequence from={0} durationInFrames={270}>
        <SceneIntro />
      </Sequence>

      <Sequence from={270} durationInFrames={300}>
        <SceneMicrolectures />
      </Sequence>

      <Sequence from={570} durationInFrames={300}>
        <SceneDiagram />
      </Sequence>

      <Sequence from={870} durationInFrames={300}>
        <SceneOralExam />
      </Sequence>

      <Sequence from={1170} durationInFrames={180}>
        <SceneOutro />
      </Sequence>
    </AbsoluteFill>
  );
};
