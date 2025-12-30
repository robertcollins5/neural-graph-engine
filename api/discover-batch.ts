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
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    const serpApiKey = process.env.SERPAPI_KEY;

    let companiesWithRelationships;
    let searchMode = 'claude_only';
    
    if (perplexityApiKey && claudeApiKey) {
      console.log('Using Perplexity + Claude discovery');
      searchMode = 'perplexity';
      try {
        companiesWithRelationships = await discoverBatchWithPerplexity(companies, perplexityApiKey, claudeApiKey);
        const totalRels = companiesWithRelationships.reduce((sum, c) => sum + c.relationships.length, 0);
        if (totalRels === 0) {
          console.log('Perplexity returned no results, falling back to SerpAPI');
          if (serpApiKey) {
            companiesWithRelationships = await discoverBatchWithSerpApi(companies, serpApiKey, claudeApiKey);
            searchMode = 'serpapi_fallback';
          } else {
            companiesWithRelationships = await discoverBatchWithClaude(companies, claudeApiKey);
            searchMode = 'claude_fallback';
          }
        }
      } catch (error) {
        console.error('Perplexity discovery failed:', error);
        if (serpApiKey) {
          companiesWithRelationships = await discoverBatchWithSerpApi(companies, serpApiKey, claudeApiKey);
          searchMode = 'serpapi_fallback';
        } else {
          companiesWithRelationships = await discoverBatchWithClaude(companies, claudeApiKey);
          searchMode = 'claude_fallback';
        }
      }
    } else if (serpApiKey && claudeApiKey) {
      console.log('Using SerpAPI + Claude discovery');
      searchMode = 'serpapi';
      companiesWithRelationships = await discoverBatchWithSerpApi(companies, serpApiKey, claudeApiKey);
    } else if (claudeApiKey) {
      console.log('Using Claude-only discovery');
      companiesWithRelationships = await discoverBatchWithClaude(companies, claudeApiKey);
    } else {
      return res.json(createFallbackBatchOutput(companies));
    }

    // Normalize entity names for better matching
    companiesWithRelationships = normalizeAllEntityNames(companiesWithRelationships);

    const whoCares = calculateWhoCaresFromRelationships(companiesWithRelationships);

    return res.json({
      companies: companiesWithRelationships.map(c => ({ ...c, processing_status: 'completed' as const })),
      who_cares: whoCares,
      processing_stats: {
        total_companies: companies.length,
        total_relationships: companiesWithRelationships.reduce((sum, c) => sum + c.relationships.length, 0),
        multi_exposure_entities: whoCares.length,
        processing_time_ms: Date.now(),
        search_mode: searchMode,
      },
    });
  } catch (error) {
    console.error('Batch discovery error:', error);
    return res.status(500).json({ error: 'Discovery failed' });
  }
}

// ============ ENTITY NAME NORMALIZATION ============

function normalizeAllEntityNames(
  companies: Array<ParsedCompany & { relationships: Relationship[] }>
): Array<ParsedCompany & { relationships: Relationship[] }> {
  return companies.map(company => ({
    ...company,
    relationships: company.relationships.map(rel => ({
      ...rel,
      entity_name: normalizeEntityName(rel.entity_name),
    })),
  }));
}

