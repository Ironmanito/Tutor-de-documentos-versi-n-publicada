import { Storage } from "@google-cloud/storage";
import type { StorageOptions } from "@google-cloud/storage";
import fs from "fs";
import path from "path";

let storageClient: Storage | null = null;
let isGcsWriteDisabled = false;
let gcsWarnLogged = false;

/**
 * Handles GOOGLE_APPLICATION_CREDENTIALS whether it's a file path or the full JSON string.
 * If a JSON string is passed, it writes it to a real file path and configures Storage options.
 */
export function resolveGoogleCredentials(): { options?: StorageOptions; parsedCreds?: any } {
  const envCreds =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GCS_KEY_FILE ||
    process.env.GCP_SERVICE_ACCOUNT ||
    process.env.GCS_CREDENTIALS;

  if (!envCreds) {
    return {};
  }

  const trimmed = envCreds.trim();

  // Check if credentials are provided as raw JSON string (starts with '{')
  if (trimmed.startsWith("{") && trimmed.includes("service_account")) {
    try {
      const parsed = JSON.parse(trimmed);

      // Write to an actual local file so any internal google-auth-library checks find a real file
      const credFilePath = path.join(process.cwd(), ".gcp_service_account.json");
      try {
        fs.writeFileSync(credFilePath, trimmed, "utf8");
        process.env.GOOGLE_APPLICATION_CREDENTIALS = credFilePath;
      } catch (e) {
        const fallbackPath = "/tmp/gcp_service_account.json";
        fs.writeFileSync(fallbackPath, trimmed, "utf8");
        process.env.GOOGLE_APPLICATION_CREDENTIALS = fallbackPath;
      }

      return {
        options: {
          credentials: {
            client_email: parsed.client_email,
            private_key: parsed.private_key
          },
          projectId: parsed.project_id
        },
        parsedCreds: parsed
      };
    } catch (parseErr) {
      console.warn("[GCS Storage] Advertencia al parsear JSON de credenciales de Google Cloud:", parseErr);
    }
  }

  return {};
}

// Pre-resolve immediately upon loading
resolveGoogleCredentials();

export function getStorageClient(): Storage {
  if (!storageClient) {
    const { options } = resolveGoogleCredentials();
    if (options && options.credentials) {
      storageClient = new Storage(options);
    } else {
      // In Google Cloud Run, Application Default Credentials (ADC) are automatically provided
      storageClient = new Storage();
    }
  }
  return storageClient;
}

export function resetStorageClient() {
  storageClient = null;
  isGcsWriteDisabled = false;
  gcsWarnLogged = false;
}

export function getBucketName(): string | null {
  return (
    process.env.GCS_BUCKET_NAME ||
    process.env.GOOGLE_CLOUD_STORAGE_BUCKET ||
    process.env.STORAGE_BUCKET ||
    null
  );
}

export interface UploadResult {
  success: boolean;
  fileName: string;
  originalName: string;
  gcsUri?: string;
  publicUrl?: string;
  size?: number;
  contentType?: string;
  error?: string;
}

/**
 * Uploads a file directly to Google Cloud Storage instead of using local fs.writeFile().
 * Compatible with PDFs, DOCX, TXT, images, and other study materials.
 */
export async function uploadFileToGCS(
  originalName: string,
  buffer: Buffer,
  mimeType: string = "application/octet-stream",
  folder: string = "uploads"
): Promise<UploadResult> {
  const bucketName = getBucketName();
  if (!bucketName) {
    return {
      success: false,
      originalName,
      fileName: originalName,
      error: "Variable de entorno GCS_BUCKET_NAME no configurada."
    };
  }

  try {
    const storage = getStorageClient();
    const bucket = storage.bucket(bucketName);

    const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const destination = `${folder}/${Date.now()}_${sanitizedName}`;
    const file = bucket.file(destination);

    await file.save(buffer, {
      contentType: mimeType,
      resumable: false,
      metadata: {
        cacheControl: "public, max-age=31536000",
        uploadedVia: "tutor-de-cuaderno-gcs"
      }
    });

    const gcsUri = `gs://${bucketName}/${destination}`;
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;

    console.log(`[Google Cloud Storage] Archivo "${originalName}" guardado en ${gcsUri}`);

    return {
      success: true,
      originalName,
      fileName: destination,
      gcsUri,
      publicUrl,
      size: buffer.length,
      contentType: mimeType
    };
  } catch (err: any) {
    if (err?.code === 403 || err?.code === 404) {
      if (!gcsWarnLogged) {
        console.warn(`[Google Cloud Storage] Aviso: El bucket "${bucketName}" no permite escritura o no existe (código ${err.code}). Los datos se guardan y preservan de forma local.`);
        gcsWarnLogged = true;
      }
      isGcsWriteDisabled = true;
    } else {
      console.warn(`[Google Cloud Storage] Advertencia al subir archivo "${originalName}":`, err.message || err);
    }
    return {
      success: false,
      originalName,
      fileName: originalName,
      error: err.message || String(err)
    };
  }
}

