// Shared types for the application

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Document {
  id: string;
  name: string;
  content: string;
  uploadedAt: Date;
  processed: boolean;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}