function normalizeEntityName(name: string): string {
  let normalized = name.trim();
  
  // Known entity mappings (aliases → canonical name)
  const knownEntities: Record<string, string> = {
    // Auditors
    'ernst & young': 'Ernst & Young',
    'ey': 'Ernst & Young',
    'ernst & young (ey)': 'Ernst & Young',
    'pricewaterhousecoopers': 'PwC',
    'pwc': 'PwC',
    'pricewaterhousecoopers (pwc)': 'PwC',
    'kpmg australia': 'KPMG',
    'kpmg': 'KPMG',
    'deloitte touche tohmatsu': 'Deloitte',
    'deloitte': 'Deloitte',
    'bdo australia': 'BDO',
    'bdo': 'BDO',
    
    // Major shareholders/custodians
    'hsbc custody nominees (australia) limited': 'HSBC Custody Nominees',
    'hsbc custody nominees': 'HSBC Custody Nominees',
    'j p morgan nominees australia pty limited': 'JP Morgan Nominees',
    'jp morgan nominees australia': 'JP Morgan Nominees',
    'j.p. morgan': 'JP Morgan',
    'citicorp nominees pty limited': 'Citicorp Nominees',
    'national nominees limited': 'National Nominees',
    'bnp paribas nominees pty ltd': 'BNP Paribas Nominees',
    
    // Asset managers
    'blackrock, inc.': 'BlackRock',
    'blackrock inc': 'BlackRock',
    'blackrock group': 'BlackRock',
    'blackrock': 'BlackRock',
    'vanguard group': 'Vanguard',
    'the vanguard group': 'Vanguard',
    'vanguard funds': 'Vanguard',
    'vanguard': 'Vanguard',
    'state street corporation': 'State Street',
    'state street corporation and subsidiaries': 'State Street',
    'state street': 'State Street',
    'fidelity investments': 'Fidelity',
    'fidelity': 'Fidelity',
    'fil limited': 'Fidelity',
    
    // Banks/Brokers
    'macquarie group limited': 'Macquarie',
    'macquarie group': 'Macquarie',
    'macquarie capital': 'Macquarie',
    'macquarie bank': 'Macquarie',
    'macquarie': 'Macquarie',
    'goldman sachs': 'Goldman Sachs',
    'goldman sachs australia': 'Goldman Sachs',
    'ubs': 'UBS',
    'ubs australia': 'UBS',
    'morgan stanley': 'Morgan Stanley',
    'morgan stanley australia': 'Morgan Stanley',
    'citi': 'Citi',
    'citigroup': 'Citi',
    'citibank': 'Citi',
    'jp morgan': 'JP Morgan',
    'jpmorgan': 'JP Morgan',
    'j.p. morgan chase': 'JP Morgan',
    'bell potter': 'Bell Potter',
    'bell potter securities': 'Bell Potter',
    
    // PE Firms
    'kkr': 'KKR',
    'kkr & co': 'KKR',
    'kohlberg kravis roberts': 'KKR',
    'tpg': 'TPG',
    'tpg capital': 'TPG',
    'carlyle': 'Carlyle Group',
    'carlyle group': 'Carlyle Group',
    'bgh capital': 'BGH Capital',
    'affinity equity partners': 'Affinity Equity Partners',
    'brookfield': 'Brookfield',
    'brookfield asset management': 'Brookfield',
    
    // Government/Regulators
    'accc': 'ACCC',
    'australian competition and consumer commission': 'ACCC',
    'asic': 'ASIC',
    'australian securities and investments commission': 'ASIC',
    'asx': 'ASX',
    'australian securities exchange': 'ASX',
    'ato': 'ATO',
    'australian taxation office': 'ATO',
    'apra': 'APRA',
    'australian prudential regulation authority': 'APRA',
    
    // Share registries
    'link market services': 'Link Market Services',
    'link administration': 'Link Market Services',
    'computershare': 'Computershare',
    'computershare limited': 'Computershare',
    
    // Healthcare companies (for this demo)
    'sonic healthcare': 'Sonic Healthcare',
    'sonic healthcare ltd': 'Sonic Healthcare',
    'sonic healthcare ltd (asx: shl)': 'Sonic Healthcare',
    'sonic healthcare (asx: shl)': 'Sonic Healthcare',
    'healius': 'Healius',
    'healius limited': 'Healius',
    'healius ltd': 'Healius',
    'ramsay health care': 'Ramsay Health Care',
    'ramsay health care limited': 'Ramsay Health Care',
    'healthscope': 'Healthscope',
    'healthscope limited': 'Healthscope',
    'australian clinical labs': 'Australian Clinical Labs',
    'australian clinical labs ltd': 'Australian Clinical Labs',
    'australian clinical labs ltd (asx: acl)': 'Australian Clinical Labs',
    
    // Superannuation
    'australian retirement trust': 'Australian Retirement Trust',
    'australian retirement trust pty ltd': 'Australian Retirement Trust',
    'unisuper': 'UniSuper',
    'unisuper limited': 'UniSuper',
    'aware super': 'Aware Super',
    'cbus': 'Cbus',
    'cbus super': 'Cbus',
    'hostplus': 'Hostplus',
    'rest super': 'REST Super',
    
    // Investment firms
    'perpetual limited': 'Perpetual',
    'perpetual': 'Perpetual',
    'allan gray': 'Allan Gray',
    'allan gray australia': 'Allan Gray',
    'allan gray australia pty ltd': 'Allan Gray',
    'dimensional fund advisors': 'DFA',
    'dfa': 'DFA',
    'lazard asset management': 'Lazard',
    'lazard': 'Lazard',
  };
  
  // Check known entities first (case-insensitive)
  const lowerName = normalized.toLowerCase();
  if (knownEntities[lowerName]) {
    return knownEntities[lowerName];
  }
  
  // Check if name contains a known entity
  for (const [alias, canonical] of Object.entries(knownEntities)) {
    if (lowerName.includes(alias)) {
      return canonical;
    }
  }
  
  // Remove common suffixes
  const suffixPatterns = [
    /\s*\(asx:\s*[a-z]+\)/i,  // (ASX: XXX)
    /\s*\([a-z]{2,4}\)/i,     // (XXX) ticker
    /\s*pty\.?\s*ltd\.?/i,    // Pty Ltd
    /\s*limited$/i,           // Limited
    /\s*ltd\.?$/i,            // Ltd
    /\s*inc\.?$/i,            // Inc
    /\s*incorporated$/i,      // Incorporated
    /\s*corporation$/i,       // Corporation
    /\s*corp\.?$/i,           // Corp
    /\s*&\s*co\.?$/i,         // & Co
    /\s*and\s+subsidiaries$/i, // and subsidiaries
    /\s*group$/i,             // Group
    /\s*holdings$/i,          // Holdings
    /\s*australia$/i,         // Australia (at end)
  ];
  
  for (const pattern of suffixPatterns) {
    normalized = normalized.replace(pattern, '');
  }
  
  // Clean up extra whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Title case for consistency
  if (normalized.length > 0) {
    normalized = normalized
      .split(' ')
      .map(word => {
        // Keep acronyms uppercase
        if (word.length <= 4 && word === word.toUpperCase()) {
          return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }
  
  return normalized;
}

// ============ PERPLEXITY DISCOVERY ============

async function discoverBatchWithPerplexity(
  companies: ParsedCompany[],
  perplexityApiKey: string,
  claudeApiKey: string
): Promise<Array<ParsedCompany & { relationships: Relationship[] }>> {
  const results = await Promise.all(
    companies.map(async (company) => {
      const researchData = await researchWithPerplexity(company, perplexityApiKey);
      const relationships = await extractRelationshipsWithClaude(company, researchData, claudeApiKey);
      return { ...company, relationships };
    })
  );
  return results;
}

async function researchWithPerplexity(company: ParsedCompany, apiKey: string): Promise<string> {
  const queries = [
    `Who are the major shareholders of ${company.name} (ASX: ${company.ticker})? List the top 10 substantial shareholders with their percentage holdings.`,
    `Who are the current board of directors and executive team of ${company.name} (ASX: ${company.ticker})? Include CEO, CFO, Chairman and all directors with their roles.`,
    `Who is the external auditor of ${company.name} (ASX: ${company.ticker})? Also list any legal advisors, M&A advisors, or corporate brokers.`,
    `Who are the main competitors of ${company.name} (ASX: ${company.ticker})? List ASX-listed competitors and any private equity firms interested in the sector.`,
  ];

  let allResults = '';

  for (const query of queries) {
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: 'You are a financial research assistant. Provide accurate, current information about ASX-listed companies with specific names, percentages, and roles. Be concise and factual.'
            },
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        console.error(`Perplexity error: ${response.status}`);
        continue;
      }

      const data = await response.json() as any;
      const answer = data.choices?.[0]?.message?.content || '';
      allResults += `\n\n=== ${query} ===\n${answer}`;
    } catch (error) {
      console.error('Perplexity query error:', error);
    }
  }

  return allResults;
}