/**
 * Saves user study notebooks database directly to Google Cloud Storage.
 */
export async function saveUserDbToGCS(dbData: any): Promise<boolean> {
  const bucketName = getBucketName();
  if (!bucketName || isGcsWriteDisabled) return false;

  try {
    const storage = getStorageClient();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file("database/user_studies_db.json");

    await file.save(Buffer.from(JSON.stringify(dbData, null, 2), "utf8"), {
      contentType: "application/json",
      resumable: false
    });
    return true;
  } catch (err: any) {
    if (err?.code === 403 || err?.code === 404) {
      if (!gcsWarnLogged) {
        console.warn(`[GCS Storage] Aviso: Permisos insuficientes en bucket "${bucketName}" (código ${err.code}). Usando almacenamiento local persistente.`);
        gcsWarnLogged = true;
      }
      isGcsWriteDisabled = true;
    } else {
      console.warn("[Google Cloud Storage] Advertencia al guardar base de datos en GCS:", err.message || err);
    }
    return false;
  }
}

/**
 * Saves user profiles tracking database to GCS.
 */
export async function saveUsersDbToGCS(usersData: any): Promise<boolean> {
  const bucketName = getBucketName();
  if (!bucketName || isGcsWriteDisabled) return false;
  try {
    const storage = getStorageClient();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file("database/user_profiles_db.json");
    await file.save(Buffer.from(JSON.stringify(usersData, null, 2), "utf8"), {
      contentType: "application/json",
      resumable: false
    });
    return true;
  } catch (err: any) {
    if (err?.code === 403 || err?.code === 404) {
      if (!gcsWarnLogged) {
        console.warn(`[GCS Storage] Aviso: Permisos insuficientes en bucket "${bucketName}" (código ${err.code}). Usando almacenamiento local persistente.`);
        gcsWarnLogged = true;
      }
      isGcsWriteDisabled = true;
    } else {
      console.warn("[GCS] Advertencia al guardar perfiles de usuario:", err.message || err);
    }
    return false;
  }
}

export async function readUsersDbFromGCS(): Promise<any | null> {
  const bucketName = getBucketName();
  if (!bucketName) return null;
  try {
    const storage = getStorageClient();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file("database/user_profiles_db.json");
    const [exists] = await file.exists();
    if (!exists) return null;
    const [content] = await file.download();
    return JSON.parse(content.toString("utf8"));
  } catch (err: any) {
    return null;
  }
}

/**
 * Saves feedback submissions database to GCS.
 */
export async function saveFeedbackDbToGCS(feedbackData: any): Promise<boolean> {
  const bucketName = getBucketName();
  if (!bucketName || isGcsWriteDisabled) return false;
  try {
    const storage = getStorageClient();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file("database/user_feedback_db.json");
    await file.save(Buffer.from(JSON.stringify(feedbackData, null, 2), "utf8"), {
      contentType: "application/json",
      resumable: false
    });
    return true;
  } catch (err: any) {
    if (err?.code === 403 || err?.code === 404) {
      if (!gcsWarnLogged) {
        console.warn(`[GCS Storage] Aviso: Permisos insuficientes en bucket "${bucketName}" (código ${err.code}). Usando almacenamiento local persistente.`);
        gcsWarnLogged = true;
      }
      isGcsWriteDisabled = true;
    } else {
      console.warn("[GCS] Advertencia al guardar feedback en GCS:", err.message || err);
    }
    return false;
  }
}

export async function readFeedbackDbFromGCS(): Promise<any | null> {
  const bucketName = getBucketName();
  if (!bucketName) return null;
  try {
    const storage = getStorageClient();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file("database/user_feedback_db.json");
    const [exists] = await file.exists();
    if (!exists) return null;
    const [content] = await file.download();
    return JSON.parse(content.toString("utf8"));
  } catch (err: any) {
    return null;
  }
}

/**
 * Reads user study notebooks database directly from Google Cloud Storage.
 */
export async function readUserDbFromGCS(): Promise<any | null> {
  const bucketName = getBucketName();
  if (!bucketName) return null;

  try {
    const storage = getStorageClient();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file("database/user_studies_db.json");
    const [exists] = await file.exists();
    if (!exists) return null;

    const [content] = await file.download();
    const parsed = JSON.parse(content.toString("utf8"));
    console.log(`[Google Cloud Storage] Base de datos sincronizada desde gs://${bucketName}/database/user_studies_db.json`);
    return parsed;
  } catch (err: any) {
    return null;
  }
}

export function getStorageStatus() {
  const bucketName = getBucketName();
  return {
    isConfigured: !!bucketName,
    bucketName: bucketName,
    provider: "Google Cloud Storage",
    library: "@google-cloud/storage",
    cloudRunReady: true,
    hasWritePermission: !isGcsWriteDisabled
  };
}
