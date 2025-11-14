import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@apollo/client";
import { GET_DOCUMENTS } from "@/graphql/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Search, 
  Filter, 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  ExternalLink,
  Eye
} from "lucide-react";
import { format } from "date-fns";

import QueueFilters from "@/components/queue/QueueFilters";
import DocumentDetails from "@/components/queue/DocumentDetails";

export default function QueuePage() {
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ministryFilter, setMinistryFilter] = useState("all");

  const { data, loading, error, refetch } = useQuery(GET_DOCUMENTS, {
    variables: {
      limit: 50,
    },
  });

  const documents = data?.documents || [];

  const filteredDocuments = useMemo(() => {
    let filtered = [...documents];

    if (searchQuery) {
      filtered = filtered.filter(doc => 
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.ministry.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(doc => doc.status === statusFilter);
    }

    if (ministryFilter !== "all") {
      filtered = filtered.filter(doc => doc.ministry === ministryFilter);
    }

    return filtered;
  }, [documents, searchQuery, statusFilter, ministryFilter]);


  const getStatusConfig = (status) => {
    const configs = {
      uploaded: { color: "bg-slate-100 text-slate-700", label: "Uploaded", icon: FileText },
      processing: { color: "bg-blue-100 text-blue-700", label: "Processing", icon: Clock },
      completed: { color: "bg-green-100 text-green-700", label: "Completed", icon: CheckCircle },
      needs_validation: { color: "bg-amber-100 text-amber-700", label: "Needs Review", icon: AlertTriangle },
      archived: { color: "bg-slate-100 text-slate-600", label: "Archived", icon: FileText }
    };
    return configs[status] || configs.uploaded;
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: "text-slate-600",
      medium: "text-blue-600",
      high: "text-amber-600",
      urgent: "text-red-600"
    };
    return colors[priority] || colors.medium;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Processing Queue</h1>
            <p className="text-slate-600">Monitor and manage document processing status across all ministries</p>
          </div>

          <div className="grid lg:grid-cols-4 gap-6">
            {/* Main Queue */}
            <div className="lg:col-span-3">
              <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <CardTitle className="text-xl">Document Queue ({filteredDocuments.length})</CardTitle>
                    
                    <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="Search documents..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 w-full md:w-64"
                        />
                      </div>
                      
                      <QueueFilters
                        statusFilter={statusFilter}
                        ministryFilter={ministryFilter}
                        onStatusChange={setStatusFilter}
                        onMinistryChange={setMinistryFilter}
                      />
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead>Document</TableHead>
                          <TableHead>Ministry</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading || error ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8">
                              <div className="flex items-center justify-center space-x-2">
                                {loading ? (
                                  <>
                                    <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                    <span>Loading documents...</span>
                                  </>
                                ) : (
                                  <span className="text-red-600">Error loading documents: {error?.message}</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : filteredDocuments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                              No documents found matching your criteria
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredDocuments.map((doc) => {
                            const statusConfig = getStatusConfig(doc.status);
                            const StatusIcon = statusConfig.icon;
                            
                            return (
                              <TableRow 
                                key={doc.id} 
                                className="hover:bg-slate-50 cursor-pointer transition-colors"
                                onClick={() => setSelectedDocument(doc)}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <FileText className="w-4 h-4 text-slate-600" />
                                    <div className="max-w-48 truncate font-medium">{doc.title}</div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="capitalize">
                                    {doc.ministry.replace('_', ' ')}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge className={statusConfig.color}>
                                    <StatusIcon className="w-3 h-3 mr-1" />
                                    {statusConfig.label}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {doc.confidence_score ? (
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{Math.round(doc.confidence_score)}%</span>
                                      {doc.confidence_score < 95 && (
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className={`capitalize font-medium ${getPriorityColor(doc.priority)}`}>
                                    {doc.priority}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {format(new Date(doc.created_date), "MMM d, h:mm a")}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDocument(doc);
                                      }}
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                    {doc.file_url && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(doc.file_url, '_blank');
                                        }}
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Document Details Sidebar */}
            <div>
              <DocumentDetails document={selectedDocument} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


