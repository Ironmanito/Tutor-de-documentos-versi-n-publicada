/**
 * Motor de Telemetría Global y Excedente Conductual (Behavioral Surplus)
 * Basado en interacción persona-sistema y psicometría educativa.
 * Captura al milisegundo: latencias de decisión, titubeos, cambios de pestaña en Android y lectura.
 */

export interface MetadatosResiduales {
  tiempo_decision_ms: number;
  titubeos_correccion: number;
  hora_local: string;
  cambios_de_pestana: number;
  tiempo_fuera_pantalla_ms: number;
  velocidad_interaccion: 'pausada' | 'reflexiva' | 'impulsiva' | 'fluida' | 'errática';
  toques_pantalla?: number;
  palabras_por_minuto_lectura?: number;
  profundidad_scroll_pct?: number;
}

export interface TelemetriaEvento {
  id: string;
  tipo: 'navegacion' | 'lectura' | 'pregunta_respondida' | 'examen_oral' | 'foco_pantalla' | 'clic';
  pantalla: string;
  timestamp: number;
  duracion_ms?: number;
  detalles?: Record<string, any>;
}

export interface DatosServicioSesion {
  cuaderno_activo?: string;
  archivos_consultados: string[];
  vistas_visitadas: string[];
  preguntas_respondidas_count: number;
  promedio_calificacion?: number;
  examenes_orales_count: number;
  documentos_leidos_count: number;
}

export interface ExcedenteConductualConsolidado {
  duracion_total_sesion_ms: number;
  tiempo_activo_ms: number;
  tiempo_en_segundo_plano_ms: number;
  cambios_de_pestana_total: number;
  titubeos_correccion_total: number;
  latencia_promedio_decision_ms: number;
  velocidad_interaccion_predominante: string;
  metricas_lectura: {
    tiempo_lectura_total_ms: number;
    wpm_promedio: number;
    profundidad_max_scroll: number;
    textos_copiados_count: number;
  };
  eventos_recientes: TelemetriaEvento[];
}

export interface SesionTelemetricaPayload {
  sessionId: string;
  visitorId: string;
  userEmail?: string;
  userName?: string;
  device: string;
  iniciada_en: string;
  finalizada_en: string;
  datos_servicio: DatosServicioSesion;
  excedente_conductual: ExcedenteConductualConsolidado;
}

class TelemetryManager {
  private sessionId: string;
  private startTime: number;
  private lastActivityTime: number;
  private hiddenStartTime: number | null = null;
  private totalHiddenTimeMs: number = 0;
  private tabSwitchesCount: number = 0;
  private totalBackspacesCount: number = 0;
  private decisionLatencies: number[] = [];
  private eventHistory: TelemetriaEvento[] = [];
  private currentView: string = 'setup';
  private currentViewStartTime: number = Date.now();
  private visitedViews: Set<string> = new Set(['setup']);
  private consultedFiles: Set<string> = new Set();
  
  // Métricas de lectura
  private readingTimeMs: number = 0;
  private readingWpmHistory: number[] = [];
  private maxScrollDepth: number = 0;
  private textCopyCount: number = 0;
  
  // Métricas de preguntas
  private questionsAnswered: number = 0;
  private scores: number[] = [];
  private oralExamsCount: number = 0;
  private documentsReadCount: number = 0;

  private isListenerActive: boolean = false;
  private isDispatched: boolean = false;

