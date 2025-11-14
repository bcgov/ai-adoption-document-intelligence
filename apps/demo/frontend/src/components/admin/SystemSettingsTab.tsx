import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

const SettingsRow = ({ title, description, children }) => (
  <div className="flex items-center justify-between p-4 border rounded-lg">
    <div>
      <h4 className="font-medium">{title}</h4>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
    {children}
  </div>
);

export default function SystemSettingsTab() {
  return (
    <div className="mt-6 space-y-6">
      <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>
            Configure platform-wide settings and features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsRow title="Enable Public API" description="Allow external access via API keys.">
            <Switch />
          </SettingsRow>
          <SettingsRow title="Maintenance Mode" description="Temporarily disable access for system updates.">
            <Switch />
          </SettingsRow>
          <SettingsRow title="New User Registration" description="Allow users to self-register for an account.">
            <Switch defaultChecked={false} />
          </SettingsRow>
        </CardContent>
      </Card>
      
      <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm border-red-200">
        <CardHeader>
          <CardTitle className="text-red-700">Danger Zone</CardTitle>
          <CardDescription>
            These actions are irreversible. Please proceed with caution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg">
              <div>
                <h4 className="font-medium">Reset All Workflows</h4>
                <p className="text-sm text-slate-500">Delete all custom workflows and revert to system defaults.</p>
              </div>
              <Button variant="destructive">Reset Workflows</Button>
            </div>
            <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg">
              <div>
                <h4 className="font-medium">Purge Archived Documents</h4>
                <p className="text-sm text-slate-500">Permanently delete all documents currently in the archive.</p>
              </div>
              <Button variant="destructive">Purge Archive</Button>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}


