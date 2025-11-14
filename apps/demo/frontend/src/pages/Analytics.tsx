import React, { useState, useEffect } from "react";
import { Document } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, 
  Clock, 
  BarChart3, 
  DollarSign,
  TrendingUp,
  Download
} from "lucide-react";
import { subDays, format } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';

import StatCard from "@/components/analytics/StatCard";

// Mock data generation for charts
const generateDateRangeData = (docs, days) => {
  const data = [];
  const endDate = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(endDate, i);
    const dateString = format(date, "MMM d");
    const count = docs.filter(d => format(new Date(d.created_date), "yyyy-MM-dd") === format(date, "yyyy-MM-dd")).length;
    data.push({ name: dateString, documents: count });
  }
  return data;
};

const getMinistryDistribution = (docs) => {
  const ministryCounts = {};
  docs.forEach(doc => {
    const ministry = doc.ministry.charAt(0).toUpperCase() + doc.ministry.slice(1);
    ministryCounts[ministry] = (ministryCounts[ministry] || 0) + 1;
  });
  return Object.entries(ministryCounts).map(([name, value]) => ({ name, value }));
};

const getStatusBreakdown = (docs) => {
  const statusCounts = {};
  docs.forEach(doc => {
    const status = doc.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6'];

export default function AnalyticsPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const docData = await Document.list();
    setDocuments(docData);
    setLoading(false);
  };
  
  const filteredDocs = documents.filter(doc => {
    const docDate = new Date(doc.created_date);
    const rangeStartDate = subDays(new Date(), timeRange);
    return docDate >= rangeStartDate;
  });

  const documentsByTime = generateDateRangeData(filteredDocs, timeRange);
  const ministryDistribution = getMinistryDistribution(filteredDocs);
  const statusBreakdown = getStatusBreakdown(filteredDocs);
  const totalProcessed = filteredDocs.length;
  const avgAccuracy = totalProcessed > 0 
    ? (filteredDocs.reduce((sum, doc) => sum + (doc.confidence_score || 0), 0) / totalProcessed).toFixed(1)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Platform Analytics</h1>
              <p className="text-slate-600">Analyze performance, efficiency, and document trends</p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={String(timeRange)} onValueChange={(val) => setTimeRange(Number(val))}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="90">Last 90 Days</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard title="Documents Processed" value={totalProcessed} icon={FileText} />
            <StatCard title="Average Accuracy" value={`${avgAccuracy}%`} icon={TrendingUp} />
            <StatCard title="Est. Time Saved" value="1,240 hrs" icon={Clock} />
            <StatCard title="Est. Cost Savings" value="$25,800" icon={DollarSign} />
          </div>

          {/* Charts */}
          <div className="space-y-6">
            <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Documents Processed Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={documentsByTime}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="documents" fill="#3b82f6" name="Documents" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Distribution by Ministry</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={ministryDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        fill="#8884d8"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {ministryDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Document Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={statusBreakdown} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#10b981" name="Count" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


