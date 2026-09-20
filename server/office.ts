import JSZip from 'jszip';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import type { GoogleGenAI } from '@google/genai';

/**
 * Decodes standard XML entities and numeric character references.
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Extracts all slide text, headings, bullet points, tables, and speaker notes
 * from modern Microsoft PowerPoint (.pptx) presentations.
 */
export async function extractTextFromPPTX(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  
  // Find all slide XML files
  const slideFiles = Object.keys(zip.files).filter(name => 
    /^ppt\/slides\/slide\d+\.xml$/i.test(name)
  );

  // Sort slides numerically in natural presentation order (slide1, slide2, slide10...)
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
    const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
    return numA - numB;
  });

  if (slideFiles.length === 0) {
    // Fallback: any file matching slide*.xml
    const anySlide = Object.keys(zip.files).filter(name => name.toLowerCase().includes('slide') && name.endsWith('.xml'));
    if (anySlide.length === 0) {
      throw new Error("No se encontraron diapositivas legibles dentro del archivo PowerPoint (.pptx).");
    }
    slideFiles.push(...anySlide);
  }

  const slideTexts: string[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const slideNum = i + 1;
    const xmlContent = await zip.files[slidePath].async('string');

    // Parse slide text with preserved paragraph breaks
    const cleanedSlide = xmlContent
      .replace(/<a:br[^>]*\/>/gi, '\n')
      .replace(/<\/a:p>/gi, '\n')
      .replace(/<a:t[^>]*>(.*?)<\/a:t>/gs, (_m, text) => decodeXmlEntities(text) + ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // Check for corresponding speaker notes
    const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
    let notesText = '';
    if (zip.files[notesPath]) {
      try {
        const notesXml = await zip.files[notesPath].async('string');
        notesText = notesXml
          .replace(/<a:br[^>]*\/>/gi, '\n')
          .replace(/<\/a:p>/gi, '\n')
          .replace(/<a:t[^>]*>(.*?)<\/a:t>/gs, (_m, text) => decodeXmlEntities(text) + ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n\s*\n/g, '\n')
          .trim();
      } catch (_) {
        // speaker notes optional
      }
    }

    if (cleanedSlide.length > 0 || notesText.length > 0) {
      let section = `--- DIAPOSITIVA ${slideNum} ---\n${cleanedSlide}`;
      if (notesText && notesText.length > 0) {
        section += `\n\n[Notas del orador: ${notesText}]`;
      }
      slideTexts.push(section);
    }
  }

  if (slideTexts.length === 0) {
    throw new Error("La presentación de PowerPoint no contiene texto legible en las diapositivas.");
  }

  return slideTexts.join('\n\n');
}

/**
 * Extracts readable text streams from legacy Microsoft PowerPoint 97-2003 (.ppt) binary files.
 */
export async function extractTextFromPPT(buffer: Buffer): Promise<string> {
  // Extract ASCII and UTF-16 strings from the binary stream
  const rawString = buffer.toString('binary');
  const asciiMatches = rawString.match(/[\x20-\x7E\xA0-\xFF]{5,}/g) || [];
  
  // Filter out binary signatures and formatting noise
  const cleanChunks = asciiMatches.filter(chunk => {
    const trimmed = chunk.trim();
    if (trimmed.length < 5) return false;
    // Skip common font names and internal PPT tags
    if (/^(Arial|Times|Calibri|Symbol|Wingdings|Tahoma|Verdana|PowerPoint|Microsoft|Current User|DocumentSummaryInformation)/i.test(trimmed)) {
      return false;
    }
    // Must contain letters
    return /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(trimmed);
  });

  const extracted = cleanChunks.join('\n');
  if (extracted.length < 100) {
    throw new Error(
      "El archivo es una presentación en formato antiguo de PowerPoint (.ppt). " +
      "Para conservar la estructura completa de diapositivas, títulos y notas, por favor ábrelo en PowerPoint " +
      "o Google Slides y guárdalo como formato moderno (.pptx) o expórtalo como PDF antes de subirlo."
    );
  }

  return `--- PRESENTACIÓN POWERPOINT (FORMATO .PPT) ---\n\n${extracted}`;
}

const OCR_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

/**
 * Transcribes any image (photo of textbook, photocopy, notes, blackboard, diagrams)
 * using Gemini Vision with automatic image optimization via sharp.
 */
