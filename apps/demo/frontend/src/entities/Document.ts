// Mock entity class for Document
// In a real app, this would interface with a backend API

export interface DocumentData {
  id?: string;
  title: string;
  file_url: string;
  file_type: 'pdf' | 'image' | 'scan';
  intake_method: 'web_upload' | 'email' | 'mobile' | 'citizen_portal' | 'scan';
  workspace_id?: string;
  status: 'uploaded' | 'processing' | 'completed' | 'needs_validation' | 'archived';
  confidence_score?: number;
  extracted_data?: Record<string, any>;
  validation_status?: 'pending' | 'approved' | 'rejected' | 'not_required';
  ministry: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  retention_date?: string;
  created_date?: string;
}

class Document {
  static storage: DocumentData[] = [];

  static async create(data: DocumentData): Promise<DocumentData> {
    const newDoc: DocumentData = {
      ...data,
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_date: new Date().toISOString(),
      status: data.status || 'uploaded',
      priority: data.priority || 'medium',
    };
    this.storage.push(newDoc);
    return newDoc;
  }

  static async list(sortBy: string = '-created_date', limit?: number): Promise<DocumentData[]> {
    let docs = [...this.storage];
    
    // Simple sorting
    if (sortBy.startsWith('-')) {
      const field = sortBy.slice(1);
      docs.sort((a, b) => {
        const aVal = a[field as keyof DocumentData];
        const bVal = b[field as keyof DocumentData];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return bVal.localeCompare(aVal);
        }
        return (bVal as any) - (aVal as any);
      });
    }
    
    return limit ? docs.slice(0, limit) : docs;
  }

  static async get(id: string): Promise<DocumentData | null> {
    return this.storage.find(doc => doc.id === id) || null;
  }

  static async update(id: string, data: Partial<DocumentData>): Promise<DocumentData | null> {
    const index = this.storage.findIndex(doc => doc.id === id);
    if (index === -1) return null;
    
    this.storage[index] = { ...this.storage[index], ...data };
    return this.storage[index];
  }

  static async delete(id: string): Promise<boolean> {
    const index = this.storage.findIndex(doc => doc.id === id);
    if (index === -1) return false;
    
    this.storage.splice(index, 1);
    return true;
  }
}

export default Document;


