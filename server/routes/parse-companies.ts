/**
 * API Route: /api/parse-companies
 * Extracts company names and tickers from unstructured text using Claude
 * Design: Data-Driven Minimalism with Precision Accents
 */

import { Router, Request, Response } from 'express';
import { ParsedCompany, ParseCompaniesRequest, ParseCompaniesResponse } from '@/../../shared/types';
import { parseCompaniesWithClaude } from '../lib/claude-parser.js';

const router = Router();

/**
 * Parse companies from text
 * POST /api/parse-companies
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { text } = req.body as ParseCompaniesRequest;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Use Claude API for reliable company extraction
    let companies: ParsedCompany[];
    try {
      companies = await parseCompaniesWithClaude(text);
      // If Claude returns empty (no API key), fall back to regex
      if (companies.length === 0) {
        companies = extractCompaniesFromText(text);
      }
    } catch (error) {
      console.error('Claude API error, falling back to regex:', error);
      // Fallback to regex extraction if Claude fails
      companies = extractCompaniesFromText(text);
    }

    if (companies.length === 0) {
      return res.status(400).json({
        error: 'No companies found. Try including ticker codes like (TER) or (BBN)',
      });
    }

    const response: ParseCompaniesResponse = {
      companies,
    };

    res.json(response);
  } catch (error) {
    console.error('Error parsing companies:', error);
    res.status(500).json({ error: 'Failed to parse companies' });
  }
});

/**
 * Fallback: Simple regex-based company extraction
 */
function extractCompaniesFromText(text: string): ParsedCompany[] {
  const companies: ParsedCompany[] = [];
  const seen = new Set<string>();

  // Pattern: Company Name (TICKER) with optional percentage
  const pattern = /([A-Z][a-zA-Z\s&]+?)\s*\(([A-Z]{1,4})\)(?:\s*[-–]?\s*([0-9.]+)%)?/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].trim();
    const ticker = match[2].toUpperCase();
    const stressSignal = match[3] ? `-${match[3]}%` : undefined;

    const key = `${name}|${ticker}`;
    if (!seen.has(key)) {
      seen.add(key);
      companies.push({
        name,
        ticker,
        exchange: 'ASX',
        stress_signal: stressSignal,
      });
    }
  }

  return companies;
}

export default router;
