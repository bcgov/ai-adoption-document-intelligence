import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const ministries = [
  { value: "health", label: "Ministry of Health" },
  { value: "education", label: "Ministry of Education" },
  { value: "transportation", label: "Ministry of Transportation" },
  { value: "justice", label: "Ministry of Justice" },
  { value: "finance", label: "Ministry of Finance" },
  { value: "environment", label: "Ministry of Environment" },
  { value: "social_services", label: "Ministry of Social Services" }
];

const intakeMethods = [
  { id: "web_upload", label: "Web Upload" },
  { id: "email", label: "Email Processing" },
  { id: "mobile", label: "Mobile Capture" },
  { id: "citizen_portal", label: "Citizen Portal" },
  { id: "scan", label: "Scanner Integration" }
];

const retentionPolicies = [
  { value: "one_year", label: "1 Year" },
  { value: "three_years", label: "3 Years" },
  { value: "seven_years", label: "7 Years" },
  { value: "permanent", label: "Permanent" }
];

const accessLevels = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "restricted", label: "Restricted" },
  { value: "confidential", label: "Confidential" }
];

export default function CreateWorkspaceDialog({ open, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    name: "",
    ministry: "",
    description: "",
    intake_methods: [],
    retention_policy: "seven_years",
    access_level: "internal"
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({
      name: "",
      ministry: "",
      description: "",
      intake_methods: [],
      retention_policy: "seven_years",
      access_level: "internal"
    });
  };

  const handleIntakeMethodChange = (methodId, checked) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        intake_methods: [...prev.intake_methods, methodId]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        intake_methods: prev.intake_methods.filter(id => id !== methodId)
      }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Workspace</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Workspace Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                placeholder="e.g., Health Records Processing"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Ministry *
              </label>
              <Select 
                value={formData.ministry} 
                onValueChange={(value) => setFormData(prev => ({...prev, ministry: value}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select ministry" />
                </SelectTrigger>
                <SelectContent>
                  {ministries.map(ministry => (
                    <SelectItem key={ministry.value} value={ministry.value}>
                      {ministry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description
            </label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
              placeholder="Describe the purpose and scope of this workspace..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Intake Methods
            </label>
            <div className="grid md:grid-cols-2 gap-3">
              {intakeMethods.map(method => (
                <div key={method.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={method.id}
                    checked={formData.intake_methods.includes(method.id)}
                    onCheckedChange={(checked) => handleIntakeMethodChange(method.id, checked)}
                  />
                  <label htmlFor={method.id} className="text-sm font-medium">
                    {method.label}
                  </label>
                </div>
              ))}
            </div>
            {formData.intake_methods.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {formData.intake_methods.map(methodId => {
                  const method = intakeMethods.find(m => m.id === methodId);
                  return (
                    <Badge key={methodId} variant="secondary" className="text-xs">
                      {method?.label}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Retention Policy
              </label>
              <Select 
                value={formData.retention_policy} 
                onValueChange={(value) => setFormData(prev => ({...prev, retention_policy: value}))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {retentionPolicies.map(policy => (
                    <SelectItem key={policy.value} value={policy.value}>
                      {policy.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Access Level
              </label>
              <Select 
                value={formData.access_level} 
                onValueChange={(value) => setFormData(prev => ({...prev, access_level: value}))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accessLevels.map(level => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!formData.name || !formData.ministry}
            >
              Create Workspace
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


