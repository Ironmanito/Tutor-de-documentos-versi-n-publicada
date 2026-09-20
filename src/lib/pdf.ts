import { getAccessToken } from './firebase';

/**
 * Attempts fast, client-side PDF text extraction directly in the browser using pdfjs-dist.
 * This completely eliminates upload time, 32MB payload limits, and server timeouts for PDFs
 * that already contain a digital or OCR text layer.
 */
async function tryBrowserPdfExtraction(file: File): Promise<string | null> {
  try {
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPDF) return null;

    const arrayBuffer = await file.arrayBuffer();
    const pdfjs = await import('pdfjs-dist');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    }
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ');
      fullText += `--- PÁGINA ${i} ---\n${pageText}\n\n`;
    }
    const substantive = fullText.replace(/---\s*PÁGINA\s+\d+\s*---/gi, '').replace(/[\s\r\n\t]+/g, ' ').trim();
    if (substantive.length >= 80) {
      console.log(`[Browser PDF Extraction] Extraído con éxito en el navegador para "${file.name}": ${substantive.length} caracteres.`);
      return fullText.trim();
    }
    console.log(`[Browser PDF Extraction] El PDF "${file.name}" tiene poco texto digital (${substantive.length} chars), enviando al servidor para OCR...`);
    return null;
  } catch (err) {
    console.warn("[Browser PDF Extraction] No se pudo extraer en navegador, recurriendo a extracción en servidor:", err);
    return null;
  }
}

export async function extractTextFromPDF(file: File, signal?: AbortSignal): Promise<string> {
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
    const browserText = await tryBrowserPdfExtraction(file);
    if (signal?.aborted) {
      throw new DOMException("Operación cancelada por el usuario", "AbortError");
    }
    if (browserText && browserText.trim().length > 0) {
      return browserText;
    }
  }

  // 2. Convert File to Base64 in a non-blocking, safe way compatible with all browsers
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

  // 3. Call the server-side extraction endpoint which supports PDF, Word (.docx), PowerPoint (.pptx), Images and OCR
  const userApiKey = typeof window !== 'undefined' ? (localStorage.getItem('user_gemini_api_key') || '') : '';
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userApiKey) {
    headers["x-gemini-api-key"] = userApiKey;
  }

  let res: Response;
  try {
    res = await fetch("/api/extract-pdf", {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({ 
        fileName: file.name, 
        fileData: base64, 
        mimeType: file.type || undefined,
        apiKey: userApiKey || undefined
      })
    });
  } catch (networkErr: any) {
    if (networkErr.name === 'AbortError' || signal?.aborted) {
      throw new DOMException("Operación cancelada por el usuario", "AbortError");
    }
    throw new Error(`Error de conexión con el servidor al enviar "${file.name}": ${networkErr.message || 'Verifica tu red'}`);
  }

  // Safe response parsing: prevents "Unexpected token '<', "<!doctype "..." syntax errors
  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text().catch(() => "");
  let data: any = null;

  if (contentType.includes("application/json") || (rawText.startsWith("{") && rawText.endsWith("}"))) {
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      data = null;
    }
  }

  if (!res.ok) {
    if (data && data.error) {
      throw new Error(data.error);
    }
    if (res.status === 413 || rawText.includes("413") || rawText.toLowerCase().includes("payload too large") || rawText.toLowerCase().includes("entity too large")) {
      throw new Error(`El archivo "${file.name}" supera el tamaño máximo de subida directa (~30 MB). Por favor, comprímelo con una herramienta de compresión de PDF o súbelo dividido en capítulos.`);
    }
    if (res.status === 504 || rawText.includes("504") || rawText.toLowerCase().includes("gateway time-out") || rawText.toLowerCase().includes("timeout")) {
      throw new Error(`El tiempo de procesamiento del documento escaneado "${file.name}" excedió el tiempo límite (504 Gateway Timeout). Te recomendamos subir capítulos o páginas individuales.`);
    }
    const titleMatch = rawText.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      throw new Error(`Error del servidor (${res.status}): ${titleMatch[1].trim()}`);
    }
    throw new Error(`Error del servidor al extraer el archivo "${file.name}" (${res.status})`);
  }

  if (!data) {
    if (rawText.includes("<!doctype html") || rawText.includes("<html")) {
      throw new Error(`El servidor devolvió una página HTML en lugar de los datos extraídos (posible reinicio temporal). Por favor, intenta subir "${file.name}" nuevamente.`);
    }
    throw new Error(`Respuesta no válida del servidor al procesar "${file.name}".`);
  }

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

export async function extractTextFromFile(file: File, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) {
    throw new DOMException("Operación cancelada por el usuario", "AbortError");
  }

  const fileNameLower = file.name.toLowerCase();

  // Handle Google Doc shortcut files (.gdoc)
  if (fileNameLower.endsWith('.gdoc')) {
    try {
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
        const imported = await importGoogleDocFromUrl(docUrl);
        return imported.text;
      } else if (rawText && rawText.length > 30) {
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
    return await extractTextFromPDF(file, signal);
  } else if (file.type.startsWith('text/') || fileNameLower.endsWith('.md') || fileNameLower.endsWith('.txt') || fileNameLower.endsWith('.csv') || fileNameLower.endsWith('.gdoc')) {
    return await file.text();
  } else {
    throw new Error(`Tipo de archivo no soportado: ${file.name}`);
  }
}
