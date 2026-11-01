import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';

// Setup pdfjs worker
try {
  // Use official CDN matching the installed version
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
} catch (e) {
  console.warn('PDF.js worker initialization warning:', e);
}

/**
 * Extract text from a File object (PDF or Image)
 * @param {File} file - PDF or Image file
 * @param {Function} onProgress - Callback with { stage, percent, message }
 * @returns {Promise<{ text: string, isScanned: boolean, pageCount: number }>}
 */
export async function parseDocument(file, onProgress = () => {}) {
  const fileType = file.type || '';
  const fileName = file.name.toLowerCase();

  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return parsePDFDocument(file, onProgress);
  } else if (fileType.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff)$/i.test(fileName)) {
    return parseImageDocument(file, onProgress);
  } else {
    throw new Error('Unsupported file type. Please upload a PDF document or an image file (PNG, JPG).');
  }
}

/**
 * Parse PDF document, with automatic OCR fallback if text is sparse/scanned
 */
async function parsePDFDocument(file, onProgress) {
  onProgress({ stage: 'loading', percent: 15, message: 'Loading PDF document...' });

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  let fullText = '';
  let totalWords = 0;

  onProgress({ stage: 'extracting', percent: 30, message: `Extracting text from ${numPages} page(s)...` });

  // First pass: extract digital text
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group text items by line proximity
    const pageLines = [];
    let currentY = null;
    let currentLine = '';

    for (const item of textContent.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      if (currentY === null || Math.abs(currentY - y) > 6) {
        if (currentLine) pageLines.push(currentLine.trim());
        currentLine = item.str;
        currentY = y;
      } else {
        currentLine += ' ' + item.str;
      }
    }
    if (currentLine) pageLines.push(currentLine.trim());

    const pageText = pageLines.join('\n');
    fullText += `\n--- PAGE ${pageNum} ---\n` + pageText;
    totalWords += pageText.split(/\s+/).filter(Boolean).length;
  }

  // If the PDF has substantial text (more than 30 words), return digital text
  if (totalWords >= 30) {
    onProgress({ stage: 'complete', percent: 100, message: 'Digital text extracted successfully.' });
    return {
      text: fullText.trim(),
      isScanned: false,
      pageCount: numPages
    };
  }

  // If PDF has very few words, it is likely a scanned document. Run OCR on rendered canvases!
  onProgress({ stage: 'ocr_init', percent: 45, message: 'Scanned document detected. Initializing AI OCR Engine...' });

  let ocrCombinedText = '';
  const pagesToScan = Math.min(numPages, 3); // OCR up to first 3 pages

  for (let pageNum = 1; pageNum <= pagesToScan; pageNum++) {
    onProgress({
      stage: 'ocr_page',
      percent: 45 + Math.round((pageNum / pagesToScan) * 45),
      message: `Running Optical Character Recognition on page ${pageNum} of ${pagesToScan}...`
    });

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR accuracy
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const pageImageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const pageOCR = await performOCR(pageImageBlob, (p) => {
      onProgress({
        stage: 'ocr_progress',
        percent: 45 + Math.round(((pageNum - 1 + p) / pagesToScan) * 45),
        message: `Reading text from page ${pageNum} (${Math.round(p * 100)}%)...`
      });
    });

    ocrCombinedText += `\n--- SCANNED PAGE ${pageNum} ---\n` + pageOCR;
  }

  onProgress({ stage: 'complete', percent: 100, message: 'OCR text recognition completed.' });
  return {
    text: ocrCombinedText.trim() || fullText.trim(),
    isScanned: true,
    pageCount: numPages
  };
}

/**
 * Parse an image directly using Tesseract OCR
 */
async function parseImageDocument(file, onProgress) {
  onProgress({ stage: 'ocr_init', percent: 20, message: 'Preparing image for OCR recognition...' });

  const text = await performOCR(file, (p) => {
    onProgress({
      stage: 'ocr_progress',
      percent: 20 + Math.round(p * 75),
      message: `Analyzing medical document with OCR (${Math.round(p * 100)}%)...`
    });
  });

  onProgress({ stage: 'complete', percent: 100, message: 'Image text recognized successfully.' });
  return {
    text: text.trim(),
    isScanned: true,
    pageCount: 1
  };
}

/**
 * Helper to perform Tesseract OCR
 */
async function performOCR(imageSource, progressCallback = () => {}) {
  let worker = null;
  try {
    worker = await createWorker('eng');
    
    // Tesseract progress
    const ret = await worker.recognize(imageSource);
    return ret.data.text || '';
  } catch (err) {
    console.error('OCR Error:', err);
    throw new Error('Optical Character Recognition failed: ' + (err.message || 'Unknown error'));
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}

