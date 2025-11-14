import React from "react";
import { Button } from "@/components/ui/button";
import { FileText, Image, X } from "lucide-react";

export default function FilePreview({ file, onRemove }) {
  const isImage = file.type.startsWith("image/");
  const isPDF = file.type === "application/pdf";

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border">
          {isPDF ? (
            <FileText className="w-5 h-5 text-red-500" />
          ) : (
            <Image className="w-5 h-5 text-blue-500" />
          )}
        </div>
        <div>
          <p className="font-medium text-slate-900 truncate max-w-48">{file.name}</p>
          <p className="text-sm text-slate-500">{formatFileSize(file.size)}</p>
        </div>
      </div>
      
      <Button 
        variant="ghost" 
        size="icon"
        onClick={onRemove}
        className="text-slate-400 hover:text-slate-600"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}


