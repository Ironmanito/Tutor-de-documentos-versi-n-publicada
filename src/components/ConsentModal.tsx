import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Brain, Eye, Lock, CheckCircle2, Sparkles } from 'lucide-react';

interface ConsentModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onConsentGiven?: () => void;
}

export const ConsentModal: React.FC<ConsentModalProps> = ({ 
  isOpen: controlledIsOpen, 
  onClose: controlledOnClose, 
  onConsentGiven 
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  useEffect(() => {
    if (controlledIsOpen !== undefined) return;
    try {
      const consent = localStorage.getItem('tutor_telemetry_consent');
      if (!consent) {
        // Mostrar aviso transparente a nuevos usuarios tras 1.5s
        const timer = setTimeout(() => setInternalIsOpen(true), 1500);
        return () => clearTimeout(timer);
      }
    } catch (_) {}
  }, [controlledIsOpen]);

  const handleAccept = () => {
    try {
      localStorage.setItem('tutor_telemetry_consent', 'accepted');
      localStorage.setItem('tutor_telemetry_consent_date', new Date().toISOString());
      localStorage.setItem('user_tier', 'pro');
    } catch (_) {}
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
    onConsentGiven?.();
  };

  const handleDecline = () => {
    try {
      localStorage.setItem('tutor_telemetry_consent', 'declined');
    } catch (_) {}
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          className="bg-panel-systematic border border-white/15 rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl text-ink"
        >
          <div className="w-12 h-12 rounded-2xl bg-accent-systematic/15 border border-accent-systematic/30 text-accent-systematic flex items-center justify-center mb-5">
            <Brain className="w-6 h-6" />
          </div>

          <span className="font-mono text-[10px] text-accent-systematic uppercase tracking-widest block font-bold mb-1">
            Privacidad & Pedagogía Adaptativa • Activación PRO Gratuita
          </span>
          <h2 className="text-xl font-bold text-ink mb-2">
            Optimización Cognitiva y Desbloqueo PRO
          </h2>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[9px] uppercase tracking-wider font-bold mb-3">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Plan PRO 100% Bonificado al Aceptar</span>
          </div>

          <p className="text-xs text-ink-muted leading-relaxed mb-4">
            Al activar la telemetría pedagógica anónima para calibrar la exigencia del tutor de IA, obtienes acceso automático y permanente a todas las características <strong className="text-white">PRO sin ningún costo</strong> (documentos ilimitados, exámenes completos y tutoría de voz prioritaria):
          </p>

          <div className="space-y-2.5 mb-6 text-xs bg-bg-systematic p-4 rounded-xl border border-white/5">
            <div className="flex items-start gap-2.5">
              <span className="text-accent-systematic font-bold text-sm">⏱️</span>
              <p className="text-ink-muted">
                <strong className="text-white">Ritmos de respuesta y pausas:</strong> Medición de milisegundos de reflexión y vacilación para detectar conceptos donde experimentas dudas.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="text-accent-systematic font-bold text-sm">📖</span>
              <p className="text-ink-muted">
                <strong className="text-white">Comprensión de lectura:</strong> Velocidad de avance (palabras por minuto) y profundidad en el cuaderno para identificar párrafos complejos.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="text-accent-systematic font-bold text-sm">🔒</span>
              <p className="text-ink-muted">
                <strong className="text-white">Confidencialidad rigurosa:</strong> Tus datos de comportamiento son anonimizados y se procesan con fines de investigación académica.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={handleAccept}
              className="w-full sm:w-auto flex-1 py-3 px-5 bg-accent-systematic hover:bg-white text-black font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Aceptar Telemetría y Activar PRO Gratis</span>
            </button>
            <button
              type="button"
              onClick={handleDecline}
              className="w-full sm:w-auto py-3 px-4 bg-white/5 hover:bg-white/10 text-ink-muted hover:text-ink text-xs rounded-xl cursor-pointer transition-colors"
            >
              Modo Estándar (Free)
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
