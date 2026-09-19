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

  // 1. Google Docs
  if (mimeType === 'application/vnd.google-apps.document') {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`;
    const res = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`No se pudo exportar el Google Doc "${name}". (${res.status})`);
    }
    const text = await res.text();
    return { text, fileName: name.endsWith('.txt') ? name : `${name}.txt` };
  }

  // 2. Google Presentations (Slides)
  if (mimeType === 'application/vnd.google-apps.presentation') {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`;
    const res = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`No se pudo exportar la presentación "${name}". (${res.status})`);
    }
    const text = await res.text();
    return { text, fileName: `${name}.txt` };
  }

  // 3. Google Spreadsheets (Sheets)
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/csv`;
    const res = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`No se pudo exportar la hoja de cálculo "${name}". (${res.status})`);
    }
    const text = await res.text();
    return { text, fileName: `${name}.csv` };
  }

  // 4. Binary files (PDF, Word, TXT, CSV, etc.) stored in Drive
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Error al descargar el archivo "${name}" de Google Drive (${res.status})`);
  }

  const blob = await res.blob();
  const fileObj = new File([blob], name, { type: blob.type || mimeType });
  const text = await extractTextFromFile(fileObj);

  return { text, fileName: name };
}
