import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquareHeart, 
  X, 
  Send, 
  Sparkles, 
  AlertTriangle, 
  ThumbsUp, 
  Lightbulb, 
  Mic, 
  FileText, 
  CheckCircle2, 
  HeartHandshake,
  Mail
} from 'lucide-react';
import { submitUserFeedback, FeedbackCategory } from '../lib/userTracker';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string | null;
  currentUserName?: string | null;
  triggerSource?: 'periodic' | 'manual' | 'quiz_finished' | 'oral_finished';
}

const RATING_OPTIONS = [
  { value: 1, emoji: '😠', label: 'Frustrado / No me sirvió', color: 'hover:border-red-500/60 text-red-400' },
  { value: 2, emoji: '😕', label: 'Regular / Faltan cosas', color: 'hover:border-amber-500/60 text-amber-400' },
  { value: 3, emoji: '😐', label: 'Aceptable', color: 'hover:border-yellow-500/60 text-yellow-300' },
  { value: 4, emoji: '🙂', label: 'Bueno y útil', color: 'hover:border-emerald-500/60 text-emerald-400' },
  { value: 5, emoji: '🤩', label: '¡Excelente!', color: 'hover:border-amber-400 text-amber-300' },
];

const CATEGORIES: { id: FeedbackCategory; label: string; icon: React.FC<any>; isCritique?: boolean }[] = [
  { id: 'critique', label: 'Crítica constructiva', icon: AlertTriangle, isCritique: true },
  { id: 'bug', label: 'Error o falla técnica', icon: AlertTriangle, isCritique: true },
  { id: 'voice_tutor', label: 'Tutor de voz en vivo', icon: Mic },
  { id: 'exam', label: 'Examen oral o preguntas', icon: FileText },
  { id: 'suggestion', label: 'Nueva idea o sugerencia', icon: Lightbulb },
  { id: 'general', label: 'Comentario general', icon: ThumbsUp },
];

const QUICK_TAGS = [
  'La voz tardó en responder',
  'No entendió bien lo que le dije',
  'Pregunta de examen confusa',
  'Falla al cargar un PDF/Word',
  '¡Me encantó la explicación!',
  'Mejorar velocidad general',
];

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  currentUserEmail,
  currentUserName,
  triggerSource = 'manual',
}) => {
  const [rating, setRating] = useState<number>(3);
  const [category, setCategory] = useState<FeedbackCategory>('critique');
  const [comment, setComment] = useState('');
  const [email, setEmail] = useState(() => currentUserEmail || localStorage.getItem('tutor_guest_user_email') || '');
  const [allowContact, setAllowContact] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    setIsSubmitting(true);
    try {
      if (email && email.includes('@')) {
        localStorage.setItem('tutor_guest_user_email', email.trim());
      }

      await submitUserFeedback({
        rating,
        category,
        comment: comment.trim(),
        userEmail: email.trim() || undefined,
        userName: currentUserName || undefined,
        allowContact,
      });

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setComment('');
        onClose();
      }, 2200);
    } catch (err) {
      console.error('Error enviando feedback:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickTagClick = (tag: string) => {
    if (comment.includes(tag)) return;
    setComment((prev) => (prev ? `${prev}. ${tag}` : tag));
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 15 }}
          className="relative w-full max-w-lg bg-[#140E05] border border-amber-500/30 rounded-3xl shadow-2xl shadow-black/80 overflow-hidden text-neutral-200"
        >
          {/* Header con gradiente áureo */}
          <div className="relative px-6 pt-6 pb-4 border-b border-amber-500/20 bg-gradient-to-b from-amber-950/40 to-transparent">
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-amber-100 flex items-center gap-2">
                  Tu Opinión y Críticas Sinceras
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </h3>
                <p className="text-xs text-amber-300/70">
                  {triggerSource === 'oral_finished' || triggerSource === 'quiz_finished'
                    ? '¿Cómo estuvo esta sesión de estudio? Cuéntanos sin filtro.'
                    : 'Las fallas y lo que no te gustó son lo que más nos ayuda a mejorar.'}
                </p>
              </div>
            </div>
          </div>

          {isSuccess ? (
            <div className="p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-4"
              >
                <CheckCircle2 className="w-9 h-9" />
              </motion.div>
              <h4 className="text-xl font-bold text-white mb-2">¡Muchísimas gracias!</h4>
              <p className="text-sm text-neutral-300 max-w-sm">
                Tu comentario fue enviado directamente al creador del proyecto. Tomaremos en cuenta cada observación para perfeccionar el Tutor.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto custom-scrollbar">
              {/* Selector de Satisfacción / Calificación */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-amber-400/90 mb-2">
                  1. ¿Qué tan buena fue tu experiencia?
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {RATING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRating(opt.value)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all text-center ${
                        rating === opt.value
                          ? 'bg-amber-500/25 border-amber-400 shadow-md shadow-amber-950/40 scale-105'
                          : 'bg-black/30 border-white/10 hover:bg-white/5 ' + opt.color
                      }`}
                    >
                      <span className="text-2xl mb-1 select-none">{opt.emoji}</span>
                      <span className="text-[10px] leading-tight line-clamp-2 text-neutral-300 font-medium">
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Categoría */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-amber-400/90 mb-2">
                  2. ¿De qué se trata principalmente?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all text-left ${
                          isSelected
                            ? cat.isCritique
                              ? 'bg-rose-500/20 border-rose-500/60 text-rose-200 shadow-sm'
                              : 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-sm'
                            : 'bg-black/25 border-white/10 text-neutral-300 hover:border-white/20 hover:bg-white/5'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? (cat.isCritique ? 'text-rose-400' : 'text-amber-400') : 'text-neutral-400'}`} />
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tags de acceso rápido */}
              <div>
                <span className="text-[11px] text-neutral-400 block mb-1.5">Sugerencias rápidas (haz clic para agregar):</span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleQuickTagClick(tag)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-neutral-300 hover:border-amber-500/40 hover:text-amber-200 transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea de comentario */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-amber-400/90">
                    3. Detalle (Sé 100% sincero)
                  </label>
                  <span className="text-[10px] text-amber-400/60 font-medium">
                    {category === 'critique' || category === 'bug' || rating <= 2
                      ? '⚡ ¡Las críticas son prioritarias!'
                      : '¡Cualquier aporte suma!'}
                  </span>
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    rating <= 2
                      ? 'Dinos qué no funcionó bien, qué fue confuso o qué te causó frustración. No te preocupes por ser duro, es lo que más nos sirve para arreglarlo...'
                      : 'Cuéntanos qué te gustó, qué cambiarías o qué funciones te encantaría ver en las próximas versiones...'
                  }
                  rows={4}
                  required
                  className="w-full bg-black/40 border border-amber-500/30 rounded-2xl p-3 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-colors resize-none"
                />
              </div>

              {/* Email de contacto */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-amber-400/90 mb-1.5">
                  Tu correo electrónico (para poder responderte o avisarte la mejora)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-neutral-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tunombre@ejemplo.com"
                    className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allowContact}
                    onChange={(e) => setAllowContact(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-amber-500/40 text-amber-500 focus:ring-amber-400 bg-black/50"
                  />
                  <span className="text-[11px] text-neutral-400">
                    Acepto que me contacten por correo sobre esta sugerencia o para probar la solución
                  </span>
                </label>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                >
                  Ahora no
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !comment.trim()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold text-xs rounded-xl shadow-lg shadow-amber-950/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmitting ? (
                    'Enviando...'
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Enviar Feedback
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default FeedbackModal;
