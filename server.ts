import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import * as mammothModule from "mammoth";
import fs from "fs";
import { 
  uploadFileToGCS, 
  saveUserDbToGCS, 
  readUserDbFromGCS, 
  saveUsersDbToGCS,
  readUsersDbFromGCS,
  saveFeedbackDbToGCS,
  readFeedbackDbFromGCS,
  getBucketName, 
  getStorageStatus,
  resolveGoogleCredentials,
  resetStorageClient
} from "./server/storage.ts";

// ES Module compatibility for third-party CommonJS packages
const mammoth = ((mammothModule as any).default || mammothModule) as any;

dotenv.config();
resolveGoogleCredentials();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = 3000;

const USER_DB_PATH = path.join(process.cwd(), "user_studies_db.json");

interface SavedStudy {
  id: string;
  title: string;
  files: { name: string; size: number; type?: string }[];
  studyText: string;
  topics: any[];
  unlockedTopics: string[];
  viewMode: string;
  createdAt: string;
}

function readUserDb(): Record<string, SavedStudy[]> {
  try {
    if (!fs.existsSync(USER_DB_PATH)) {
      return {};
    }
    const data = fs.readFileSync(USER_DB_PATH, "utf8");
    return JSON.parse(data) || {};
  } catch (err) {
    console.error("Error reading user studies DB, returning empty:", err);
    return {};
  }
}

async function writeUserDb(db: Record<string, SavedStudy[]>) {
  try {
    // Write local cache
    fs.writeFileSync(USER_DB_PATH, JSON.stringify(db, null, 2), "utf8");
    // Asynchronously synchronize directly to Google Cloud Storage
    await saveUserDbToGCS(db);
  } catch (err) {
    console.error("Error writing user studies DB:", err);
  }
}

// Initial sync from Google Cloud Storage on server startup
readUserDbFromGCS().then(gcsData => {
  if (gcsData && Object.keys(gcsData).length > 0) {
    try {
      fs.writeFileSync(USER_DB_PATH, JSON.stringify(gcsData, null, 2), "utf8");
      console.log("[GCS Initializer] Base de datos local sincronizada desde Google Cloud Storage con éxito.");
    } catch (e) {
      console.warn("[GCS Initializer] No se pudo guardar la copia local:", e);
    }
  }
}).catch(err => {
  console.log("[GCS Initializer] Verificación de GCS completada (sin datos previos o bucket nuevo):", err.message || err);
});

// --- User Profiles Database (Who uses the app) ---
const USER_PROFILES_PATH = path.join(process.cwd(), "user_profiles_db.json");
const ACTIVITY_LOG_PATH = path.join(process.cwd(), "user_activity_log.json");

interface UserProfile {
  id: string;
  email?: string;
  visitorId?: string;
  displayName: string;
  photoURL?: string;
  authProvider: 'google' | 'guest';
  firstSeenAt: string;
  lastSeenAt: string;
  sessionCount: number;
  studiesCount: number;
  device?: string;
  ip?: string;
  isAnonymous?: boolean;
  lastAction?: string;
  actionsCount?: number;
}

interface ActivityEvent {
  id: string;
  visitorId: string;
  userEmail?: string;
  userName?: string;
  action: string;
  details?: string;
  timestamp: string;
  device?: string;
}

function readUsersDb(): Record<string, UserProfile> {
  try {
    if (!fs.existsSync(USER_PROFILES_PATH)) {
      return {};
    }
    const data = fs.readFileSync(USER_PROFILES_PATH, "utf8");
    return JSON.parse(data) || {};
  } catch (err) {
    console.error("Error reading users profile DB:", err);
    return {};
  }
}

async function writeUsersDb(users: Record<string, UserProfile>) {
  try {
    fs.writeFileSync(USER_PROFILES_PATH, JSON.stringify(users, null, 2), "utf8");
    await saveUsersDbToGCS(users);
  } catch (err) {
    console.error("Error writing users profile DB:", err);
  }
}

function readActivityLog(): ActivityEvent[] {
  try {
    if (!fs.existsSync(ACTIVITY_LOG_PATH)) {
      return [];
    }
    const data = fs.readFileSync(ACTIVITY_LOG_PATH, "utf8");
    return JSON.parse(data) || [];
  } catch (err) {
    return [];
  }
}

function appendActivityLog(event: ActivityEvent) {
  try {
    const log = readActivityLog();
    log.unshift(event);
    const trimmed = log.slice(0, 150); // keep last 150 events
    fs.writeFileSync(ACTIVITY_LOG_PATH, JSON.stringify(trimmed, null, 2), "utf8");
  } catch (err) {
    console.warn("Could not append activity log:", err);
  }
}

// Initial sync users from GCS
readUsersDbFromGCS().then(gcsUsers => {
  if (gcsUsers && Object.keys(gcsUsers).length > 0) {
    try {
      fs.writeFileSync(USER_PROFILES_PATH, JSON.stringify(gcsUsers, null, 2), "utf8");
      console.log("[GCS Initializer] Perfiles de usuario sincronizados desde GCS.");
    } catch (e) {
      console.warn("[GCS Initializer] Error guardando perfiles locales:", e);
    }
  }
}).catch(() => {});

// --- User Feedback Database (Feedback & Critiques) ---
const USER_FEEDBACK_PATH = path.join(process.cwd(), "user_feedback_db.json");

interface FeedbackItem {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  rating: number; // 1 to 5
  category: 'critique' | 'bug' | 'voice_tutor' | 'exam' | 'suggestion' | 'general';
  comment: string;
  status: 'new' | 'reviewed' | 'replied';
  createdAt: string;
  device?: string;
  allowContact?: boolean;
}

function readFeedbackDb(): FeedbackItem[] {
  try {
    if (!fs.existsSync(USER_FEEDBACK_PATH)) {
      return [];
    }
    const data = fs.readFileSync(USER_FEEDBACK_PATH, "utf8");
    return JSON.parse(data) || [];
  } catch (err) {
    console.error("Error reading feedback DB:", err);
    return [];
  }
}

async function writeFeedbackDb(items: FeedbackItem[]) {
  try {
    fs.writeFileSync(USER_FEEDBACK_PATH, JSON.stringify(items, null, 2), "utf8");
    await saveFeedbackDbToGCS(items);
  } catch (err) {
    console.error("Error writing feedback DB:", err);
  }
}

// Initial sync feedback from GCS
readFeedbackDbFromGCS().then(gcsFeedback => {
  if (gcsFeedback && Array.isArray(gcsFeedback) && gcsFeedback.length > 0) {
    try {
      fs.writeFileSync(USER_FEEDBACK_PATH, JSON.stringify(gcsFeedback, null, 2), "utf8");
      console.log("[GCS Initializer] Feedback sincronizado desde GCS.");
    } catch (e) {
      console.warn("[GCS Initializer] Error guardando feedback local:", e);
    }
  }
}).catch(() => {});

let aiClient: GoogleGenAI | null = null;

function getApiKey(): string | undefined {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  // Try to find any key in the environment starting with "AIza", "AIzaSy" or "AQ."
  const keys = Object.keys(process.env);
  for (const k of keys) {
    const val = process.env[k];
    if (val && (val.startsWith("AIzaSy") || val.startsWith("AIza") || val.startsWith("AQ."))) {
      console.log(`Auto-detected Gemini API key in environment variable: ${k}`);
      return val;
    }
  }
  return undefined;
}

