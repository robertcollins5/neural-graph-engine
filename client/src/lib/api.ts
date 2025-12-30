/**
 * API Client Utilities
 * Design: Data-Driven Minimalism with Precision Accents
 */

import { ParsedCompany, BatchOutput } from '@/../../shared/types';

/**
 * Load the pre-cached demo batch
 */
export async function loadDemoBatch(): Promise<BatchOutput> {
  const response = await fetch('/demo-batch.json');
  if (!response.ok) {
    throw new Error('Failed to load demo batch');
  }
  return response.json();
}

/**
 * Parse companies from text using the backend API
 */
export async function parseCompaniesFromText(text: string): Promise<ParsedCompany[]> {
  const response = await fetch('/api/parse-companies', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error('Failed to parse companies');
  }

  const data = await response.json();
  return data.companies;
}

/**
 * Discover relationships for a batch of companies
 */
export async function discoverBatch(companies: ParsedCompany[]): Promise<BatchOutput> {
  const response = await fetch('/api/discover-batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ companies }),
  });

  if (!response.ok) {
    throw new Error('Failed to discover batch');
  }

  return response.json();
}
