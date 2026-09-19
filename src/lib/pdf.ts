import { getAccessToken } from './firebase';

export async function extractTextFromPDF(file: File): Promise<string> {
  // Check if file is empty or 0 bytes (common with unsynced Google Drive files or Google Docs shortcuts)
  if (file.size === 0) {
    throw new Error(
      `El archivo "${file.name}" está vacío (tiene 0 bytes). ` +
      `Si este archivo proviene de Google Drive o es un acceso directo de Google Docs, por favor descárgalo ` +
      `en tu dispositivo (o expórtalo como PDF real) antes de subirlo.`
    );
  }

  // Convert File to Base64 in a non-blocking, safe way compatible with all browsers
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (!result) {
        reject(new Error("No se pudo leer el archivo (el resultado de lectura está vacío)."));
        return;
      }
      const parts = result.split(',');
      if (parts.length < 2) {
        reject(new Error("El formato del archivo leído no es un DataURL válido."));
        return;
      }
      const base64Data = parts[1];
      if (!base64Data || base64Data.trim() === "") {
        reject(new Error(
          `El contenido del archivo "${file.name}" no pudo convertirse a base64 (está vacío). ` +
          `Por favor verifica que no sea un archivo en la nube no descargado.`
        ));
        return;
      }
      resolve(base64Data);
    };
    reader.onerror = () => reject(new Error("Error al leer el archivo desde el navegador."));
    reader.readAsDataURL(file);
  });

  // Call the server-side extraction endpoint which supports PDF and Word (.docx) and uploads to GCS
  const res = await fetch("/api/extract-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileData: base64, mimeType: file.type || undefined })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error del servidor al extraer el archivo (${res.status})`);
  }

  const data = await res.json();
  if (data.gcsUri) {
    (file as any).gcsUri = data.gcsUri;
    (file as any).publicUrl = data.publicUrl;
  }
  return data.text || '';
}

export async function importGoogleDocFromUrl(url: string): Promise<{ text: string; title: string }> {
  if (!url || !url.trim()) {
    throw new Error("Ingresa un enlace válido de Google Docs.");
  }

  const token = getAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch("/api/import-google-doc", {
    method: "POST",
    headers,
    body: JSON.stringify({ url: url.trim(), accessToken: token || undefined })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error al importar Google Doc (${res.status})`);
  }

  const data = await res.json();
  return {
    text: data.text || '',
    title: data.title || 'Google_Doc.txt'
  };
}

export async function extractTextFromFile(file: File): Promise<string> {
  const fileNameLower = file.name.toLowerCase();

  // Handle Google Doc shortcut files (.gdoc)
  if (fileNameLower.endsWith('.gdoc')) {
    try {
      const rawText = await file.text();
      let docUrl = '';
      
      try {
        const json = JSON.parse(rawText);
        docUrl = json.url || json.doc_id || json.resource_id || '';
      } catch (_) {
        const match = rawText.match(/https?:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+/i);
        if (match) {
          docUrl = match[0];
        }
      }

      if (docUrl) {
        const imported = await importGoogleDocFromUrl(docUrl);
        return imported.text;
      } else if (rawText && rawText.length > 30) {
        return rawText;
      }
    } catch (gdocErr: any) {
      throw new Error(`No se pudo procesar el archivo .gdoc "${file.name}". Te recomendamos usar la opción "Importar por Enlace" de Google Docs pasting el link directamente.`);
    }
  }

  const isPDF = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf');
  const isWord = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                  file.type === 'application/msword' ||
                  fileNameLower.endsWith('.docx') ||
                  fileNameLower.endsWith('.doc');

  if (isPDF || isWord) {
    return await extractTextFromPDF(file);
  } else if (file.type.startsWith('text/') || fileNameLower.endsWith('.md') || fileNameLower.endsWith('.txt') || fileNameLower.endsWith('.csv') || fileNameLower.endsWith('.gdoc')) {
    return await file.text();
  } else {
    throw new Error(`Tipo de archivo no soportado: ${file.name}`);
  }
}
