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

/**
 * Gets cached studies from localStorage for instant display
 */
export function getLocalCachedStudies(userKey?: string | null): SavedStudyRecord[] {
  if (!userKey) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userKey.trim().toLowerCase());
    if (raw) {
      return JSON.parse(raw);
    }
    // Fallback to legacy key
    const legacy = localStorage.getItem('tutor_user_studies');
    if (legacy) {
      return JSON.parse(legacy);
    }
  } catch (e) {
    console.warn('[Storage] Error reading local cache:', e);
  }
  return [];
}

/**
 * Saves studies to localStorage cache
 */
export function setLocalCachedStudies(userKey: string, studies: SavedStudyRecord[]) {
  if (!userKey) return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + userKey.trim().toLowerCase(), JSON.stringify(studies));
    localStorage.setItem('tutor_user_studies', JSON.stringify(studies));
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
