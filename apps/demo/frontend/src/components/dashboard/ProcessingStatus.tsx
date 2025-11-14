import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, CheckCircle, AlertCircle, FileText } from "lucide-react";

export default function ProcessingStatus({ documents, loading }) {
  const getStatusCounts = () => {
    const total = documents.length;
    const processing = documents.filter(d => d.status === "processing").length;
    const completed = documents.filter(d => d.status === "completed").length;
    const needsValidation = documents.filter(d => d.status === "needs_validation").length;
    const uploaded = documents.filter(d => d.status === "uploaded").length;
    
    return { total, processing, completed, needsValidation, uploaded };
  };

  const counts = getStatusCounts();
  const completionRate = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;

  return (
    <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Processing Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-4">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className="text-3xl font-bold text-slate-900 mb-1">{completionRate}%</div>
              <div className="text-sm text-slate-600">Processing Efficiency</div>
              <Progress value={completionRate} className="mt-2" />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-slate-600" />
                  <span className="font-medium text-slate-700">Uploaded</span>
                </div>
                <span className="font-bold text-slate-900">{counts.uploaded}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-700">Processing</span>
                </div>
                <span className="font-bold text-blue-900">{counts.processing}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <span className="font-medium text-amber-700">Needs Review</span>
                </div>
                <span className="font-bold text-amber-900">{counts.needsValidation}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-green-50">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-700">Completed</span>
                </div>
                <span className="font-bold text-green-900">{counts.completed}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}


