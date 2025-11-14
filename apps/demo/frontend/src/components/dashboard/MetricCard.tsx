import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

const colorVariants = {
  blue: {
    bg: "bg-blue-500",
    light: "bg-blue-50",
    text: "text-blue-700"
  },
  green: {
    bg: "bg-emerald-500", 
    light: "bg-emerald-50",
    text: "text-emerald-700"
  },
  yellow: {
    bg: "bg-amber-500",
    light: "bg-amber-50", 
    text: "text-amber-700"
  },
  purple: {
    bg: "bg-purple-500",
    light: "bg-purple-50",
    text: "text-purple-700"
  }
};

export default function MetricCard({ title, value, icon: Icon, trend, color = "blue" }) {
  const colors = colorVariants[color];
  
  return (
    <Card className="relative overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 border-0 bg-white/90 backdrop-blur-sm">
      <div className={`absolute top-0 right-0 w-20 h-20 ${colors.bg} opacity-10 rounded-full transform translate-x-6 -translate-y-6`} />
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-600">{title}</p>
            <p className="text-3xl font-bold text-slate-900">{value}</p>
          </div>
          <div className={`${colors.light} ${colors.text} p-3 rounded-xl`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
        {trend && (
          <div className="flex items-center gap-1 mt-4">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-medium text-emerald-600">{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