function getAiClient(customKey?: string): GoogleGenAI {
  const key = customKey || getApiKey();
  if (!key) {
    throw new Error(
      "La clave API de Gemini (GEMINI_API_KEY) no está configurada. " +
      "Por favor, agrégala en el panel de 'Settings > Secrets' (Configuración > Secretos) en la barra superior o en el panel lateral de AI Studio para activar las funciones de estudio con Inteligencia Artificial."
    );
  }
  if (customKey) {
    return new GoogleGenAI({
      apiKey: customKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

console.log("Lazy initialization helper for Gemini API defined. Initial key present in process.env:", !!process.env.GEMINI_API_KEY);

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4, baseDelayMs = 1500): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.response?.status;
      const isRetryable = status === 503 || status === 429 || status === 500;
      if (!isRetryable || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500;
      console.warn(`[Retry] Intento ${attempt}/${maxAttempts} fallido (${status}). Reintentando en ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// HTTP routes
app.get("/api/check-env", (req, res) => {
  const key = getApiKey();
  res.json({
    gemini_key_present: !!key,
    gemini_key_length: key ? key.length : 0,
    node_env: process.env.NODE_ENV
  });
});

// Storage status and management routes
app.get("/api/storage/status", (req, res) => {
  res.json({
    ...getStorageStatus(),
    environment: process.env.NODE_ENV,
    cloudRunReady: true,
    adcInfo: !process.env.GOOGLE_APPLICATION_CREDENTIALS 
      ? "Detectando credenciales por defecto de Cloud Run (Service Account)" 
      : "Credenciales configuradas por variable GOOGLE_APPLICATION_CREDENTIALS"
  });
});

app.post("/api/storage/set-bucket", (req, res) => {
  const { bucketName } = req.body;
  if (!bucketName || typeof bucketName !== "string") {
    return res.status(400).json({ error: "Nombre de bucket inválido" });
  }
  process.env.GCS_BUCKET_NAME = bucketName.trim();
  resetStorageClient();
  console.log(`[Google Cloud Storage] Bucket configurado dinámicamente a: ${bucketName.trim()}`);
  res.json({ success: true, ...getStorageStatus() });
});

// Direct file upload to Google Cloud Storage (replaces local fs.writeFile)
app.post("/api/upload", async (req, res) => {
  try {
    const { fileData, fileName, mimeType, folder } = req.body;
    if (!fileData || !fileName) {
      return res.status(400).json({ error: "Faltan datos requeridos (fileData o fileName)" });
    }

    const buffer = Buffer.from(fileData, 'base64');
    const result = await uploadFileToGCS(
      fileName,
      buffer,
      mimeType || 'application/octet-stream',
      folder || 'uploads'
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(result.error?.includes("no configurada") ? 400 : 500).json(result);
    }
  } catch (error: any) {
    console.error("[Storage Upload] Error uploading file:", error);
    res.status(500).json({ error: `Error al subir archivo a Google Cloud Storage: ${error.message || error}` });
  }
});

app.post("/api/extract-pdf", async (req, res) => {
  try {
    const { fileData, fileName, mimeType } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: "Falta el contenido del archivo (fileData)" });
    }

    console.log(`[Server File Extraction] Recibida solicitud para extraer texto de: ${fileName || 'documento'}`);
    const buffer = Buffer.from(fileData, 'base64');
    let text = '';

    const isWord = fileName && (fileName.toLowerCase().endsWith('.docx') || fileName.toLowerCase().endsWith('.doc'));

    if (isWord) {
      if (fileName.toLowerCase().endsWith('.doc')) {
        return res.status(400).json({ 
          error: "El formato de Word antiguo (.doc) no está soportado directamente. Por favor, vuelve a guardar tu archivo en Word como formato moderno (.docx) o expórtalo a PDF para poder subirlo." 
        });
      }
      console.log(`[Server Word Extraction] Procesando archivo .docx con Mammoth para: ${fileName}`);
      const result = await mammoth.extractRawText({ buffer: buffer });
      text = result.value || '';
    } else {
      console.log(`[Server PDF Extraction] Procesando archivo PDF para: ${fileName}`);
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const parsedData = await parser.getText();
        text = parsedData.text || '';
      } finally {
        await parser.destroy();
      }
    }
    
    // Asynchronously send the original document to Google Cloud Storage (replaces local fs.writeFile)
    let gcsResult: any = null;
    try {
      const fileMime = mimeType || (isWord 
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
        : 'application/pdf');
      gcsResult = await uploadFileToGCS(fileName || 'documento', buffer, fileMime);
      if (gcsResult.success) {
        console.log(`[Server Extraction] Documento respaldado en Google Cloud Storage: ${gcsResult.gcsUri}`);
      }
    } catch (gcsErr: any) {
      console.warn("[Server Extraction] Advertencia al respaldar en GCS:", gcsErr.message || gcsErr);
    }

    console.log(`[Server Extraction] Extracción exitosa de: ${fileName || 'documento'}. Caracteres extraídos: ${text.length}`);
    res.json({ 
      text,
      gcsUri: gcsResult?.gcsUri,
      publicUrl: gcsResult?.publicUrl,
      gcsUploaded: !!gcsResult?.success
    });
  } catch (error: any) {
    console.error("[Server Extraction] Error parsing file on server:", error);
    res.status(500).json({ error: `No se pudo extraer el texto del archivo en el servidor: ${error.message || error}` });
  }
});

app.post("/api/import-google-doc", async (req, res) => {
  try {
    const { url, docId: inputDocId, accessToken: bodyAccessToken } = req.body;
    const authHeader = req.headers.authorization;
    const accessToken = bodyAccessToken || (authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null);

    let docId = inputDocId;

    if (!docId && url) {
      const match = url.match(/(?:document\/d\/|file\/d\/|id=)([a-zA-Z0-9_-]{25,})/i);
      if (match) {
        docId = match[1];
      } else if (/^[a-zA-Z0-9_-]{25,}$/.test(url.trim())) {
        docId = url.trim();
      }
    }

    if (!docId) {
      return res.status(400).json({ 
        error: "No se encontró un ID de Google Doc válido en el enlace proporcionado. Asegúrate de pegar el enlace completo de tu documento (ej: https://docs.google.com/document/d/1abc.../edit)." 
      });
    }

    console.log(`[Google Doc Import] Intentando importar Google Doc ID: ${docId}. Con token: ${!!accessToken}`);

    // If OAuth access token is provided, use Google Drive API export
    if (accessToken) {
      const apiExportUrl = `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/plain`;
      const apiRes = await fetch(apiExportUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (apiRes.ok) {
        const text = await apiRes.text();
        console.log(`[Google Doc Import] Exportación por Google Drive API exitosa. Caracteres: ${text.length}`);
        return res.json({
          docId,
          text,
          title: `Google_Doc_${docId.substring(0, 6)}.txt`
        });
      }
    }

    // Fallback to public web export format
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const response = await fetch(exportUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      if (contentType.includes('text/html') && (text.includes('accounts.google.com') || text.includes('ServiceLogin') || text.includes('<!DOCTYPE html>'))) {
        return res.status(403).json({
          error: "El documento de Google Docs es privado. Haz clic en 'Conectar Google Drive' para acceder a tus documentos privados o cambia los permisos del documento a 'Cualquier persona con el enlace puede ver'."
        });
      }

      if (!text || text.trim().length === 0) {
        return res.status(400).json({
          error: "El documento importado de Google Docs parece estar vacío."
        });
      }

      console.log(`[Google Doc Import] Importación pública exitosa de Doc ID: ${docId}. Caracteres: ${text.length}`);
      return res.json({ 
        docId, 
        text, 
        title: `Google_Doc_${docId.substring(0, 6)}.txt` 
      });
    } else if (response.status === 404) {
      return res.status(404).json({
        error: "No se encontró el documento de Google Docs. Revisa que la URL sea correcta."
      });
    } else {
      return res.status(403).json({
        error: "No se pudo acceder al documento. Si el documento es privado, usa el botón 'Conectar Google Drive' en la app."
      });
    }
  } catch (error: any) {
    console.error("[Google Doc Import] Error importing Google Doc:", error);
    res.status(500).json({ error: `Error al importar Google Doc: ${error.message || error}` });
  }
});

// API endpoints for user studies history
app.get("/api/history", (req, res) => {
  const { email } = req.query;
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Falta el parámetro email" });
  }
  const cleanEmail = email.trim().toLowerCase();
  const db = readUserDb();
  const studies = db[cleanEmail] || [];
  res.json({ studies });
});

app.post("/api/history", (req, res) => {
  const { email, study } = req.body;
  if (!email || !study) {
    return res.status(400).json({ error: "Faltan email o study en la solicitud" });
  }
  const cleanEmail = email.trim().toLowerCase();
  const db = readUserDb();
  
  if (!db[cleanEmail]) {
    db[cleanEmail] = [];
  }
  
  const index = db[cleanEmail].findIndex((s) => s.id === study.id);
  if (index !== -1) {
    db[cleanEmail][index] = study;
  } else {
    db[cleanEmail].unshift(study);
  }
  
  writeUserDb(db);
  res.json({ success: true, study });
});

app.delete("/api/history", (req, res) => {
  const { email, studyId } = req.body;
  if (!email || !studyId) {
    return res.status(400).json({ error: "Faltan email o studyId en la solicitud" });
  }
  const cleanEmail = email.trim().toLowerCase();
  const db = readUserDb();
  
  if (db[cleanEmail]) {
    db[cleanEmail] = db[cleanEmail].filter((s) => s.id !== studyId);
    writeUserDb(db);
  }
  
  res.json({ success: true });
});

// ==========================================
// USER & VISITOR TRACKING ENDPOINTS
// ==========================================

app.post("/api/users/track", (req, res) => {
  try {
    const { email, displayName, photoURL, authProvider, device, visitorId, action, details } = req.body;
    
    // Si no hay email ni visitorId, generar uno basado en la sesión o rechazar
    const cleanVisitorId = visitorId && typeof visitorId === "string" ? visitorId.trim() : `vis_${Date.now()}`;
    const cleanEmail = email && typeof email === "string" && email.includes('@') ? email.trim().toLowerCase() : undefined;

    const users = readUsersDb();
    const now = new Date().toISOString();
    const studiesDb = readUserDb();
    const userStudiesCount = cleanEmail ? (studiesDb[cleanEmail] || []).length : 0;

    const userKey = cleanEmail || `visitor:${cleanVisitorId}`;
    const isAnon = !cleanEmail;
    const shortId = cleanVisitorId.replace('vis_', '').substring(0, 6);
    const resolvedName = displayName || (isAnon ? `Visitante #${shortId}` : cleanEmail.split('@')[0]);

    if (users[userKey]) {
      users[userKey] = {
        ...users[userKey],
        id: userKey,
        email: cleanEmail || users[userKey].email,
        visitorId: cleanVisitorId,
        displayName: resolvedName,
        photoURL: photoURL || users[userKey].photoURL,
        authProvider: authProvider || users[userKey].authProvider,
        lastSeenAt: now,
        sessionCount: (users[userKey].sessionCount || 1) + 1,
        studiesCount: Math.max(users[userKey].studiesCount || 0, userStudiesCount),
        device: device || users[userKey].device,
        isAnonymous: isAnon,
        lastAction: action || users[userKey].lastAction || 'Ingresó a la app',
        actionsCount: (users[userKey].actionsCount || 1) + 1
      };
    } else {
      users[userKey] = {
        id: userKey,
        email: cleanEmail,
        visitorId: cleanVisitorId,
        displayName: resolvedName,
        photoURL: photoURL || '',
        authProvider: authProvider || (isAnon ? 'guest' : 'google'),
        firstSeenAt: now,
        lastSeenAt: now,
        sessionCount: 1,
        studiesCount: userStudiesCount,
        device: device || '',
        isAnonymous: isAnon,
        lastAction: action || 'Ingresó a la app',
        actionsCount: 1
      };
    }

    // Si un visitante anónimo ahora dio su email, podemos limpiar la clave anónima previa para no duplicar
    if (cleanEmail && cleanVisitorId && users[`visitor:${cleanVisitorId}`]) {
      delete users[`visitor:${cleanVisitorId}`];
    }

    writeUsersDb(users);

    // Registrar en el log cronológico de eventos
    appendActivityLog({
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      visitorId: cleanVisitorId,
      userEmail: cleanEmail,
      userName: resolvedName,
      action: action || (isAnon ? 'Visita anónima al sitio' : 'Ingreso de usuario'),
      details: details || (device ? device.substring(0, 70) : undefined),
      timestamp: now,
      device: device || undefined
    });

    res.json({ success: true, user: users[userKey] });
  } catch (error: any) {
    console.error("[User Tracking] Error:", error);
    res.status(500).json({ error: error.message || "Error al registrar actividad de usuario" });
  }
});

app.get("/api/admin/users", (req, res) => {
  try {
    const users = readUsersDb();
    const studiesDb = readUserDb();
    const userList = Object.values(users).map(u => {
      const realStudiesCount = u.email ? (studiesDb[u.email.toLowerCase()] || []).length : (u.studiesCount || 0);
      return {
        ...u,
        studiesCount: Math.max(u.studiesCount || 0, realStudiesCount)
      };
    }).sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

    const registeredUsers = userList.filter(u => u.email && u.email.includes('@'));
    const anonymousVisitors = userList.filter(u => !u.email || u.isAnonymous);
    const totalVisits = userList.reduce((acc, u) => acc + (u.sessionCount || 1), 0);
    const activityLog = readActivityLog();

    res.json({
      users: userList,
      registeredUsers,
      anonymousVisitors,
      totalCount: userList.length,
      registeredCount: registeredUsers.length,
      anonymousCount: anonymousVisitors.length,
      totalVisits,
      recentActivity: activityLog,
      activeToday: userList.filter(u => {
        const last = new Date(u.lastSeenAt).getTime();
        return (Date.now() - last) < 24 * 60 * 60 * 1000;
      }).length
    });
  } catch (error: any) {
    console.error("[Admin Users] Error:", error);
    res.status(500).json({ error: error.message || "Error al obtener usuarios" });
  }
});

// ==========================================
// FEEDBACK & CRITIQUES ENDPOINTS
// ==========================================

app.post("/api/feedback", (req, res) => {
  try {
    const { userId, userEmail, userName, rating, category, comment, device, allowContact } = req.body;
    if (!comment || typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({ error: "El comentario es obligatorio" });
    }

    const feedbackList = readFeedbackDb();
    const id = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newFeedback: FeedbackItem = {
      id,
      userId: userId || undefined,
      userEmail: userEmail ? userEmail.trim().toLowerCase() : undefined,
      userName: userName ? userName.trim() : undefined,
      rating: typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : 3,
      category: category || 'general',
      comment: comment.trim(),
      status: 'new',
      createdAt: now,
      device: device || undefined,
      allowContact: allowContact !== false
    };

    feedbackList.unshift(newFeedback);
    writeFeedbackDb(feedbackList);

    // If user provided an email, also ensure they are in the users list
    if (userEmail && userEmail.includes('@')) {
      const users = readUsersDb();
      const cleanEmail = userEmail.trim().toLowerCase();
      if (!users[cleanEmail]) {
        users[cleanEmail] = {
          id: cleanEmail,
          email: cleanEmail,
          visitorId: cleanEmail,
          displayName: userName || cleanEmail.split('@')[0],
          authProvider: 'guest',
          firstSeenAt: now,
          lastSeenAt: now,
          sessionCount: 1,
          studiesCount: 0,
          device: device || '',
          isAnonymous: false,
          lastAction: 'Envió feedback',
          actionsCount: 1
        };
        writeUsersDb(users);
      }
    }

    console.log(`[Feedback] Recibido nuevo feedback (${newFeedback.rating}★ [${newFeedback.category}]): ${newFeedback.comment.substring(0, 60)}...`);
    res.json({ success: true, feedback: newFeedback });
  } catch (error: any) {
    console.error("[Feedback] Error:", error);
    res.status(500).json({ error: error.message || "Error al procesar feedback" });
  }
});

app.get("/api/admin/feedback", (req, res) => {
  try {
    const feedbackList = readFeedbackDb();
    res.json({
      feedback: feedbackList,
      totalCount: feedbackList.length,
      averageRating: feedbackList.length > 0 
        ? +(feedbackList.reduce((acc, f) => acc + f.rating, 0) / feedbackList.length).toFixed(1)
        : 0,
      critiquesCount: feedbackList.filter(f => f.category === 'critique' || f.category === 'bug' || f.rating <= 2).length
    });
  } catch (error: any) {
    console.error("[Admin Feedback] Error:", error);
    res.status(500).json({ error: error.message || "Error al obtener feedback" });
  }
});

app.patch("/api/admin/feedback/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const feedbackList = readFeedbackDb();
    const index = feedbackList.findIndex(f => f.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Feedback no encontrado" });
    }

    if (status && ['new', 'reviewed', 'replied'].includes(status)) {
      feedbackList[index].status = status;
      writeFeedbackDb(feedbackList);
    }

    res.json({ success: true, feedback: feedbackList[index] });
  } catch (error: any) {
    console.error("[Admin Feedback Patch] Error:", error);
    res.status(500).json({ error: error.message || "Error al actualizar feedback" });
  }
});

