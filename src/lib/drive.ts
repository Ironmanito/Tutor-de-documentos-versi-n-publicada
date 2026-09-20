import { extractTextFromFile } from './pdf';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  iconLink?: string;
  thumbnailLink?: string;
  size?: string;
}

/**
 * Fetch files from the authenticated user's Google Drive.
 */
export async function listDriveFiles(
  accessToken: string,
  searchQuery: string = '',
  pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  let q = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
  
  if (searchQuery.trim()) {
    const safeQuery = searchQuery.replace(/'/g, "\\'");
    q += ` and name contains '${safeQuery}'`;
  }

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'nextPageToken, files(id, name, mimeType, modifiedTime, iconLink, thumbnailLink, size)');
  url.searchParams.set('pageSize', '30');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("UNAUTHORIZED_TOKEN");
    }
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Error al obtener archivos de Google Drive (${response.status})`);
  }

  const data = await response.json();
  return {
    files: data.files || [],
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Import and extract text content from a Google Drive file.
 */
export async function importDriveFile(
  accessToken: string,
  file: DriveFile
): Promise<{ text: string; fileName: string }> {
  const { id, name, mimeType } = file;

  // Call the server-side download endpoint which bypasses CORS, handles Google Workspace formats, and retrieves binaries cleanly
  const res = await fetch("/api/download-drive-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileId: id,
      accessToken,
      fileName: name,
      mimeType
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error al descargar el archivo "${name}" de Google Drive (${res.status})`);
  }

  const data = await res.json();
  if (data.isText) {
    return {
      text: data.text || '',
      fileName: data.fileName || `${name}.txt`
    };
  }

  // If binary (PDF, Word, etc.), send base64 data to /api/extract-pdf
  const userApiKey = typeof window !== 'undefined' ? (localStorage.getItem('user_gemini_api_key') || '') : '';
  const extractHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (userApiKey) {
    extractHeaders["x-gemini-api-key"] = userApiKey;
  }

  let extractRes: Response;
  try {
    extractRes = await fetch("/api/extract-pdf", {
      method: "POST",
      headers: extractHeaders,
      body: JSON.stringify({
        fileName: data.fileName,
        fileData: data.fileData,
        mimeType: data.mimeType,
        apiKey: userApiKey || undefined
      })
    });
  } catch (netErr: any) {
    throw new Error(`Error de conexión al procesar el archivo "${name}": ${netErr.message || 'Verifica tu red'}`);
  }

  const contentType = extractRes.headers.get("content-type") || "";
  const rawText = await extractRes.text().catch(() => "");
  let extractData: any = null;

  if (contentType.includes("application/json") || (rawText.startsWith("{") && rawText.endsWith("}"))) {
    try {
      extractData = JSON.parse(rawText);
    } catch (_) {
      extractData = null;
    }
  }

  if (!extractRes.ok) {
    if (extractData && extractData.error) {
      throw new Error(extractData.error);
    }
    if (extractRes.status === 413 || rawText.includes("413")) {
      throw new Error(`El archivo de Google Drive "${name}" supera el tamaño máximo permitido (~30 MB).`);
    }
    if (extractRes.status === 504 || rawText.includes("504")) {
      throw new Error(`El tiempo de procesamiento del archivo de Google Drive "${name}" superó el límite permitido.`);
    }
    throw new Error(`Error al procesar el archivo "${name}" (${extractRes.status})`);
  }

  if (!extractData) {
    throw new Error(`El servidor devolvió una respuesta no válida al procesar "${name}".`);
  }

  return {
    text: extractData.text || '',
    fileName: name
  };
}
