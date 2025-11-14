import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { FileText, Clock, CheckCircle, AlertTriangle } from "lucide-react";

const statusConfig = {
  uploaded: { icon: FileText, color: "bg-slate-100 text-slate-700", label: "Uploaded" },
  processing: { icon: Clock, color: "bg-blue-100 text-blue-700", label: "Processing" },
  completed: { icon: CheckCircle, color: "bg-green-100 text-green-700", label: "Completed" },
  needs_validation: { icon: AlertTriangle, color: "bg-amber-100 text-amber-700", label: "Needs Review" }
};

export default function RecentActivity({ documents, loading }) {
  return (
    <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Recent Document Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {loading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-4 rounded-lg bg-slate-50">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))
          ) : (
            documents.slice(0, 10).map((doc) => {
              const status = statusConfig[doc.status] || statusConfig.uploaded;
              const StatusIcon = status.icon;
              
              return (
                <div key={doc.id} className="flex items-center space-x-4 p-4 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                    <StatusIcon className="w-5 h-5 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{doc.title}</p>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <span>{doc.ministry}</span>
                      <span>•</span>
                      <span>{format(new Date(doc.created_date), "MMM d, h:mm a")}</span>
                      {doc.confidence_score && (
                        <>
                          <span>•</span>
                          <span>{Math.round(doc.confidence_score)}% confidence</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge className={status.color}>
                    {status.label}
                  </Badge>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}


