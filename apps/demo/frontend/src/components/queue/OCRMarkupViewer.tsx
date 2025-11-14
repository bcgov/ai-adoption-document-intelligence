import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import { WordPosition, PDFPageData } from "@/integrations/Core";
import * as pdfjsLib from "pdfjs-dist";

// Configure pdfjs worker - use worker from public folder
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface OCRMarkupViewerProps {
  document: {
    file_url: string;
    file_type: "pdf" | "image";
    extracted_data?: {
      word_positions?: WordPosition[];
      pdf_pages?: PDFPageData[];
      image_dimensions?: { width: number; height: number };
      content?: string;
    };
  };
  open: boolean;
  onClose: () => void;
}

export default function OCRMarkupViewer({ document, open, onClose }: OCRMarkupViewerProps) {
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPages, setPdfPages] = useState<{ pageNumber: number; imageUrl: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (open && document.file_type === "pdf") {
      loadPDFPages();
    }
  }, [open, document.file_url, document.file_type]);

  const loadPDFPages = async () => {
    setLoading(true);
    try {
      const response = await fetch(document.file_url);
      const arrayBuffer = await response.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const pages: { pageNumber: number; imageUrl: string }[] = [];
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        
        // Use window.document to avoid shadowing the component prop
        const canvas = window.document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        
        if (!context) continue;
        
        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        }).promise;
        
        pages.push({
          pageNumber: pageNum,
          imageUrl: canvas.toDataURL("image/png"),
        });
      }
      
      setPdfPages(pages);
      setCurrentPage(1);
    } catch (error) {
      console.error("Error loading PDF:", error);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentPageWords = (): WordPosition[] => {
    if (document.file_type === "pdf") {
      const pdfPages = document.extracted_data?.pdf_pages;
      console.log('🔍 PDF Words Debug:', {
        hasPdfPages: !!pdfPages,
        pdfPagesCount: pdfPages?.length || 0,
        currentPage,
        pageData: pdfPages?.find(p => p.pageNumber === currentPage),
        wordsInCurrentPage: pdfPages?.find(p => p.pageNumber === currentPage)?.words?.length || 0
      });
      if (!pdfPages) return [];
      const pageData = pdfPages.find(p => p.pageNumber === currentPage);
      const words = pageData?.words || [];
      if (words.length > 0) {
        console.log('✅ Found words for PDF page:', {
          pageNumber: currentPage,
          wordsCount: words.length,
          sampleWord: words[0]
        });
      } else {
        console.warn('⚠️ No words found for PDF page:', currentPage);
      }
      return words;
    } else {
      const words = document.extracted_data?.word_positions || [];
      console.log('🔍 Image Words Debug:', {
        hasWordPositions: !!document.extracted_data?.word_positions,
        wordsCount: words.length,
        sampleWord: words[0]
      });
      return words;
    }
  };

  const getCurrentPageDimensions = (): { width: number; height: number } => {
    if (document.file_type === "pdf") {
      const pdfPages = document.extracted_data?.pdf_pages;
      if (!pdfPages) {
        // Fallback: try to get dimensions from image after it loads
        if (imageRef.current) {
          return {
            width: imageRef.current.naturalWidth || 0,
            height: imageRef.current.naturalHeight || 0,
          };
        }
        return { width: 0, height: 0 };
      }
      const pageData = pdfPages.find(p => p.pageNumber === currentPage);
      return {
        width: pageData?.pageWidth || 0,
        height: pageData?.pageHeight || 0,
      };
    } else {
      // Try stored dimensions first, then fallback to image natural size
      const stored = document.extracted_data?.image_dimensions;
      if (stored && stored.width > 0 && stored.height > 0) {
        return stored;
      }
      if (imageRef.current) {
        return {
          width: imageRef.current.naturalWidth || 0,
          height: imageRef.current.naturalHeight || 0,
        };
      }
      return { width: 0, height: 0 };
    }
  };

  const getImageUrl = (): string => {
    if (document.file_type === "pdf") {
      const page = pdfPages.find(p => p.pageNumber === currentPage);
      return page?.imageUrl || "";
    }
    return document.file_url;
  };

  const words = getCurrentPageWords();
  const dimensions = getCurrentPageDimensions();
  const imageUrl = getImageUrl();
  const totalPages = document.file_type === "pdf" 
    ? (document.extracted_data?.pdf_pages?.length || 0)
    : 1;

  // Debug when component renders
  React.useEffect(() => {
    console.log('🖼️ OCRMarkupViewer Render:', {
      open,
      fileType: document.file_type,
      hasExtractedData: !!document.extracted_data,
      wordsCount: words.length,
      dimensions,
      currentPage,
      totalPages,
      hasImageUrl: !!imageUrl,
      showBoundingBoxes
    });
  }, [open, words.length, dimensions, currentPage, imageUrl, showBoundingBoxes]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  const renderBoundingBoxes = () => {
    console.log('🎨 renderBoundingBoxes called:', {
      showBoundingBoxes,
      hasImageRef: !!imageRef.current,
      wordsCount: words.length,
      dimensions,
      imageNaturalSize: imageRef.current ? {
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight
      } : null,
      imageDisplaySize: imageRef.current ? {
        width: imageRef.current.getBoundingClientRect().width,
        height: imageRef.current.getBoundingClientRect().height
      } : null
    });

    if (!showBoundingBoxes) {
      console.log('❌ Bounding boxes hidden (toggle off)');
      return null;
    }
    
    if (!imageRef.current) {
      console.log('❌ No image reference (image not loaded yet)');
      return null;
    }
    
    if (words.length === 0) {
      console.warn('⚠️ No words available to render boxes');
      return null;
    }

    const img = imageRef.current;
    const imgRect = img.getBoundingClientRect();
    
    // Get actual dimensions - use natural size if stored dimensions aren't available
    const actualWidth = dimensions.width || img.naturalWidth || imgRect.width;
    const actualHeight = dimensions.height || img.naturalHeight || imgRect.height;
    
    console.log('📐 Dimension calculations:', {
      storedDimensions: dimensions,
      naturalDimensions: { width: img.naturalWidth, height: img.naturalHeight },
      displayDimensions: { width: imgRect.width, height: imgRect.height },
      actualDimensions: { width: actualWidth, height: actualHeight }
    });
    
    if (actualWidth === 0 || actualHeight === 0) {
      console.error('❌ Invalid dimensions (0 width or height)');
      return null;
    }
    
    const scaleX = imgRect.width / actualWidth;
    const scaleY = imgRect.height / actualHeight;
    
    console.log('🔢 Scale factors:', { scaleX, scaleY });
    
    if (words.length > 0) {
      console.log('✅ Rendering', words.length, 'bounding boxes');
      console.log('📝 Sample word bbox:', words[0]?.bbox);
    }

    return words.map((word, index) => {
      const left = word.bbox.x0 * scaleX;
      const top = word.bbox.y0 * scaleY;
      const width = (word.bbox.x1 - word.bbox.x0) * scaleX;
      const height = (word.bbox.y1 - word.bbox.y0) * scaleY;

      // Color based on confidence
      const confidenceColor = word.confidence >= 90 
        ? "rgba(34, 197, 94, 0.3)" // green
        : word.confidence >= 70
        ? "rgba(251, 191, 36, 0.3)" // yellow
        : "rgba(239, 68, 68, 0.3)"; // red

      return (
        <div
          key={index}
          className="absolute border-2 pointer-events-none"
          style={{
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
            borderColor: confidenceColor.replace("0.3", "1"),
            backgroundColor: confidenceColor,
          }}
          title={`${word.text} (${Math.round(word.confidence)}% confidence)`}
        />
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] overflow-hidden p-0 m-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">OCR Markup View</DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-slate-100">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0">
          {/* Controls */}
          <div className="px-6 py-3 border-b bg-slate-50 flex items-center justify-between flex-wrap gap-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
              >
                {showBoundingBoxes ? "Hide" : "Show"} Bounding Boxes
              </Button>
              
              {document.file_type === "pdf" && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-slate-600">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || loading}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm text-slate-600 min-w-[60px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button variant="outline" size="sm" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetZoom}>
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Image/PDF Viewer */}
          <div 
            ref={containerRef}
            className="flex-1 overflow-auto bg-slate-100 p-6 flex items-center justify-center min-h-0"
          >
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-slate-600">Loading PDF pages...</p>
                </div>
              </div>
            ) : imageUrl ? (
              <div className="relative inline-block" style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}>
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Document page"
                  className="max-w-full h-auto shadow-lg"
                  style={{ display: "block" }}
                />
                {renderBoundingBoxes()}
              </div>
            ) : (
              <div className="text-center text-slate-500">
                No image available
              </div>
            )}
          </div>

          {/* Stats Footer */}
          <div className="px-6 py-3 border-t bg-slate-50 flex items-center justify-between text-sm flex-shrink-0">
            <div className="flex items-center gap-4">
              <span className="text-slate-600">
                Words detected: <strong>{words.length}</strong>
              </span>
              {document.file_type === "pdf" && document.extracted_data?.pdf_pages && (
                <span className="text-slate-600">
                  Page confidence: <strong>{Math.round(document.extracted_data.pdf_pages[currentPage - 1]?.confidence || 0)}%</strong>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Green: ≥90% | Yellow: 70-89% | Red: &lt;70%
              </Badge>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

