/**
 * Neural Graph Engine - Shared Type Definitions
 * Design: Data-Driven Minimalism with Precision Accents
 */

export interface ParsedCompany {
  name: string;
  ticker: string;
  exchange: string;
  stress_signal?: string; // e.g., "-26.67%"
}

export interface Relationship {
  entity_name: string;
  entity_type: 'company' | 'person' | 'firm';
  category: string; // auditor, broker, shareholder, director, advisor, supplier
  details?: string;
  source_url?: string;
}

export interface CompanyWithRelationships extends ParsedCompany {
  relationships: Relationship[];
  processing_status: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string;
}

export interface WhoCaresEntity {
  entity_name: string;
  entity_type: 'company' | 'person' | 'firm';
  category: string;
  exposure_count: number; // Number of companies (>=2)
  exposed_companies: string[]; // Array of tickers
  exposure_details: {
    ticker: string;
    relationship_type: string;
  }[];
}

export interface BatchInput {
  source: 'sample' | 'pasted' | 'manual';
  raw_text?: string;
  companies: ParsedCompany[];
}

export interface BatchOutput {
  companies: CompanyWithRelationships[];
  who_cares: WhoCaresEntity[];
  processing_stats: {
    total_companies: number;
    total_relationships: number;
    multi_exposure_entities: number;
    api_calls_used: number;
    processing_time_ms: number;
  };
}

export interface ParseCompaniesRequest {
  text: string;
}

export interface ParseCompaniesResponse {
  companies: ParsedCompany[];
  error?: string;
}

export interface DiscoverBatchRequest {
  companies: ParsedCompany[];
}

export interface DiscoverBatchResponse {
  companies: CompanyWithRelationships[];
  error?: string;
}

export interface WhoCaresRequest {
  relationships: Relationship[];
}

export interface WhoCaresResponse {
  entities: WhoCaresEntity[];
}
