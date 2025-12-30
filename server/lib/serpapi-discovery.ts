/**
 * SerpApi Integration for Relationship Discovery
 * Design: Data-Driven Minimalism with Precision Accents
 */

import { Relationship, ParsedCompany } from '@/../../shared/types';

const SERPAPI_KEY = process.env.SERPAPI_KEY;

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

/**
 * Discover relationships for a single company using web search
 */
export async function discoverCompanyRelationships(
  company: ParsedCompany
): Promise<Relationship[]> {
  if (!SERPAPI_KEY) {
    throw new Error('SERPAPI_KEY environment variable is not set');
  }

  const relationships: Relationship[] = [];

  // Search for different relationship categories
  const searchQueries = [
    { query: `${company.ticker} ${company.name} auditor`, category: 'auditor' },
    { query: `${company.ticker} ${company.name} shareholders`, category: 'shareholder' },
    { query: `${company.ticker} ${company.name} broker advisor`, category: 'broker' },
    { query: `${company.ticker} ${company.name} board directors`, category: 'director' },
    { query: `${company.ticker} ${company.name} management team`, category: 'director' },
  ];

  for (const { query, category } of searchQueries) {
    try {
      const results = await searchWithSerpApi(query);
      const extracted = extractRelationshipsFromResults(results, category, company);
      relationships.push(...extracted);
    } catch (error) {
      console.error(`Error searching for ${category} of ${company.ticker}:`, error);
      // Continue with next search
    }
  }

  return relationships;
}

/**
 * Search using SerpApi
 */
async function searchWithSerpApi(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    api_key: SERPAPI_KEY!,
    engine: 'google',
    num: '10',
  });

  try {
    const response = await fetch(`https://serpapi.com/search?${params}`, {
      headers: {
        'User-Agent': 'Neural-Graph-Engine/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`SerpApi error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.organic_results || [];
  } catch (error) {
    console.error('SerpApi search error:', error);
    throw error;
  }
}

/**
 * Extract entity names from search results
 */
function extractRelationshipsFromResults(
  results: SearchResult[],
  category: string,
  company: ParsedCompany
): Relationship[] {
  const relationships: Relationship[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const entities = extractEntitiesFromText(result.title + ' ' + result.snippet, category);

    for (const entity of entities) {
      const key = `${entity.name}|${category}`;
      if (!seen.has(key)) {
        seen.add(key);
        relationships.push({
          entity_name: entity.name,
          entity_type: entity.type,
          category,
          details: result.snippet.substring(0, 100),
          source_url: result.link,
        });
      }
    }
  }

  return relationships;
}

/**
 * Extract entity names from text based on category
 */
function extractEntitiesFromText(
  text: string,
  category: string
): { name: string; type: 'company' | 'person' | 'firm' }[] {
  const entities: { name: string; type: 'company' | 'person' | 'firm' }[] = [];

  // Patterns for different entity types
  const patterns = {
    auditor: [
      /(?:auditor|audit firm):\s*([A-Z][^,.]+?)(?:\s*(?:,|$))/gi,
      /([A-Z][a-zA-Z\s&]+?)\s+(?:auditor|audit|audited)/gi,
    ],
    shareholder: [
      /(?:shareholder|investor):\s*([A-Z][^,.]+?)(?:\s*(?:,|$))/gi,
      /([A-Z][a-zA-Z\s&]+?)\s+(?:holds?|owns?)\s+\d+%/gi,
    ],
    broker: [
      /(?:broker|advisor):\s*([A-Z][^,.]+?)(?:\s*(?:,|$))/gi,
      /([A-Z][a-zA-Z\s&]+?)\s+(?:broker|advised|advisor)/gi,
    ],
    director: [
      /(?:director|CEO|CFO|chairman):\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:director|CEO|CFO|chairman)/gi,
    ],
  };

  const categoryPatterns = patterns[category as keyof typeof patterns] || [];

  for (const pattern of categoryPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 2 && name.length < 100) {
        // Determine entity type
        let type: 'company' | 'person' | 'firm' = 'company';
        if (category === 'director' || /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(name)) {
          type = 'person';
        } else if (/(firm|bank|group|fund|management)$/i.test(name)) {
          type = 'firm';
        }

        entities.push({ name, type });
      }
    }
  }

  return entities;
}
