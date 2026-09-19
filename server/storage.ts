import { Storage } from "@google-cloud/storage";

let storageClient: Storage | null = null;

export function getStorageClient(): Storage {
  if (!storageClient) {
    // When running in Google Cloud Run, Application Default Credentials (ADC)
    // are automatically provided by the compute service account.
    // For local development or custom setups, GOOGLE_APPLICATION_CREDENTIALS can be set.
    storageClient = new Storage();
  }
  return storageClient;
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
    console.error(`[Google Cloud Storage] Error al subir archivo "${originalName}":`, err);
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
  if (!bucketName) return false;

  try {
    const storage = getStorageClient();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file("database/user_studies_db.json");

    await file.save(Buffer.from(JSON.stringify(dbData, null, 2), "utf8"), {
      contentType: "application/json",
      resumable: false
    });
    console.log(`[Google Cloud Storage] Base de datos guardada en gs://${bucketName}/database/user_studies_db.json`);
    return true;
  } catch (err: any) {
    console.error("[Google Cloud Storage] Error al guardar base de datos en GCS:", err);
    return false;
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
    console.error("[Google Cloud Storage] Error al leer base de datos desde GCS:", err);
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
    cloudRunReady: true
  };
}
