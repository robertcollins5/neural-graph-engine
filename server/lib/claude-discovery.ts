/**
 * Claude-Powered Relationship Discovery
 * Uses Anthropic Claude API for intelligent company relationship discovery
 */

import { ParsedCompany, Relationship } from '@/../../shared/types';

interface ClaudeResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * Call Claude API for relationship discovery
 */
async function callClaude(prompt: string, apiKey: string): Promise<string> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Claude API error: ${response.status}`, error);
      return '';
    }

    const data = (await response.json()) as ClaudeResponse;
    const textContent = data.content.find((c) => c.type === 'text');
    return textContent?.text || '';
  } catch (error) {
    console.error('Claude API error:', error);
    return '';
  }
}

/**
 * Discover all relationships for a company using Claude
 */
export async function discoverRelationshipsWithClaude(
  company: ParsedCompany,
  apiKey: string
): Promise<Relationship[]> {
  const prompt = `You are an expert financial analyst. Research and discover all relationships for the company "${company.name}" (ticker: ${company.ticker}).

Find and list:
1. Major shareholders (>2% holdings)
2. Board members and executives
3. Auditors and financial advisors
4. Brokers and underwriters
5. Industry competitors
6. PE firms or investment groups with interest
7. Suppliers and major customers

For each entity found, provide:
- Entity name
- Relationship type (shareholder/executive/auditor/broker/advisor/competitor/pe_firm/supplier/customer)
- Brief details (e.g., "8.2% shareholder" or "CEO departed June 2025")

Format your response as a JSON array with objects containing: name, type, details

Example format:
[
  {"name": "BDO Australia", "type": "auditor", "details": "External auditor"},
  {"name": "Soul Pattinson", "type": "shareholder", "details": "9.7% shareholder, withdrew takeover bid"}
]

Be thorough and find as many real relationships as possible. Focus on high-quality, verified information.`;

  try {
    const response = await callClaude(prompt, apiKey);

    if (!response) {
      console.warn(`No response from Claude for ${company.ticker}`);
      return [];
    }

    // Parse JSON response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn(`Could not find JSON in Claude response for ${company.ticker}`);
      return [];
    }

    const entities = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      type: string;
      details: string;
    }>;

    // Convert to relationships
    const relationships: Relationship[] = entities.map((entity) => ({
      entity_name: entity.name,
      entity_type: mapEntityType(entity.type),
      category: entity.type as any,
      details: entity.details,
    }));

    console.log(
      `Claude discovered ${relationships.length} relationships for ${company.ticker}`
    );
    return relationships;
  } catch (error) {
    console.error(
      `Error discovering relationships for ${company.ticker}:`,
      error
    );
    return [];
  }
}

/**
 * Map entity type string to standard types
 */
function mapEntityType(type: string): 'company' | 'person' | 'firm' {
  const typeMap: Record<string, 'company' | 'person' | 'firm'> = {
    shareholder: 'company',
    executive: 'person',
    auditor: 'firm',
    broker: 'firm',
    advisor: 'firm',
    competitor: 'company',
    pe_firm: 'company',
    supplier: 'company',
    customer: 'company',
    director: 'person',
    ceo: 'person',
    cfo: 'person',
  };

  return typeMap[type.toLowerCase()] || 'firm';
}

/**
 * Discover relationships for multiple companies in parallel
 */
export async function discoverBatchWithClaude(
  companies: ParsedCompany[],
  apiKey: string
): Promise<Array<ParsedCompany & { relationships: Relationship[] }>> {
  const results = await Promise.all(
    companies.map(async (company) => {
      const relationships = await discoverRelationshipsWithClaude(company, apiKey);
      return {
        ...company,
        relationships,
        processing_status: 'completed' as const,
      };
    })
  );

  return results;
}

/**
 * Calculate WHO CARES from discovered relationships
 */
export function calculateWhoCaresFromRelationships(
  companies: Array<ParsedCompany & { relationships: Relationship[] }>
) {
  const entityMap = new Map<string, Set<string>>();
  const entityDetails = new Map<string, { type: string; category: string }>();

  for (const company of companies) {
    for (const rel of company.relationships) {
      if (!entityMap.has(rel.entity_name)) {
        entityMap.set(rel.entity_name, new Set());
      }
      entityMap.get(rel.entity_name)!.add(company.ticker);
      entityDetails.set(rel.entity_name, {
        type: rel.entity_type,
        category: rel.category,
      });
    }
  }

  return Array.from(entityMap.entries())
    .filter(([_, tickers]) => tickers.size >= 2)
    .map(([name, tickers]) => {
      const details = entityDetails.get(name)!;
      const entityType = (details.type as 'firm' | 'company' | 'person') || 'firm';
      return {
        entity_name: name,
        entity_type: entityType,
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
}
