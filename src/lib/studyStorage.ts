import { doc, setDoc, getDocs, deleteDoc, collection, query, orderBy } from 'firebase/firestore';
import { db, auth, ensureFirebaseAuth } from './firebase';

export interface SavedStudyRecord {
  id: string;
  userId?: string;
  userEmail?: string;
  title: string;
  files: { name: string; size: number; type?: string }[];
  studyText: string;
  fileTexts?: Record<string, string>;
  activeFileNames?: string[];
  topics?: any[];
  unlockedTopics?: string[];
  savedQuizQuestions?: any[];
  suggestedOralTopics?: any[];
  oralExamSessions?: any[];
  activeOralSession?: any;
  viewMode?: string;
  createdAt: string;
  updatedAt?: string;
  cloudSynced?: boolean;
}

const STORAGE_KEY_PREFIX = 'tutor_saved_studies_';
export const ACTIVE_SESSION_KEY = 'tutor_active_study_session';
export const GLOBAL_STUDIES_KEY = 'tutor_global_studies_index';

export interface ActiveSessionData {
  id?: string | null;
  title: string;
  files: { name: string; size: number; type?: string }[];
  studyText: string;
  fileTexts?: Record<string, string>;
  activeFileNames?: string[];
  topics?: any[];
  unlockedTopics?: string[];
  savedQuizQuestions?: any[];
  suggestedOralTopics?: any[];
  oralExamSessions?: any[];
  activeOralSession?: any | null;
  viewMode?: string;
  lastSavedAt: string;
}

/**
 * Saves the active working notebook to local storage immediately.
 * Ensures that if Render redeploys or the page refreshes, the user does not lose their current work.
 */
export function saveActiveSession(session: ActiveSessionData) {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('[Storage] Error guardando sesión activa local:', e);
  }
}

/**
 * Retrieves the last active study session from local storage.
 */
export function loadActiveSession(): ActiveSessionData | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && (data.studyText || (data.files && data.files.length > 0) || data.id || data.title)) {
        return data;
      }
    }
  } catch (e) {
    console.warn('[Storage] Error cargando sesión activa local:', e);
  }
  return null;
}

/**
 * Clears the active session from local storage (e.g. when starting a new notebook).
 */
export function clearActiveSession() {
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch (e) {
    console.warn('[Storage] Error limpiando sesión activa local:', e);
  }
}

/**
 * Gets cached studies from localStorage for instant display across multiple keys
 */
export function getLocalCachedStudies(userKey?: string | null): SavedStudyRecord[] {
  const result: SavedStudyRecord[] = [];
  const seenIds = new Set<string>();

  const addStudies = (studies: SavedStudyRecord[]) => {
    if (Array.isArray(studies)) {
      for (const s of studies) {
        if (s && s.id && !seenIds.has(s.id)) {
          seenIds.add(s.id);
          result.push(s);
        }
      }
    }
  };

  try {
    // 1. User specific key
    if (userKey) {
      const rawUser = localStorage.getItem(STORAGE_KEY_PREFIX + userKey.trim().toLowerCase());
      if (rawUser) addStudies(JSON.parse(rawUser));
    }

    // 2. Global registry key
    const rawGlobal = localStorage.getItem(GLOBAL_STUDIES_KEY);
    if (rawGlobal) addStudies(JSON.parse(rawGlobal));

    // 3. Guest key
    const rawGuest = localStorage.getItem(STORAGE_KEY_PREFIX + 'guest');
    if (rawGuest) addStudies(JSON.parse(rawGuest));

    // 4. Legacy key
    const legacy = localStorage.getItem('tutor_user_studies');
    if (legacy) addStudies(JSON.parse(legacy));
  } catch (e) {
    console.warn('[Storage] Error reading local cache:', e);
  }
  return result;
}

/**
 * Saves studies to localStorage cache (user key and global index)
 */
export function setLocalCachedStudies(userKey: string, studies: SavedStudyRecord[]) {
  try {
    const cleanUser = userKey ? userKey.trim().toLowerCase() : 'guest';
    localStorage.setItem(STORAGE_KEY_PREFIX + cleanUser, JSON.stringify(studies));
    localStorage.setItem('tutor_user_studies', JSON.stringify(studies));

    // Also update global master registry merging any existing studies
    const currentGlobal = getLocalCachedStudies();
    const globalIds = new Set(studies.map(s => s.id));
    const mergedGlobal = [...studies];
    for (const g of currentGlobal) {
      if (!globalIds.has(g.id)) {
        mergedGlobal.push(g);
      }
    }
    localStorage.setItem(GLOBAL_STUDIES_KEY, JSON.stringify(mergedGlobal));
  } catch (e) {
    console.warn('[Storage] Error saving local cache:', e);
  }
}

/**
 * Saves a study notebook to Google Cloud Firestore, Server DB, and LocalStorage
 */
