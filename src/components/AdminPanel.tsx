import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  MessageSquareHeart, 
  X, 
  Mail, 
  Copy, 
  Check, 
  RefreshCw, 
  ExternalLink, 
  Sparkles, 
  AlertTriangle, 
  ThumbsUp, 
  Lightbulb, 
  Mic, 
  FileText, 
  Search, 
  Calendar, 
  Laptop, 
  CheckCircle2, 
  Clock,
  Activity,
  Globe,
  Radio,
  Eye
} from 'lucide-react';
import { 
  fetchAdminUsers, 
  fetchAdminFeedback, 
  updateFeedbackStatus, 
  AppUserProfile, 
  FeedbackItem,
  ActivityEvent
} from '../lib/userTracker';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string | null;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen,
  onClose,
  currentUserEmail,
}) => {
  const ADMIN_EMAILS = ['martinvelozz01@gmail.com'];
  const isAdmin = Boolean(
    currentUserEmail && ADMIN_EMAILS.includes(currentUserEmail.toLowerCase().trim())
  );

  const [activeTab, setActiveTab] = useState<'users' | 'visitors' | 'feedback'>('visitors');
  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<AppUserProfile[]>([]);
  const [anonymousVisitors, setAnonymousVisitors] = useState<AppUserProfile[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [totalVisits, setTotalVisits] = useState(0);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [anonymousCount, setAnonymousCount] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'critiques' | 'suggestions' | 'voice'>('all');
  const [copiedEmails, setCopiedEmails] = useState(false);
  const [copiedSingleEmail, setCopiedSingleEmail] = useState<string | null>(null);
  const [averageRating, setAverageRating] = useState(0);
  const [critiquesCount, setCritiquesCount] = useState(0);
  const [activeToday, setActiveToday] = useState(0);

  const loadData = async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    try {
      const [usersData, feedbackData] = await Promise.all([
        fetchAdminUsers(currentUserEmail || ''),
        fetchAdminFeedback(currentUserEmail || ''),
      ]);
      setUsers(usersData.users || []);
      setRegisteredUsers(usersData.registeredUsers || (usersData.users || []).filter(u => u.email && u.email.includes('@')));
      setAnonymousVisitors(usersData.anonymousVisitors || (usersData.users || []).filter(u => !u.email || u.isAnonymous));
      setRecentActivity(usersData.recentActivity || []);
      setTotalVisits(usersData.totalVisits || (usersData.users || []).reduce((acc, u) => acc + (u.sessionCount || 1), 0));
      setRegisteredCount(usersData.registeredCount || (usersData.users || []).filter(u => u.email && u.email.includes('@')).length);
      setAnonymousCount(usersData.anonymousCount || (usersData.users || []).filter(u => !u.email || u.isAnonymous).length);
      setActiveToday(usersData.activeToday || 0);

      setFeedback(feedbackData.feedback || []);
      setAverageRating(feedbackData.averageRating || 0);
      setCritiquesCount(feedbackData.critiquesCount || 0);
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && isAdmin) {
      loadData();
    }
  }, [isOpen, isAdmin]);

  if (!isOpen || !isAdmin) return null;

  // Filtrado de usuarios con correo
  const filteredRegisteredUsers = registeredUsers.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.displayName && u.displayName.toLowerCase().includes(q))
    );
  });

  // Filtrado de todas las visitas (anónimos + registrados)
  const filteredAllVisitors = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      (u.device && u.device.toLowerCase().includes(q)) ||
      (u.lastAction && u.lastAction.toLowerCase().includes(q))
    );
  });

  // Filtrado de feedback
  const filteredFeedback = feedback.filter((f) => {
    if (feedbackFilter === 'critiques') {
      return f.category === 'critique' || f.category === 'bug' || f.rating <= 2;
    }
    if (feedbackFilter === 'suggestions') {
      return f.category === 'suggestion';
    }
    if (feedbackFilter === 'voice') {
      return f.category === 'voice_tutor';
    }
    return true;
  });

  // Copiar todos los correos
  const handleCopyAllEmails = () => {
    const validEmails = Array.from(
      new Set(
        registeredUsers
          .map((u) => u.email)
          .filter((e): e is string => !!e && e.includes('@'))
          .map((e) => e.trim().toLowerCase())
      )
    );

    if (validEmails.length === 0) return;

    const emailListStr = validEmails.join(', ');
    navigator.clipboard.writeText(emailListStr);
    setCopiedEmails(true);
    setTimeout(() => setCopiedEmails(false), 3000);
  };

  // Copiar un solo correo
  const handleCopySingle = (email?: string) => {
    if (!email) return;
    navigator.clipboard.writeText(email);
    setCopiedSingleEmail(email);
    setTimeout(() => setCopiedSingleEmail(null), 2000);
  };

  // Abrir cliente de correo con BCC masivo
  const handleMassEmail = () => {
    const validEmails = Array.from(
      new Set(
        registeredUsers
          .map((u) => u.email)
          .filter((e): e is string => !!e && e.includes('@'))
          .map((e) => e.trim().toLowerCase())
      )
    );

    if (validEmails.length === 0) return;

    const bcc = encodeURIComponent(validEmails.join(','));
    const subject = encodeURIComponent('Novedades y mejoras en Tutor de Cuaderno');
    const body = encodeURIComponent(
      'Hola,\n\n¡Gracias por estudiar con Tutor de Cuaderno! Quería contarte las últimas novedades y consultar cómo ha sido tu experiencia...\n\nUn saludo cordial,'
    );
    window.location.href = `mailto:?bcc=${bcc}&subject=${subject}&body=${body}`;
  };

  // Cambiar estado de feedback
  const handleStatusChange = async (id: string, newStatus: 'new' | 'reviewed' | 'replied') => {
    try {
      await updateFeedbackStatus(id, newStatus, currentUserEmail || '');
      setFeedback((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      );
    } catch (err) {
      console.error('Error updating feedback status:', err);
    }
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return 'Reciente';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-5xl h-[90vh] bg-[#120D05] border border-amber-500/30 rounded-3xl shadow-2xl shadow-black flex flex-col overflow-hidden text-neutral-200"
      >
        {/* Top Header */}
        <div className="px-6 py-5 border-b border-amber-500/20 bg-gradient-to-r from-amber-950/40 via-black/50 to-transparent flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Panel de Comunidad & Feedback
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Creador
                </span>
              </div>
              <p className="text-xs text-amber-300/70">
                Conoce a quienes usan la app, envíales correos y revisa sus críticas y sugerencias.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:border-amber-500/40 text-neutral-300 hover:text-amber-300 transition-colors"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Cerrar panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Resumen de Métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-6 py-4 border-b border-amber-500/10 bg-black/40">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400">Total Visitas</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-amber-300">{totalVisits}</span>
              <span className="text-xs text-amber-400/80 font-medium">sesiones</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400">Visitantes Únicos</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">{users.length}</span>
              <span className="text-xs text-neutral-400 font-medium">personas</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400">Con Correo</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-sky-400">{registeredCount}</span>
              <span className="text-xs text-sky-300/80">contactables</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400">Activos 24h</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-emerald-400">{activeToday}</span>
              <span className="text-xs text-emerald-400/80">hoy</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400">Críticas & Fallas</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-rose-400">{critiquesCount}</span>
              <span className="text-xs text-rose-300/80">prioritarias</span>
            </div>
          </div>
        </div>

        {/* Selector de Pestañas y Acciones */}
        <div className="px-6 py-3 border-b border-amber-500/10 flex flex-wrap items-center justify-between gap-3 bg-[#0D0903]">
          <div className="flex items-center gap-1.5 p-1 bg-black/60 border border-white/10 rounded-2xl">
            <button
              onClick={() => setActiveTab('visitors')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'visitors'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-950/40'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Visitas & Actividad ({users.length})
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'users'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-950/40'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Contactos con Email ({registeredCount})
            </button>

            <button
              onClick={() => setActiveTab('feedback')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'feedback'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-950/40'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <MessageSquareHeart className="w-3.5 h-3.5" />
              Feedback & Críticas ({feedback.length})
              {critiquesCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
          </div>

          {activeTab === 'users' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyAllEmails}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-semibold transition-all"
              >
                {copiedEmails ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ¡Copiados!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Correos
                  </>
                )}
              </button>

              <button
                onClick={handleMassEmail}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-semibold shadow-md transition-all"
              >
                <Mail className="w-3.5 h-3.5" />
                Redactar a Todos (CCO)
              </button>
            </div>
          )}
        </div>

        {/* Contenido Principal */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-black/20">
          
          {/* ================= PESTAÑA 1: VISITAS & ACTIVIDAD EN VIVO ================= */}
          {activeTab === 'visitors' && (
            <div className="space-y-6">
              {/* Feed en vivo de actividad reciente */}
              {recentActivity.length > 0 && (
                <div className="p-4 rounded-2xl bg-black/50 border border-amber-500/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                      <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                      <span>Registro de Actividad en Vivo (Últimos Eventos)</span>
                    </div>
                    <span className="text-[10px] text-neutral-400">{recentActivity.length} eventos registrados</span>
                  </div>

                  <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {recentActivity.slice(0, 15).map((evt) => (
                      <div
                        key={evt.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <span className="font-semibold text-white truncate">
                            {evt.userName || evt.userEmail || `Visitante #${evt.visitorId.replace('vis_', '').substring(0, 5)}`}
                          </span>
                          <span className="text-neutral-300 font-mono text-[11px] truncate">
                            &rarr; {evt.action}
                          </span>
                          {evt.details && (
                            <span className="text-[10px] text-neutral-400 truncate hidden sm:inline">
                              ({evt.details})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-amber-300/70 font-mono shrink-0 ml-2">
                          {formatDate(evt.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Buscador de visitas */}
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar visitas por dispositivo, nombre o acción..."
                  className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>

              {/* Grid de visitantes */}
              {filteredAllVisitors.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-white/10 rounded-3xl">
                  <Globe className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                  <h4 className="text-sm font-semibold text-neutral-300">No hay visitas que coincidan</h4>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1">
                    Cada vez que alguien abre la app, aparece aquí inmediatamente con su dispositivo y hora de entrada.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredAllVisitors.map((u) => {
                    const isAnon = !u.email || u.isAnonymous;
                    return (
                      <div
                        key={u.id || u.visitorId || u.email}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                          isAnon
                            ? 'bg-neutral-950/50 border-white/10 hover:border-amber-500/30'
                            : 'bg-black/60 border-amber-500/20 hover:border-amber-500/40 shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${
                              isAnon 
                                ? 'bg-neutral-800 border border-neutral-700 text-neutral-400'
                                : 'bg-amber-500/20 border border-amber-500/30 text-amber-300'
                            }`}>
                              {isAnon ? '👤' : (u.displayName ? u.displayName[0].toUpperCase() : 'U')}
                            </div>

                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-white truncate">
                                {u.displayName || (isAnon ? 'Visitante Anónimo' : 'Usuario')}
                              </h4>
                              <p className="text-xs font-mono text-neutral-400 truncate">
                                {u.email ? u.email : `ID: ${u.visitorId || u.id || 'visitante'}`}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
                              !isAnon
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                : 'bg-amber-500/10 text-amber-300/80 border border-amber-500/20'
                            }`}
                          >
                            {!isAnon ? (u.authProvider === 'google' ? 'Google' : 'Registrado') : 'Anónimo'}
                          </span>
                        </div>

                        {/* Última acción registrada */}
                        <div className="mt-2.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5 flex items-center gap-2 text-xs">
                          <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-neutral-300 font-medium truncate">
                            {u.lastAction || 'Ingreso a la aplicación'}
                          </span>
                        </div>

                        {/* Metadatos */}
                        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-neutral-400">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-neutral-500" />
                              {formatDate(u.lastSeenAt)}
                            </span>
                            <span className="flex items-center gap-1 font-semibold text-amber-300">
                              <Eye className="w-3 h-3 text-neutral-500" />
                              {u.sessionCount || 1} visitas
                            </span>
                          </div>

                          {u.device && (
                            <span className="text-[10px] text-neutral-400 truncate max-w-[120px]" title={u.device}>
                              {u.device.includes('iPhone') ? '📱 iPhone' : u.device.includes('Android') ? '📱 Android' : u.device.includes('Macintosh') ? '💻 Mac' : '💻 PC'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= PESTAÑA 2: USUARIOS CON CORREO ================= */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Buscador */}
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre o correo electrónico..."
                  className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>

              {filteredRegisteredUsers.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-white/10 rounded-3xl">
                  <Mail className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                  <h4 className="text-sm font-semibold text-neutral-300">Aún no hay usuarios identificados con correo</h4>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1">
                    En cuanto un estudiante conecte Google Drive o ingrese su email, aparecerá aquí con botones directos para contactarlo.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredRegisteredUsers.map((u) => {
                    const isSingleCopied = copiedSingleEmail === u.email;
                    return (
                      <div
                        key={u.email}
                        className="p-4 rounded-2xl bg-black/40 border border-white/10 hover:border-amber-500/30 transition-all flex flex-col justify-between"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {u.photoURL ? (
                              <img
                                src={u.photoURL}
                                alt={u.displayName}
                                className="w-10 h-10 rounded-full border border-amber-500/30 shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center font-bold text-amber-300 shrink-0">
                                {u.displayName ? u.displayName[0].toUpperCase() : 'U'}
                              </div>
                            )}

                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-white truncate">
                                {u.displayName || 'Usuario de Estudio'}
                              </h4>
                              <p className="text-xs text-amber-300/80 truncate">{u.email}</p>
                            </div>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
                              u.authProvider === 'google'
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                            }`}
                          >
                            {u.authProvider === 'google' ? 'Google' : 'Invitado'}
                          </span>
                        </div>

                        {/* Metadatos y acciones */}
                        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-neutral-400">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-neutral-500" />
                              {formatDate(u.lastSeenAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3 text-neutral-500" />
                              {u.studiesCount || 0} cuadernos
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleCopySingle(u.email)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-amber-300 transition-colors"
                              title="Copiar email"
                            >
                              {isSingleCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <a
                              href={`mailto:${u.email}?subject=Tutor de Cuaderno - Consulta&body=Hola ${encodeURIComponent(
                                u.displayName || ''
                              )},\n\n`}
                              className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors"
                              title="Enviar correo a este usuario"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= PESTAÑA: FEEDBACK & CRÍTICAS ================= */}
          {activeTab === 'feedback' && (
            <div className="space-y-4">
              {/* Filtros de feedback */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setFeedbackFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    feedbackFilter === 'all'
                      ? 'bg-amber-500 text-black'
                      : 'bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  Todos ({feedback.length})
                </button>
                <button
                  onClick={() => setFeedbackFilter('critiques')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    feedbackFilter === 'critiques'
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-950/50'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Críticas & Fallas ({critiquesCount})
                </button>
                <button
                  onClick={() => setFeedbackFilter('suggestions')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    feedbackFilter === 'suggestions'
                      ? 'bg-amber-500 text-black'
                      : 'bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  <Lightbulb className="w-3 h-3" />
                  Sugerencias
                </button>
                <button
                  onClick={() => setFeedbackFilter('voice')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    feedbackFilter === 'voice'
                      ? 'bg-amber-500 text-black'
                      : 'bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  <Mic className="w-3 h-3" />
                  Tutor de Voz
                </button>
              </div>

              {filteredFeedback.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-white/10 rounded-3xl">
                  <MessageSquareHeart className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                  <h4 className="text-sm font-semibold text-neutral-300">Aún no hay feedback en esta categoría</h4>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1">
                    A medida que los estudiantes usen la app y dejen sus opiniones o críticas, aparecerán aquí con prioridad.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredFeedback.map((item) => {
                    const isCritique = item.category === 'critique' || item.category === 'bug' || item.rating <= 2;
                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          isCritique
                            ? 'bg-rose-950/20 border-rose-500/30 shadow-md shadow-rose-950/20'
                            : 'bg-black/40 border-white/10 hover:border-amber-500/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">
                              {item.rating === 1 ? '😠' : item.rating === 2 ? '😕' : item.rating === 3 ? '😐' : item.rating === 4 ? '🙂' : '🤩'}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white">
                                  {item.userName || (item.userEmail ? item.userEmail.split('@')[0] : 'Estudiante anónimo')}
                                </span>
                                {item.userEmail && (
                                  <span className="text-xs text-amber-300/80">({item.userEmail})</span>
                                )}
                              </div>
                              <span className="text-[10px] text-neutral-400">
                                {formatDate(item.createdAt)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                                isCritique
                                  ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {item.category === 'critique'
                                ? 'Crítica'
                                : item.category === 'bug'
                                ? 'Falla técnica'
                                : item.category === 'voice_tutor'
                                ? 'Tutor de voz'
                                : item.category === 'exam'
                                ? 'Examen'
                                : item.category === 'suggestion'
                                ? 'Sugerencia'
                                : 'General'}
                            </span>

                            <select
                              value={item.status}
                              onChange={(e) => handleStatusChange(item.id, e.target.value as any)}
                              className="bg-black/60 border border-white/10 rounded-lg text-[11px] text-neutral-300 px-2 py-1 focus:outline-none focus:border-amber-400"
                            >
                              <option value="new">Nuevo</option>
                              <option value="reviewed">Revisado</option>
                              <option value="replied">Respondido</option>
                            </select>
                          </div>
                        </div>

                        {/* Comentario */}
                        <div className="mt-3 p-3 rounded-xl bg-black/40 border border-white/5 text-xs text-neutral-200 leading-relaxed whitespace-pre-wrap">
                          {item.comment}
                        </div>

                        {/* Acciones de respuesta */}
                        {item.userEmail && (
                          <div className="mt-3 flex items-center justify-end gap-2">
                            <a
                              href={`mailto:${item.userEmail}?subject=Sobre tu comentario en Tutor de Cuaderno&body=Hola,\n\nLeí tu observación sobre "${encodeURIComponent(
                                item.comment.substring(0, 50)
                              )}..." y quería agradecerte por avisarnos.\n\n`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-colors"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              Responder por Correo
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AdminPanel;
