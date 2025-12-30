/**
 * Real Google Search API Integration
 * Direct calls to Google Custom Search API for relationship discovery
 */

import { ParsedCompany, Relationship } from '@/../../shared/types';

interface GoogleSearchResult {
  items?: Array<{
    title: string;
    link: string;
    snippet: string;
  }>;
}

/**
 * Perform Google Custom Search
 */
export async function googleSearch(
  query: string,
  apiKey: string,
  searchEngineId: string
): Promise<string[]> {
  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.append('q', query);
    url.searchParams.append('key', apiKey);
    url.searchParams.append('cx', searchEngineId);
    url.searchParams.append('num', '10');

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`Google Search API error: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as GoogleSearchResult;
    return (data.items || []).map((item) => `${item.title}\n${item.snippet}`);
  } catch (error) {
    console.error('Google Search error:', error);
    return [];
  }
}

/**
 * Discover shareholders for a company
 */
export async function discoverShareholdersReal(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<Relationship[]> {
  const relationships: Relationship[] = [];

  try {
    const queries = [
      `${company.ticker} major shareholders ASX`,
      `${company.name} shareholders`,
      `${company.ticker} top shareholders`,
    ];

    for (const query of queries) {
      const results = await googleSearch(query, apiKey, searchEngineId);
      
      for (const result of results) {
        // Extract shareholder names and percentages
        const percentMatches = result.match(/(\d+(?:\.\d+)?)\s*%/g);
        if (percentMatches && percentMatches.length > 0) {
          // Look for company names before percentages
          const lines = result.split('\n');
          for (const line of lines) {
            if (line.match(/\d+(?:\.\d+)?\s*%/) && line.length > 10) {
              // Extract entity name (simplified)
              const nameMatch = line.match(/([A-Z][a-zA-Z\s&.]+?)(?:\s+\(|\s+–|\s+\d+%)/);
              if (nameMatch) {
                const name = nameMatch[1].trim();
                if (name.length > 2 && name.length < 100) {
                  relationships.push({
                    entity_name: name,
                    entity_type: 'company',
                    category: 'shareholder',
                    details: `Shareholder of ${company.ticker}`,
                  });
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error discovering shareholders for ${company.ticker}:`, error);
  }

  return deduplicateRelationships(relationships);
}

/**
 * Discover board members and executives
 */
