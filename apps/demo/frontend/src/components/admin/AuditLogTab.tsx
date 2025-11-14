import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, subDays } from "date-fns";

const mockAuditLogs = [
  { id: 1, user: "admin@example.gov", action: "Updated System Settings", details: "Enabled Maintenance Mode", timestamp: new Date() },
  { id: 2, user: "john.doe@example.gov", action: "Created Workspace", details: "Workspace: 'Finance Q4 Audits'", timestamp: subDays(new Date(), 1) },
  { id: 3, user: "jane.smith@example.gov", action: "User Login", details: "Successful login from IP 192.168.1.1", timestamp: subDays(new Date(), 2) },
  { id: 4, user: "admin@example.gov", action: "User Role Change", details: "Changed role for 'jane.smith' to Admin", timestamp: subDays(new Date(), 2) },
  { id: 5, user: "system", action: "Document Purge", details: "Purged 1,204 documents older than 7 years", timestamp: subDays(new Date(), 5) },
];

const getActionBadge = (action) => {
  if (action.includes("Update") || action.includes("Change")) return "bg-blue-100 text-blue-800";
  if (action.includes("Create")) return "bg-green-100 text-green-800";
  if (action.includes("Purge") || action.includes("Delete")) return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-800";
};

export default function AuditLogTab() {
  return (
    <Card className="mt-6 shadow-lg border-0 bg-white/90 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>System Audit Log</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockAuditLogs.map(log => (
              <TableRow key={log.id}>
                <TableCell>{format(log.timestamp, "MMM d, yyyy h:mm a")}</TableCell>
                <TableCell className="font-medium">{log.user}</TableCell>
                <TableCell>
                  <Badge className={getActionBadge(log.action)}>{log.action}</Badge>
                </TableCell>
                <TableCell>{log.details}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}