function cleanJsonText(rawText: string): string {
  if (!rawText) return '[]';
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.substring(firstBracket, lastBracket + 1);
  }
  return cleaned;
}

function cleanStudyTextForAnalysis(text: string): string {
  if (!text) return "";

  const lines = text.split('\n');
  const cleanedLines: string[] = [];

  const noiseRegex = /^\s*(dossier(\s+de\s+preguntas|\s+tem[aá]tico)?|cuaderno(\s+de\s+c[aá]tedra|\s+de\s+estudio)?|gu[ií]a(\s+de\s+estudio|\s+de\s+preguntas|\s+pr[aá]ctica)?|programa(\s+anal[ií]tico|\s+de\s+la\s+materia)?|c[aá]tedra|profesora?|prof\.?|docente|titular|adjunto|jtp|universidad|facultad|departamento|materia:|asignatura:|carrera|ciclo\s+lectivo|cuatrimestre|unidad\s+acad[eé]mica|alumno|alumna|integrantes|legajo|fecha:|turno:|comisi[oó]n|cuaderno\s+de\s+trabajo|trabajo\s+pr[aá]ctico\s+n[°o]?\s*\d*)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Skip if line matches noise regex
    if (noiseRegex.test(line)) {
      continue;
    }
    // Skip short lines that are metadata like "Dossier", "Prof. Laura...", "UBA - Cátedra"
    if (/^(dossier|c[aá]tedra|profesora?|gu[ií]a|universidad|facultad|materia|trabajo\s+pr[aá]ctico)\b/i.test(line) && line.length < 80) {
      continue;
    }
    cleanedLines.push(lines[i]);
  }

  const result = cleanedLines.join('\n').trim();
  return result.length > 50 ? result : text;
}

