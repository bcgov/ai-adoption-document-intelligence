import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Image } from "lucide-react";

export default function DropZone({ onFilesSelect }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    onFilesSelect(files);
  };

  const handleFileSelect = (e) => {
    onFilesSelect(e.target.files);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
        isDragOver 
          ? "border-blue-500 bg-blue-50" 
          : "border-slate-300 hover:border-slate-400"
      }`}
    >
      <div className="space-y-4">
        <div className="w-16 h-16 mx-auto bg-slate-100 rounded-full flex items-center justify-center">
          <Upload className="w-8 h-8 text-slate-600" />
        </div>
        
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Drop files here or click to upload
          </h3>
          <p className="text-slate-600 mb-4">
            Support for PDF documents and image files (PNG, JPG, JPEG)
          </p>
        </div>

        <div className="flex justify-center items-center gap-4 text-sm text-slate-500 mb-6">
          <div className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            <span>PDF</span>
          </div>
          <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
          <div className="flex items-center gap-1">
            <Image className="w-4 h-4" />
            <span>PNG, JPG</span>
          </div>
        </div>

        <input
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        
        <Button asChild variant="outline" className="border-slate-300">
          <label htmlFor="file-upload" className="cursor-pointer">
            Select Files
          </label>
        </Button>
      </div>
    </div>
  );
}


