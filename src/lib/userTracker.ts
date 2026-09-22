import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface AppUserProfile {
  id?: string;
  email?: string;
  visitorId?: string;
  displayName: string;
  photoURL?: string;
  authProvider: 'google' | 'guest';
  firstSeenAt?: string;
  lastSeenAt?: string;
  sessionCount?: number;
  studiesCount?: number;
  device?: string;
  isAnonymous?: boolean;
  lastAction?: string;
  actionsCount?: number;
}

export interface ActivityEvent {
  id: string;
  visitorId: string;
  userEmail?: string;
  userName?: string;
  action: string;
  details?: string;
  timestamp: string;
  device?: string;
}

export type FeedbackCategory = 'critique' | 'bug' | 'voice_tutor' | 'exam' | 'suggestion' | 'general';

export interface FeedbackItem {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  rating: number; // 1 to 5
  category: FeedbackCategory;
  comment: string;
  status: 'new' | 'reviewed' | 'replied';
  createdAt: string;
  device?: string;
  allowContact?: boolean;
}

export interface FeedbackSubmission {
  userId?: string;
  userEmail?: string;
  userName?: string;
  rating: number;
  category: FeedbackCategory;
  comment: string;
  allowContact?: boolean;
}

const STORAGE_LAST_FEEDBACK_PROMPT = 'tutor_last_feedback_prompt';
const STORAGE_GUEST_USER_EMAIL = 'tutor_guest_user_email';
const STORAGE_GUEST_USER_NAME = 'tutor_guest_user_name';
const STORAGE_VISITOR_ID = 'tutor_visitor_id';

/**
 * Obtiene o crea un ID único y persistente para el visitante actual,
 * incluso si nunca inicia sesión o no proporciona un correo.
 */
export function getOrCreateVisitorId(): string {
  try {
    let vid = localStorage.getItem(STORAGE_VISITOR_ID);
    if (!vid) {
      vid = `vis_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      localStorage.setItem(STORAGE_VISITOR_ID, vid);
    }
    return vid;
  } catch {
    return `vis_${Date.now()}`;
  }
}

/**
 * Tracks user and visitor activity and persists to Firestore and Server DB
 * REGISTRA LA ACTIVIDAD AÚN SI EL VISITANTE NO SE IDENTIFICA CON EMAIL NI DEJA FEEDBACK.
 */
export async function trackUserActivity(user: {
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  uid?: string | null;
  authProvider?: 'google' | 'guest';
  action?: string;
  details?: string;
}) {
  try {
    const visitorId = getOrCreateVisitorId();
    const storedEmail = localStorage.getItem(STORAGE_GUEST_USER_EMAIL) || localStorage.getItem('user_email');
    const email = (user.email || storedEmail || '').trim().toLowerCase() || undefined;
    const storedName = localStorage.getItem(STORAGE_GUEST_USER_NAME) || localStorage.getItem('user_display_name');
    const displayName = user.displayName || storedName || (email ? email.split('@')[0] : `Visitante #${visitorId.replace('vis_', '').substring(0, 5)}`);
    const device = `${navigator.userAgent.substring(0, 120)} | ${window.innerWidth}x${window.innerHeight}`;

    // 1. Sync to backend API (handles GCS, Activity Log & JSON file backup)
    try {
      await fetch('/api/users/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId,
          email,
          displayName,
          photoURL: user.photoURL || '',
          authProvider: user.authProvider || (user.uid ? 'google' : 'guest'),
          device,
          action: user.action || 'Visita a la aplicación',
          details: user.details,
        }),
      });
    } catch (e) {
      console.warn('Could not sync user to server API:', e);
    }

    // 2. Sync to Firestore if signed in
    if (user.uid && email) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(
          userRef,
          {
            email,
            displayName,
            photoURL: user.photoURL || '',
            lastSeenAt: new Date().toISOString(),
            authProvider: user.authProvider || 'google',
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Could not sync user to Firestore:', err);
      }
    }
  } catch (err) {
    console.warn('Error in trackUserActivity:', err);
  }
}

/**
 * Registra una acción específica del usuario o visitante (ej. subir archivo, iniciar tutor de voz, examen)
 */
export function trackUserAction(action: string, details?: string) {
  trackUserActivity({ action, details }).catch(() => {});
}

/**
 * Submits user feedback (positive, neutral or critical) to Firestore & Server DB
 */
export async function submitUserFeedback(submission: FeedbackSubmission): Promise<{ success: boolean; id?: string }> {
  const device = `${navigator.platform} - ${navigator.userAgent.substring(0, 120)}`;
  const now = new Date().toISOString();

  let assignedId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // 1. Send to Backend API
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...submission,
        device,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.feedback?.id) {
        assignedId = data.feedback.id;
      }
    }
  } catch (e) {
    console.warn('Could not submit feedback to backend API:', e);
  }

  // 2. Also record in Firestore
  try {
    await addDoc(collection(db, 'feedback'), {
      id: assignedId,
      userId: submission.userId || null,
      userEmail: submission.userEmail || null,
      userName: submission.userName || null,
      rating: submission.rating,
      category: submission.category,
      comment: submission.comment,
      status: 'new',
      createdAt: now,
      device,
      allowContact: submission.allowContact ?? true,
    });
  } catch (err) {
    console.warn('Could not write feedback to Firestore directly:', err);
  }

  // Update prompt cooldown so user isn't prompted again immediately
  localStorage.setItem(STORAGE_LAST_FEEDBACK_PROMPT, Date.now().toString());

  return { success: true, id: assignedId };
}