function generateFallbackOralTopics(studyText: string, excludeTitles: string[] = []) {
  const cleanText = cleanStudyTextForAnalysis(studyText);
  const text = cleanText || "Contenido de estudio general.";
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const noiseKeywords = /^(dossier|cuaderno|gu[ií]a|programa|c[aá]tedra|profesora?|prof\.?|docente|titular|universidad|facultad|materia|trabajo\s+pr[aá]ctico)/i;
  
  const cleanSentences = sentences
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 200)
    .filter(s => !noiseKeywords.test(s));

  const baseTopics = generateFallbackTopics(cleanText);
  // Exclude titles already shown
  const availableTopics = baseTopics.filter(bt => !excludeTitles.some(et => et.toLowerCase().trim() === bt.title.toLowerCase().trim()));
  const topicsToUse = availableTopics.length > 0 ? availableTopics : baseTopics;

  // Divide sentences into distinct slices for each topic
  const totalSlices = topicsToUse.length || 1;
  const sliceSize = Math.max(1, Math.floor(cleanSentences.length / totalSlices));

  return topicsToUse.map((t, idx) => {
    const titleSuffix = excludeTitles.length > 0 ? ` (Bloque ${idx + 1})` : '';
    const finalTitle = `Tema ${idx + 1}: ${t.title}${titleSuffix}`;

    // Slice dedicated sentences for this specific topic branch
    const startIdx = idx * sliceSize;
    const branchSentences = cleanSentences.slice(startIdx, startIdx + sliceSize);
    const branchText = branchSentences.length > 0 ? branchSentences : cleanSentences;

    const s1 = branchText[0] || `Concepto central de ${t.title}`;
    const s2 = branchText[1] || branchText[0] || `Detalle temático en ${t.title}`;
    const s3 = branchText[2] || branchText[0] || `Aplicación clave de ${t.title}`;
    
    const words = s1.split(' ').filter(w => w.length > 4);
    const kw = words[idx % (words.length || 1)] || t.title;

    return {
      id: `oral_topic_${Date.now()}_${idx + 1}_${Math.random().toString(36).substring(2, 6)}`,
      title: finalTitle,
      description: `Evaluación oral focalizada exclusivamente en la rama de "${t.title}": ${t.description}`,
      questions: [
        `Dentro de la rama de ${t.title}, ¿cómo analiza el documento el siguiente punto específico: "${s1}"?`,
        `¿A qué se refiere exactamente el texto al explicar el concepto de "${kw}" en la sección de ${t.title}?`,
        `¿Qué detalles, clasificaciones o ejemplos presenta el autor al abordar "${s2.substring(0, 75)}..."?`,
        `¿Cuáles son las reglas, principios o postulados fundamentales expuestos en el texto únicamente sobre ${t.title}?`,
        `Basándote en las conclusiones de esta sección, ¿qué implicaciones o aplicaciones se derivan sobre "${s3.substring(0, 70)}..."?`
      ]
    };
  });
}

