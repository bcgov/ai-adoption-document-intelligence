import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Settings, History, Key } from "lucide-react";

import UserManagementTab from "@/components/admin/UserManagementTab";
import SystemSettingsTab from "@/components/admin/SystemSettingsTab";
import AuditLogTab from "@/components/admin/AuditLogTab";
import ApiKeysTab from "@/components/admin/ApiKeysTab";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Admin Panel</h1>
            <p className="text-slate-600">Manage users, system settings, and monitor platform activity</p>
          </div>

          <Tabs defaultValue="user-management" className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 bg-slate-200/50">
              <TabsTrigger value="user-management">
                <Users className="w-4 h-4 mr-2" />
                User Management
              </TabsTrigger>
              <TabsTrigger value="system-settings">
                <Settings className="w-4 h-4 mr-2" />
                System Settings
              </TabsTrigger>
              <TabsTrigger value="audit-log">
                <History className="w-4 h-4 mr-2" />
                Audit Log
              </TabsTrigger>
              <TabsTrigger value="api-keys">
                <Key className="w-4 h-4 mr-2" />
                API Keys
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="user-management">
              <UserManagementTab />
            </TabsContent>
            <TabsContent value="system-settings">
              <SystemSettingsTab />
            </TabsContent>
            <TabsContent value="audit-log">
              <AuditLogTab />
            </TabsContent>
            <TabsContent value="api-keys">
              <ApiKeysTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}


