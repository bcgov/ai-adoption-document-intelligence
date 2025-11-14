// Integration functions for file upload and OCR processing using Tesseract.js

import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker - use worker from public folder
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface UploadFileResponse {
  file_url: string;
}

export interface ExtractDataResponse {
  status: 'success' | 'error';
  output?: {
    extracted_fields?: Record<string, any>;
    confidence_score?: number;
    word_positions?: WordPosition[];
    pdf_pages?: PDFPageData[];
    image_dimensions?: { width: number; height: number };
  };
  error?: string;
}

export async function UploadFile({ file }: { file: File }): Promise<UploadFileResponse> {
  // Mock implementation - in real app, this would upload to a storage service
  return new Promise((resolve) => {
    setTimeout(() => {
      // Create a mock file URL
      const mockUrl = URL.createObjectURL(file);
      resolve({ file_url: mockUrl });
    }, 500);
  });
}

export interface WordPosition {
  text: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  confidence: number;
}

async function processImageWithOCR(file: File): Promise<{ 
  text: string; 
  confidence: number; 
  words: WordPosition[];
  imageWidth: number;
  imageHeight: number;
}> {
  const worker = await createWorker('eng');
  try {
    // Configure worker to output word-level data and structured formats
    // In Tesseract.js, we need to explicitly request structured outputs
    try {
      await worker.setParameters({
        // tessedit_pageseg_mode: '1', // Auto page segmentation  
        tessedit_create_hocr: '1',   // Enable hOCR output
        tessedit_create_tsv: '1',     // Enable TSV output  
        tessedit_create_box: '1',    // Enable box output
        hocr_char_boxes: '1',        // Include character boxes in hOCR
      });
      console.log('✅ Worker parameters set successfully');
    } catch (paramError) {
      console.warn('⚠️ Failed to set some parameters, continuing anyway:', paramError);
    }
    
    // Recognize image - Tesseract.js should return structured data with proper configuration
    const result = await worker.recognize(file,{},{'tsv':true});
    
    const text = result.data.text;
    
    // Get hOCR data which contains bounding boxes
    const hocrData = result.data.hocr;
    const tsvData = result.data.tsv;
    
    // Log the complete result structure for debugging
    console.log('🔍 Full Tesseract Result Structure:', {
      hasData: !!result.data,
      dataKeys: result.data ? Object.keys(result.data) : [],
      textLength: result.data?.text?.length || 0,
      hasHocr: !!hocrData,
      hocrLength: hocrData?.length || 0,
      hasTsv: !!tsvData,
      tsvLength: tsvData?.length || 0,
      hasWords: !!(result.data as any).words,
      wordsLength: (result.data as any).words?.length || 0,
      hasBlocks: !!(result.data as any).blocks,
      hasLines: !!(result.data as any).lines,
      hasSymbols: !!(result.data as any).symbols,
      hasBox: !!(result.data as any).box,
      sampleHocr: hocrData ? hocrData.substring(0, 500) : null,
      sampleTsv: tsvData ? tsvData.substring(0, 500) : null,
      fullResult: result
    });
    
    // Check if box data exists (alternative format)
    const boxData = (result.data as any).box;
    if (boxData) {
      console.log('📦 Found box data:', {
        type: typeof boxData,
        length: boxData?.length || 0,
        sample: boxData?.substring ? boxData.substring(0, 500) : boxData
      });
    }
    
    // Parse word positions - try multiple methods
    let words: any[] = [];
    
    // First, try direct words array (most efficient)
    if ((result.data as any).words && Array.isArray((result.data as any).words)) {
      words = (result.data as any).words;
      console.log(`✅ Found ${words.length} words via result.data.words (direct access)`);
    }
    
    // Try extracting words from blocks -> lines -> words hierarchy
    if (words.length === 0 && (result.data as any).blocks) {
      console.log('🔍 Trying to extract words from blocks hierarchy...');
      const blocks = (result.data as any).blocks;
      if (Array.isArray(blocks)) {
        blocks.forEach((block: any) => {
          if (block.lines && Array.isArray(block.lines)) {
            block.lines.forEach((line: any) => {
              if (line.words && Array.isArray(line.words)) {
                words.push(...line.words);
              }
            });
          }
        });
        if (words.length > 0) {
          console.log(`✅ Extracted ${words.length} words from blocks hierarchy`);
        }
      }
    }
    
    // Parse hOCR data to extract word positions
    // hOCR format: HTML with bbox attributes like "bbox 100 200 300 400"
    if (words.length === 0 && hocrData && typeof hocrData === 'string') {
      console.log('🔍 Parsing hOCR data for word positions...');
      
      // Parse hOCR HTML to extract word spans with bbox
      const parser = new DOMParser();
      const doc = parser.parseFromString(hocrData, 'text/html');
      
      // Find all word spans (typically <span class="ocrx_word">)
      const wordSpans = doc.querySelectorAll('span.ocrx_word, span[class*="word"]');
      
      console.log(`📝 Found ${wordSpans.length} word spans in hOCR`);
      
      wordSpans.forEach((span, index) => {
        const title = span.getAttribute('title');
        if (title) {
          // Parse bbox from title attribute: "bbox x0 y0 x1 y1; x_wconf confidence"
          const bboxMatch = title.match(/bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
          const confMatch = title.match(/x_wconf\s+(\d+)/);
          
          if (bboxMatch) {
            const x0 = parseInt(bboxMatch[1], 10);
            const y0 = parseInt(bboxMatch[2], 10);
            const x1 = parseInt(bboxMatch[3], 10);
            const y1 = parseInt(bboxMatch[4], 10);
            const confidence = confMatch ? parseFloat(confMatch[1]) : 0;
            const wordText = span.textContent?.trim() || '';
            
            if (wordText && !isNaN(x0) && !isNaN(y0) && !isNaN(x1) && !isNaN(y1)) {
              words.push({
                text: wordText,
                bbox: {
                  x0,
                  y0,
                  x1,
                  y1,
                },
                confidence,
              });
              
              if (index < 3) {
                console.log(`📝 Word ${index + 1} from hOCR:`, {
                  text: wordText,
                  bbox: { x0, y0, x1, y1 },
                  confidence
                });
              }
            }
          }
        }
      });
      
      if (words.length > 0) {
        console.log(`✅ Extracted ${words.length} words from hOCR data`);
      } else {
        console.warn('⚠️ No words extracted from hOCR data');
      }
    }
    
    // Fallback: Parse TSV data if hOCR didn't work
    if (words.length === 0 && tsvData && typeof tsvData === 'string') {
      console.log('🔍 Trying TSV data as fallback...');
      const lines = tsvData.split('\n');
      
      // Skip header line (first line)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split('\t');
        if (parts.length >= 12) {
          const level = parts[0];
          const left = parseInt(parts[6], 10);
          const top = parseInt(parts[7], 10);
          const width = parseInt(parts[8], 10);
          const height = parseInt(parts[9], 10);
          const conf = parseFloat(parts[10]);
          const wordText = parts[11];
          
          // Only process word-level entries (level 5 in TSV)
          if (level === '5' && !isNaN(left) && !isNaN(top) && !isNaN(width) && !isNaN(height) && wordText.trim()) {
            words.push({
              text: wordText,
              bbox: {
                x0: left,
                y0: top,
                x1: left + width,
                y1: top + height,
              },
              confidence: conf,
            });
          }
        }
      }
      
      if (words.length > 0) {
        console.log(`✅ Extracted ${words.length} words from TSV data`);
      }
    }
    
    // Try parsing box data if available (alternative format)
    if (words.length === 0 && boxData && typeof boxData === 'string') {
      console.log('🔍 Trying to parse box data...');
      // Box format: word x0 y0 x1 y1 page_num
      const boxLines = boxData.split('\n');
      boxLines.forEach((line: string) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          const wordText = parts[0];
          const x0 = parseInt(parts[1], 10);
          const y0 = parseInt(parts[2], 10);
          const x1 = parseInt(parts[3], 10);
          const y1 = parseInt(parts[4], 10);
          
          if (wordText && !isNaN(x0) && !isNaN(y0) && !isNaN(x1) && !isNaN(y1)) {
            words.push({
              text: wordText,
              bbox: { x0, y0, x1, y1 },
              confidence: 0, // Box format doesn't include confidence
            });
          }
        }
      });
      
      if (words.length > 0) {
        console.log(`✅ Extracted ${words.length} words from box data`);
      }
    }
    
    // Last resort: Try detect() method which might return word positions
    if (words.length === 0) {
      console.log('🔍 Trying detect() method as last resort...');
      try {
        const detectResult = await worker.detect(file);
        console.log('🔍 Detect result:', {
          hasData: !!detectResult.data,
          dataKeys: detectResult.data ? Object.keys(detectResult.data) : [],
          detectData: detectResult.data,
          fullDetect: detectResult
        });
        
        // detect() might return words in a different structure
        if (detectResult.data && (detectResult.data as any).words) {
          words = (detectResult.data as any).words;
          console.log(`✅ Found ${words.length} words via detect() method`);
        }
      } catch (detectError) {
        console.warn('⚠️ detect() method failed:', detectError);
      }
    }
    
    // Get image dimensions
    const img = new Image();
    const imageUrl = URL.createObjectURL(file);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });
    const imageWidth = img.width;
    const imageHeight = img.height;
    URL.revokeObjectURL(imageUrl);
    
    // Calculate average confidence and extract word positions
    let totalConfidence = 0;
    let wordCount = 0;
    const wordPositions: WordPosition[] = [];
    
    console.log('🔍 OCR Image Processing Debug:', {
      wordsArrayLength: words?.length || 0,
      wordsArrayType: Array.isArray(words) ? 'array' : typeof words,
      firstWord: words?.[0],
      sampleWordStructure: words?.[0] ? Object.keys(words[0]) : [],
      imageWidth,
      imageHeight
    });
    
    if (words && words.length > 0) {
      words.forEach((word: any, index: number) => {
        // Check different possible bbox structures
        let bbox: any = null;
        
        if (word.bbox) {
          bbox = word.bbox;
        } else if (word.bbox0) {
          bbox = word.bbox0;
        } else if (word.bounding_box) {
          bbox = word.bounding_box;
        } else if (word.rect) {
          bbox = word.rect;
        }
        
        // Some structures might have individual coordinates
        if (!bbox && (word.x0 !== undefined || word.left !== undefined)) {
          bbox = {
            x0: word.x0 || word.left || 0,
            y0: word.y0 || word.top || 0,
            x1: word.x1 || (word.left !== undefined && word.width !== undefined ? word.left + word.width : undefined) || (word.x0 !== undefined && word.width !== undefined ? word.x0 + word.width : undefined) || 0,
            y1: word.y1 || (word.top !== undefined && word.height !== undefined ? word.top + word.height : undefined) || (word.y0 !== undefined && word.height !== undefined ? word.y0 + word.height : undefined) || 0,
          };
        }
        
        const confidence = word.confidence || word.conf || 0;
        
        if (bbox && (bbox.x0 !== undefined || bbox.left !== undefined)) {
          // Normalize bbox to our format
          const normalizedBbox = {
            x0: bbox.x0 !== undefined ? bbox.x0 : (bbox.left !== undefined ? bbox.left : 0),
            y0: bbox.y0 !== undefined ? bbox.y0 : (bbox.top !== undefined ? bbox.top : 0),
            x1: bbox.x1 !== undefined ? bbox.x1 : (bbox.right !== undefined ? bbox.right : (bbox.left !== undefined && bbox.width !== undefined ? bbox.left + bbox.width : (bbox.x0 !== undefined && bbox.width !== undefined ? bbox.x0 + bbox.width : 0))),
            y1: bbox.y1 !== undefined ? bbox.y1 : (bbox.bottom !== undefined ? bbox.bottom : (bbox.top !== undefined && bbox.height !== undefined ? bbox.top + bbox.height : (bbox.y0 !== undefined && bbox.height !== undefined ? bbox.y0 + bbox.height : 0))),
          };
          
          if (normalizedBbox.x1 > normalizedBbox.x0 && normalizedBbox.y1 > normalizedBbox.y0) {
            totalConfidence += confidence;
            wordCount++;
            const wordPos = {
              text: word.text || word.text_content || '',
              bbox: normalizedBbox,
              confidence: confidence,
            };
            wordPositions.push(wordPos);
            
            // Log first few words for debugging
            if (index < 3) {
              console.log(`📝 Word ${index + 1}:`, {
                text: wordPos.text,
                bbox: wordPos.bbox,
                confidence: wordPos.confidence,
                originalWord: word
              });
            }
          }
        } else {
          // Log words without bbox for debugging
          if (index < 3) {
            console.warn(`⚠️ Word ${index + 1} has no bbox:`, word);
          }
        }
      });
    }
    
    const avgConfidence = wordCount > 0 ? totalConfidence / wordCount : 0;
    
    console.log('✅ Image OCR Result:', {
      totalWordsFound: words?.length || 0,
      validWords: wordPositions.length,
      avgConfidence: Math.round(avgConfidence),
      imageDimensions: { width: imageWidth, height: imageHeight }
    });
    
    await worker.terminate();
    return { text, confidence: avgConfidence, words: wordPositions, imageWidth, imageHeight };
  } catch (error) {
    await worker.terminate();
    throw error;
  }
}

