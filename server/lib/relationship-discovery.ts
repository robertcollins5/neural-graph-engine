/**
 * Comprehensive Relationship Discovery Engine
 * Uses Google Search API, Claude, and Firecrawl to discover:
 * - Shareholders and investors
 * - Board members and executives
 * - Suppliers and customers
 * - Industry competitors and peers
 * - Service providers (auditors, brokers, advisors)
 * - PE firms and investment groups
 */

import { ParsedCompany, Relationship } from '@/../../shared/types';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface DiscoveredEntity {
  name: string;
  type: 'shareholder' | 'executive' | 'auditor' | 'broker' | 'advisor' | 'competitor' | 'supplier' | 'customer' | 'pe_firm' | 'industry_peer';
  details: string;
  source: string;
  confidence: number;
}

/**
 * Search for shareholders using Google Search API
 */
export async function discoverShareholders(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<DiscoveredEntity[]> {
  const shareholders: DiscoveredEntity[] = [];

  try {
    // Search for major shareholders
    const queries = [
      `${company.ticker} major shareholders ASX`,
      `${company.name} shareholders list`,
      `${company.ticker} top shareholders`,
      `${company.name} institutional investors`,
    ];

    for (const query of queries) {
      const results = await performGoogleSearch(query, apiKey, searchEngineId);
      
      // Parse results for shareholder information
      for (const result of results) {
        const entities = parseShareholderData(result, company);
        shareholders.push(...entities);
      }
    }
  } catch (error) {
    console.error(`Error discovering shareholders for ${company.ticker}:`, error);
  }

  return deduplicateEntities(shareholders);
}

/**
 * Search for board members and executives
 */
export async function discoverExecutives(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<DiscoveredEntity[]> {
  const executives: DiscoveredEntity[] = [];

  try {
    const queries = [
      `${company.ticker} board members`,
      `${company.name} CEO CFO executives`,
      `${company.ticker} management team`,
      `${company.name} directors`,
      `${company.ticker} board departures`,
      `${company.name} executive changes`,
    ];

    for (const query of queries) {
      const results = await performGoogleSearch(query, apiKey, searchEngineId);
      
      for (const result of results) {
        const entities = parseExecutiveData(result, company);
        executives.push(...entities);
      }
    }
  } catch (error) {
    console.error(`Error discovering executives for ${company.ticker}:`, error);
  }

  return deduplicateEntities(executives);
}

/**
 * Search for suppliers and customers
 */
export async function discoverSuppliesAndCustomers(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<DiscoveredEntity[]> {
  const entities: DiscoveredEntity[] = [];

  try {
    const queries = [
      `${company.name} suppliers`,
      `${company.ticker} customers clients`,
      `${company.name} business partners`,
      `${company.ticker} supply chain`,
      `${company.name} major contracts`,
    ];

    for (const query of queries) {
      const results = await performGoogleSearch(query, apiKey, searchEngineId);
      
      for (const result of results) {
        const parsed = parseSupplyChainData(result, company);
        entities.push(...parsed);
      }
    }
  } catch (error) {
    console.error(`Error discovering supply chain for ${company.ticker}:`, error);
  }

  return deduplicateEntities(entities);
}

/**
 * Search for industry competitors and peers
 */
export async function discoverIndustryPeers(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<DiscoveredEntity[]> {
  const peers: DiscoveredEntity[] = [];

  try {
    const queries = [
      `${company.name} competitors`,
      `${company.ticker} industry peers`,
      `companies similar to ${company.name}`,
      `${company.name} market competitors ASX`,
      `${company.ticker} sector analysis`,
    ];

    for (const query of queries) {
      const results = await performGoogleSearch(query, apiKey, searchEngineId);
      
      for (const result of results) {
        const parsed = parseCompetitorData(result, company);
        peers.push(...parsed);
      }
    }
  } catch (error) {
    console.error(`Error discovering industry peers for ${company.ticker}:`, error);
  }

  return deduplicateEntities(peers);
}

/**
 * Search for service providers (auditors, brokers, advisors)
 */
export async function discoverServiceProviders(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<DiscoveredEntity[]> {
  const providers: DiscoveredEntity[] = [];

  try {
    const queries = [
      `${company.ticker} auditor`,
      `${company.name} external auditor`,
      `${company.ticker} broker advisor`,
      `${company.name} financial advisor`,
      `${company.ticker} legal advisor`,
    ];

    for (const query of queries) {
      const results = await performGoogleSearch(query, apiKey, searchEngineId);
      
      for (const result of results) {
        const parsed = parseServiceProviderData(result, company);
        providers.push(...parsed);
      }
    }
  } catch (error) {
    console.error(`Error discovering service providers for ${company.ticker}:`, error);
  }

  return deduplicateEntities(providers);
}

/**
 * Search for PE firms and investment groups
 */
export async function discoverInvestmentGroups(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<DiscoveredEntity[]> {
  const groups: DiscoveredEntity[] = [];

  try {
    const queries = [
      `${company.ticker} private equity`,
      `${company.name} takeover bid`,
      `${company.ticker} acquisition interest`,
      `${company.name} investment consortium`,
      `${company.ticker} PE interest`,
    ];

    for (const query of queries) {
      const results = await performGoogleSearch(query, apiKey, searchEngineId);
      
      for (const result of results) {
        const parsed = parseInvestmentGroupData(result, company);
        groups.push(...parsed);
      }
    }
  } catch (error) {
    console.error(`Error discovering investment groups for ${company.ticker}:`, error);
  }

  return deduplicateEntities(groups);
}

/**
 * Perform Google Search API call
 */
async function performGoogleSearch(
  query: string,
  apiKey: string,
  searchEngineId: string
): Promise<SearchResult[]> {
  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.append('q', query);
    url.searchParams.append('key', apiKey);
    url.searchParams.append('cx', searchEngineId);
    url.searchParams.append('num', '10');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Google Search API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return (data.items || []).map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
    }));
  } catch (error) {
    console.error('Google Search error:', error);
    return [];
  }
}

/**
 * Parse shareholder information from search results
 */
function parseShareholderData(result: SearchResult, company: ParsedCompany): DiscoveredEntity[] {
  const entities: DiscoveredEntity[] = [];
  const text = `${result.title} ${result.snippet}`.toLowerCase();

  //  // Look for percentage holdings
  const percentPattern = /(\d+(?:\.\d+)?)\s*%/g;
  let match;
  while ((match = percentPattern.exec(text)) !== null) {
    const percentage = parseFloat(match[1]);
    if (percentage > 2) { // Only major shareholders (>2%)
      // Extract company/entity name (simplified)
      const nameMatch = result.snippet.match(/([A-Z][a-zA-Z\s&.]+?)(?:\s+holds?|\s+owns?|\s+\(|\s+–)/);
      if (nameMatch) {
        entities.push({
          name: nameMatch[1].trim(),
          type: 'shareholder',
          details: `${percentage}% shareholder`,
          source: result.link,
          confidence: 0.8,
        });
      }
    }
  }

  return entities;
}

/**
 * Parse executive information from search results
 */
function parseExecutiveData(result: SearchResult, company: ParsedCompany): DiscoveredEntity[] {
  const entities: DiscoveredEntity[] = [];
  const text = `${result.title} ${result.snippet}`;

  const roles = ['CEO', 'CFO', 'Chairman', 'Director', 'COO', 'CTO', 'Managing Director'];
  const departures = ['departed', 'resigned', 'stepped down', 'left', 'exited'];

  for (const role of roles) {
    if (text.includes(role)) {
      const isDeparture = departures.some(d => text.includes(d));
      const nameMatch = text.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/);
      
      if (nameMatch) {
        entities.push({
          name: nameMatch[1],
          type: 'executive',
          details: `${role}${isDeparture ? ' (departed)' : ''}`,
          source: result.link,
          confidence: isDeparture ? 0.9 : 0.7,
        });
      }
    }
  }

  return entities;
}

/**
 * Parse supply chain information from search results
 */
function parseSupplyChainData(result: SearchResult, company: ParsedCompany): DiscoveredEntity[] {
  const entities: DiscoveredEntity[] = [];
  const text = `${result.title} ${result.snippet}`;

  const isSupplier = text.match(/supplier|vendor|provider|manufacturer/i);
  const isCustomer = text.match(/customer|client|buyer|purchaser/i);

  if (isSupplier || isCustomer) {
    const nameMatch = text.match(/([A-Z][a-zA-Z\s&.]+?)(?:\s+supplies?|\s+provides?|\s+manufactures?|,)/);
    if (nameMatch) {
      const entityType = isSupplier ? 'supplier' : 'customer';
      entities.push({
        name: nameMatch[1].trim(),
        type: entityType as 'supplier' | 'customer',
        details: isSupplier ? 'Supplier' : 'Customer',
        source: result.link,
        confidence: 0.7,
      });
    }
  }

  return entities;
}

/**
 * Parse competitor information from search results
 */
function parseCompetitorData(result: SearchResult, company: ParsedCompany): DiscoveredEntity[] {
  const entities: DiscoveredEntity[] = [];
  const text = `${result.title} ${result.snippet}`;

  // Look for ASX ticker codes in results
  const tickerPattern = /\(ASX:\s*([A-Z]{1,4})\)/g;
  let match;
  while ((match = tickerPattern.exec(text)) !== null) {
    const ticker = match[1];
    if (ticker !== company.ticker) {
      const nameMatch = text.match(new RegExp(`([A-Z][a-zA-Z\\s&.]+?)\\s*\\(ASX:\\s*${ticker}\\)`));
      if (nameMatch) {
        entities.push({
          name: nameMatch[1].trim(),
          type: 'industry_peer',
          details: `Industry peer (${ticker})`,
          source: result.link,
          confidence: 0.8,
        });
      }
    }
  }

  return entities;
}

/**
 * Parse service provider information from search results
 */
function parseServiceProviderData(result: SearchResult, company: ParsedCompany): DiscoveredEntity[] {
  const entities: DiscoveredEntity[] = [];
  const text = `${result.title} ${result.snippet}`;

  const roles: Array<{ pattern: RegExp; type: 'auditor' | 'broker' | 'advisor' }> = [
    { pattern: /auditor/i, type: 'auditor' },
    { pattern: /broker|brokerage/i, type: 'broker' },
    { pattern: /advisor|adviser/i, type: 'advisor' },
  ];

  for (const role of roles) {
    if (role.pattern.test(text)) {
      const nameMatch = text.match(/([A-Z][a-zA-Z\s&.]+?)(?:\s+is\s+|,\s+|–)/);
      if (nameMatch) {
        const typedRole: 'auditor' | 'broker' | 'advisor' = role.type;
        entities.push({
          name: nameMatch[1].trim(),
          type: typedRole,
          details: role.type.charAt(0).toUpperCase() + role.type.slice(1),
          source: result.link,
          confidence: 0.75,
        });
      }
    }
  }

  return entities;
}

/**
 * Parse investment group information from search results
 */
function parseInvestmentGroupData(result: SearchResult, company: ParsedCompany): DiscoveredEntity[] {
  const entities: DiscoveredEntity[] = [];
  const text = `${result.title} ${result.snippet}`;

  if (text.match(/private equity|takeover|acquisition|consortium|bid/i)) {
    const nameMatch = text.match(/([A-Z][a-zA-Z\s&.]+?)(?:\s+bid|\s+offer|\s+consortium|,)/);
    if (nameMatch) {
      entities.push({
        name: nameMatch[1].trim(),
        type: 'pe_firm',
        details: 'Investment group / PE firm',
        source: result.link,
        confidence: 0.8,
      });
    }
  }

  return entities;
}

/**
 * Remove duplicate entities
 */
function deduplicateEntities(entities: DiscoveredEntity[]): DiscoveredEntity[] {
  const seen = new Map<string, DiscoveredEntity>();

  for (const entity of entities) {
    const key = `${entity.name}|${entity.type}`;
    if (!seen.has(key) || (seen.get(key)?.confidence || 0) < entity.confidence) {
      seen.set(key, entity);
    }
  }

  return Array.from(seen.values());
}

/**
 * Convert discovered entities to relationships
 */
export function entitiesToRelationships(entities: DiscoveredEntity[]): Relationship[] {
  return entities.map(entity => ({
    entity_name: entity.name,
    entity_type: entity.type === 'pe_firm' ? 'company' : 
                 entity.type === 'industry_peer' ? 'company' :
                 entity.type === 'executive' ? 'person' : 'firm',
    category: entity.type as any,
    details: entity.details,
  }));
}