export async function discoverExecutivesReal(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<Relationship[]> {
  const relationships: Relationship[] = [];

  try {
    const queries = [
      `${company.ticker} CEO CFO board`,
      `${company.name} management team`,
      `${company.ticker} directors`,
      `${company.name} executive departure`,
    ];

    for (const query of queries) {
      const results = await googleSearch(query, apiKey, searchEngineId);
      
      for (const result of results) {
        const roles = ['CEO', 'CFO', 'Chairman', 'Director', 'COO', 'CTO'];
        for (const role of roles) {
          if (result.includes(role)) {
            // Extract names (simplified pattern)
            const nameMatches = result.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/g);
            if (nameMatches) {
              for (const name of nameMatches) {
                if (name.length > 5 && name.length < 50) {
                  relationships.push({
                    entity_name: name,
                    entity_type: 'person',
                    category: 'executive',
                    details: `${role} of ${company.ticker}`,
                  });
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error discovering executives for ${company.ticker}:`, error);
  }

  return deduplicateRelationships(relationships);
}

/**
 * Discover industry competitors
 */
export async function discoverCompetitorsReal(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<Relationship[]> {
  const relationships: Relationship[] = [];

  try {
    const queries = [
      `${company.name} competitors`,
      `${company.ticker} industry peers ASX`,
      `companies similar to ${company.name}`,
    ];

    for (const query of queries) {
      const results = await googleSearch(query, apiKey, searchEngineId);
      
      for (const result of results) {
        // Look for ASX tickers
        const tickerMatches = result.match(/\(ASX:\s*([A-Z]{1,4})\)/g);
        if (tickerMatches) {
          for (const tickerMatch of tickerMatches) {
            const ticker = tickerMatch.match(/[A-Z]{1,4}/)?.[0];
            if (ticker && ticker !== company.ticker) {
              // Extract company name
              const nameMatch = result.match(
                new RegExp(`([A-Z][a-zA-Z\\s&.]+?)\\s*\\(ASX:\\s*${ticker}\\)`)
              );
              if (nameMatch) {
                relationships.push({
                  entity_name: nameMatch[1].trim(),
                  entity_type: 'company',
                  category: 'competitor',
                  details: `Industry competitor (${ticker})`,
                });
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error discovering competitors for ${company.ticker}:`, error);
  }

  return deduplicateRelationships(relationships);
}

/**
 * Discover auditors and service providers
 */
export async function discoverServiceProvidersReal(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<Relationship[]> {
  const relationships: Relationship[] = [];

  try {
    const queries = [
      `${company.ticker} auditor`,
      `${company.name} external auditor`,
      `${company.ticker} broker advisor`,
    ];

    for (const query of queries) {
      const results = await googleSearch(query, apiKey, searchEngineId);
      
      for (const result of results) {
        const providers = [
          { pattern: /auditor/i, type: 'auditor' },
          { pattern: /broker|brokerage/i, type: 'broker' },
          { pattern: /advisor|adviser/i, type: 'advisor' },
        ];

        for (const provider of providers) {
          if (provider.pattern.test(result)) {
            // Extract firm names
            const nameMatches = result.match(/([A-Z][a-zA-Z\s&.]+?)(?:\s+is\s+|,\s+|\s+–|\s+\()/g);
            if (nameMatches) {
              for (const nameMatch of nameMatches) {
                const name = nameMatch.replace(/\s+is\s+|,\s+|\s+–|\s+\(/, '').trim();
                if (name.length > 3 && name.length < 100) {
                  relationships.push({
                    entity_name: name,
                    entity_type: 'firm',
                    category: provider.type as any,
                    details: `${provider.type.charAt(0).toUpperCase() + provider.type.slice(1)} of ${company.ticker}`,
                  });
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error discovering service providers for ${company.ticker}:`, error);
  }

  return deduplicateRelationships(relationships);
}

/**
 * Discover PE firms and investment groups
 */
export async function discoverInvestmentGroupsReal(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<Relationship[]> {
  const relationships: Relationship[] = [];

  try {
    const queries = [
      `${company.ticker} takeover bid`,
      `${company.name} private equity interest`,
      `${company.ticker} acquisition`,
    ];

    for (const query of queries) {
      const results = await googleSearch(query, apiKey, searchEngineId);
      
      for (const result of results) {
        if (result.match(/takeover|acquisition|private equity|consortium|bid/i)) {
          // Extract firm names
          const nameMatches = result.match(/([A-Z][a-zA-Z\s&.]+?)(?:\s+bid|\s+offer|\s+consortium|,)/g);
          if (nameMatches) {
            for (const nameMatch of nameMatches) {
              const name = nameMatch.replace(/\s+bid|\s+offer|\s+consortium|,/, '').trim();
              if (name.length > 3 && name.length < 100) {
                relationships.push({
                  entity_name: name,
                  entity_type: 'company',
                  category: 'pe_firm',
                  details: `PE/Investment interest in ${company.ticker}`,
                });
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error discovering investment groups for ${company.ticker}:`, error);
  }

  return deduplicateRelationships(relationships);
}

/**
 * Deduplicate relationships
 */
function deduplicateRelationships(relationships: Relationship[]): Relationship[] {
  const seen = new Map<string, Relationship>();

  for (const rel of relationships) {
    const key = `${rel.entity_name}|${rel.category}`;
    if (!seen.has(key)) {
      seen.set(key, rel);
    }
  }

  return Array.from(seen.values());
}

/**
 * Discover all relationships for a company
 */
export async function discoverAllRelationshipsReal(
  company: ParsedCompany,
  apiKey: string,
  searchEngineId: string
): Promise<Relationship[]> {
  const [shareholders, executives, competitors, providers, investmentGroups] =
    await Promise.all([
      discoverShareholdersReal(company, apiKey, searchEngineId),
      discoverExecutivesReal(company, apiKey, searchEngineId),
      discoverCompetitorsReal(company, apiKey, searchEngineId),
      discoverServiceProvidersReal(company, apiKey, searchEngineId),
      discoverInvestmentGroupsReal(company, apiKey, searchEngineId),
    ]);

  return deduplicateRelationships([
    ...shareholders,
    ...executives,
    ...competitors,
    ...providers,
    ...investmentGroups,
  ]);
}
