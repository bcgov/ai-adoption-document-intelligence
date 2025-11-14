// Shared types for the application

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Document {
  id: string;
  title: string;
  original_filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  metadata?: Record<string, unknown>;
  source?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}
