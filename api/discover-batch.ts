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
}

interface RawEntity {
  name: string;
  type: string;
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

    const claudeApiKey = process.env.ANTHROPIC_API_KEY;
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;

    if (!claudeApiKey) {
      return res.json(createFallbackOutput(companies));
    }

    console.log('Step 1: Researching companies...');

    // Step 1: Research all companies
    const companyResearch = await Promise.all(
      companies.map(async (company) => ({
        company,
        research: perplexityApiKey 
          ? await researchWithPerplexity(company, perplexityApiKey)
          : '',
      }))
    );

    console.log('Step 2: Extracting entities...');

    // Step 2: Extract raw entities from each company
    const allRawEntities: Array<{ ticker: string; entity: RawEntity }> = [];
    const companiesWithRawEntities: Array<{ company: ParsedCompany; rawEntities: RawEntity[] }> = [];

    for (const { company, research } of companyResearch) {
      const rawEntities = await extractRawEntities(company, research, claudeApiKey);
      console.log(`${company.ticker}: extracted ${rawEntities.length} entities`);
      companiesWithRawEntities.push({ company, rawEntities });
      
      for (const entity of rawEntities) {
        allRawEntities.push({ ticker: company.ticker, entity });
      }
    }

    // Step 3: Semantic entity resolution
    console.log('Step 3: Resolving entities semantically...');
    const entityNames = [...new Set(allRawEntities.map(e => e.entity.name))];
    console.log(`Unique entity names to resolve: ${entityNames.length}`);
    
    const resolvedNames = await resolveEntitiesSemantically(entityNames, claudeApiKey);

    // Step 4: Build final relationships with resolved names
    console.log('Step 4: Building relationships...');
    const companiesWithRelationships = companiesWithRawEntities.map(({ company, rawEntities }) => {
      const relationships: Relationship[] = rawEntities.map(entity => {
        const resolvedName = resolvedNames.get(entity.name) || entity.name;
        return {
          entity_name: resolvedName,
          entity_type: mapEntityType(entity.type),
          category: entity.type,
          details: entity.details,
        };
      });
      
      return { ...company, relationships, processing_status: 'completed' as const };
    });

    // Step 5: Calculate WHO CARES
    console.log('Step 5: Calculating WHO CARES...');
    const whoCares = calculateWhoCaresFromRelationships(companiesWithRelationships);
    console.log(`Found ${whoCares.length} multi-exposure entities`);

    return res.json({
      companies: companiesWithRelationships,
      who_cares: whoCares,
      processing_stats: {
        total_companies: companies.length,
        total_relationships: companiesWithRelationships.reduce((sum, c) => sum + c.relationships.length, 0),
        multi_exposure_entities: whoCares.length,
        processing_time_ms: Date.now(),
        search_mode: perplexityApiKey ? 'perplexity_semantic' : 'claude_semantic',
      },
    });
  } catch (error) {
    console.error('Batch discovery error:', error);
    return res.status(500).json({ error: 'Discovery failed' });
  }
}

// ============ PERPLEXITY RESEARCH ============

async function researchWithPerplexity(company: ParsedCompany, apiKey: string): Promise<string> {
  const queries = [
    `Who are the top 10 substantial shareholders of ${company.name} (ASX: ${company.ticker})? Include percentage holdings.`,
    `Who are all board directors and executives of ${company.name} (ASX: ${company.ticker})? Include Chairman, CEO, CFO, all non-executive directors with roles.`,
    `Who is the external auditor for ${company.name} (ASX: ${company.ticker})? Also list legal advisors, M&A advisors, corporate brokers, and share registry.`,
    `Who are the main ASX-listed competitors of ${company.name} (${company.ticker})? Also list any private equity firms interested in this sector.`,
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
              content: 'You are a financial research assistant. Provide accurate, specific information about ASX companies including names, percentages, and roles. Always include the external auditor.'
            },
            { role: 'user', content: query }
          ],
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        console.error(`Perplexity error for ${company.ticker}: ${response.status}`);
        continue;
      }

      const data = await response.json() as any;
      const answer = data.choices?.[0]?.message?.content || '';
      allResults += `\n\n${answer}`;
    } catch (error) {
      console.error('Perplexity error:', error);
    }
  }

  return allResults;
}