/**
 * Checks if it's a good time to periodically prompt the user for feedback
 */
export function shouldPromptPeriodicFeedback(): boolean {
  try {
    const lastPromptStr = localStorage.getItem(STORAGE_LAST_FEEDBACK_PROMPT);
    if (!lastPromptStr) return true; // Never prompted before

    const lastPrompt = parseInt(lastPromptStr, 10);
    const now = Date.now();
    // Prompt at most once every 18 minutes of active usage
    const COOLDOWN_MS = 18 * 60 * 1000;
    return now - lastPrompt > COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function recordFeedbackPromptShown() {
  localStorage.setItem(STORAGE_LAST_FEEDBACK_PROMPT, Date.now().toString());
}

/**
 * Admin: Fetch all users and visitor metrics
 */
export async function fetchAdminUsers(adminEmail?: string): Promise<{
  users: AppUserProfile[];
  registeredUsers: AppUserProfile[];
  anonymousVisitors: AppUserProfile[];
  totalCount: number;
  registeredCount: number;
  anonymousCount: number;
  totalVisits: number;
  activeToday: number;
  recentActivity: ActivityEvent[];
}> {
  const email = adminEmail || localStorage.getItem('user_email') || '';
  const res = await fetch('/api/admin/users', {
    headers: {
      'x-admin-email': email,
    },
  });
  if (!res.ok) {
    throw new Error('Error al obtener lista de usuarios');
  }
  return await res.json();
}

/**
 * Admin: Fetch all feedback
 */
export async function fetchAdminFeedback(adminEmail?: string): Promise<{
  feedback: FeedbackItem[];
  totalCount: number;
  averageRating: number;
  critiquesCount: number;
}> {
  const email = adminEmail || localStorage.getItem('user_email') || '';
  const res = await fetch('/api/admin/feedback', {
    headers: {
      'x-admin-email': email,
    },
  });
  if (!res.ok) {
    throw new Error('Error al obtener lista de feedback');
  }
  return await res.json();
}

/**
 * Admin: Update feedback status
 */
export async function updateFeedbackStatus(id: string, status: 'new' | 'reviewed' | 'replied', adminEmail?: string) {
  const email = adminEmail || localStorage.getItem('user_email') || '';
  const res = await fetch(`/api/admin/feedback/${id}`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      'x-admin-email': email,
    },
    body: JSON.stringify({ status }),
  });
  return res.ok;
}

export interface SessionReportItem {
  id: string;
  sessionId: string;
  visitorId: string;
  userEmail?: string;
  userName?: string;
  device: string;
  iniciada_en: string;
  finalizada_en: string;
  duracion_segundos: number;
  datos_servicio: {
    archivos_consultados?: string[];
    vistas_visitadas?: string[];
    preguntas_respondidas_count?: number;
    promedio_calificacion?: number;
    examenes_orales_count?: number;
    documentos_leidos_count?: number;
  };
  excedente_conductual: {
    duracion_total_sesion_ms: number;
    tiempo_activo_ms: number;
    tiempo_en_segundo_plano_ms: number;
    cambios_de_pestana_total: number;
    titubeos_correccion_total: number;
    latencia_promedio_decision_ms: number;
    velocidad_interaccion_predominante: string;
    metricas_lectura?: {
      tiempo_lectura_total_ms: number;
      wpm_promedio: number;
      profundidad_max_scroll: number;
      textos_copiados_count: number;
    };
    eventos_recientes?: any[];
  };
  analisis_cognitivo?: {
    nivel_certeza: number;
    nivel_vacilacion: number;
    indice_fatiga: number;
    diagnostico_emocional: string;
    resumen_ejecutivo: string;
    desvios_detectados: string;
    patrones_detectados: string[];
    recomendacion_pedagogica: string;
  };
  createdAt: string;
}

/**
 * Admin: Fetch all recorded sessions with cognitive & emotional surplus analysis
 */
export async function fetchAdminSessions(adminEmail?: string): Promise<{ sessions: SessionReportItem[] }> {
  const email = adminEmail || localStorage.getItem('user_email') || '';
  const res = await fetch('/api/admin/sessions', {
    headers: {
      'x-admin-email': email,
    },
  });
  if (!res.ok) {
    throw new Error('Error al obtener lista de sesiones');
  }
  return await res.json();
}

/**
 * Admin: Delete a session report
 */
export async function deleteAdminSession(id: string, adminEmail?: string): Promise<boolean> {
  const email = adminEmail || localStorage.getItem('user_email') || '';
  const res = await fetch(`/api/admin/sessions/${id}`, {
    method: 'DELETE',
    headers: {
      'x-admin-email': email,
    },
  });
  return res.ok;
}

