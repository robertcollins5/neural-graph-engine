import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ParsedCompany {
  name: string;
  ticker: string;
  exchange: string;
  stress_signal?: string;
  event_type?: string;
  severity?: string;
  industry?: string;
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

interface WhoCares {
  entity_name: string;
  entity_type: string;
  category: string;
  exposure_count: number;
  exposed_companies: string[];
  exposure_details: Array<{ ticker: string; relationship_type: string }>;
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

    // Step 6: Generate narrative summary
    console.log('Step 6: Generating narrative summary...');
    const narrativeSummary = await generateNarrativeSummary(companies, whoCares, claudeApiKey);

    return res.json({
      companies: companiesWithRelationships,
      who_cares: whoCares,
      narrative_summary: narrativeSummary,
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

// ============ NARRATIVE SUMMARY ============

async function generateNarrativeSummary(
  companies: ParsedCompany[],
  whoCares: WhoCares[],
  apiKey: string
): Promise<object> {
  if (whoCares.length === 0) {
    return {
      headline: "No multi-exposure entities identified",
      key_findings: ["No entities found with exposure to multiple companies in this analysis."],
      suggested_approaches: [],
      disclaimer: "Signal6 provides indicative insights, not predictive claims."
    };
  }

  const prompt = `You are a business intelligence analyst for advisory firms (executive recruiters, strategy consultants, restructuring advisors). Generate an executive summary of these findings.

STRESSED COMPANIES ANALYSED:
${companies.map(c => `• ${c.name} (${c.ticker}): ${c.stress_signal || 'Stress signal detected'}`).join('\n')}

MULTI-EXPOSURE ENTITIES FOUND (entities connected to 2+ stressed companies):
${whoCares.slice(0, 10).map(w => `• ${w.entity_name} (${w.category}): Connected to ${w.exposed_companies.join(', ')} - ${w.exposure_count} companies`).join('\n')}

Generate a JSON response with this structure:
{
  "headline": "One sentence summary of the overall finding",
  "key_findings": [
    "Bullet point 1 - most significant cross-exposure and why it matters",
    "Bullet point 2 - second finding",
    "Bullet point 3 - third finding"
  ],
  "suggested_approaches": [
    {"target": "Entity name", "angle": "How to approach them", "advisory_type": "e.g., Board Advisory, Restructuring, Compliance"},
    {"target": "Entity name", "angle": "How to approach them", "advisory_type": "e.g., Executive Search, Strategy"}
  ],
  "disclaimer": "Signal6 provides indicative insights, not predictive claims."
}

IMPORTANT RULES:
- Use words like "indicative", "suggests", "may signal" - NOT "will", "predicts", "guarantees"
- Focus on multi-exposure as the key insight
- Keep findings concise - max 30 words per bullet
- Maximum 3 key findings, maximum 3 suggested approaches
- Return ONLY valid JSON, no markdown`;

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
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Narrative generation API error:', response.status);
      return createFallbackNarrative(companies, whoCares);
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '';
    
    // Strip markdown code blocks if present
    let cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in narrative response');
      return createFallbackNarrative(companies, whoCares);
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Narrative generation error:', error);
    return createFallbackNarrative(companies, whoCares);
  }
}

function createFallbackNarrative(companies: ParsedCompany[], whoCares: WhoCares[]): object {
  const topEntity = whoCares[0];
  return {
    headline: `${whoCares.length} entities identified with multi-company exposure across ${companies.length} stressed companies.`,
    key_findings: [
      `${topEntity?.entity_name || 'Key entity'} has exposure to ${topEntity?.exposure_count || 'multiple'} companies, indicating potential advisory opportunity.`,
      `Cross-exposure patterns suggest sector-wide stress affecting common stakeholders.`,
      `Multi-exposure entities may be navigating similar challenges across their portfolio or board positions.`
    ],
    suggested_approaches: [
      {
        target: topEntity?.entity_name || 'Top multi-exposure entity',
        angle: 'Reference their dual exposure to open conversation',
        advisory_type: topEntity?.category === 'director' ? 'Board Advisory' : 'Strategic Advisory'
      }
    ],
    disclaimer: "Signal6 provides indicative insights, not predictive claims."
  };
}

// ============ PERPLEXITY RESEARCH ============

async function researchWithPerplexity(company: ParsedCompany, apiKey: string): Promise<string> {
  const queries = [
    `Who are the top 10 substantial shareholders of ${company.name} (ASX: ${company.ticker})? Include percentage holdings, institutional investors, private equity firms, and activist shareholders.`,
    `Who are all board directors and executives of ${company.name} (ASX: ${company.ticker})? Include Chairman, CEO, CFO, all non-executive directors with their roles. Note any recent departures, appointments, or upcoming retirements.`,
    `Who are the professional advisors of ${company.name} (ASX: ${company.ticker})? Include external auditor, legal counsel, M&A advisors, corporate brokers, share registry, and any restructuring or turnaround advisors.`,
    `Who are the main ASX-listed competitors of ${company.name} (${company.ticker})? Also list any private equity firms that have shown acquisition interest in this company or sector, including failed bids.`,
    `Who are the lenders and debt providers to ${company.name} (ASX: ${company.ticker})? Include any debt facilities, covenant issues, refinancing activity, or financial stress indicators.`,
    `Has ${company.name} (ASX: ${company.ticker}) faced any regulatory scrutiny, ASIC or ACCC investigations, ASX queries, compliance issues, or governance concerns? Include any enforceable undertakings or remediation programs.`,
    `Has ${company.name} (ASX: ${company.ticker}) engaged any strategy consultants for strategic reviews, transformation programs, cost reduction, or performance improvement? Include any announced restructuring or turnaround initiatives.`,
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
              content: 'You are a financial research assistant specializing in ASX-listed companies. Provide accurate, specific information including names of firms and individuals, percentages, roles, and dates. Include any professional advisors, consultants, or restructuring firms involved.'
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

Extract entities into these categories (important for executive recruiters, strategy consultants, and restructuring advisors):

OWNERSHIP & GOVERNANCE:
- shareholder (with % if known - especially PE firms, activists, institutions)
- director (Chairman, Non-Executive Directors - note multiple board seats)
- executive (CEO, CFO, COO, Company Secretary - note departures/appointments)

PROFESSIONAL ADVISORS:
- auditor (external audit firm)
- legal_advisor (law firms acting for the company)
- ma_advisor (M&A advisory, corporate finance)
- broker (corporate broker, research coverage)
- restructuring_advisor (turnaround, insolvency specialists like FTI, McGrathNicol, KordaMentha)
- strategy_consultant (McKinsey, KPMG, Bain, BCG, LEK, SPP, Nous)

FINANCIAL RELATIONSHIPS:
- lender (banks with debt exposure, syndicate members)
- pe_firm (private equity with ownership or acquisition interest)

MARKET CONTEXT:
- competitor (ASX-listed and private competitors)
- customer (major B2B customers)
- supplier (key suppliers)

REGULATORY:
- government (ACCC, ASIC, ASX, APRA, ATO - especially if investigating)
- registry (share registry)

Return ONLY a JSON array with no markdown formatting:
[{"name": "Full Entity Name", "type": "category", "details": "specific details including roles, percentages, dates, nature of engagement"}]

IMPORTANT: 
- Include ALL professional advisors mentioned (auditors, lawyers, consultants, restructuring firms)
- Note any regulatory investigations or compliance issues
- Include lenders and debt providers
- Flag any PE firms with acquisition interest`;

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

AUDIT FIRMS:
- "Ernst & Young (EY)", "EY", "Ernst & Young Australia" → "Ernst & Young"
- "PricewaterhouseCoopers", "PwC", "PwC Australia" → "PwC"
- "KPMG Australia", "KPMG" → "KPMG"
- "Deloitte Touche Tohmatsu", "Deloitte" → "Deloitte"

ASSET MANAGERS:
- "BlackRock Group", "BlackRock, Inc." → "BlackRock"
- "State Street Corporation and subsidiaries", "State Street" → "State Street"
- "Vanguard funds", "The Vanguard Group" → "Vanguard"

BANKS/BROKERS:
- "Macquarie Group Limited", "Macquarie Capital", "Macquarie Bank" → "Macquarie"
- "Goldman Sachs Australia", "Goldman Sachs" → "Goldman Sachs"
- "UBS Australia", "UBS AG" → "UBS"

RESTRUCTURING FIRMS:
- "FTI Consulting", "FTI" → "FTI Consulting"
- "McGrathNicol", "McGrath Nicol" → "McGrathNicol"
- "KordaMentha", "Korda Mentha" → "KordaMentha"

STRATEGY CONSULTANTS:
- "McKinsey & Company", "McKinsey" → "McKinsey"
- "Boston Consulting Group", "BCG" → "BCG"
- "Bain & Company", "Bain" → "Bain"

LAW FIRMS:
- "Gilbert + Tobin", "Gilbert+Tobin", "G+T" → "Gilbert + Tobin"
- "King & Wood Mallesons", "KWM" → "King & Wood Mallesons"
- "Allens", "Allens Linklaters" → "Allens"

PE FIRMS:
- "BGH Capital" → "BGH Capital"
- "KKR", "Kohlberg Kravis Roberts" → "KKR"
- "TPG", "TPG Capital" → "TPG"

REGULATORS:
- "Australian Competition and Consumer Commission", "ACCC" → "ACCC"
- "Australian Securities and Investments Commission", "ASIC" → "ASIC"
- "Australian Securities Exchange", "ASX" → "ASX"
- "Australian Prudential Regulation Authority", "APRA" → "APRA"

GENERAL RULES:
- Remove suffixes: Ltd, Limited, Pty, Inc, Corporation, Group, Australia
- People: normalize variations like "Kate (Kathryn) McKenzie" → "Kate McKenzie"
- Healthcare companies: "Sonic Healthcare Ltd (ASX: SHL)" → "Sonic Healthcare"

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
    
    let cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in resolution response');
      return new Map(entityNames.map(n => [n, n]));
    }

    const mappings = JSON.parse(jsonMatch[0]);
    const mappingCount = Object.keys(mappings).length;
    console.log(`Resolved ${mappingCount} entity mappings`);
    
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
    legal_advisor: 'firm',
    ma_advisor: 'firm',
    broker: 'firm',
    restructuring_advisor: 'firm',
    strategy_consultant: 'firm',
    lender: 'firm',
    pe_firm: 'company',
    competitor: 'company',
    customer: 'company',
    supplier: 'company',
    government: 'government',
    registry: 'firm',
  };
  return typeMap[type?.toLowerCase()] || 'firm';
}

function calculateWhoCaresFromRelationships(
  companies: Array<ParsedCompany & { relationships: Relationship[] }>
): WhoCares[] {
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
    narrative_summary: {
      headline: "Analysis could not be completed",
      key_findings: ["API key not configured"],
      suggested_approaches: [],
      disclaimer: "Signal6 provides indicative insights, not predictive claims."
    },
    processing_stats: {
      total_companies: companies.length,
      total_relationships: 0,
      multi_exposure_entities: 0,
      processing_time_ms: 0,
      search_mode: 'fallback',
    },
  };
}
