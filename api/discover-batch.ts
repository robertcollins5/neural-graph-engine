import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ParsedCompany {
  name: string;
  ticker: string;
  exchange: string;
  stress_signal?: string;
}

interface Relationship {
  entity_name: string;
  entity_type: 'company' | 'person' | 'firm' | 'government';
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
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;

    let companiesWithRelationships;
    
    if (serpApiKey && claudeApiKey) {
      console.log('Using hybrid search + Claude discovery');
      try {
        companiesWithRelationships = await discoverBatchHybrid(companies, serpApiKey, claudeApiKey, firecrawlApiKey);
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
        api_calls_used: companies.length * 7,
        processing_time_ms: Date.now(),
        search_mode: serpApiKey ? 'hybrid_web_search' : 'claude_only',
        firecrawl_enabled: !!firecrawlApiKey,
      },
    });
  } catch (error) {
    console.error('Batch discovery error:', error);
    return res.status(500).json({ error: 'Discovery failed' });
  }
}

// ============ HYBRID DISCOVERY (SerpAPI + Firecrawl + Claude) ============

async function discoverBatchHybrid(
  companies: ParsedCompany[],
  serpApiKey: string,
  claudeApiKey: string,
  firecrawlApiKey?: string
): Promise<Array<ParsedCompany & { relationships: Relationship[] }>> {
  const results = await Promise.all(
    companies.map(async (company) => {
      const searchData = await gatherSearchData(company, serpApiKey, firecrawlApiKey);
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

async function gatherSearchData(
  company: ParsedCompany, 
  serpApiKey: string,
  firecrawlApiKey?: string
): Promise<string> {
  // Expanded WHO ELSE search queries
  const searchQueries = [
    // Shareholders & Ownership
    `"${company.ticker}" ASX substantial shareholders top 20 holders`,
    `"${company.name}" institutional investors Vanguard BlackRock State Street UniSuper`,
    
    // Board & Executives
    `"${company.name}" board of directors 2024 2025`,
    `"${company.name}" CEO CFO executive management team appointments`,
    `"${company.ticker}" director resignation appointment ASX announcement`,
    
    // Financial relationships
    `"${company.name}" auditor annual report 2024`,
    `"${company.ticker}" broker analyst coverage UBS Macquarie Goldman Citi`,
    `"${company.name}" lenders debt facility banking syndicate`,
    
    // Competitors & Industry
    `"${company.name}" competitors industry peers ASX`,
    `"${company.name}" suppliers customers B2B partners`,
    
    // Regulatory & Government
    `"${company.name}" ASIC ACCC regulatory government inquiry`,
    
    // M&A & PE interest
    `"${company.name}" private equity takeover acquisition interest`,
  ];

  let allResults = '';
  const urlsToScrape: string[] = [];

  // First pass: Get search results
  for (const query of searchQueries) {
    try {
      const results = await searchWithSerpApi(query, serpApiKey);
      for (const result of results.slice(0, 3)) {
        allResults += `\n\nSource: ${result.link}\nTitle: ${result.title}\nSnippet: ${result.snippet}`;
        
        // Collect high-value URLs for deep scraping
        if (firecrawlApiKey && isHighValueUrl(result.link)) {
          urlsToScrape.push(result.link);
        }
      }
    } catch (error) {
      console.error(`Search error for query "${query}":`, error);
    }
  }

  // Second pass: Deep scrape high-value pages with Firecrawl
  if (firecrawlApiKey && urlsToScrape.length > 0) {
    const uniqueUrls = [...new Set(urlsToScrape)].slice(0, 5); // Max 5 pages
    for (const url of uniqueUrls) {
      try {
        const pageContent = await scrapeWithFirecrawl(url, firecrawlApiKey);
        if (pageContent) {
          allResults += `\n\n=== FULL PAGE CONTENT ===\nSource: ${url}\n${pageContent.slice(0, 3000)}`;
        }
      } catch (error) {
        console.error(`Firecrawl error for ${url}:`, error);
      }
    }
  }

  return allResults;
}

function isHighValueUrl(url: string): boolean {
  const highValueDomains = [
    'asx.com.au',
    'afr.com',
    'theaustralian.com.au',
    'smh.com.au',
    'reuters.com',
    'bloomberg.com',
    'companiesmarketcap.com',
    'marketindex.com.au',
    'intelligentinvestor.com.au',
  ];
  return highValueDomains.some(domain => url.includes(domain));
}

async function searchWithSerpApi(query: string, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: 'google',
    num: '10',
    gl: 'au', // Australia focus
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

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v0/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: url,
        pageOptions: {
          onlyMainContent: true,
        },
      }),
    });

    if (!response.ok) {
      console.error(`Firecrawl error: ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    return data.data?.markdown || data.data?.content || null;
  } catch (error) {
    console.error('Firecrawl scrape error:', error);
    return null;
  }
}

async function analyseWithClaude(
  company: ParsedCompany,
  searchData: string,
  apiKey: string
): Promise<Relationship[]> {
  const prompt = `You are an expert financial analyst specializing in corporate relationships and stakeholder mapping. 

Analyze the following web search results about "${company.name}" (ASX: ${company.ticker}) and extract ALL entities that have a relationship with this company.

SEARCH RESULTS:
${searchData}

Extract entities in these categories:

WHO ELSE (connected to this company):
1. SHAREHOLDERS - Major/substantial holders, institutional investors, funds (with % if mentioned)
2. BOARD - Directors, chairman, non-executive directors (with roles)
3. EXECUTIVES - CEO, CFO, COO, company secretary (with roles and tenure)
4. AUDITORS - Audit firms
5. BROKERS - Research analysts, broking firms with coverage
6. ADVISORS - Legal counsel, M&A advisors, consultants
7. LENDERS - Banks, debt providers
8. COMPETITORS - Industry peers, direct competitors
9. SUPPLIERS - B2B suppliers, service providers
10. CUSTOMERS - Major B2B customers
11. REGISTRIES - Share registries
12. PE_FIRMS - Private equity firms with interest
13. GOVERNMENT - Regulators, government bodies (ASIC, ACCC, ATO, Health Dept)
14. UNIONS - Worker unions, industry associations
15. INSURERS - D&O insurers, professional indemnity

Format as JSON array:
[
  {"name": "Entity Name", "type": "shareholder|director|executive|auditor|broker|advisor|lender|competitor|supplier|customer|registry|pe_firm|government|union|insurer", "details": "specific details from search results"}
]

IMPORTANT: 
- Only include entities ACTUALLY MENTIONED in the search results
- Include specific details: percentages, roles, dates, amounts
- Be thorough - extract every entity mentioned
- For people, include their role/title`;

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
        max_tokens: 4000,
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

// ============ CLAUDE-ONLY DISCOVERY (fallback) ============

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
  const prompt = `You are an expert financial analyst. Research and discover all relationships for "${company.name}" (ASX: ${company.ticker}).

Find entities in these categories:
1. Major shareholders (with %)
2. Board members and executives (with roles)
3. Auditors
4. Brokers with research coverage
5. Legal and M&A advisors
6. Lenders/banks
7. Competitors
8. Major suppliers and customers (B2B)
9. Private equity firms with interest
10. Government/regulatory bodies
11. Share registries

Format as JSON array:
[
  {"name": "Entity Name", "type": "shareholder|director|executive|auditor|broker|advisor|lender|competitor|supplier|customer|pe_firm|government|registry", "details": "specific details"}
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
        max_tokens: 4000,
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

// ============ UTILITIES ============

function mapEntityType(type: string): 'company' | 'person' | 'firm' | 'government' {
  const typeMap: Record<string, 'company' | 'person' | 'firm' | 'government'> = {
    shareholder: 'company',
    director: 'person',
    executive: 'person',
    auditor: 'firm',
    broker: 'firm',
    advisor: 'firm',
    lender: 'firm',
    competitor: 'company',
    supplier: 'company',
    customer: 'company',
    registry: 'firm',
    pe_firm: 'company',
    government: 'government',
    union: 'firm',
    insurer: 'firm',
  };
  return typeMap[type.toLowerCase()] || 'firm';
}

function calculateWhoCaresFromRelationships(
  companies: Array<ParsedCompany & { relationships: Relationship[] }>
) {
  const entityMap = new Map<string, Set<string>>();
  const entityDetails = new Map<string, { type: string; category: string; details: string }>();

  for (const company of companies) {
    for (const rel of company.relationships) {
      const normalizedName = rel.entity_name.trim();
      if (!entityMap.has(normalizedName)) {
        entityMap.set(normalizedName, new Set());
      }
      entityMap.get(normalizedName)!.add(company.ticker);
      entityDetails.set(normalizedName, {
        type: rel.entity_type,
        category: rel.category,
        details: rel.details,
      });
    }
  }

  return Array.from(entityMap.entries())
    .filter(([_, tickers]) => tickers.size >= 2)
    .map(([name, tickers]) => {
      const details = entityDetails.get(name)!;
      return {
        entity_name: name,
        entity_type: details.type as 'firm' | 'company' | 'person' | 'government',
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