// ============ ENTITY EXTRACTION ============

async function extractRawEntities(
  company: ParsedCompany,
  research: string,
  apiKey: string
): Promise<RawEntity[]> {
  const prompt = `Extract ALL entities from this research about ${company.name} (ASX: ${company.ticker}).

RESEARCH:
${research || 'No external research available - use your knowledge.'}

Extract entities into categories:
- shareholder (with % if known)
- director (with role: Chairman, Non-Executive Director, etc.)
- executive (CEO, CFO, COO, Company Secretary)
- auditor
- broker
- advisor (legal, M&A, financial)
- competitor
- pe_firm (private equity)
- government (regulators: ACCC, ASIC, etc.)
- registry (share registry)
- lender
- supplier
- customer

Return ONLY a JSON array with no markdown formatting:
[{"name": "Full Entity Name", "type": "category", "details": "specific details"}]

IMPORTANT: Include the external auditor. Do not wrap response in code blocks.`;

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
      console.error(`Entity extraction API error for ${company.ticker}: ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '';
    
    // Strip markdown code blocks if present
    let cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    
    const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`No JSON array found for ${company.ticker}`);
      return [];
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Entity extraction error:', error);
    return [];
  }
}

// ============ SEMANTIC ENTITY RESOLUTION ============

async function resolveEntitiesSemantically(
  entityNames: string[],
  apiKey: string
): Promise<Map<string, string>> {
  if (entityNames.length === 0) return new Map();

  console.log(`Resolving ${entityNames.length} entities semantically...`);

  const prompt = `You are an expert at entity resolution. Below is a list of entity names extracted from multiple companies. Many refer to the SAME entity with different naming variations.

ENTITY LIST:
${entityNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

Your task: Identify which entities are THE SAME and assign a single canonical name.

Matching rules:
- "Ernst & Young (EY)", "EY", "Ernst & Young Australia" → "Ernst & Young"
- "BlackRock Group", "BlackRock, Inc." → "BlackRock"
- "State Street Corporation and subsidiaries", "State Street" → "State Street"
- "Vanguard funds", "The Vanguard Group" → "Vanguard"
- "Macquarie Group Limited", "Macquarie Capital" → "Macquarie"
- "HSBC Custody Nominees (Australia) Limited" → "HSBC Custody Nominees"
- "Sonic Healthcare Ltd (ASX: SHL)" → "Sonic Healthcare"
- "Australian Competition and Consumer Commission" → "ACCC"
- Remove suffixes: Ltd, Limited, Pty, Inc, Corporation, Group, Australia
- Government bodies use acronyms: ASIC, ACCC, ASX, ATO, APRA
- People: normalize variations like "Kate (Kathryn) McKenzie" → "Kate McKenzie"

Return ONLY a JSON object mapping every original name to its canonical form. No markdown, no explanation:
{"original name": "canonical name", ...}`;

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
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Resolution API error:', response.status);
      return new Map(entityNames.map(n => [n, n]));
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '';
    
    console.log('Resolution response length:', text.length);
    
    // Strip markdown code blocks if present
    let cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    
    // Extract JSON object from response
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in resolution response. First 500 chars:', cleanText.substring(0, 500));
      return new Map(entityNames.map(n => [n, n]));
    }

    const mappings = JSON.parse(jsonMatch[0]);
    const mappingCount = Object.keys(mappings).length;
    console.log(`Resolved ${mappingCount} entity mappings`);
    
    // Log some example mappings to verify normalization
    const examples = Object.entries(mappings).slice(0, 5);
    console.log('Example mappings:', JSON.stringify(examples));
    
    // Count how many were actually normalized (different from original)
    const normalizedCount = Object.entries(mappings).filter(([orig, canon]) => orig !== canon).length;
    console.log(`Entities normalized: ${normalizedCount} of ${mappingCount}`);

    return new Map(Object.entries(mappings));
  } catch (error) {
    console.error('Entity resolution error:', error);
    return new Map(entityNames.map(n => [n, n]));
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
      const name = rel.entity_name;
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

function createFallbackOutput(companies: ParsedCompany[]) {
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
