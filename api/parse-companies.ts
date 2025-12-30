import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ParsedCompany {
  name: string;
  ticker: string;
  exchange: string;
  stress_signal?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    let companies: ParsedCompany[] = [];

    if (apiKey) {
      try {
        companies = await parseCompaniesWithClaude(text, apiKey);
      } catch (error) {
        console.error('Claude API error, falling back to regex:', error);
        companies = extractCompaniesFromText(text);
      }
    } else {
      companies = extractCompaniesFromText(text);
    }

    if (companies.length === 0) {
      return res.status(400).json({
        error: 'No companies found. Try including ticker codes like (TER) or (BBN)',
      });
    }

    return res.json({ companies });
  } catch (error) {
    console.error('Error parsing companies:', error);
    return res.status(500).json({ error: 'Failed to parse companies' });
  }
}

async function parseCompaniesWithClaude(text: string, apiKey: string): Promise<ParsedCompany[]> {
  const prompt = `Extract all company mentions from this text. For each company found, return a JSON array with:
- name: Full company name
- ticker: Stock code (e.g., TER, BBN)
- exchange: Stock exchange (ASX unless otherwise specified)
- stress_signal: Any percentage or indicator mentioned (e.g., "-26.67%")
Return ONLY valid JSON array, no other text.
Text to parse:
${text}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json() as any;
  const content = data.content[0]?.text || '[]';
  
  const companies: ParsedCompany[] = JSON.parse(content);
  
  return companies.filter((c) => c.name && c.ticker).map((c) => ({
    name: c.name.trim(),
    ticker: c.ticker.toUpperCase(),
    exchange: c.exchange || 'ASX',
    stress_signal: c.stress_signal,
  }));
}

function extractCompaniesFromText(text: string): ParsedCompany[] {
  const companies: ParsedCompany[] = [];
  const seen = new Set<string>();
  
  const pattern = /([A-Z][a-zA-Z\s&]+?)\s*\(([A-Z]{1,4})\)(?:\s*[-–]?\s*([0-9.]+)%)?/g;
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].trim();
    const ticker = match[2].toUpperCase();
    const stressSignal = match[3] ? `-${match[3]}%` : undefined;
    const key = `${name}|${ticker}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      companies.push({
        name,
        ticker,
        exchange: 'ASX',
        stress_signal: stressSignal,
      });
    }
  }
  
  return companies;
}