export async function saveStudyNotebook(
  study: SavedStudyRecord,
  user: { uid?: string | null; email?: string | null }
): Promise<{ success: boolean; firestoreSaved: boolean; serverSaved: boolean }> {
  const email = (user.email || '').trim().toLowerCase();
  let uid = user.uid || auth.currentUser?.uid;
  if (!uid) {
    try {
      const anonUser = await ensureFirebaseAuth();
      if (anonUser) uid = anonUser.uid;
    } catch (e) {
      console.warn('[Storage] Anonymous auth failed:', e);
    }
  }
  const userKey = email || uid || 'guest';

  let firestoreSaved = false;
  let serverSaved = false;

  const nowIso = new Date().toISOString();
  const completeStudy: SavedStudyRecord = {
    ...study,
    userId: uid || undefined,
    userEmail: email || undefined,
    updatedAt: nowIso,
    createdAt: study.createdAt || nowIso,
    cloudSynced: false
  };

  // 1. Save to Google Cloud Firestore if user is authenticated
  if (uid) {
    try {
      const studyRef = doc(db, 'users', uid, 'studies', study.id);
      // Clean undefined fields for Firestore
      const firestoreData: Record<string, any> = {
        id: study.id,
        userId: uid,
        title: study.title || 'Cuaderno de estudio',
        files: study.files || [],
        studyText: study.studyText || '',
        fileTexts: study.fileTexts || {},
        activeFileNames: study.activeFileNames || [],
        topics: study.topics || [],
        unlockedTopics: study.unlockedTopics || [],
        savedQuizQuestions: study.savedQuizQuestions || [],
        suggestedOralTopics: study.suggestedOralTopics || [],
        oralExamSessions: study.oralExamSessions || [],
        activeOralSession: study.activeOralSession || null,
        viewMode: study.viewMode || 'setup',
        createdAt: study.createdAt || nowIso,
        updatedAt: nowIso
      };

      await setDoc(studyRef, firestoreData, { merge: true });
      firestoreSaved = true;
      completeStudy.cloudSynced = true;
      console.log(`[Google Cloud Firestore] Cuaderno "${study.title}" guardado en Google Cloud.`);
    } catch (err: any) {
      console.warn('[Google Cloud Firestore] Error guardando en Firestore:', err.message || err);
    }
  }

  // 2. Save to Server DB (/api/history)
  if (email) {
    try {
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, study: completeStudy })
      });
      if (res.ok) {
        serverSaved = true;
      }
    } catch (e) {
      console.warn('[Server History] Error sincronizando con el servidor:', e);
    }
  }

  // 3. Update Local Cache
  try {
    const cached = getLocalCachedStudies(userKey);
    const existingIdx = cached.findIndex(s => s.id === study.id);
    let updated: SavedStudyRecord[];
    if (existingIdx !== -1) {
      updated = [...cached];
      updated[existingIdx] = completeStudy;
    } else {
      updated = [completeStudy, ...cached];
    }
    setLocalCachedStudies(userKey, updated);

    // Also persist as active session so reload or redeploy immediately restores it
    saveActiveSession({
      id: completeStudy.id,
      title: completeStudy.title,
      files: completeStudy.files || [],
      studyText: completeStudy.studyText || '',
      fileTexts: completeStudy.fileTexts || {},
      activeFileNames: completeStudy.activeFileNames || [],
      topics: completeStudy.topics || [],
      unlockedTopics: completeStudy.unlockedTopics || [],
      savedQuizQuestions: completeStudy.savedQuizQuestions || [],
      suggestedOralTopics: completeStudy.suggestedOralTopics || [],
      oralExamSessions: completeStudy.oralExamSessions || [],
      activeOralSession: completeStudy.activeOralSession || null,
      viewMode: completeStudy.viewMode || 'setup',
      lastSavedAt: nowIso
    });
  } catch (e) {
    console.warn('[Storage] Error actualizando cache local:', e);
  }

  return {
    success: firestoreSaved || serverSaved,
    firestoreSaved,
    serverSaved
  };
}

/**
 * Loads all studies for a user from Google Cloud Firestore, Server API, and LocalStorage.
 * Automatically synchronizes and migrates any server/local studies to Firestore.
 */
