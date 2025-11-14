import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter } from "lucide-react";

const ministries = [
  { value: "all", label: "All Ministries" },
  { value: "health", label: "Health" },
  { value: "education", label: "Education" },
  { value: "transportation", label: "Transportation" },
  { value: "justice", label: "Justice" },
  { value: "finance", label: "Finance" },
  { value: "environment", label: "Environment" },
  { value: "social_services", label: "Social Services" }
];

const statuses = [
  { value: "all", label: "All Status" },
  { value: "uploaded", label: "Uploaded" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "needs_validation", label: "Needs Review" },
  { value: "archived", label: "Archived" }
];

export default function QueueFilters({ 
  statusFilter, 
  ministryFilter, 
  onStatusChange, 
  onMinistryChange 
}) {
  return (
    <div className="flex gap-2">
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-40">
          <Filter className="w-4 h-4 mr-2" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statuses.map(status => (
            <SelectItem key={status.value} value={status.value}>
              {status.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={ministryFilter} onValueChange={onMinistryChange}>
        <SelectTrigger className="w-40">
          <SelectValue />
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
  );
}


