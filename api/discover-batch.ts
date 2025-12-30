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
  source_url?: string;
}

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
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

    const claudeApiKey = process.env.ANTHROPIC_API_KEY;
    const serpApiKey = process.env.SERPAPI_KEY;

    let companiesWithRelationships;
    
    if (serpApiKey && claudeApiKey) {
      console.log('Using hybrid SerpAPI + Claude discovery');
      try {
        companiesWithRelationships = await discoverBatchHybrid(companies, serpApiKey, claudeApiKey);
        // If hybrid returns no relationships, fall back to Claude-only
        const totalRels = companiesWithRelationships.reduce((sum, c) => sum + c.relationships.length, 0);
        if (totalRels === 0) {
          console.log('Hybrid returned no results, falling back to Claude-only');
          companiesWithRelationships = await discoverBatchWithClaude(companies, claudeApiKey);
        }
      } catch (error) {
        console.error('Hybrid discovery failed, falling back to Claude-only:', error);
        companiesWithRelationships = await discoverBatchWithClaude(companies, claudeApiKey);
      }
    } else if (claudeApiKey) {
      console.log('Using Claude-only discovery');
      companiesWithRelationships = await discoverBatchWithClaude(companies, claudeApiKey);
    } else {
      console.warn('No API keys configured, using fallback');
      return res.json(createFallbackBatchOutput(companies));
    }

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
        api_calls_used: companies.length * 5,
        processing_time_ms: Date.now(),
        search_mode: serpApiKey ? 'hybrid_web_search' : 'claude_only',
      },
    });
  } catch (error) {
    console.error('Batch discovery error:', error);
    return res.status(500).json({ error: 'Discovery failed' });
  }
}

async function discoverBatchHybrid(
  companies: ParsedCompany[],
  serpApiKey: string,
  claudeApiKey: string
): Promise<Array<ParsedCompany & { relationships: Relationship[] }>> {
  const results = await Promise.all(
    companies.map(async (company) => {
      const searchData = await gatherSearchData(company, serpApiKey);
      const relationships = await analyseWithClaude(company, searchData, claudeApiKey);
      
      return {
        ...company,
        relationships,
        processing_status: 'completed' as const,
      };
    })
  );
  return results;
}

async function gatherSearchData(company: ParsedCompany, serpApiKey: string): Promise<string> {
  const searchQueries = [
    `${company.ticker} ASX shareholders registry`,
    `${company.ticker} ${company.name} board directors executives`,
    `${company.ticker} ${company.name} auditor`,
    `${company.ticker} ${company.name} broker analyst coverage`,
    `${company.ticker} ${company.name} news announcements 2024 2025`,
  ];

  let allResults = '';

  for (const query of searchQueries) {
    try {
      const results = await searchWithSerpApi(query, serpApiKey);
      for (const result of results.slice(0, 5)) {
        allResults += `\n\nSource: ${result.link}\nTitle: ${result.title}\nSnippet: ${result.snippet}`;
      }
    } catch (error) {
      console.error(`Search error for query "${query}":`, error);
    }
  }

  return allResults;
}

async function searchWithSerpApi(query: string, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: 'google',
    num: '10',
  });

  const response = await fetch(`https://serpapi.com/search?${params}`);

  if (!response.ok) {
    throw new Error(`SerpApi error: ${response.status}`);
  }

  const data = await response.json() as any;
  return (data.organic_results || []).map((r: any) => ({
    title: r.title || '',
    snippet: r.snippet || '',
    link: r.link || '',
  }));
}

async function analyseWithClaude(
  company: ParsedCompany,
  searchData: string,
  apiKey: string
): Promise<Relationship[]> {
  const prompt = `You are an expert financial analyst. Based on the following REAL web search results about "${company.name}" (ASX: ${company.ticker}), extract all relationships.

SEARCH RESULTS:
${searchData}

Extract and list ALL entities mentioned:
1. Shareholders (with percentages if mentioned)
2. Board members and executives (with roles)
3. Auditors
4. Brokers and advisors
5. Competitors
6. Any other relevant entities

Format your response as a JSON array:
[
  {"name": "Entity Name", "type": "shareholder|executive|auditor|broker|advisor|competitor|director", "details": "specific details from the search results"}
]

IMPORTANT: Only include entities actually mentioned in the search results. Include specific details like percentages, roles, or dates found in the results.`;

  try {
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
      console.error(`Claude API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

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
    console.error(`Claude analysis error for ${company.ticker}:`, error);
    return [];
  }
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

Format your response as a JSON array:
[
  {"name": "BDO Australia", "type": "auditor", "details": "External auditor"},
  {"name": "Soul Pattinson", "type": "shareholder", "details": "9.7% shareholder"}
]`;

  try {
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

    if (!response.ok) return [];

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const entities = JSON.parse(jsonMatch[0]);
    return entities.map((entity: any) => ({
      entity_name: entity.name,
      entity_type: mapEntityType(entity.type),
      category: entity.type,
      details: entity.details,
    }));
  } catch (error) {
    console.error(`Claude error for ${company.ticker}:`, error);
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
    director: 'person',
    ceo: 'person',
    cfo: 'person',
  };
  return typeMap[type.toLowerCase()] || 'firm';
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
  const companiesWithRelationships = companies.map((c) => ({
    ...c,
    relationships: [],
    processing_status: 'completed' as const,
  }));

  return {
    companies: companiesWithRelationships,
    who_cares: [],
    processing_stats: {
      total_companies: companies.length,
      total_relationships: 0,
      multi_exposure_entities: 0,
      api_calls_used: 0,
      processing_time_ms: 0,
      search_mode: 'fallback',
    },
  };
}
