import React, { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { GET_WORKSPACES, CREATE_WORKSPACE } from "@/graphql/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

import WorkspaceCard from "@/components/workspaces/WorkspaceCard";
import CreateWorkspaceDialog from "@/components/workspaces/CreateWorkspaceDialog";

export default function WorkspacesPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();

  const { data, loading, error, refetch } = useQuery(GET_WORKSPACES);
  const [createWorkspace] = useMutation(CREATE_WORKSPACE, {
    onCompleted: () => {
      refetch();
      setShowCreateDialog(false);
      toast({
        title: "Workspace Created",
        description: "The workspace has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create workspace: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const workspaces = data?.workspaces || [];

  const handleCreateWorkspace = async (workspaceData) => {
    await createWorkspace({
      variables: {
        name: workspaceData.name,
        ministry: workspaceData.ministry,
        description: workspaceData.description,
        status: workspaceData.status || "active",
        intake_methods: workspaceData.intake_methods || [],
        retention_policy: workspaceData.retention_policy || "seven_years",
        access_level: workspaceData.access_level || "internal",
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Workspaces</h1>
              <p className="text-slate-600">Manage custom document processing environments for different ministries and teams</p>
            </div>
            <Button 
              onClick={() => setShowCreateDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Workspace
            </Button>
          </div>

          {/* Workspaces Grid */}
          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array(6).fill(0).map((_, i) => (
                <Card key={i} className="shadow-lg border-0 bg-white/90 backdrop-blur-sm animate-pulse">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                      <div className="h-3 bg-slate-200 rounded w-full"></div>
                      <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                      <div className="flex gap-2">
                        <div className="h-6 bg-slate-200 rounded w-16"></div>
                        <div className="h-6 bg-slate-200 rounded w-20"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
              <CardContent className="p-12 text-center">
                <Building2 className="w-16 h-16 mx-auto mb-6 text-red-300" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Error Loading Workspaces</h3>
                <p className="text-slate-600 mb-6">{error.message}</p>
              </CardContent>
            </Card>
          ) : workspaces.length === 0 ? (
            <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
              <CardContent className="p-12 text-center">
                <Building2 className="w-16 h-16 mx-auto mb-6 text-slate-300" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">No Workspaces Yet</h3>
                <p className="text-slate-600 mb-6 max-w-md mx-auto">
                  Create your first workspace to set up custom document processing workflows for your ministry or team.
                </p>
                <Button 
                  onClick={() => setShowCreateDialog(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Workspace
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {workspaces.map((workspace) => (
                <WorkspaceCard 
                  key={workspace.id} 
                  workspace={workspace}
                  onUpdate={refetch}
                />
              ))}
            </div>
          )}

          <CreateWorkspaceDialog
            open={showCreateDialog}
            onClose={() => setShowCreateDialog(false)}
            onSubmit={handleCreateWorkspace}
          />
        </div>
      </div>
    </div>
  );
}


