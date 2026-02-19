export class BoundingRegionDto {
  pageNumber: number;
  polygon: number[];
}

export class DocumentDto {
  docType: string;
  boundingRegions: BoundingRegionDto[];
  confidence: number;
  spans: any[];
}

export class PageDto {
  pageNumber: number;
  angle: number;
  width: number;
  height: number;
  unit: string;
  words: any[];
  lines: any[];
  spans: any[];
}

export class AnalyzeResultDto {
  apiVersion: string;
  modelId: string;
  stringIndexType: string;
  content: string;
  pages: PageDto[];
  documents: DocumentDto[];
  contentFormat: string;
}

export class ClassificationResultDto {
  status: string;
  createdDateTime: string;
  lastUpdatedDateTime: string;
  analyzeResult: AnalyzeResultDto;
}
