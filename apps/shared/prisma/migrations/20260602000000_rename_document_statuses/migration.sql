-- Rename DocumentStatus enum values for clarity
-- completed_ocr → extracted (OCR extraction done, but workflow not necessarily terminal)
-- ready → complete (terminal state: all processing done)

ALTER TYPE "DocumentStatus" RENAME VALUE 'completed_ocr' TO 'extracted';
ALTER TYPE "DocumentStatus" RENAME VALUE 'ready' TO 'complete';