async function extractRelationshipsWithClaude(
  company: ParsedCompany,
  researchData: string,
  apiKey: string
): Promise<Relationship[]> {
  const prompt = `You are an expert financial analyst. Extract ALL entities mentioned in this research about "${company.name}" (ASX: ${company.ticker}).

RESEARCH DATA:
${researchData}

Extract every entity into these categories:
1. SHAREHOLDERS - with exact percentages
2. DIRECTORS - with roles (Chairman, Non-Executive Director, etc.)
3. EXECUTIVES - CEO, CFO, COO, Company Secretary with tenure if mentioned
4. AUDITORS - audit firms
5. BROKERS - research coverage, corporate brokers
6. ADVISORS - legal, M&A, financial advisors
7. COMPETITORS - listed and private competitors
8. PE_FIRMS - private equity with sector interest
9. LENDERS - banks, debt facilities
10. GOVERNMENT - regulators (ASIC, ACCC, ATO)
11. REGISTRIES - share registries
12. SUPPLIERS - key B2B suppliers
13. CUSTOMERS - major B2B customers

IMPORTANT: Use simple, canonical names for entities:
- Use "Ernst & Young" not "Ernst & Young (EY)"
- Use "Sonic Healthcare" not "Sonic Healthcare Ltd (ASX: SHL)"
- Use "BlackRock" not "BlackRock, Inc."
- Use "Macquarie" not "Macquarie Group Limited"
- Use "ACCC" not "Australian Competition and Consumer Commission"

Format as JSON array:
[
  {"name": "Entity Name", "type": "shareholder|director|executive|auditor|broker|advisor|competitor|pe_firm|lender|government|registry|supplier|customer", "details": "specific details with percentages, roles, dates"}
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
    console.error(`Claude extraction error for ${company.ticker}:`, error);
    return [];
  }
}

// ============ SERPAPI FALLBACK ============

async function discoverBatchWithSerpApi(
  companies: ParsedCompany[],
  serpApiKey: string,
  claudeApiKey: string
): Promise<Array<ParsedCompany & { relationships: Relationship[] }>> {
  const results = await Promise.all(
    companies.map(async (company) => {
      const searchData = await gatherSearchData(company, serpApiKey);
      const relationships = await extractRelationshipsWithClaude(company, searchData, claudeApiKey);
      return { ...company, relationships };
    })
  );
  return results;
}

async function gatherSearchData(company: ParsedCompany, serpApiKey: string): Promise<string> {
  const queries = [
    `"${company.ticker}" ASX substantial shareholders top holders`,
    `"${company.name}" board directors executives CEO CFO`,
    `"${company.name}" auditor annual report`,
    `"${company.name}" broker analyst coverage`,
    `"${company.name}" competitors industry peers`,
  ];

  let allResults = '';

  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        q: query,
        api_key: serpApiKey,
        engine: 'google',
        num: '10',
        gl: 'au',
      });

      const response = await fetch(`https://serpapi.com/search?${params}`);
      if (!response.ok) continue;

      const data = await response.json() as any;
      for (const result of (data.organic_results || []).slice(0, 5)) {
        allResults += `\n\nSource: ${result.link}\nTitle: ${result.title}\nSnippet: ${result.snippet}`;
      }
    } catch (error) {
      console.error(`SerpAPI error:`, error);
    }
  }

  return allResults;
}