function generateFallbackTopics(studyText: string) {
  const cleanText = cleanStudyTextForAnalysis(studyText);
  const text = cleanText || "Contenido de estudio general.";
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 5 && line.length < 100);

  const topics: any[] = [];
  
  const noiseKeywords = /^(dossier|cuaderno|gu[ií]a|programa|c[aá]tedra|profesora?|prof\.?|docente|titular|universidad|facultad|departamento|materia|asignatura|trabajo\s+pr[aá]ctico|evaluaci[oó]n|alumnos?|integrantes|hoja|p[aá]gina)/i;

  const headings = lines.filter(line => {
    if (noiseKeywords.test(line)) return false;
    return /^[I|V|X|\d]+\.?\s+/i.test(line) || 
      /^[A-ZÁÉÍÓÚ\s]{5,50}$/.test(line) ||
      line.endsWith(':') || 
      (line.length > 10 && line.length < 40);
  }).slice(0, 5);

  if (headings.length >= 3) {
    headings.forEach((h, idx) => {
      let cleanTitle = h.replace(/^[\d\.\-\s#•*]+/g, '').trim();
      cleanTitle = cleanTitle.replace(/^(dossier|c[aá]tedra|gu[ií]a|profesora?)\s*(de\s*)?/i, '').trim();
      if (!cleanTitle || noiseKeywords.test(cleanTitle)) {
        cleanTitle = `Rama de Estudio ${idx + 1}`;
      } else {
        cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      }
      topics.push({
        id: `tema_${idx + 1}`,
        title: cleanTitle,
        description: `Análisis de la rama de estudio sobre "${cleanTitle}". Conceptos clave, definiciones e implicaciones derivadas del texto.`,
        imagePrompt: `${cleanTitle.toLowerCase()} educational academic conceptual minimalist illustration vector icon`
      });
    });
  } else {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const cleanSentences = sentences
      .map(s => s.trim())
      .filter(s => s.length > 30 && s.length < 150)
      .filter(s => !noiseKeywords.test(s));
      
    const count = Math.min(4, Math.max(3, Math.ceil(cleanSentences.length / 5)));
    for (let i = 0; i < count; i++) {
      const sentence = cleanSentences[i * 4 % (cleanSentences.length || 1)] || `Concepto clave de estudio parte ${i + 1}`;
      const firstWords = sentence.split(' ').slice(0, 4).join(' ').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
      let title = firstWords ? (firstWords.charAt(0).toUpperCase() + firstWords.slice(1)) : `Unidad Temática ${i + 1}`;
      title = title.replace(/^(dossier|c[aá]tedra|gu[ií]a|profesora?)\s*(de\s*)?/i, '').trim();
      if (!title) title = `Unidad Temática ${i + 1}`;
      topics.push({
        id: `tema_${i + 1}`,
        title: title,
        description: `Estudio y desglose del concepto: "${sentence.substring(0, 80)}..."`,
        imagePrompt: `${title.toLowerCase()} academic research flat clean vector icon illustration`
      });
    }
  }

  while (topics.length < 3) {
    const idx = topics.length + 1;
    topics.push({
      id: `tema_${idx}`,
      title: `Unidad Temática ${idx}`,
      description: `Exploración y asimilación de las ideas fundamentales descritas en el bloque ${idx} de los documentos de estudio.`,
      imagePrompt: `educational book and idea concept minimalist illustration`
    });
  }

  return topics;
}

function generateFallbackQuiz(studyText: string) {
  const text = studyText || "Contenido de estudio general para evaluación interactiva.";
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const cleanSentences = sentences
    .map(s => s.trim())
    .filter(s => s.length > 40 && s.length < 250);

  const quiz: any[] = [];
  
  const definitionSentences = cleanSentences.filter(s => 
    /\b(es|son|fue|fueron|consiste en|se define como|se refiere a|se caracteriza por|implica|surge de|nace en)\b/i.test(s)
  );

  const sources = definitionSentences.length > 5 ? definitionSentences : cleanSentences;
  const numQuestions = Math.min(10, Math.max(5, sources.length));

  for (let i = 0; i < numQuestions; i++) {
    const sentence = sources[i % sources.length];
    if (!sentence) continue;

    const words = sentence.split(' ');
    let keyWordIndex = Math.floor(words.length / 2);
    for (let w = 0; w < words.length; w++) {
      if (words[w].length > 6 && /^[a-zA-ZáéíóúÁÉÍÓÚñÑ]+$/.test(words[w])) {
        keyWordIndex = w;
        break;
      }
    }

    const rawKeyWord = words[keyWordIndex] || "concepto";
    const keyWord = rawKeyWord.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g,"");
    const maskedSentence = words.map((w, idx) => idx === keyWordIndex ? "________" : w).join(' ');

    const distractors = [
      "Una hipótesis secundaria no corroborada por el autor",
      "Un concepto complementario de la sección analizada",
      "Un postulado teórico alternativo en desuso",
      "Una definición general aplicable a otros escenarios"
    ];

    const correctOption = keyWord.charAt(0).toUpperCase() + keyWord.slice(1);
    const options = [correctOption, distractors[0], distractors[1], distractors[2]];
    
    // Shuffle options
    const correctIndex = Math.floor(Math.random() * 4);
    const temp = options[0];
    options[0] = options[correctIndex];
    options[correctIndex] = temp;

    quiz.push({
      question: `Completa la afirmación según el texto: "${maskedSentence}"`,
      options: options,
      correctIndex: correctIndex,
      explanation: `Basado en la lectura: "${sentence}". La respuesta idónea es "${correctOption}".`
    });
  }

  while (quiz.length < 5) {
    const idx = quiz.length + 1;
    quiz.push({
      question: `¿Cuál es el propósito central del tema de estudio número ${idx}?`,
      options: [
        "Analizar críticamente las fuentes y comprender las ideas principales descritas en los documentos.",
        "Memorizar los términos sin prestar atención a su significado o contexto práctico.",
        "Reemplazar por completo el contenido original con suposiciones personales o intuitivas.",
        "Ignorar las explicaciones del tutor y estudiar exclusivamente de resúmenes externos."
      ],
      correctIndex: 0,
      explanation: "El objetivo de un tutor dinámico interactivo y del plan de estudios es facilitar el análisis crítico y la asimilación real de las ideas principales."
    });
  }

  return quiz;
}

