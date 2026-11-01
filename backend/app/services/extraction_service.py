"""Text and Optical Character Recognition (OCR) extraction service (PyMuPDF & Tesseract).

Dispatches digital selectable-text PDFs to PyMuPDF (fitz) in sub-second time.
Dispatches scanned PDFs and images (PNG, JPG, JPEG) to Tesseract OCR with Pillow preprocessing.
Executes blocking routines inside threadpools via asyncio.to_thread() to preserve event loop concurrency.
"""

import asyncio
import io
import logging
import os
import shutil
from typing import Tuple
from PIL import Image, ImageOps
import pymupdf
import pytesseract

from app.config import get_settings
from app.core.exceptions import DocumentExtractionException

logger = logging.getLogger("aegis.extraction")
settings = get_settings()

# Auto-configure Tesseract binary path
def _configure_tesseract_path() -> None:
    if settings.TESSERACT_CMD and os.path.isfile(settings.TESSERACT_CMD):
        pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
        logger.info("Configured Tesseract OCR binary from settings: %s", settings.TESSERACT_CMD)
        return

    if not shutil.which("tesseract"):
        common_candidates = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"),
        ]
        for candidate in common_candidates:
            if os.path.isfile(candidate):
                pytesseract.pytesseract.tesseract_cmd = candidate
                logger.info("Auto-configured Tesseract OCR binary path: %s", candidate)
                return

_configure_tesseract_path()


def preprocess_image_for_ocr(img: Image.Image) -> Image.Image:
    """Preprocess PIL Image for high-accuracy Tesseract OCR.
    
    1. Corrects EXIF camera orientation.
    2. Handles transparency / alpha channels by compositing onto a solid white background (prevents black-on-black failure).
    3. Upscales low-resolution scans and small captures to optimal recognition DPI.
    4. Converts to standard grayscale.
    5. Applies adaptive autocontrast to emphasize text glyphs against light backgrounds.
    """
    # 1. Correct EXIF orientation
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    # 2. Handle transparency & alpha channels (composite onto solid white)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        img_rgba = img.convert("RGBA")
        white_bg = Image.new("RGB", img_rgba.size, (255, 255, 255))
        alpha = img_rgba.split()[3]
        white_bg.paste(img_rgba, mask=alpha)
        rgb_img = white_bg
    elif img.mode != "RGB":
        rgb_img = img.convert("RGB")
    else:
        rgb_img = img

    # 3. Intelligent resolution upscaling for low-res / small scans
    w, h = rgb_img.size
    max_dim = max(w, h)
    if max_dim < 1800:
        scale = min(2.0, 2000.0 / max_dim)
        if scale > 1.1:
            new_w, new_h = int(w * scale), int(h * scale)
            rgb_img = rgb_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # 4. Grayscale conversion
    gray = ImageOps.grayscale(rgb_img)

    # 5. Adaptive contrast enhancement
    try:
        gray = ImageOps.autocontrast(gray, cutoff=1)
    except Exception:
        pass

    return gray