export interface PDFPageData {
  pageNumber: number;
  text: string;
  confidence: number;
  words: WordPosition[];
  pageWidth: number;
  pageHeight: number;
}

async function processPDFWithOCR(file: File): Promise<{ 
  text: string; 
  confidence: number;
  pages: PDFPageData[];
}> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let allText = '';
  let allConfidences: number[] = [];
  const pagesData: PDFPageData[] = [];
  
  // Process each page of the PDF
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    
    // Create canvas to render PDF page
    const canvas = window.document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Could not get canvas context');
    }
    
    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise;
    
    // Convert canvas to blob and process with OCR
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      }, 'image/png');
    });
    
    const imageFile = new File([blob], `page-${pageNum}.png`, { type: 'image/png' });
    const { text, confidence, words, imageWidth, imageHeight } = await processImageWithOCR(imageFile);
    allText += text + '\n\n';
    allConfidences.push(confidence);
    
    console.log(`📄 PDF Page ${pageNum} OCR:`, {
      wordsCount: words.length,
      confidence: Math.round(confidence),
      dimensions: { width: imageWidth, height: imageHeight },
      sampleWords: words.slice(0, 2).map(w => ({ text: w.text, hasBbox: !!w.bbox }))
    });
    
    pagesData.push({
      pageNumber: pageNum,
      text,
      confidence,
      words,
      pageWidth: imageWidth,
      pageHeight: imageHeight,
    });
  }
  
  // Calculate average confidence across all pages
  const avgConfidence = allConfidences.length > 0
    ? allConfidences.reduce((sum, conf) => sum + conf, 0) / allConfidences.length
    : 0;
  
  return { text: allText.trim(), confidence: avgConfidence, pages: pagesData };
}

