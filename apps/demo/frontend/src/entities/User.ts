// Mock entity class for User
export interface UserData {
  id?: string;
  email: string;
  full_name?: string;
  role?: 'admin' | 'user' | 'viewer';
  status?: 'active' | 'inactive';
}

class User {
  static storage: UserData[] = [
    { id: '1', email: 'admin@example.gov', full_name: 'Admin User', role: 'admin', status: 'active' },
    { id: '2', email: 'john.doe@example.gov', full_name: 'John Doe', role: 'user', status: 'active' },
  ];

  static async list(): Promise<UserData[]> {
    return [...this.storage];
  }

  static async create(data: UserData): Promise<UserData> {
    const newUser: UserData = {
      ...data,
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role: data.role || 'user',
      status: data.status || 'active',
    };
    this.storage.push(newUser);
    return newUser;
  }
}

export default User;