  constructor() {
    this.sessionId = `ses_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
    this.initListeners();
  }

  private initListeners() {
    if (typeof window === 'undefined' || this.isListenerActive) return;
    this.isListenerActive = true;

    // 1. Detección de cambios de foco / cambios de pestaña en Android (visibilitychange)
    document.addEventListener('visibilitychange', () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        this.hiddenStartTime = now;
        this.tabSwitchesCount++;
        this.recordEvent('foco_pantalla', { estado: 'en_segundo_plano', cambios_acumulados: this.tabSwitchesCount });
      } else if (document.visibilityState === 'visible') {
        if (this.hiddenStartTime) {
          const duration = now - this.hiddenStartTime;
          this.totalHiddenTimeMs += duration;
          this.recordEvent('foco_pantalla', { estado: 'regreso_a_app', tiempo_ausente_ms: duration });
          this.hiddenStartTime = null;
        }
      }
    });

    // 2. Detección de correcciones y titubeos por teclado (Backspaces)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        this.totalBackspacesCount++;
      }
    });

    // 3. Envío al cerrar o abandonar página en Android
    window.addEventListener('pagehide', () => {
      this.dispatchSessionBeacon();
    });

    window.addEventListener('beforeunload', () => {
      this.dispatchSessionBeacon();
    });
  }

  public recordViewChange(newView: string) {
    const now = Date.now();
    const durationOnPrevious = now - this.currentViewStartTime;
    this.recordEvent('navegacion', {
      desde: this.currentView,
      hacia: newView,
      tiempo_en_anterior_ms: durationOnPrevious
    }, durationOnPrevious);

    this.currentView = newView;
    this.currentViewStartTime = now;
    this.visitedViews.add(newView);
    this.lastActivityTime = now;
  }

  public recordFileConsulted(fileName: string) {
    this.consultedFiles.add(fileName);
  }

  public recordDocumentReading(data: {
    fileName: string;
    durationMs: number;
    wpm: number;
    scrollDepthPct: number;
    textCopied?: boolean;
  }) {
    this.documentsReadCount++;
    this.readingTimeMs += data.durationMs;
    if (data.wpm > 0) this.readingWpmHistory.push(data.wpm);
    if (data.scrollDepthPct > this.maxScrollDepth) this.maxScrollDepth = data.scrollDepthPct;
    if (data.textCopied) this.textCopyCount++;

    this.recordEvent('lectura', {
      archivo: data.fileName,
      duracion_ms: data.durationMs,
      wpm: data.wpm,
      scroll_pct: data.scrollDepthPct
    }, data.durationMs);
  }

  public recordQuestionDecision(latencyMs: number, titubeos: number = 0, score?: number) {
    this.questionsAnswered++;
    this.decisionLatencies.push(latencyMs);
    if (score !== undefined) this.scores.push(score);
    this.totalBackspacesCount += titubeos;

    this.recordEvent('pregunta_respondida', {
      latencia_ms: latencyMs,
      titubeos,
      puntaje: score
    }, latencyMs);
  }

  public recordOralExamCompleted(scoreAverage: number, questionsCount: number = 5) {
    this.oralExamsCount++;
    this.scores.push(scoreAverage);
    this.recordEvent('examen_oral', {
      promedio: scoreAverage,
      preguntas: questionsCount
    });
  }

  public recordEvent(
    tipo: TelemetriaEvento['tipo'],
    detalles?: Record<string, any>,
    duracion_ms?: number
  ) {
    const ev: TelemetriaEvento = {
      id: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      tipo,
      pantalla: this.currentView,
      timestamp: Date.now(),
      duracion_ms,
      detalles
    };
    this.eventHistory.push(ev);
    // Limitar buffer a los últimos 60 eventos para no saturar memoria
    if (this.eventHistory.length > 60) {
      this.eventHistory.shift();
    }
    this.lastActivityTime = Date.now();
  }

  private calculateInteractionVelocity(): 'pausada' | 'reflexiva' | 'impulsiva' | 'fluida' | 'errática' {
    if (this.decisionLatencies.length === 0) return 'reflexiva';
    const avgLatency = this.decisionLatencies.reduce((a, b) => a + b, 0) / this.decisionLatencies.length;
    
    if (avgLatency < 1200 && this.totalBackspacesCount < 2) return 'impulsiva';
    if (avgLatency > 7000) return 'pausada';
    if (this.totalBackspacesCount > 8 && avgLatency > 4000) return 'errática';
    if (avgLatency >= 2000 && avgLatency <= 6000) return 'reflexiva';
    return 'fluida';
  }

  public buildPayload(): SesionTelemetricaPayload {
    const now = Date.now();
    const totalDuration = now - this.startTime;
    const activeTime = Math.max(0, totalDuration - this.totalHiddenTimeMs);
    const avgLatency = this.decisionLatencies.length > 0
      ? Math.round(this.decisionLatencies.reduce((a, b) => a + b, 0) / this.decisionLatencies.length)
      : 0;
    
    const avgWpm = this.readingWpmHistory.length > 0
      ? Math.round(this.readingWpmHistory.reduce((a, b) => a + b, 0) / this.readingWpmHistory.length)
      : 0;

    const avgScore = this.scores.length > 0
      ? Math.round(this.scores.reduce((a, b) => a + b, 0) / this.scores.length)
      : undefined;

    let visitorId = 'anon';
    try {
      visitorId = localStorage.getItem('tutor_visitor_id') || 'anon';
    } catch (_) {}

    let userEmail: string | undefined;
    let userName: string | undefined;
    try {
      userEmail = localStorage.getItem('user_email') || localStorage.getItem('tutor_guest_user_email') || undefined;
      userName = localStorage.getItem('user_display_name') || localStorage.getItem('tutor_guest_user_name') || undefined;
    } catch (_) {}

    return {
      sessionId: this.sessionId,
      visitorId,
      userEmail,
      userName,
      device: typeof navigator !== 'undefined' ? `${navigator.userAgent.substring(0, 100)} (${window.innerWidth}x${window.innerHeight})` : 'Dispositivo móvil/web',
      iniciada_en: new Date(this.startTime).toISOString(),
      finalizada_en: new Date(now).toISOString(),
      datos_servicio: {
        archivos_consultados: Array.from(this.consultedFiles),
        vistas_visitadas: Array.from(this.visitedViews),
        preguntas_respondidas_count: this.questionsAnswered,
        promedio_calificacion: avgScore,
        examenes_orales_count: this.oralExamsCount,
        documentos_leidos_count: this.documentsReadCount
      },
      excedente_conductual: {
        duracion_total_sesion_ms: totalDuration,
        tiempo_activo_ms: activeTime,
        tiempo_en_segundo_plano_ms: this.totalHiddenTimeMs,
        cambios_de_pestana_total: this.tabSwitchesCount,
        titubeos_correccion_total: this.totalBackspacesCount,
        latencia_promedio_decision_ms: avgLatency,
        velocidad_interaccion_predominante: this.calculateInteractionVelocity(),
        metricas_lectura: {
          tiempo_lectura_total_ms: this.readingTimeMs,
          wpm_promedio: avgWpm,
          profundidad_max_scroll: Math.round(this.maxScrollDepth),
          textos_copiados_count: this.textCopyCount
        },
        eventos_recientes: this.eventHistory.slice(-20)
      }
    };
  }

  public dispatchSessionBeacon() {
    // Si la sesión duró menos de 5 segundos y no hubo actividad, ignorar para evitar reportes vacíos
    if (Date.now() - this.startTime < 5000 && this.eventHistory.length <= 1) return;

    const payload = this.buildPayload();
    const dataString = JSON.stringify(payload);

    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([dataString], { type: 'application/json' });
        navigator.sendBeacon('/api/analytics/session-end', blob);
      } else {
        fetch('/api/analytics/session-end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: dataString,
          keepalive: true
        }).catch(() => {});
      }
    } catch (_) {}
  }

  public async forceDispatch(): Promise<boolean> {
    try {
      const payload = this.buildPayload();
      const res = await fetch('/api/analytics/session-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// Instancia única (Singleton) para toda la aplicación
export const telemetry = new TelemetryManager();
