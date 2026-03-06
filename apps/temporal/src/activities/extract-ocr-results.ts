import axios from 'axios';
import type { OCRResponse, OCRResult } from '../types';

/**
 * Normalize endpoint URL by removing trailing slash
 */
function normalizeEndpoint(url: string | undefined): string {
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Activity: Extract OCR results from Azure response
 * Parses and structures the OCR data
 */
export async function extractOCRResults(params: {
  apimRequestId: string;
  fileName: string;
  fileType: string;
  modelId: string;
  ocrResponse?: OCRResponse;
}): Promise<{ ocrResult: OCRResult }> {
  const activityName = 'extractOCRResults';
  const { apimRequestId, fileName, fileType, modelId, ocrResponse } = params;
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    apimRequestId,
    fileName,
    fileType,
    modelId,
    timestamp: new Date().toISOString()
  }));

  try {
    let ocrResponseObj: OCRResponse | undefined = ocrResponse;

    // If response not provided, fetch it
    if (!ocrResponseObj) {
      if (!endpoint || !apiKey) {
        throw new Error(
          'Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY environment variables.'
        );
      }
      const normalizedEndpoint = normalizeEndpoint(endpoint);
      const normalizedModelId = modelId || 'prebuilt-layout';
      const url = `${normalizedEndpoint}/documentintelligence/documentModels/${normalizedModelId}/analyzeResults/${apimRequestId}?api-version=2024-11-30`;
      const response = await axios.get<OCRResponse>(url, {
        headers: { 'api-key': apiKey }
      });
      ocrResponseObj = response.data;
    }

    if (!ocrResponseObj) {
      throw new Error('No OCR response available to extract results.');
    }

    const analyzeResult = ocrResponseObj.analyzeResult || {
      apiVersion: '',
      modelId: '',
      content: '',
      pages: [],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: []
    };

    const result: OCRResult = {
      success: ocrResponseObj.status === 'succeeded',
      status: ocrResponseObj.status || 'unknown',
      apimRequestId: apimRequestId || '',
      fileName: fileName || 'document',
      fileType: fileType || 'pdf',
      modelId: analyzeResult.modelId || modelId || 'prebuilt-layout',
      extractedText: analyzeResult.content || '',
      pages: analyzeResult.pages || [],
      tables: analyzeResult.tables || [],
      paragraphs: analyzeResult.paragraphs || [],
      keyValuePairs: analyzeResult.keyValuePairs || [],
      sections: analyzeResult.sections || [],
      figures: analyzeResult.figures || [],
      documents: analyzeResult.documents || [],
      processedAt: new Date().toISOString()
    };

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      apimRequestId,
      fileName,
      status: result.status,
      pagesCount: result.pages.length,
      tablesCount: result.tables.length,
      timestamp: new Date().toISOString()
    }));

    // Return with port name as key for output binding
    return { ocrResult: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      apimRequestId,
      fileName,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}
