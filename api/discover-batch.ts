import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ParsedCompany {
  name: string;
  ticker: string;
  exchange: string;
  stress_signal?: string;
}

interface Relationship {
  entity_name: string;
  entity_type: 'company' | 'person' | 'firm';
  category: string;
  details: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { companies } = req.body as { companies: ParsedCompany[] };

    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ error: 'Companies array is required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.warn('Claude API key not configured, using fallback');
      return res.json(createFallbackBatchOutput(companies));
    }

    const companiesWithRelationships = await discoverBatchWithClaude(companies, apiKey);
    const whoCares = calculateWhoCaresFromRelationships(companiesWithRelationships);

    const companiesWithStatus = companiesWithRelationships.map(c => ({
      ...c,
      processing_status: 'completed' as const,
    }));

    return res.json({
      companies: companiesWithStatus,
      who_cares: whoCares,
      processing_stats: {
        total_companies: companies.length,
        total_relationships: companiesWithRelationships.reduce(
          (sum, c) => sum + c.relationships.length,
          0
        ),
        multi_exposure_entities: whoCares.length,
        api_calls_used: companies.length,
        processing_time_ms: Date.now(),
      },
    });
  } catch (error) {
    console.error('Batch discovery error:', error);
    return res.status(500).json({ error: 'Discovery failed' });
  }
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Claude API error: ${response.status}`, error);
    return '';
  }

  const data = await response.json() as any;
  const textContent = data.content.find((c: any) => c.type === 'text');
  return textContent?.text || '';
}

async function discoverRelationshipsWithClaude(
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
      return [];
    }

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const entities = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      type: string;
      details: string;
    }>;

    return entities.map((entity) => ({
      entity_name: entity.name,
      entity_type: mapEntityType(entity.type),
      category: entity.type,
      details: entity.details,
    }));
  } catch (error) {
    console.error(`Error discovering relationships for ${company.ticker}:`, error);
    return [];
  }
}

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

async function discoverBatchWithClaude(
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

function calculateWhoCaresFromRelationships(
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
      return {
        entity_name: name,
        entity_type: details.type as 'firm' | 'company' | 'person',
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

function createFallbackBatchOutput(companies: ParsedCompany[]) {
  const mockRelationships: Record<string, Relationship[]> = {
    TER: [
      { entity_name: 'BDO Australia', entity_type: 'firm', category: 'auditor', details: 'External auditor' },
      { entity_name: 'Sprott Asset Management', entity_type: 'company', category: 'shareholder', details: '8.2% shareholding' },
    ],
    MVF: [
      { entity_name: 'BDO Australia', entity_type: 'firm', category: 'auditor', details: 'External auditor' },
      { entity_name: 'Sprott Asset Management', entity_type: 'company', category: 'shareholder', details: '6.5% shareholding' },
    ],
  };

  const companiesWithRelationships = companies.map((c) => ({
    ...c,
    relationships: mockRelationships[c.ticker] || [],
    processing_status: 'completed' as const,
  }));

  const entityMap = new Map<string, Set<string>>();
  for (const company of companiesWithRelationships) {
    for (const rel of company.relationships) {
      if (!entityMap.has(rel.entity_name)) {
        entityMap.set(rel.entity_name, new Set());
      }
      entityMap.get(rel.entity_name)!.add(company.ticker);
    }
  }

  const whoCares = Array.from(entityMap.entries())
    .filter(([_, tickers]) => tickers.size >= 2)
    .map(([name, tickers]) => {
      const rel = companiesWithRelationships
        .flatMap((c) => c.relationships)
        .find((r) => r.entity_name === name)!;
      return {
        entity_name: name,
        entity_type: rel.entity_type,
        category: rel.category,
        exposure_count: tickers.size,
        exposed_companies: Array.from(tickers),
        exposure_details: Array.from(tickers).map((ticker) => ({
          ticker,
          relationship_type: rel.category,
        })),
      };
    });

  return {
    companies: companiesWithRelationships,
    who_cares: whoCares,
    processing_stats: {
      total_companies: companies.length,
      total_relationships: companiesWithRelationships.reduce((sum, c) => sum + c.relationships.length, 0),
      multi_exposure_entities: whoCares.length,
      api_calls_used: 0,
      processing_time_ms: 1000,
    },
  };
}
