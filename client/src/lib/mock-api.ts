/**
 * Mock API Responses for Development
 * Design: Data-Driven Minimalism with Precision Accents
 * 
 * In production, these would call real Claude and SerpApi endpoints.
 * For demo purposes, we use mock data to simulate the full workflow.
 */

import { ParsedCompany, BatchOutput, Relationship } from '@/../../shared/types';

/**
 * Mock company parsing - simulates Claude API
 * Supports multiple formats:
 * - Company Name (TICKER)
 * - Company Name ASX:TICKER
 * - TICKER Company Name
 */
export function mockParseCompanies(text: string): ParsedCompany[] {
  const companies: ParsedCompany[] = [];
  const seen = new Set<string>();

  // Pattern 1: Company Name (TICKER) with optional percentage
  const pattern1 = /([A-Z][a-zA-Z\s&]+?)\s*\(([A-Z]{1,4})\)(?:\s*[-–]?\s*([0-9.]+)%)?/g;
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    addCompany(match[1].trim(), match[2].toUpperCase(), match[3]);
  }

  // Pattern 2: Company Name ASX:TICKER or NYSE:TICKER format
  const pattern2 = /([A-Z][a-zA-Z\s&]+?)\s+(?:ASX|NYSE|NASDAQ|LSE|TSX):\s*([A-Z]{1,4})(?:\s*[-–]?\s*([0-9.]+)%)?/g;
  while ((match = pattern2.exec(text)) !== null) {
    addCompany(match[1].trim(), match[2].toUpperCase(), match[3]);
  }

  // Pattern 3: TICKER Company Name format
  const pattern3 = /\b([A-Z]{1,4})\s+([A-Z][a-zA-Z\s&]+?)(?:\s*[-–]?\s*([0-9.]+)%)?/g;
  while ((match = pattern3.exec(text)) !== null) {
    addCompany(match[2].trim(), match[1].toUpperCase(), match[3]);
  }

  function addCompany(name: string, ticker: string, stressStr?: string) {
    const stressSignal = stressStr ? `-${stressStr}%` : undefined;
    const key = `${name}|${ticker}`;
    if (!seen.has(key) && ticker.length <= 4 && name.length > 2) {
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

/**
 * Mock relationship discovery - simulates SerpApi + Claude analysis
 */
export function mockDiscoverBatch(companies: ParsedCompany[]): BatchOutput {
  const mockRelationships: Record<string, Relationship[]> = {
    TER: [
      {
        entity_name: 'BDO Australia',
        entity_type: 'firm',
        category: 'auditor',
        details: 'External auditor since 2019',
      },
      {
        entity_name: 'Sprott Asset Management',
        entity_type: 'company',
        category: 'shareholder',
        details: '8.2% shareholding',
      },
      {
        entity_name: 'Canaccord Genuity',
        entity_type: 'firm',
        category: 'broker',
        details: 'Lead broker for capital raises',
      },
      {
        entity_name: 'Robert Chen',
        entity_type: 'person',
        category: 'director',
        details: 'Chairman, appointed 2018',
      },
    ],
    IND: [
      {
        entity_name: 'BDO Australia',
        entity_type: 'firm',
        category: 'auditor',
        details: 'External auditor since 2020',
      },
      {
        entity_name: 'Goldman Sachs Australia',
        entity_type: 'firm',
        category: 'broker',
        details: 'M&A advisor',
      },
    ],
    NMR: [
      {
        entity_name: 'BDO Australia',
        entity_type: 'firm',
        category: 'auditor',
        details: 'External auditor since 2019',
      },
      {
        entity_name: 'Robert Chen',
        entity_type: 'person',
        category: 'director',
        details: 'Independent director',
      },
      {
        entity_name: 'Macquarie Group',
        entity_type: 'company',
        category: 'shareholder',
        details: '5.1% shareholding',
      },
    ],
    DXB: [
      {
        entity_name: 'Canaccord Genuity',
        entity_type: 'firm',
        category: 'broker',
        details: 'Corporate advisor',
      },
    ],
    MVF: [
      {
        entity_name: 'BDO Australia',
        entity_type: 'firm',
        category: 'auditor',
        details: 'External auditor',
      },
      {
        entity_name: 'Canaccord Genuity',
        entity_type: 'firm',
        category: 'broker',
        details: 'Lead broker',
      },
      {
        entity_name: 'Sprott Asset Management',
        entity_type: 'company',
        category: 'shareholder',
        details: '6.5% shareholding',
      },
    ],
  };

  const companiesWithRelationships = companies.map((company) => ({
    ...company,
    relationships: mockRelationships[company.ticker] || [],
    processing_status: 'completed' as const,
  }));

  // Calculate multi-exposure entities
  const entityMap = new Map<string, Set<string>>();
  const entityDetails = new Map<string, { type: string; category: string }>();

  for (const company of companiesWithRelationships) {
    for (const rel of company.relationships) {
      const key = rel.entity_name;
      if (!entityMap.has(key)) {
        entityMap.set(key, new Set());
      }
      entityMap.get(key)!.add(company.ticker);
      entityDetails.set(key, { type: rel.entity_type, category: rel.category });
    }
  }

  const whoCares = Array.from(entityMap.entries())
    .filter(([_, tickers]) => tickers.size >= 2)
    .map(([name, tickers]) => {
      const details = entityDetails.get(name)!;
      return {
        entity_name: name,
        entity_type: details.type as 'company' | 'person' | 'firm',
        category: details.category,
        exposure_count: tickers.size,
        exposed_companies: Array.from(tickers),
        exposure_details: Array.from(tickers).map((ticker) => ({
          ticker,
          relationship_type: details.category,
        })),
      };
    })
    .sort((a, b) => b.exposure_count - a.exposure_count);

  return {
    companies: companiesWithRelationships,
    who_cares: whoCares,
    processing_stats: {
      total_companies: companies.length,
      total_relationships: companiesWithRelationships.reduce(
        (sum, c) => sum + c.relationships.length,
        0
      ),
      multi_exposure_entities: whoCares.length,
      api_calls_used: companies.length * 5,
      processing_time_ms: Math.random() * 3000 + 1000,
    },
  };
}
