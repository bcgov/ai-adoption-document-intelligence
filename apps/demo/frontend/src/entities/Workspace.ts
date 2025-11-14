// Mock entity class for Workspace
// In a real app, this would interface with a backend API

export interface WorkspaceData {
  id?: string;
  name: string;
  ministry: string;
  description?: string;
  intake_methods?: string[];
  retention_policy?: string;
  access_level?: 'public' | 'internal' | 'restricted' | 'confidential';
  status?: 'active' | 'inactive';
  created_date?: string;
}

class Workspace {
  static storage: WorkspaceData[] = [];

  static async create(data: WorkspaceData): Promise<WorkspaceData> {
    const newWorkspace: WorkspaceData = {
      ...data,
      id: `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_date: new Date().toISOString(),
      status: data.status || 'active',
      intake_methods: data.intake_methods || [],
      retention_policy: data.retention_policy || 'seven_years',
      access_level: data.access_level || 'internal',
    };
    this.storage.push(newWorkspace);
    return newWorkspace;
  }

  static async list(sortBy?: string): Promise<WorkspaceData[]> {
    let workspaces = [...this.storage];
    
    if (sortBy && sortBy.startsWith('-')) {
      const field = sortBy.slice(1);
      workspaces.sort((a, b) => {
        const aVal = a[field as keyof WorkspaceData];
        const bVal = b[field as keyof WorkspaceData];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return bVal.localeCompare(aVal);
        }
        return (bVal as any) - (aVal as any);
      });
    }
    
    return workspaces;
  }

  static async get(id: string): Promise<WorkspaceData | null> {
    return this.storage.find(ws => ws.id === id) || null;
  }

  static async update(id: string, data: Partial<WorkspaceData>): Promise<WorkspaceData | null> {
    const index = this.storage.findIndex(ws => ws.id === id);
    if (index === -1) return null;
    
    this.storage[index] = { ...this.storage[index], ...data };
    return this.storage[index];
  }

  static async delete(id: string): Promise<boolean> {
    const index = this.storage.findIndex(ws => ws.id === id);
    if (index === -1) return false;
    
    this.storage.splice(index, 1);
    return true;
  }
}

export default Workspace;


