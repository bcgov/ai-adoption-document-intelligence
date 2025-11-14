// Application constants

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const APP_NAME = 'AI OCR Frontend';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const SUPPORTED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff'
] as const;
