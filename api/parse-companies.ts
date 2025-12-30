import type { VercelRequest, VercelResponse } from '@vercel/node';

interface PreProcessorSignal {
  source_type?: string;
  title?: string;
  summary?: string;
  event_type?: string;
  entity_name: string;
  entity_ticker?: string;
  entity_industry?: string;
  entity_size?: string;
  entity_location_city?: string;
  entity_location_state?: string;
  financial_impact_amount?: number;
  primary_pain_points?: string[];
  event_severity?: string;
  urgency_level?: string;
  critical_deadline_date?: string;
  event_date?: string;
}

interface ParsedCompany {
  name: string;
  ticker: string;
  exchange: string;
  stress_signal?: string;
  event_type?: string;
  severity?: string;
  industry?: string;
  is_listed: boolean;
}

// Known ticker mappings for common Australian companies
const KNOWN_TICKERS: Record<string, string> = {
  // Market Infrastructure
  'australian securities exchange': 'ASX',
  'asx': 'ASX',
  'asx limited': 'ASX',
  'computershare': 'CPU',
  'link administration': 'LNK',
  'iress': 'IRE',
  
  // Big 4 Banks
  'westpac': 'WBC',
  'westpac banking corporation': 'WBC',
  'commonwealth bank': 'CBA',
  'commonwealth bank of australia': 'CBA',
  'cba': 'CBA',
  'national australia bank': 'NAB',
  'nab': 'NAB',
  'anz': 'ANZ',
  'anz bank': 'ANZ',
  'australia and new zealand banking group': 'ANZ',
  'macquarie': 'MQG',
  'macquarie group': 'MQG',
  
  // Healthcare
  'healius': 'HLS',
  'sonic healthcare': 'SHL',
  'ramsay health care': 'RHC',
  'ramsay healthcare': 'RHC',
  'monash ivf': 'MVF',
  'monash ivf group': 'MVF',
  'australian clinical labs': 'ACL',
  'integral diagnostics': 'IDX',
  
  // Retail
  'woolworths': 'WOW',
  'woolworths group': 'WOW',
  'coles': 'COL',
  'coles group': 'COL',
  'wesfarmers': 'WES',
  'jb hi-fi': 'JBH',
  'harvey norman': 'HVN',
  
  // Mining
  'bhp': 'BHP',
  'bhp group': 'BHP',
  'rio tinto': 'RIO',
  'fortescue': 'FMG',
  'fortescue metals': 'FMG',
  'fortescue metals group': 'FMG',
  'south32': 'S32',
  'newcrest': 'NCM',
  'northern star': 'NST',
  'pilbara minerals': 'PLS',
  'mineral resources': 'MIN',
  'igo': 'IGO',
  'liontown resources': 'LTR',
  
  // Telco
  'telstra': 'TLS',
  'telstra corporation': 'TLS',
  'optus': 'SGT',
  'singtel optus': 'SGT',
  'tpg': 'TPG',
  'tpg telecom': 'TPG',
  
  // Insurance
  'qbe': 'QBE',
  'qbe insurance': 'QBE',
  'iag': 'IAG',
  'insurance australia group': 'IAG',
  'suncorp': 'SUN',
  'suncorp group': 'SUN',
  'medibank': 'MPL',
  'medibank private': 'MPL',
  'nib': 'NHF',
  'nib holdings': 'NHF',
  
  // Real Estate
  'goodman group': 'GMG',
  'goodman': 'GMG',
  'stockland': 'SGP',
  'mirvac': 'MGR',
  'mirvac group': 'MGR',
  'dexus': 'DXS',
  'scentre group': 'SCG',
  'vicinity centres': 'VCX',
  'charter hall': 'CHC',
  'charter hall group': 'CHC',
  
  // Tech
  'wisetech': 'WTC',
  'wisetech global': 'WTC',
  'xero': 'XRO',
  'rea group': 'REA',
  'seek': 'SEK',
  'carsales': 'CAR',
  'carsales.com': 'CAR',
  'technology one': 'TNE',
  'technologyone': 'TNE',
  'pro medicus': 'PME',
  'altium': 'ALU',
  
  // Transport & Logistics
  'qantas': 'QAN',
  'qantas airways': 'QAN',
  'brambles': 'BXB',
  'transurban': 'TCL',
  'transurban group': 'TCL',
  'aurizon': 'AZJ',
  'aurizon holdings': 'AZJ',
  
  // Energy
  'woodside': 'WDS',
  'woodside energy': 'WDS',
  'santos': 'STO',
  'origin energy': 'ORG',
  'origin': 'ORG',
  'agl': 'AGL',
  'agl energy': 'AGL',
  
  // Other
  'aristocrat': 'ALL',
  'aristocrat leisure': 'ALL',
  'amcor': 'AMC',
  'cochlear': 'COH',
  'csl': 'CSL',
  'csl limited': 'CSL',
  'resmed': 'RMD',
  'james hardie': 'JHX',
  'james hardie industries': 'JHX',
  'orica': 'ORI',
  'incitec pivot': 'IPL',
  'bluescope': 'BSL',
  'bluescope steel': 'BSL',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body as { text: string };

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text input is required' });
    }

    const trimmedText = text.trim();
    let companies: ParsedCompany[] = [];

    // Detect input format
    if (trimmedText.startsWith('[')) {
      // JSON array format (pre-processor output)
      console.log('Detected JSON input format');
      companies = await parsePreProcessorJson(trimmedText);
    } else {
      // Plain text format (manual input)
      console.log('Detected plain text input format');
      companies = await parsePlainText(trimmedText);
    }

    // Filter to only listed companies for now (have tickers)
    const listedCompanies = companies.filter(c => c.is_listed && c.ticker);
    const privateCompanies = companies.filter(c => !c.is_listed || !c.ticker);

    if (privateCompanies.length > 0) {
      console.log(`Note: ${privateCompanies.length} private/unlisted companies excluded:`, 
        privateCompanies.map(c => c.name));
    }

    return res.json({ 
      companies: listedCompanies,
      excluded: privateCompanies.map(c => ({
        name: c.name,
        reason: 'No ASX ticker - private or unlisted company',
        industry: c.industry,
      })),
      stats: {
        total_parsed: companies.length,
        listed: listedCompanies.length,
        private: privateCompanies.length,
      }
    });
  } catch (error) {
    console.error('Parse error:', error);
    return res.status(500).json({ error: 'Failed to parse companies' });
  }
}