export async function loadUserNotebooks(
  user: { uid?: string | null; email?: string | null }
): Promise<{ studies: SavedStudyRecord[]; fromCloud: boolean }> {
  const email = (user.email || '').trim().toLowerCase();
  let uid = user.uid || auth.currentUser?.uid;
  if (!uid) {
    try {
      const anonUser = await ensureFirebaseAuth();
      if (anonUser) uid = anonUser.uid;
    } catch (e) {
      console.warn('[Storage] Anonymous auth failed on load:', e);
    }
  }
  const userKey = email || uid || 'guest';

  // Instant load from local cache
  const localStudies = getLocalCachedStudies(userKey);
  const studiesMap = new Map<string, SavedStudyRecord>();

  // Populate map with local studies first
  for (const s of localStudies) {
    studiesMap.set(s.id, s);
  }

  let fromCloud = false;
  const firestoreStudies: SavedStudyRecord[] = [];

  // 1. Fetch from Google Cloud Firestore
  if (uid) {
    try {
      const studiesColl = collection(db, 'users', uid, 'studies');
      const q = query(studiesColl);
      const snapshot = await getDocs(q);

      snapshot.forEach(docSnap => {
        const data = docSnap.data() as SavedStudyRecord;
        if (data && data.id) {
          data.cloudSynced = true;
          firestoreStudies.push(data);
          studiesMap.set(data.id, data);
        }
      });

      if (firestoreStudies.length > 0) {
        fromCloud = true;
        console.log(`[Google Cloud Firestore] ${firestoreStudies.length} cuadernos cargados desde Google Cloud.`);
      }
    } catch (err: any) {
      console.warn('[Google Cloud Firestore] Error leyendo de Firestore:', err.message || err);
    }
  }

  // 2. Fetch from Server API (/api/history)
  const serverStudies: SavedStudyRecord[] = [];
  if (email) {
    try {
      const res = await fetch(`/api/history?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.studies)) {
          for (const s of data.studies) {
            serverStudies.push(s);
            // If not in Firestore or local is newer, add/merge
            if (!studiesMap.has(s.id)) {
              studiesMap.set(s.id, s);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Server History] Error consultando /api/history:', err);
    }

    // 2b. SERVER REHYDRATION (Fix for Render redeploy data loss):
    // If the server container was just rebuilt on Render, its local disk was wiped clean.
    // We immediately push our persistent local/cloud studies back to the server so /api/history has them!
    if (studiesMap.size > 0 && serverStudies.length < studiesMap.size) {
      const serverIds = new Set(serverStudies.map(s => s.id));
      for (const [id, study] of studiesMap.entries()) {
        if (!serverIds.has(id)) {
          console.log(`[Auto-Rehydrate] Resincronizando cuaderno local "${study.title}" con el servidor...`);
          fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, study })
          }).catch(e => console.warn('[Auto-Rehydrate] Error rehidratando servidor:', e));
        }
      }
    }
  }

  // 3. AUTO-MIGRATION: If we have studies from server or local that are NOT yet in Firestore, upload them!
  if (uid) {
    const firestoreIds = new Set(firestoreStudies.map(s => s.id));
    for (const [id, study] of studiesMap.entries()) {
      if (!firestoreIds.has(id)) {
        console.log(`[Auto-Sync] Migrando cuaderno "${study.title}" a Google Cloud Firestore...`);
        try {
          const studyRef = doc(db, 'users', uid, 'studies', id);
          const cleanDoc: Record<string, any> = {
            id: study.id,
            userId: uid,
            title: study.title || 'Cuaderno',
            files: study.files || [],
            studyText: study.studyText || '',
            fileTexts: study.fileTexts || {},
            activeFileNames: study.activeFileNames || [],
            topics: study.topics || [],
            unlockedTopics: study.unlockedTopics || [],
            savedQuizQuestions: study.savedQuizQuestions || [],
            suggestedOralTopics: study.suggestedOralTopics || [],
            oralExamSessions: study.oralExamSessions || [],
            activeOralSession: study.activeOralSession || null,
            viewMode: study.viewMode || 'setup',
            createdAt: study.createdAt || new Date().toISOString(),
            updatedAt: study.updatedAt || new Date().toISOString()
          };
          await setDoc(studyRef, cleanDoc, { merge: true });
          study.cloudSynced = true;
          fromCloud = true;
        } catch (migErr) {
          console.warn(`[Auto-Sync] No se pudo migrar cuaderno ${id} a Firestore:`, migErr);
        }
      }
    }
  }

  // Sort by updatedAt or createdAt descending
  const sorted = Array.from(studiesMap.values()).sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  // Update local cache with complete merged data
  setLocalCachedStudies(userKey, sorted);

  return { studies: sorted, fromCloud };
}

/**
 * Deletes a study from Google Cloud Firestore, Server API, and LocalStorage
 */
export async function deleteStudyNotebook(
  studyId: string,
  user: { uid?: string | null; email?: string | null }
): Promise<boolean> {
  const email = (user.email || '').trim().toLowerCase();
  const uid = user.uid || auth.currentUser?.uid;
  const userKey = email || uid || 'guest';

  // 1. Delete from Firestore
  if (uid) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'studies', studyId));
      console.log(`[Google Cloud Firestore] Cuaderno ${studyId} eliminado de Google Cloud.`);
    } catch (e) {
      console.warn('[Google Cloud Firestore] Error eliminando de Firestore:', e);
    }
  }

  // 2. Delete from Server API
  if (email) {
    try {
      await fetch('/api/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, studyId })
      });
    } catch (e) {
      console.warn('[Server History] Error eliminando en servidor:', e);
    }
  }

  // 3. Delete from Local Cache
  try {
    const cached = getLocalCachedStudies(userKey);
    const updated = cached.filter(s => s.id !== studyId);
    setLocalCachedStudies(userKey, updated);
  } catch (e) {
    console.warn('[Storage] Error actualizando cache local al eliminar:', e);
  }

  return true;
}
