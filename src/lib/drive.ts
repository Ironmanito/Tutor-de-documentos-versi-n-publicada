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
  const extractRes = await fetch("/api/extract-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: data.fileName,
      fileData: data.fileData,
      mimeType: data.mimeType
    })
  });

  if (!extractRes.ok) {
    const errData = await extractRes.json().catch(() => ({}));
    throw new Error(errData.error || `Error al procesar el archivo "${name}" (${extractRes.status})`);
  }

  const extractData = await extractRes.json();
  return {
    text: extractData.text || '',
    fileName: name
  };
}