// ============ JSON PARSING (Pre-Processor Format) ============

async function parsePreProcessorJson(jsonText: string): Promise<ParsedCompany[]> {
  let signals: PreProcessorSignal[];
  
  try {
    signals = JSON.parse(jsonText);
  } catch (error) {
    console.error('JSON parse error:', error);
    throw new Error('Invalid JSON format');
  }

  if (!Array.isArray(signals)) {
    signals = [signals];
  }

  const companies: ParsedCompany[] = [];

  for (const signal of signals) {
    if (!signal.entity_name) continue;

    // Try to find ticker
    const ticker = findTicker(signal.entity_name, signal.entity_ticker);
    const isListed = !!ticker;

    // Build stress signal from summary and pain points
    const stressSignalParts: string[] = [];
    if (signal.event_type) {
      stressSignalParts.push(formatEventType(signal.event_type));
    }
    if (signal.summary) {
      stressSignalParts.push(signal.summary);
    }
    if (signal.primary_pain_points && signal.primary_pain_points.length > 0) {
      stressSignalParts.push(`Pain points: ${signal.primary_pain_points.join(', ')}`);
    }
    if (signal.financial_impact_amount) {
      stressSignalParts.push(`Financial impact: $${(signal.financial_impact_amount / 1000000).toFixed(1)}M`);
    }

    companies.push({
      name: cleanCompanyName(signal.entity_name),
      ticker: ticker || '',
      exchange: ticker ? 'ASX' : '',
      stress_signal: stressSignalParts.join('. '),
      event_type: signal.event_type,
      severity: signal.event_severity,
      industry: signal.entity_industry,
      is_listed: isListed,
    });
  }

  return companies;
}

function findTicker(entityName: string, providedTicker?: string): string | null {
  // Use provided ticker if available
  if (providedTicker) {
    return providedTicker.toUpperCase();
  }

  // Lookup in known tickers
  const normalizedName = entityName.toLowerCase().trim();
  
  if (KNOWN_TICKERS[normalizedName]) {
    return KNOWN_TICKERS[normalizedName];
  }

  // Try partial matches
  for (const [name, ticker] of Object.entries(KNOWN_TICKERS)) {
    if (normalizedName.includes(name) || name.includes(normalizedName)) {
      return ticker;
    }
  }

  return null;
}

function cleanCompanyName(name: string): string {
  return name
    .replace(/\s+(limited|ltd|pty|inc|corporation|corp)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatEventType(eventType: string): string {
  const typeMap: Record<string, string> = {
    'regulatory_penalty': 'Regulatory penalty',
    'new_funding_investment': 'New funding/investment',
    'financial_distress': 'Financial distress',
    'ipo_listing': 'IPO/Listing',
    'restructure_reorganisation': 'Restructure/reorganisation',
    'leadership_change': 'Leadership change',
    'merger_acquisition': 'M&A activity',
    'compliance_breach': 'Compliance breach',
    'strategic_review': 'Strategic review',
  };
  return typeMap[eventType] || eventType.replace(/_/g, ' ');
}

// ============ PLAIN TEXT PARSING (Manual Input) ============

async function parsePlainText(text: string): Promise<ParsedCompany[]> {
  const companies: ParsedCompany[] = [];
  const lines = text.split('\n').filter(line => line.trim());

  for (const line of lines) {
    // Try regex pattern: Company Name (TICKER) context
    const tickerMatch = line.match(/^(.+?)\s*\(([A-Z]{2,5})\)\s*(.*)$/);
    
    if (tickerMatch) {
      const [, name, ticker, context] = tickerMatch;
      companies.push({
        name: cleanCompanyName(name.trim()),
        ticker: ticker.toUpperCase(),
        exchange: 'ASX',
        stress_signal: context.trim() || undefined,
        is_listed: true,
      });
    } else {
      // Try to find company name and lookup ticker
      const cleanedLine = line.trim();
      const ticker = findTicker(cleanedLine);
      
      if (ticker) {
        companies.push({
          name: cleanCompanyName(cleanedLine),
          ticker: ticker,
          exchange: 'ASX',
          stress_signal: undefined,
          is_listed: true,
        });
      } else {
        // Unknown company - mark as unlisted
        companies.push({
          name: cleanCompanyName(cleanedLine),
          ticker: '',
          exchange: '',
          stress_signal: undefined,
          is_listed: false,
        });
      }
    }
  }

  return companies;
}
