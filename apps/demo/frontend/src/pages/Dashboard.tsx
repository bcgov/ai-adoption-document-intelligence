import React from "react";
import { useQuery } from "@apollo/client";
import { GET_DOCUMENTS, GET_WORKSPACES } from "@/graphql/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  TrendingUp,
  Shield,
  Activity,
  Users,
  Zap
} from "lucide-react";
import { format } from "date-fns";

import MetricCard from "@/components/dashboard/MetricCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import ProcessingStatus from "@/components/dashboard/ProcessingStatus";

export default function Dashboard() {
  const { data: documentsData, loading: documentsLoading } = useQuery(GET_DOCUMENTS, {
    variables: { limit: 20 },
  });
  const { data: workspacesData, loading: workspacesLoading } = useQuery(GET_WORKSPACES);

  const documents = documentsData?.documents || [];
  const workspaces = workspacesData?.workspaces || [];
  const loading = documentsLoading || workspacesLoading;

  const getStats = () => {
    const totalDocs = documents.length;
    const processingDocs = documents.filter(d => d.status === "processing").length;
    const completedDocs = documents.filter(d => d.status === "completed").length;
    const needsValidation = documents.filter(d => d.status === "needs_validation").length;
    const avgConfidence = documents.reduce((sum, doc) => sum + (doc.confidence_score || 0), 0) / totalDocs || 0;

    return { totalDocs, processingDocs, completedDocs, needsValidation, avgConfidence };
  };

  const stats = getStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Government OCR Dashboard</h1>
              <p className="text-slate-600">Monitor document processing across all ministries and agencies</p>
            </div>
            <div className="flex gap-3">
              <Link to={createPageUrl("Upload")}>
                <Button className="bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all duration-200">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Documents
                </Button>
              </Link>
              <Link to={createPageUrl("Queue")}>
                <Button variant="outline" className="border-slate-300 hover:bg-slate-50">
                  <Activity className="w-4 h-4 mr-2" />
                  View Queue
                </Button>
              </Link>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <MetricCard
              title="Total Documents"
              value={stats.totalDocs}
              icon={FileText}
              trend="+12% this week"
              color="blue"
            />
            <MetricCard
              title="Processing"
              value={stats.processingDocs}
              icon={Clock}
              trend="3 in queue"
              color="yellow"
            />
            <MetricCard
              title="Completed Today"
              value={stats.completedDocs}
              icon={CheckCircle}
              trend="+5 from yesterday"
              color="green"
            />
            <MetricCard
              title="OCR Accuracy"
              value={`${Math.round(stats.avgConfidence)}%`}
              icon={Zap}
              trend="Above 95% target"
              color="purple"
            />
          </div>

          {/* Content Grid */}
          <div className="grid lg:grid-cols-3 gap-6 mb-8">
            {/* Recent Activity */}
            <div className="lg:col-span-2">
              <RecentActivity documents={documents} loading={loading} />
            </div>

            {/* Processing Status */}
            <div>
              <ProcessingStatus documents={documents} loading={loading} />
            </div>
          </div>

          {/* Workspaces Overview */}
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Users className="w-5 h-5 text-blue-600" />
                Active Workspaces
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workspaces.map((workspace) => (
                  <div key={workspace.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-slate-900">{workspace.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {workspace.ministry}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 mb-3">{workspace.description}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        {documents.filter(d => d.workspace_id === workspace.id).length} documents
                      </span>
                      <Badge 
                        variant="outline" 
                        className={workspace.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                      >
                        {workspace.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}