// ============ CLAUDE-ONLY FALLBACK ============

async function discoverBatchWithClaude(
  companies: ParsedCompany[],
  apiKey: string
): Promise<Array<ParsedCompany & { relationships: Relationship[] }>> {
  const results = await Promise.all(
    companies.map(async (company) => {
      const relationships = await discoverRelationshipsWithClaudeOnly(company, apiKey);
      return { ...company, relationships };
    })
  );
  return results;
}

async function discoverRelationshipsWithClaudeOnly(
  company: ParsedCompany,
  apiKey: string
): Promise<Relationship[]> {
  const prompt = `You are an expert financial analyst. List all known relationships for "${company.name}" (ASX: ${company.ticker}).

Include:
1. Major shareholders with percentages
2. Board members with roles
3. Executives (CEO, CFO, etc.)
4. Auditor
5. Brokers with coverage
6. Competitors
7. PE firms with interest

Use simple canonical names (e.g., "Ernst & Young" not "EY", "Macquarie" not "Macquarie Group Limited").

Format as JSON array:
[{"name": "Entity", "type": "shareholder|director|executive|auditor|broker|competitor|pe_firm", "details": "specific details"}]`;

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
    competitor: 'company',
    pe_firm: 'company',
    lender: 'firm',
    government: 'government',
    registry: 'firm',
    supplier: 'company',
    customer: 'company',
  };
  return typeMap[type?.toLowerCase()] || 'firm';
}

function calculateWhoCaresFromRelationships(
  companies: Array<ParsedCompany & { relationships: Relationship[] }>
) {
  const entityMap = new Map<string, Set<string>>();
  const entityDetails = new Map<string, { type: string; category: string }>();

  for (const company of companies) {
    for (const rel of company.relationships) {
      const name = rel.entity_name.trim();
      if (!entityMap.has(name)) {
        entityMap.set(name, new Set());
      }
      entityMap.get(name)!.add(company.ticker);
      entityDetails.set(name, { type: rel.entity_type, category: rel.category });
    }
  }

  return Array.from(entityMap.entries())
    .filter(([_, tickers]) => tickers.size >= 2)
    .map(([name, tickers]) => {
      const details = entityDetails.get(name)!;
      return {
        entity_name: name,
        entity_type: details.type,
        category: details.category,
        exposure_count: tickers.size,
        exposed_companies: Array.from(tickers),
        exposure_details: Array.from(tickers).map(ticker => ({
          ticker,
          relationship_type: details.category,
        })),
      };
    })
    .sort((a, b) => b.exposure_count - a.exposure_count);
}

function createFallbackBatchOutput(companies: ParsedCompany[]) {
  return {
    companies: companies.map(c => ({ ...c, relationships: [], processing_status: 'completed' as const })),
    who_cares: [],
    processing_stats: {
      total_companies: companies.length,
      total_relationships: 0,
      multi_exposure_entities: 0,
      processing_time_ms: 0,
      search_mode: 'fallback',
    },
  };
}