app.post("/api/generate-topics", async (req, res) => {
  const { studyText } = req.body;
  if (!studyText || !studyText.trim()) {
    return res.status(400).json({ error: "Falta el texto de estudio para generar los temas." });
  }

  const customKey = req.headers['x-gemini-api-key'] as string | undefined;
  const cleanText = cleanStudyTextForAnalysis(studyText);
  
  // Try using real Gemini API first
  try {
    const ai = getAiClient(customKey);
    const response = await withRetry(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Extrae de forma limpia los temas principales ACADÉMICOS SUSTANTIVOS del siguiente texto de estudio para crear un plan de estudio. Devuelve una lista de 3 a 5 temas verdaderos basados estrictamente en la materia.

REGLA CRÍTICA SOBRE ENCABEZADOS Y PORTADAS:
- IGNORA Y DESECHA POR COMPLETO títulos administrativos como "Dossier de preguntas", "Dossier", "Cuaderno de cátedra", "Guía de trabajos prácticos", nombres de profesores (ej. "Prof. ..."), materias, universidades, facultades o fechas.
- NUNCA generes un tema llamado "Dossier", "Guía de preguntas" ni con nombres de docentes o instituciones.
- Centra los títulos de los temas 100% en los contenidos académicos o módulos históricos/teóricos reales del texto (ej. "La Revolución Industrial", "Modelos Económicos", "Estructura Celular", etc.).

Texto:
${cleanText.substring(0, 50000)}`,
      config: {
        systemInstruction: "Eres un analista de contenido educativo. Extrae temas clave académicos sustantivos e ignora encabezados de portada, la palabra Dossier y nombres de profesores.",
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: 'Un ID corto y único (ej. tema_1)' },
              title: { type: Type.STRING, description: 'El título del tema académico sustantivo' },
              description: { type: Type.STRING, description: 'Una breve descripción del tema' },
              imagePrompt: { type: Type.STRING, description: 'Un prompt en inglés para generar una imagen ilustrativa del tema (ej. "industrial revolution factory history illustration minimalist")' }
            },
            required: ['id', 'title', 'description', 'imagePrompt']
          }
        }
      }
    }));

    const cleanResult = cleanJsonText(response.text || '');
    return res.json({ text: cleanResult });
  } catch (error: any) {
    console.warn("[Server API Key Alert] No se pudo utilizar la API de Gemini (o no hay clave). Usando generador local inteligente para temas.", error.message || error);
    const fallbackTopics = generateFallbackTopics(cleanText);
    return res.json({ text: JSON.stringify(fallbackTopics) });
  }
});

app.post("/api/generate-oral-topics", async (req, res) => {
  const { studyText, excludeTitles } = req.body;
  if (!studyText || !studyText.trim()) {
    return res.status(400).json({ error: "Falta el texto de estudio para generar los temas." });
  }

  const customKey = req.headers['x-gemini-api-key'] as string | undefined;
  const excludeList = Array.isArray(excludeTitles) ? excludeTitles : [];
  const cleanText = cleanStudyTextForAnalysis(studyText);
  
  try {
    const ai = getAiClient(customKey);
    const randomSeed = Math.floor(Math.random() * 1000000);
    const excludeInstruction = excludeList.length > 0
      ? `\n\nEXCLUSIÓN OBLIGATORIA DE TEMAS PREVIOS: El usuario ya tiene los siguientes temas: [${excludeList.join(', ')}].\nEs un REQUISITO ESTRICTO que generes 4 temas Y preguntas TOTALMENTE NUEVOS Y DIFERENTES, explorando otras secciones, definiciones, teorías o ejemplos del texto. Semilla de variación: ${randomSeed}.`
      : `\n\nSemilla de variación aleatoria: ${randomSeed}.`;

    const response = await withRetry(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analiza minuciosamente el contenido académico sustantivo del siguiente documento de estudio e identifica sus distintas unidades, capítulos, módulos o ramas temáticas independientes.

REGLAS ESTRUCTURALES Y DE CONTENIDO OBLIGATORIAS:

1. FILTRADO ESTRICTO DE METADATOS Y ENCABEZADOS DE PORTADA:
   - FILTRA Y DESECHA POR COMPLETO títulos administrativos como "Dossier de preguntas", "Dossier", "Cuaderno de cátedra", "Guía de trabajos prácticos", nombres de profesores (ej. "Prof. Laura...", "Profesora X"), materias, universidades, facultades o fechas.
   - NUNCA uses "Dossier", "Guía de preguntas" ni nombres de profesores como títulos de exámenes orales.
   - NUNCA hagas preguntas sobre quién es el profesor, qué es el dossier ni sobre el formato del PDF.

2. IDENTIFICACIÓN Y DIVISIÓN POR RAMAS TEMÁTICAS ACADÉMICAS:
   - Identifica las VERDADERAS unidades académicas sustantivas del texto (ej. "Tema 1: La Revolución Industrial", "Tema 2: Modelos Políticos de Occidente", "Tema 3: Factores Microeconómicos", etc.).
   - Cada uno de los 4 exámenes DEBE estar dedicado EXCLUSIVAMENTE a una rama temático-académica DISTINTA del documento, sin traslaparse con las demás.

3. ENFOQUE Y PREGUNTAS SÚPER ESPECÍFICAS EN SU PROPIA RAMA:
   - Las 5 preguntas de cada examen DEBEN mantenerse 100% enfocadas dentro de los conceptos, definiciones, causas, consecuencias, autores teóricos, procesos, clasificaciones o fórmulas descritos en esa rama académica específica.
   - NUNCA hagas preguntas genéricas ("¿De qué trata el texto?"). Haz preguntas súper específicas sobre los conocimientos de la materia.${excludeInstruction}

Texto de estudio:
${cleanText.substring(0, 50000)}`,
      config: {
        temperature: 0.95,
        systemInstruction: "Eres un diseñador curricular y evaluador académico de élite. Ignora por completo encabezados de portada, la palabra 'Dossier' y nombres de profesores. Identifica las verdaderas unidades académicas del texto y genera exámenes orales 100% enfocados en la materia.",
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: 'ID corto y único (ej. oral_topic_1)' },
              title: { type: Type.STRING, description: 'Título académico del tema (ej: Tema 1: La Revolución Industrial)' },
              description: { type: Type.STRING, description: 'Breve descripción de los conocimientos académicos que se evalúan' },
              questions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Arreglo con exactamente 5 preguntas secuenciales y súper específicas sobre este tema académico'
              }
            },
            required: ['id', 'title', 'description', 'questions']
          }
        }
      }
    }));

    const cleanResult = cleanJsonText(response.text || '');
    return res.json({ text: cleanResult });
  } catch (error: any) {
    console.warn("[Server API Key Alert] Error al generar temas orales con Gemini. Usando generador local inteligente.", error.message || error);
    const fallback = generateFallbackOralTopics(cleanText, excludeList);
    return res.json({ text: JSON.stringify(fallback) });
  }
});

