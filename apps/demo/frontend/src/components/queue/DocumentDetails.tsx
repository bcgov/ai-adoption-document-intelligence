import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { 
  FileText, 
  Calendar, 
  Building2, 
  ExternalLink, 
  CheckCircle, 
  AlertTriangle,
  Clock,
  Eye
} from "lucide-react";
import OCRMarkupViewer from "./OCRMarkupViewer";

export default function DocumentDetails({ document }) {
  const [showMarkupViewer, setShowMarkupViewer] = useState(false);

  // Debug: Log what OCR data is available (must be before early return)
  React.useEffect(() => {
    if (document && document.extracted_data) {
      console.log('Document OCR Data:', {
        hasWordPositions: !!document.extracted_data.word_positions,
        wordPositionsCount: document.extracted_data.word_positions?.length || 0,
        hasPdfPages: !!document.extracted_data.pdf_pages,
        pdfPagesCount: document.extracted_data.pdf_pages?.length || 0,
        hasContent: !!document.extracted_data.content,
        contentLength: document.extracted_data.content?.length || 0,
        allKeys: Object.keys(document.extracted_data)
      });
    }
  }, [document]);

  if (!document) {
    return (
      <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
        <CardContent className="p-6 text-center text-slate-500">
          <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <p>Select a document from the queue to view details</p>
        </CardContent>
      </Card>
    );
  }

  // Check if OCR data exists - either word positions, PDF pages, or extracted content
  const hasOCRData = document.extracted_data && (
    document.extracted_data.word_positions || 
    document.extracted_data.pdf_pages ||
    (document.extracted_data.content && document.extracted_data.content.length > 0)
  );

  const getStatusConfig = (status) => {
    const configs = {
      uploaded: { color: "bg-slate-100 text-slate-700", label: "Uploaded", icon: FileText },
      processing: { color: "bg-blue-100 text-blue-700", label: "Processing", icon: Clock },
      completed: { color: "bg-green-100 text-green-700", label: "Completed", icon: CheckCircle },
      needs_validation: { color: "bg-amber-100 text-amber-700", label: "Needs Review", icon: AlertTriangle }
    };
    return configs[status] || configs.uploaded;
  };

  const statusConfig = getStatusConfig(document.status);
  const StatusIcon = statusConfig.icon;

  return (
    <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Document Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Document Info */}
        <div>
          <h3 className="font-semibold text-slate-900 mb-2 truncate">{document.title}</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span className="capitalize">{document.ministry.replace('_', ' ')}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>{format(new Date(document.created_date), "MMM d, yyyy 'at' h:mm a")}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge className={statusConfig.color}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
          </div>
        </div>

        {/* Processing Details */}
        <div className="border-t pt-4">
          <h4 className="font-semibold text-slate-900 mb-3">Processing Information</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Intake Method:</span>
              <span className="font-medium capitalize">{document.intake_method.replace('_', ' ')}</span>
            </div>
            
            {document.confidence_score && (
              <div className="flex justify-between">
                <span className="text-slate-600">OCR Confidence:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{Math.round(document.confidence_score)}%</span>
                  {document.confidence_score < 95 && (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
              </div>
            )}
            
            <div className="flex justify-between">
              <span className="text-slate-600">Priority:</span>
              <span className="font-medium capitalize">{document.priority}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-600">File Type:</span>
              <span className="font-medium uppercase">{document.file_type}</span>
            </div>
          </div>
        </div>

        {/* OCR Verification - Extracted Text */}
        {document.extracted_data?.content && (
          <div className="border-t pt-4">
            <h4 className="font-semibold text-slate-900 mb-3">OCR Extracted Text</h4>
            <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {document.extracted_data.content.length > 500 
                  ? document.extracted_data.content.substring(0, 500) + '...'
                  : document.extracted_data.content
                }
              </p>
              {document.extracted_data.content.length > 500 && (
                <p className="text-xs text-slate-500 mt-2">
                  ({document.extracted_data.content.length} characters total)
                </p>
              )}
            </div>
          </div>
        )}

        {/* Extracted Data Preview */}
        {document.extracted_data && Object.keys(document.extracted_data).length > 0 && (
          <div className="border-t pt-4">
            <h4 className="font-semibold text-slate-900 mb-3">Extracted Data</h4>
            <div className="space-y-2 text-sm">
              {Object.entries(document.extracted_data)
                .filter(([key]) => 
                  key !== 'word_positions' && 
                  key !== 'pdf_pages' && 
                  key !== 'image_dimensions' &&
                  key !== 'content' &&
                  typeof document.extracted_data[key] !== 'object'
                )
                .slice(0, 3)
                .map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-slate-600 capitalize">{key.replace('_', ' ')}:</span>
                  <span className="font-medium max-w-32 truncate">{String(value)}</span>
                </div>
              ))}
              {Object.keys(document.extracted_data).filter(key => 
                key !== 'word_positions' && 
                key !== 'pdf_pages' && 
                key !== 'image_dimensions' &&
                key !== 'content'
              ).length > 3 && (
                <div className="text-xs text-slate-500 italic">
                  +{Object.keys(document.extracted_data).filter(key => 
                    key !== 'word_positions' && 
                    key !== 'pdf_pages' && 
                    key !== 'image_dimensions' &&
                    key !== 'content'
                  ).length - 3} more fields
                </div>
              )}
            </div>
          </div>
        )}

        {/* OCR Data Status */}
        {document.extracted_data && (
          <div className="border-t pt-4">
            <h4 className="font-semibold text-slate-900 mb-3">OCR Data Status</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Word Positions:</span>
                <Badge variant={document.extracted_data.word_positions ? "default" : "outline"}>
                  {document.extracted_data.word_positions 
                    ? `${document.extracted_data.word_positions.length} words`
                    : "Not available"}
                </Badge>
              </div>
              {document.file_type === "pdf" && (
                <div className="flex justify-between">
                  <span className="text-slate-600">PDF Pages:</span>
                  <Badge variant={document.extracted_data.pdf_pages ? "default" : "outline"}>
                    {document.extracted_data.pdf_pages 
                      ? `${document.extracted_data.pdf_pages.length} pages`
                      : "Not available"}
                  </Badge>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Extracted Text:</span>
                <Badge variant={document.extracted_data.content ? "default" : "outline"}>
                  {document.extracted_data.content 
                    ? `${document.extracted_data.content.length} chars`
                    : "Not available"}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="border-t pt-4 space-y-2">
          {hasOCRData && (
            <Button 
              variant="default" 
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              onClick={() => setShowMarkupViewer(true)}
            >
              <Eye className="w-4 h-4 mr-2" />
              View OCR Markup
            </Button>
          )}
          
          {document.file_url && (
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => window.open(document.file_url, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View Original File
            </Button>
          )}
          
          {document.status === "needs_validation" && (
            <Button className="w-full bg-blue-600 hover:bg-blue-700">
              <CheckCircle className="w-4 h-4 mr-2" />
              Validate Document
            </Button>
          )}
        </div>

        {/* OCR Markup Viewer */}
        {hasOCRData && (
          <OCRMarkupViewer
            document={{
              file_url: document.file_url,
              file_type: document.file_type,
              extracted_data: document.extracted_data,
            }}
            open={showMarkupViewer}
            onClose={() => setShowMarkupViewer(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}