export async function extractTextFromImage(
  ai: GoogleGenAI,
  buffer: Buffer,
  mimeType: string,
  fileName?: string
): Promise<string> {
  console.log(`[Image OCR] Procesando imagen "${fileName || 'imagen'}" (tamaño original: ${Math.round(buffer.length / 1024)} KB)...`);
  
  let processedBuffer = buffer;
  let targetMime = mimeType || 'image/jpeg';

  try {
    const meta = await sharp(buffer).metadata();
    const needsResize = (meta.width && meta.width > 2500) || (meta.height && meta.height > 2500) || buffer.length > 5 * 1024 * 1024;
    
    if (needsResize || !['image/jpeg', 'image/png', 'image/webp'].includes(targetMime)) {
      processedBuffer = await sharp(buffer)
        .resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      targetMime = 'image/jpeg';
      console.log(`[Image OCR] Imagen optimizada con Sharp a JPEG (${Math.round(processedBuffer.length / 1024)} KB)`);
    }
  } catch (sharpErr) {
    console.warn("[Image OCR] Sharp no pudo procesar la imagen, usando buffer original:", sharpErr);
  }

  const prompt = `Eres un asistente de transcripción y extracción académica de alta fidelidad.
Extrae minuciosamente TODO el contenido textual, esquemas, apuntes, fórmulas, definiciones y anotaciones presentes en esta imagen (fotografía de libro, página escaneada, diapositiva, pizarra o apunte de estudio).
- Conserva títulos, subtítulos, listas numeradas, viñetas y organización lógica.
- Si hay tablas o diagramas, transcribe su contenido de forma clara y estructurada.
- Si es un apunte manuscrito o un texto clásico/académico, transcribe con máxima fidelidad cada párrafo legible.
- Devuelve exclusivamente el contenido textual transcrito en formato Markdown limpio, sin preámbulos ni notas editoriales.`;

  let lastError: any = null;
  for (const model of OCR_MODELS) {
    try {
      console.log(`[Image OCR] Intentando transcripción con modelo ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: targetMime,
                  data: processedBuffer.toString('base64')
                }
              },
              {
                text: prompt
              }
            ]
          }
        ]
      });

      const extracted = response.text?.trim() || '';
      if (extracted.length > 0) {
        console.log(`[Image OCR] ¡Éxito con ${model}! Caracteres extraídos: ${extracted.length}`);
        return extracted;
      }
    } catch (err: any) {
      console.warn(`[Image OCR] Falló con modelo ${model}:`, err.message || err);
      lastError = err;
    }
  }

  throw new Error(`No se pudo transcribir el texto de la imagen: ${lastError?.message || 'Error desconocido'}`);
}

/**
 * Extracts and transcribes scanned PDFs (photocopies, books, scanned research papers)
 * using Gemini Vision OCR with automatic handling for both small and large multi-megabyte PDFs.
 */
export async function extractTextFromScannedPDF(
  ai: GoogleGenAI,
  buffer: Buffer,
  fileData: string,
  fileName?: string
): Promise<string> {
  const ocrPrompt = `Eres un transcriptor académico de élite y analista documental.
Extrae y transcribe minuciosamente todo el texto de este documento PDF de estudio con la máxima fidelidad posible.
Si se trata de un libro clásico o filosófico escaneado (como Aristóteles, Platón, tratados académicos o fotocopias de cátedra), transcribe con precisión el texto de todas las páginas legibles conservando títulos, capítulos, secciones, argumentos y estructura.
Devuelve exclusivamente el texto transcrito del documento en formato Markdown limpio sin notas editoriales ni introducciones tuyas.`;

  // For PDFs <= 14 MB, inlineData is fast and avoids filesystem I/O
  const isInline = buffer.length <= 14 * 1024 * 1024;
  let lastError: any = null;

  if (isInline) {
    for (const model of OCR_MODELS) {
      try {
        console.log(`[Scanned PDF OCR] Procesando PDF inline con modelo ${model} para: ${fileName || 'documento'}`);
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: fileData
                  }
                },
                {
                  text: ocrPrompt
                }
              ]
            }
          ]
        });

        const extracted = response.text?.trim() || '';
        if (extracted.length > 0) {
          console.log(`[Scanned PDF OCR] ¡OCR exitoso con ${model}! Caracteres extraídos: ${extracted.length}`);
          return extracted;
        }
      } catch (err: any) {
        console.warn(`[Scanned PDF OCR] Error con ${model}:`, err.message || err);
        lastError = err;
      }
    }
  } else {
    // For PDFs > 14 MB (scanned books up to hundreds of MBs), use Gemini Files API
    console.log(`[Scanned PDF OCR] PDF grande (${Math.round(buffer.length / (1024 * 1024))} MB). Subiendo a Gemini Files API...`);
    const tmpFileName = `gemini_scanned_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`;
    const tmpFilePath = path.join('/tmp', tmpFileName);
    fs.writeFileSync(tmpFilePath, buffer);

    let uploadedFile: any = null;
    try {
      uploadedFile = await ai.files.upload({
        file: tmpFilePath,
        config: { mimeType: 'application/pdf' }
      });
      console.log(`[Scanned PDF OCR] Archivo subido a Gemini Files API con éxito: ${uploadedFile.name}`);

      for (const model of OCR_MODELS) {
        try {
          console.log(`[Scanned PDF OCR] Ejecutando análisis sobre archivo grande con ${model}...`);
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    fileData: {
                      fileUri: uploadedFile.uri,
                      mimeType: uploadedFile.mimeType || 'application/pdf'
                    }
                  },
                  {
                    text: ocrPrompt
                  }
                ]
              }
            ]
          });

          const extracted = response.text?.trim() || '';
          if (extracted.length > 0) {
            console.log(`[Scanned PDF OCR] ¡OCR exitoso para archivo grande con ${model}! Caracteres extraídos: ${extracted.length}`);
            return extracted;
          }
        } catch (modelErr: any) {
          console.warn(`[Scanned PDF OCR] Error con ${model} en archivo grande:`, modelErr.message || modelErr);
          lastError = modelErr;
        }
      }
    } finally {
      // Clean up both local tmp file and remote Gemini file
      if (fs.existsSync(tmpFilePath)) {
        try { fs.unlinkSync(tmpFilePath); } catch (_) {}
      }
      if (uploadedFile?.name) {
        try {
          await ai.files.delete({ name: uploadedFile.name });
          console.log(`[Scanned PDF OCR] Archivo temporal eliminado de Gemini Files API.`);
        } catch (delErr) {
          console.warn(`[Scanned PDF OCR] Advertencia al eliminar archivo de Gemini Files:`, delErr);
        }
      }
    }
  }

  throw new Error(`No se pudo extraer texto del documento escaneado: ${lastError?.message || 'Error en el servicio de OCR'}`);
}
