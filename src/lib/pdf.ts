import { getAccessToken } from './firebase';

export type ProgressCallback = (percent: number, statusText: string) => void;

/**
 * Attempts fast, client-side PDF text extraction directly in the browser using pdfjs-dist.
 * This completely eliminates upload time, 32MB payload limits, and server timeouts for PDFs
 * that already contain a digital or OCR text layer.
 */
async function tryBrowserPdfExtraction(
  file: File, 
  signal?: AbortSignal, 
  onProgress?: ProgressCallback
): Promise<string | null> {
  try {
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPDF) return null;

    if (signal?.aborted) return null;
    onProgress?.(5, 'Leyendo estructura del PDF en navegador...');

    const arrayBuffer = await file.arrayBuffer();
    if (signal?.aborted) return null;

    const pdfjs = await import('pdfjs-dist');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    }
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    if (signal?.aborted) return null;

    onProgress?.(10, `Documento reconocido: ${pdf.numPages} páginas. Extrayendo...`);

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      if (signal?.aborted) return null;
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ');
      fullText += `--- PÁGINA ${i} ---\n${pageText}\n\n`;

      if (onProgress) {
        const pagePct = 10 + Math.round((i / pdf.numPages) * 85);
        onProgress(pagePct, `Procesando página ${i} de ${pdf.numPages}...`);
      }
    }
    const substantive = fullText.replace(/---\s*PÁGINA\s+\d+\s*---/gi, '').replace(/[\s\r\n\t]+/g, ' ').trim();
    if (substantive.length >= 80) {
      console.log(`[Browser PDF Extraction] Extraído con éxito en el navegador para "${file.name}": ${substantive.length} caracteres.`);
      onProgress?.(100, `¡Completado! (${pdf.numPages} páginas extraídas)`);
      return fullText.trim();
    }
    console.log(`[Browser PDF Extraction] El PDF "${file.name}" tiene poco texto digital (${substantive.length} chars), enviando al servidor para OCR...`);
    onProgress?.(20, 'Texto escaneado detectado. Preparando OCR en servidor...');
    return null;
  } catch (err) {
    console.warn("[Browser PDF Extraction] No se pudo extraer en navegador, recurriendo a extracción en servidor:", err);
    return null;
  }
}

export async function extractTextFromPDF(
  file: File, 
  signal?: AbortSignal,
  onProgress?: ProgressCallback
): Promise<string> {
  // Check if signal is already aborted
  if (signal?.aborted) {
    throw new DOMException("Operación cancelada por el usuario", "AbortError");
  }

  // Check if file is empty or 0 bytes (common with unsynced Google Drive files or Google Docs shortcuts)
  if (file.size === 0) {
    throw new Error(
      `El archivo "${file.name}" está vacío (tiene 0 bytes). ` +
      `Si este archivo proviene de Google Drive o es un acceso directo de Google Docs, por favor descárgalo ` +
      `en tu dispositivo (o expórtalo como PDF real) antes de subirlo.`
    );
  }

  // 1. For PDFs, first attempt instant browser-side extraction to bypass network payload/timeout limits
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPDF) {
    const browserText = await tryBrowserPdfExtraction(file, signal, onProgress);
    if (signal?.aborted) {
      throw new DOMException("Operación cancelada por el usuario", "AbortError");
    }
    if (browserText && browserText.trim().length > 0) {
      return browserText;
    }
  }

  // 2. Convert File to Base64 in a non-blocking, safe way compatible with all browsers
  onProgress?.(12, 'Leyendo datos del archivo local...');
  const base64 = await new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException("Operación cancelada por el usuario", "AbortError"));
    }
    const reader = new FileReader();
    const abortHandler = () => {
      try { reader.abort(); } catch (_) {}
      reject(new DOMException("Operación cancelada por el usuario", "AbortError"));
    };
    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }
    reader.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0 && onProgress) {
        const readPct = 12 + Math.round((e.loaded / e.total) * 12);
        onProgress(readPct, `Leyendo archivo localmente (${Math.round((e.loaded / e.total) * 100)}%)...`);
      }
    };
    reader.onload = () => {
      if (signal) signal.removeEventListener('abort', abortHandler);
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
    reader.onerror = () => {
      if (signal) signal.removeEventListener('abort', abortHandler);
      if (signal?.aborted) {
        reject(new DOMException("Operación cancelada por el usuario", "AbortError"));
      } else {
        reject(new Error("Error al leer el archivo desde el navegador."));
      }
    };
    reader.readAsDataURL(file);
  });

  if (signal?.aborted) {
    throw new DOMException("Operación cancelada por el usuario", "AbortError");
  }

  // 3. Call the server-side extraction endpoint with XMLHttpRequest to track real upload progress
  const userApiKey = typeof window !== 'undefined' ? (localStorage.getItem('user_gemini_api_key') || '') : '';
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userApiKey) {
    headers["x-gemini-api-key"] = userApiKey;
  }

  const payload = {
    fileName: file.name,
    fileData: base64,
    mimeType: file.type || undefined,
    apiKey: userApiKey || undefined
  };

  const data = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/extract-pdf", true);

    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }

    if (signal) {
      if (signal.aborted) {
        return reject(new DOMException("Operación cancelada por el usuario", "AbortError"));
      }
      signal.addEventListener("abort", () => {
        xhr.abort();
        reject(new DOMException("Operación cancelada por el usuario", "AbortError"));
      }, { once: true });
    }

    // Upload progress based on real bytes sent to server
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const uploadPercent = Math.round((event.loaded / event.total) * 100);
          const mapped = 25 + Math.round((uploadPercent / 100) * 45); // 25% -> 70%
          const loadedMb = (event.loaded / (1024 * 1024)).toFixed(1);
          const totalMb = (event.total / (1024 * 1024)).toFixed(1);
          onProgress(mapped, `Enviando al servidor: ${loadedMb} MB / ${totalMb} MB (${uploadPercent}%)...`);
        }
      };
    }

    let serverProcessTimer: any = null;
    xhr.upload.onload = () => {
      let procPct = 72;
      if (onProgress) {
        onProgress(procPct, "Servidor ejecutando OCR e IA sobre el documento...");
        serverProcessTimer = setInterval(() => {
          if (procPct < 94) {
            procPct += 2;
            onProgress(procPct, "Extrayendo texto y estructurando capítulos con IA...");
          }
        }, 400);
      }
    };

    xhr.onload = () => {
      if (serverProcessTimer) clearInterval(serverProcessTimer);
      const status = xhr.status;
      const responseText = xhr.responseText || "";
      let jsonResp: any = null;
      try {
        jsonResp = JSON.parse(responseText);
      } catch (_) {}

      if (status >= 200 && status < 300 && jsonResp) {
        if (onProgress) onProgress(100, "¡Contenido extraído con éxito!");
        resolve(jsonResp);
      } else {
        if (jsonResp && jsonResp.error) {
          reject(new Error(jsonResp.error));
        } else if (status === 413 || responseText.includes("413") || responseText.toLowerCase().includes("payload too large")) {
          reject(new Error(`El archivo "${file.name}" supera el tamaño máximo permitido (~30 MB). Te recomendamos comprimirlo o subirlo dividido en partes.`));
        } else if (status === 504 || responseText.includes("504") || responseText.toLowerCase().includes("timeout")) {
          reject(new Error(`El tiempo de procesamiento del documento escaneado "${file.name}" excedió el límite (504 Timeout). Sube páginas o capítulos individuales.`));
        } else {
          const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            reject(new Error(`Error del servidor (${status}): ${titleMatch[1].trim()}`));
          } else {
            reject(new Error(`Error del servidor al procesar "${file.name}" (${status})`));
          }
        }
      }
    };

    xhr.onerror = () => {
      if (serverProcessTimer) clearInterval(serverProcessTimer);
      reject(new Error(`Error de red al conectar con el servidor para "${file.name}".`));
    };

    xhr.onabort = () => {
      if (serverProcessTimer) clearInterval(serverProcessTimer);
      reject(new DOMException("Operación cancelada por el usuario", "AbortError"));
    };

    xhr.send(JSON.stringify(payload));
  });

  if (data.gcsUri) {
    (file as any).gcsUri = data.gcsUri;
    (file as any).publicUrl = data.publicUrl;
  }
  if (data.slides) {
    (file as any).slides = data.slides;
  }
  return data.text;
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