def _sync_extract_pdf_text(storage_path: str) -> Tuple[str, str]:
    """Synchronous worker extracting text layers from PDF or falling back to OCR for scanned pages."""
    if not os.path.exists(storage_path):
        raise DocumentExtractionException(detail="Document file does not exist on storage volume.")

    try:
        doc = pymupdf.open(storage_path)
    except Exception as exc:
        logger.error("Failed to open PDF document at %s: %s", storage_path, exc)
        raise DocumentExtractionException(
            detail=f"Unable to read PDF file. Document may be malformed or password-protected: {exc}",
            code="UNREADABLE_PDF_DOCUMENT",
        ) from exc

    full_text_parts = []
    page_count = len(doc)
    is_scanned = True

    try:
        # First pass: attempt digital vector text extraction
        for page_idx in range(page_count):
            page = doc[page_idx]
            page_text = page.get_text().strip()
            if page_text:
                full_text_parts.append(page_text)

        combined_text = "\n\n".join(full_text_parts).strip()

        # If combined text is meaningful, classify as PyMuPDF vector extraction
        if len(combined_text) >= 20:
            doc.close()
            return combined_text, "PyMuPDF"

        # If digital text is negligible or missing, process as a scanned PDF with OCR
        logger.info("PDF %s lacks embedded text layer (len=%d). Routing to Tesseract OCR.", storage_path, len(combined_text))
        ocr_text_parts = []

        for page_idx in range(page_count):
            page = doc[page_idx]
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes))

            # Preprocess image for OCR
            processed_img = preprocess_image_for_ocr(img)
            try:
                page_ocr = pytesseract.image_to_string(processed_img, config="--psm 3").strip()
                if page_ocr:
                    ocr_text_parts.append(page_ocr)
            except pytesseract.TesseractNotFoundError:
                logger.warning("Tesseract OCR binary not found on host system. Scanned PDF text extraction skipped.")
                break
            except Exception as ocr_err:
                logger.warning("OCR failed on page %d: %s", page_idx, ocr_err)

        doc.close()
        final_ocr = "\n\n".join(ocr_text_parts).strip()
        if final_ocr:
            return final_ocr, "Tesseract"

        # Fallback to whatever minimal text was found
        return combined_text, "PyMuPDF"

    except DocumentExtractionException:
        raise
    except Exception as exc:
        logger.error("Unexpected error during PDF text extraction: %s", exc)
        raise DocumentExtractionException(
            detail=f"Error extracting content from PDF: {exc}",
            code="EXTRACTION_FAILED",
        ) from exc


def _sync_extract_image_ocr(storage_path: str) -> Tuple[str, str]:
    """Synchronous worker executing image preprocessing and Tesseract OCR for PNG/JPG."""
    if not os.path.exists(storage_path):
        raise DocumentExtractionException(detail="Image file does not exist on storage volume.")

    try:
        with Image.open(storage_path) as img:
            processed_img = preprocess_image_for_ocr(img)
            try:
                # Pass 1: Standard layout analysis (PSM 3)
                raw_text = pytesseract.image_to_string(processed_img, config="--psm 3").strip()
                
                # Pass 2: If sparse text, fallback to PSM 6 (uniform block)
                if len(raw_text) < 40:
                    alt_text = pytesseract.image_to_string(processed_img, config="--psm 6").strip()
                    if len(alt_text) > len(raw_text):
                        raw_text = alt_text

                return raw_text, "Tesseract"
            except pytesseract.TesseractNotFoundError:
                logger.warning("Tesseract OCR binary not found on host system.")
                return "", "Tesseract"
            except Exception as ocr_err:
                logger.error("Tesseract optical character recognition failed: %s", ocr_err)
                raise DocumentExtractionException(
                    detail=f"OCR execution failed on uploaded image: {ocr_err}",
                    code="OCR_PROCESSING_FAILED",
                ) from ocr_err
    except DocumentExtractionException:
        raise
    except Exception as exc:
        logger.error("Failed to load image for OCR at %s: %s", storage_path, exc)
        raise DocumentExtractionException(
            detail=f"Unable to read image file. Image may be corrupted: {exc}",
            code="UNREADABLE_IMAGE_FILE",
        ) from exc


async def extract_document_text(storage_path: str, mime_type: str) -> Tuple[str, str]:
    """Extract text from PDF or image using asyncio.to_thread() to prevent event loop blocking.
    
    Returns:
        Tuple of (extracted_raw_text, extraction_engine_name)
    """
    if mime_type == "application/pdf":
        return await asyncio.to_thread(_sync_extract_pdf_text, storage_path)
    elif mime_type in ("image/jpeg", "image/png"):
        return await asyncio.to_thread(_sync_extract_image_ocr, storage_path)
    else:
        raise DocumentExtractionException(
            detail=f"Unsupported MIME type for text extraction: '{mime_type}'.",
            code="UNSUPPORTED_MEDIA_TYPE",
        )

