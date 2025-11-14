import React from "react"
import { Link, useLocation } from "react-router-dom"
import { createPageUrl } from "@/utils"
import {
  LayoutDashboard,
  Upload,
  List,
  Building2,
  BarChart3,
  Settings,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils"

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()

  const navItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: createPageUrl("Dashboard") },
    { name: "Upload", icon: Upload, path: createPageUrl("Upload") },
    { name: "Queue", icon: List, path: createPageUrl("Queue") },
    { name: "Workspaces", icon: Building2, path: createPageUrl("Workspaces") },
    { name: "Analytics", icon: BarChart3, path: createPageUrl("Analytics") },
    { name: "Admin", icon: Settings, path: createPageUrl("Admin") },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Sidebar Navigation */}
      <nav className="fixed left-0 top-0 h-full w-64 bg-white/80 backdrop-blur-sm border-r border-slate-200 shadow-lg z-40">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-8">
            AI OCR
          </h1>
          <div className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className={cn(
                      "w-full justify-start",
                      isActive && "bg-blue-600 text-white hover:bg-blue-700"
                    )}
                  >
                    <Icon className="w-4 h-4 mr-3" />
                    {item.name}
                  </Button>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="ml-64">
        {children}
      </main>
    </div>
  )
}