export async function extractTextFromFile(
  file: File, 
  signal?: AbortSignal,
  onProgress?: ProgressCallback
): Promise<string> {
  if (signal?.aborted) {
    throw new DOMException("Operación cancelada por el usuario", "AbortError");
  }

  const fileNameLower = file.name.toLowerCase();

  // Handle Google Doc shortcut files (.gdoc)
  if (fileNameLower.endsWith('.gdoc')) {
    try {
      onProgress?.(25, 'Analizando enlace de Google Docs...');
      const rawText = await file.text();
      if (signal?.aborted) {
        throw new DOMException("Operación cancelada por el usuario", "AbortError");
      }
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
        onProgress?.(50, 'Descargando contenido de Google Docs...');
        const imported = await importGoogleDocFromUrl(docUrl);
        onProgress?.(100, '¡Google Doc importado con éxito!');
        return imported.text;
      } else if (rawText && rawText.length > 30) {
        onProgress?.(100, '¡Archivo leído con éxito!');
        return rawText;
      }
    } catch (gdocErr: any) {
      if (gdocErr.name === 'AbortError' || signal?.aborted) throw gdocErr;
      throw new Error(`No se pudo procesar el archivo .gdoc "${file.name}". Te recomendamos usar la opción "Importar por Enlace" de Google Docs pasting el link directamente.`);
    }
  }

  const isPDF = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf');
  const isWord = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                  file.type === 'application/msword' ||
                  fileNameLower.endsWith('.docx') ||
                  fileNameLower.endsWith('.doc');
  const isPresentation = file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                         file.type === 'application/vnd.ms-powerpoint' ||
                         fileNameLower.endsWith('.pptx') ||
                         fileNameLower.endsWith('.ppt');
  const isImage = file.type.startsWith('image/') ||
                  /\.(png|jpe?g|webp|bmp|tiff?|gif|heic)$/i.test(fileNameLower);

  if (isPDF || isWord || isPresentation || isImage) {
    return await extractTextFromPDF(file, signal, onProgress);
  } else if (file.type.startsWith('text/') || fileNameLower.endsWith('.md') || fileNameLower.endsWith('.txt') || fileNameLower.endsWith('.csv') || fileNameLower.endsWith('.gdoc')) {
    onProgress?.(50, 'Leyendo texto del archivo plano...');
    const content = await file.text();
    onProgress?.(100, '¡Texto leído con éxito!');
    return content;
  } else {
    throw new Error(`Tipo de archivo no soportado: ${file.name}`);
  }
}