export async function ExtractDataFromUploadedFile({
  file_url,
  file,
  json_schema: _json_schema,
}: {
  file_url: string;
  file?: File;
  json_schema?: any;
}): Promise<ExtractDataResponse> {
  try {
    // Get the File object - either passed directly or fetch from blob URL
    let fileToProcess: File;
    
    if (file) {
      fileToProcess = file;
    } else {
      // Fetch the blob URL and convert to File
      const response = await fetch(file_url);
      const blob = await response.blob();
      const fileName = file_url.split('/').pop() || 'document';
      fileToProcess = new File([blob], fileName, { type: blob.type });
    }
    
    // Process based on file type
    let extractedText: string;
    let confidence_score: number;
    let wordPositions: WordPosition[] | undefined;
    let pdfPages: PDFPageData[] | undefined;
    let imageDimensions: { width: number; height: number } | undefined;
    
    if (fileToProcess.type === 'application/pdf') {
      const result = await processPDFWithOCR(fileToProcess);
      extractedText = result.text;
      confidence_score = result.confidence;
      pdfPages = result.pages;
    } else if (fileToProcess.type.startsWith('image/')) {
      const result = await processImageWithOCR(fileToProcess);
      extractedText = result.text;
      confidence_score = result.confidence;
      wordPositions = result.words;
      imageDimensions = { width: result.imageWidth, height: result.imageHeight };
    } else {
      throw new Error(`Unsupported file type: ${fileToProcess.type}`);
    }
    
    // Extract title from first line or use filename
    const lines = extractedText.split('\n').filter(line => line.trim().length > 0);
    const title = lines.length > 0 ? lines[0].substring(0, 100) : fileToProcess.name;
    
    return {
      status: 'success',
      output: {
        extracted_fields: {
          title: title,
          content: extractedText,
        },
        confidence_score: Math.round(confidence_score),
        word_positions: wordPositions,
        pdf_pages: pdfPages,
        image_dimensions: imageDimensions,
      },
    };
  } catch (error: any) {
    return {
      status: 'error',
      error: error.message || 'OCR processing failed',
    };
  }
}


