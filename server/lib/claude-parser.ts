/**
 * Claude API Integration for Company Parsing
 * Design: Data-Driven Minimalism with Precision Accents
 */

import { ParsedCompany } from '@/../../shared/types';

/**
 * Parse companies from text using Claude API
 */
export async function parseCompaniesWithClaude(text: string): Promise<ParsedCompany[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, returning empty array to trigger fallback');
    return [];
  }

  const prompt = `Extract all company mentions from this text. For each company found, return a JSON array with:
- name: Full company name
- ticker: Stock code (e.g., TER, BBN)
- exchange: Stock exchange (ASX unless otherwise specified)
- stress_signal: Any percentage or indicator mentioned (e.g., "-26.67%")

Return ONLY valid JSON array, no other text.

Text to parse:
${text}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
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
      console.error('Claude API error:', error);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const content = data.content[0]?.text || '[]';

    // Parse the JSON response
    const companies: ParsedCompany[] = JSON.parse(content);

    // Validate and normalize
    return companies.filter((c) => c.name && c.ticker).map((c) => ({
      name: c.name.trim(),
      ticker: c.ticker.toUpperCase(),
      exchange: c.exchange || 'ASX',
      stress_signal: c.stress_signal,
    }));
  } catch (error) {
    console.error('Error parsing companies with Claude:', error);
    throw error;
  }
}
