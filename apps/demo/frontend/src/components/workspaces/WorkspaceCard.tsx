import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  Settings, 
  Users, 
  FileText, 
  Shield,
  Calendar,
  Upload,
  Mail,
  Smartphone,
  Globe,
  Scan
} from "lucide-react";
import { format } from "date-fns";

const intakeIcons = {
  web_upload: Upload,
  email: Mail,
  mobile: Smartphone,
  citizen_portal: Globe,
  scan: Scan
};

const ministryColors = {
  health: "bg-red-50 text-red-700 border-red-200",
  education: "bg-blue-50 text-blue-700 border-blue-200",
  transportation: "bg-green-50 text-green-700 border-green-200",
  justice: "bg-purple-50 text-purple-700 border-purple-200",
  finance: "bg-yellow-50 text-yellow-700 border-yellow-200",
  environment: "bg-emerald-50 text-emerald-700 border-emerald-200",
  social_services: "bg-pink-50 text-pink-700 border-pink-200"
};

export default function WorkspaceCard({ workspace, onUpdate }) {
  const ministryColor = ministryColors[workspace.ministry] || "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm hover:shadow-xl transition-all duration-200">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{workspace.name}</CardTitle>
              <Badge className={`${ministryColor} border text-xs mt-1`}>
                {workspace.ministry.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-slate-600 text-sm line-clamp-2">{workspace.description}</p>
        
        {/* Intake Methods */}
        {workspace.intake_methods && workspace.intake_methods.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-2">INTAKE METHODS</div>
            <div className="flex flex-wrap gap-2">
              {workspace.intake_methods.map((method) => {
                const Icon = intakeIcons[method] || Upload;
                return (
                  <div key={method} className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded text-xs">
                    <Icon className="w-3 h-3" />
                    <span className="capitalize">{method.replace('_', ' ')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Workspace Stats */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">0</div>
            <div className="text-xs text-slate-500">Documents</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">
              {workspace.retention_policy?.replace('_', ' ') || 'N/A'}
            </div>
            <div className="text-xs text-slate-500">Retention</div>
          </div>
        </div>

        {/* Security & Status */}
        <div className="flex items-center justify-between pt-2 border-t text-xs">
          <div className="flex items-center gap-1">
            <Shield className="w-3 h-3 text-green-600" />
            <span className="text-slate-600 capitalize">{workspace.access_level}</span>
          </div>
          <Badge 
            variant="outline" 
            className={workspace.status === 'active' 
              ? 'bg-green-50 text-green-700 border-green-200' 
              : 'bg-slate-100 text-slate-600 border-slate-200'
            }
          >
            {workspace.status}
          </Badge>
        </div>

        <div className="text-xs text-slate-500">
          {workspace.createdAt && !isNaN(new Date(workspace.createdAt).getTime()) ? (
            <>Created {format(new Date(workspace.createdAt), "MMM d, yyyy")}</>
          ) : workspace.created_date && !isNaN(new Date(workspace.created_date).getTime()) ? (
            <>Created {format(new Date(workspace.created_date), "MMM d, yyyy")}</>
          ) : (
            <>Created recently</>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