app.post("/api/generate-quiz", async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Falta el texto de estudio para generar el cuestionario." });
  }

  const customKey = req.headers['x-gemini-api-key'] as string | undefined;
  const cleanText = cleanStudyTextForAnalysis(text);

  // Try using real Gemini API first
  try {
    const ai = getAiClient(customKey);
    const response = await withRetry(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Actúa como un profesor experto. Genera un cuestionario de opción múltiple exhaustivo y súper específico basado strictly en el contenido académico sustantivo del texto proporcionado.

REGLAS OBLIGATORIAS:
- FILTRA Y DESECHA POR COMPLETO los títulos de portada, metadatos y referencias administrativas como "Dossier de preguntas", "Dossier", "Cátedra", nombres de profesores, universidades o fechas.
- Las preguntas deben evaluar datos concretos, términos técnicos, clasificaciones y explicaciones académicas de los temas de estudio (ej. Revolución Industrial, conceptos teóricos, etc.). NUNCA preguntes sobre la profesora, el dossier o el formato del documento.

Texto:
${cleanText.substring(0, 50000)}`,
      config: {
        systemInstruction: "Eres un profesor universitario diseñando un examen final riguroso y detallado sobre el contenido temático sustantivo de la materia.",
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING }, 
                description: "Exactamente 4 opciones de respuesta" 
              },
              correctIndex: { type: Type.INTEGER, description: "Índice de la respuesta correcta (0 a 3)" },
              explanation: { type: Type.STRING, description: "Breve explicación de por qué es la respuesta correcta citando el texto" }
            },
            required: ["question", "options", "correctIndex", "explanation"]
          }
        }
      }
    }));

    const cleanResult = cleanJsonText(response.text || '');
    return res.json({ text: cleanResult });
  } catch (error: any) {
    console.warn("[Server API Key Alert] No se pudo utilizar la API de Gemini (o no hay clave). Usando generador local inteligente para el cuestionario.", error.message || error);
    const fallbackQuiz = generateFallbackQuiz(text);
    return res.json({ text: JSON.stringify(fallbackQuiz) });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';
  if (pathname === '/api/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (clientWs: WebSocket, request: any) => {
  console.log("Client connected to WebSocket proxy");
  let liveSession: any = null;

  // Extract apiKey from query string if available
  let customKey: string | undefined;
  try {
    if (request && request.url) {
      const urlObj = new URL(request.url, `http://${request.headers?.host || 'localhost'}`);
      const keyParam = urlObj.searchParams.get('apiKey');
      if (keyParam) {
        customKey = keyParam;
      }
    }
  } catch (err) {
    console.error("Error parsing WebSocket connection URL for apiKey:", err);
  }

  clientWs.on('message', async (message: string) => {
    try {
      const parsed = JSON.parse(message);
      
      if (parsed.type === 'setup') {
        const { mode, text, topics } = parsed.params;
        const cleanText = cleanStudyTextForAnalysis(text || '');
        
        // Define live config based on the modes
        let systemInstruction = "";
        let tools: any[] = [];

        const displayKeyConceptDeclaration = {
          name: "displayKeyConcept",
          description: "Muestra en la pantalla del usuario una palabra principal o la idea clave sintetizada en una frase muy corta, y opcionalmente las palabras clave recomendadas que el usuario debería mencionar en su respuesta.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              keyConcept: {
                type: Type.STRING,
                description: "La palabra clave o la idea principal resumida en una frase muy corta (máximo 5 a 7 palabras) para ser mostrada en pantalla."
              },
              category: {
                type: Type.STRING,
                description: "Etiqueta breve opcional (ej: 'Concepto Clave', 'Pregunta Principal', 'Idea Fuerza', 'Palabra Clave', 'Definición')."
              },
              suggestedKeywords: {
                type: Type.ARRAY,
                items: {
                  type: Type.STRING
                },
                description: "Lista de 2 a 5 palabras o términos clave específicos que el estudiante debería intentar mencionar o abordar al responder la pregunta actual."
              }
            },
            required: ["keyConcept"]
          }
        };
        
        if (mode === 'topics') {
          tools = [{
            functionDeclarations: [
              {
                name: "unlockTopic",
                description: "Desbloquea la imagen de un tema en la interfaz visual cuando el usuario responde correctamente a una pregunta sobre ese tema.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    topicId: {
                      type: Type.STRING,
                      description: "El ID del tema a desbloquear."
                    }
                  },
                  required: ["topicId"]
                }
              },
              displayKeyConceptDeclaration
            ]
          }];
          
          systemInstruction = `Eres un tutor de estudio experto y amigable. El usuario está estudiando un cuaderno con múltiples documentos.
Los temas principales a evaluar son:
${topics ? topics.map((t: any) => `- ID: ${t.id}, Título: ${t.title}, Descripción: ${t.description}`).join('\n') : ''}

Tu objetivo es hacerle un cuestionario al usuario, tema por tema.
Hazle una pregunta sobre el primer tema. Si responde incorrectamente, dale pistas y consejos para ayudarlo a llegar a la respuesta correcta. NO le des la respuesta directamente.
Cuando el usuario responda correctamente a una pregunta sobre un tema, DEBES llamar a la función 'unlockTopic' con el ID de ese tema para desbloquear su imagen en la pantalla. Luego, felicítalo y pasa a hacerle una pregunta sobre el siguiente tema.

DESPLIEGUE VISUAL DE IDEAS CLAVE Y PALABRAS GUÍA EN PANTALLA:
Siempre que expliques un concepto, des una pista o le formules una pregunta al usuario, DEBES llamar a la función 'displayKeyConcept':
1. En 'keyConcept', coloca la palabra clave o la pregunta resumida en una frase muy corta (máximo 5-7 palabras).
2. CADA VEZ QUE LE FORMULES UNA PREGUNTA, DEBES incluir obligatoriamente el parámetro 'suggestedKeywords' con 2 a 5 palabras o términos clave indispensables que el estudiante debería mencionar o responder oralmente. Esto le servirá como una guía visual en pantalla para su respuesta.

IMPORTANTE SOBRE EL TIEMPO DE RESPUESTA: Los humanos a veces hacen pausas largas para pensar. Si el usuario se queda callado a mitad de una oración o la idea parece incompleta, NO lo interrumpas ni evalúes su respuesta todavía. Dile algo como "Tómate tu tiempo..." o "¿Quieres añadir algo más?" y espera a que termine de formular su idea.

Mantén tus respuestas concisas y adecuadas para una conversación hablada en español. Sé proactivo haciendo preguntas si el usuario se queda callado por mucho tiempo sin haber empezado a hablar.

REGLA DE METADATOS:
Ignora encabezados como "Dossier de preguntas", nombres de profesores o datos de portada. Concéntrate exclusivamente en el contenido temático sustantivo.

CUADERNO DE ESTUDIO:
${cleanText ? cleanText.substring(0, 50000) : ''}
`;
        } else if (mode === 'oral_exam') {
          const { selectedTopicTitle, questions } = parsed.params;
          tools = [{
            functionDeclarations: [
              {
                name: "submitOralAnswer",
                description: "Registra la calificación, transcripción y retroalimentación para la pregunta actual del examen oral.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    questionIndex: {
                      type: Type.INTEGER,
                      description: "El índice de la pregunta (0 a 4) que se está respondiendo actualmente."
                    },
                    score: {
                      type: Type.INTEGER,
                      description: "Una calificación numérica del 0 al 100 basada en la calidad y precisión de la respuesta oral del estudiante."
                    },
                    feedback: {
                      type: Type.STRING,
                      description: "Una breve evaluación constructiva (máximo 2 oraciones) explicándole al estudiante qué hizo bien y qué puede mejorar."
                    },
                    userAnswerTranscript: {
                      type: Type.STRING,
                      description: "La transcripción resumida de la respuesta oral que dio el estudiante."
                    },
                    strengths: {
                      type: Type.STRING,
                      description: "Un reporte breve sobre los puntos fuertes de la respuesta del estudiante (qué conceptos, hechos o argumentos explicó correctamente)."
                    },
                    toImprove: {
                      type: Type.STRING,
                      description: "Un informe detallado por escrito de los pequeños temas, detalles concretos o conceptos específicos que le faltaron repasar o que debe mejorar en esta pregunta."
                    }
                  },
                  required: ["questionIndex", "score", "feedback", "userAnswerTranscript", "strengths", "toImprove"]
                }
              },
              displayKeyConceptDeclaration
            ]
          }];

          systemInstruction = `Eres un evaluador académico oral de élite para el tema de examen: "${selectedTopicTitle}".
El estudiante se ha preparado con el material del cuaderno y ahora está realizando un examen oral formal de exactamente 5 preguntas secuenciales.

Las 5 preguntas que debes formular secuencialmente son:
${questions ? questions.map((q: string, i: number) => `Pregunta ${i + 1}: ${q}`).join('\n') : ''}

INSTRUCCIONES DE CONDUCTA DEL EXAMINADOR:
1. Saluda cordialmente al estudiante, dile que vas a evaluar el tema "${selectedTopicTitle}" con 5 preguntas y formula claramente la PREGUNTA 1 (sin dar pistas de la respuesta).
2. Escucha con atención la respuesta oral del estudiante.
   - IMPORTANTE SOBRE PAUSAS: Los humanos a veces hacen pausas para pensar. No los interrumpas si la idea parece incompleta. Sé comprensivo.
3. Una vez que el estudiante haya finalizado su respuesta para la pregunta actual:
   - DEBES invocar la función 'submitOralAnswer' para registrar su respuesta, su puntaje (0-100), tu feedback detallado, una transcripción resumida de su respuesta, los puntos fuertes ('strengths'), y de forma muy específica y detallada, los temas concretos o detalles que le faltan repasar o mejorar en esta pregunta ('toImprove'). Esto es obligatorio para sincronizar la interfaz y guardar el informe escrito.
   - Dale un breve comentario oral de aliento en español (conciso, de tono profesional pero amigable) y formula la SIGUIENTE PREGUNTA.
4. Repite esto hasta haber realizado las 5 preguntas.
5. Al finalizar la última pregunta (después de llamar a 'submitOralAnswer' para el índice 4), haz una síntesis final breve con la nota promedio global de su examen, felicítalo por su esfuerzo y concluye el examen de forma amigable.

DESPLIEGUE VISUAL DE IDEAS CLAVE Y PALABRAS GUÍA EN PANTALLA:
Al formular cada pregunta o dar retroalimentación oral, DEBES llamar a la función 'displayKeyConcept':
- En 'keyConcept', coloca la pregunta o tema principal en una frase muy corta (máximo 5-7 palabras).
- CADA VEZ QUE FORMULES UNA PREGUNTA, DEBES incluir obligatoriamente el parámetro 'suggestedKeywords' con 2 a 5 palabras o términos clave que el estudiante debería mencionar o explicar en su respuesta oral para tener la máxima puntuación. Esto aparecerá destacado en pantalla como su guía de respuesta.

REGLA DE ESPECIFICIDAD DEL TEXTO Y METADATOS:
Evalúa la respuesta del estudiante basándote rigurosamente en el contenido exacto, conceptos, términos técnicos y detalles del tema. NUNCA menciones nombres de profesores, el título "Dossier de preguntas" ni datos de portada.

CUADERNO DE ESTUDIO:
${cleanText ? cleanText.substring(0, 50000) : ''}

Mantén tus respuestas orales sumamente concisas y dinámicas para evitar latencias de voz.`;
        } else {
          // Free voice study buddy mode
          tools = [{
            functionDeclarations: [
              displayKeyConceptDeclaration
            ]
          }];

          systemInstruction = `Eres un tutor de estudio experto y amigable. El usuario ha subido un documento y quiere estudiar dialogando contigo.
Explícale los conceptos, responde sus dudas y hazle preguntas para comprobar su comprensión si lo ves oportuno.

DESPLIEGUE VISUAL DE IDEAS CLAVE EN PANTALLA:
Siempre que expliques un concepto, des una respuesta o hagas una observación verbal, DEBES invocar frecuentemente la función 'displayKeyConcept' enviando la palabra clave o la idea principal resumida en una frase muy corta (2 a 6 palabras). Esto es fundamental para que el usuario vea escritas en pantalla las palabras o frases principales en tiempo real mientras te escucha hablar.

IMPORTANTE SOBRE EL TIEMPO DE RESPUESTA: Los humanos a veces hacen pausas largas para pensar. Si el usuario se queda callado a mitad de una oración o la idea parece incompleta, NO lo interrumpas ni asumas que ha terminado. Dile algo como "Tómate tu tiempo..." o "¿Quieres añadir algo más?" y espera a que termine de formular su idea.

Mantén tus respuestas concisas y adecuadas para una conversación hablada en español. Sé proactivo haciendo preguntas si el usuario se queda callado por mucho tiempo sin haber empezado a hablar.

REGLA DE METADATOS:
Ignora encabezados como "Dossier de preguntas", nombres de profesores o datos de portada. Concéntrate exclusivamente en el contenido temático sustantivo de la materia.

CUADERNO DE ESTUDIO:
${cleanText ? cleanText.substring(0, 50000) : ''}
`;
        }

        try {
          const ai = getAiClient(customKey);
          liveSession = await ai.live.connect({
            model: "gemini-3.1-flash-live-preview",
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
              },
              tools: tools.length > 0 ? tools : undefined,
              systemInstruction,
            },
            callbacks: {
              onopen: () => {
                clientWs.send(JSON.stringify({ type: 'open' }));
              },
              onmessage: (serverMessage: LiveServerMessage) => {
                clientWs.send(JSON.stringify({ type: 'message', data: serverMessage }));
              },
              onclose: () => {
                clientWs.send(JSON.stringify({ type: 'close' }));
              },
              onerror: (err) => {
                clientWs.send(JSON.stringify({ type: 'error', data: err?.message || String(err) }));
              }
            }
          });
        } catch (connErr: any) {
          console.error("Gemini Live connection failed:", connErr);
          clientWs.send(JSON.stringify({ type: 'error', data: `Error al conectar con la API de Gemini Live: ${connErr.message || connErr}` }));
        }
      } else if (parsed.type === 'realtimeInput') {
        if (liveSession) {
          liveSession.sendRealtimeInput(parsed.data);
        }
      } else if (parsed.type === 'toolResponse') {
        if (liveSession) {
          liveSession.sendToolResponse(parsed.data);
        }
      }
    } catch (err: any) {
      console.error("WebSocket proxy error processing client message:", err);
    }
  });

  clientWs.on('close', () => {
    console.log("Client disconnected from WebSocket proxy");
    if (liveSession) {
      liveSession.close();
      liveSession = null;
    }
  });
});

async function startViteDevServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startViteDevServer();
