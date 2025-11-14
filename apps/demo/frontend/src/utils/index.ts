import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function createPageUrl(pageName: string): string {
  const pageMap: Record<string, string> = {
    Dashboard: '/dashboard',
    Upload: '/upload',
    Queue: '/queue',
    Workspaces: '/workspaces',
    Analytics: '/analytics',
    Admin: '/admin',
  };
  
  return pageMap[pageName] || `/${pageName.toLowerCase()}`;
}

export function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}


