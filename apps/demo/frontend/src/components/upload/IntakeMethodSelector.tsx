import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Monitor, 
  Mail, 
  Smartphone, 
  Globe, 
  Scan,
  CheckCircle
} from "lucide-react";

const intakeMethods = [
  {
    id: "web_upload",
    title: "Web Upload",
    description: "Direct file upload via web interface",
    icon: Monitor
  },
  {
    id: "email",
    title: "Email Processing",
    description: "Documents sent via dedicated email addresses",
    icon: Mail
  },
  {
    id: "mobile",
    title: "Mobile Capture",
    description: "Field staff mobile document capture",
    icon: Smartphone
  },
  {
    id: "citizen_portal",
    title: "Citizen Portal",
    description: "Public-facing document submission portal",
    icon: Globe
  },
  {
    id: "scan",
    title: "Scanner Integration",
    description: "Connected scanning devices",
    icon: Scan
  }
];

export default function IntakeMethodSelector({ value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-3">Document Intake Method</label>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {intakeMethods.map((method) => {
          const Icon = method.icon;
          const isSelected = value === method.id;
          
          return (
            <Card
              key={method.id}
              className={`cursor-pointer transition-all duration-200 ${
                isSelected 
                  ? "ring-2 ring-blue-500 bg-blue-50 border-blue-200" 
                  : "hover:bg-slate-50 border-slate-200"
              }`}
              onClick={() => onChange(method.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <Icon className={`w-5 h-5 ${isSelected ? "text-blue-600" : "text-slate-600"}`} />
                  {isSelected && (
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                  )}
                </div>
                <h3 className={`font-medium mb-1 ${isSelected ? "text-blue-900" : "text-slate-900"}`}>
                  {method.title}
                </h3>
                <p className={`text-xs ${isSelected ? "text-blue-700" : "text-slate-600"}`}>
                  {method.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


