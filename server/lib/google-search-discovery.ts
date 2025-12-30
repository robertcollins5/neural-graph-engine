/**
 * Google Search API Relationship Discovery
 * Uses Google Custom Search to find company relationships (auditors, shareholders, brokers, directors)
 * Design: Data-Driven Minimalism with Precision Accents
 */

import axios from "axios";
import { Relationship } from "@/../../shared/types";

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

/**
 * Discover relationships for a company using Google Search
 */
export async function discoverRelationshipsWithGoogleSearch(
  companyName: string,
  ticker: string
): Promise<Relationship[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !engineId) {
    console.warn("Google Search credentials not configured");
    return [];
  }

  const relationships: Relationship[] = [];

  // Search queries for different relationship types
  const queries = [
    { query: `${companyName} ${ticker} auditor`, category: "auditor" },
    { query: `${companyName} ${ticker} shareholder`, category: "shareholder" },
    { query: `${companyName} ${ticker} broker`, category: "broker" },
    { query: `${companyName} ${ticker} director`, category: "director" },
  ];

  try {
    for (const { query, category } of queries) {
      try {
        const results = await searchGoogle(query, apiKey, engineId);
        const extracted = extractEntitiesFromResults(results, category);
        relationships.push(...extracted);
      } catch (err) {
        console.error(`Error searching for ${category}:`, err);
      }
    }

    // Deduplicate relationships
    const seen = new Set<string>();
    return relationships.filter((rel) => {
      const key = `${rel.entity_name}|${rel.category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    console.error("Google Search discovery error:", error);
    return [];
  }
}

/**
 * Perform Google Custom Search
 */
async function searchGoogle(
  query: string,
  apiKey: string,
  engineId: string
): Promise<SearchResult[]> {
  try {
    const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
      params: {
        q: query,
        key: apiKey,
        cx: engineId,
        num: 5,
      },
      timeout: 5000,
    });

    return (
      response.data.items?.map((item: any) => ({
        title: item.title,
        snippet: item.snippet,
        link: item.link,
      })) || []
    );
  } catch (error) {
    console.error("Google Search API error:", error);
    return [];
  }
}

/**
 * Extract entity names from search results
 */
function extractEntitiesFromResults(results: SearchResult[], category: string): Relationship[] {
  const entities: Relationship[] = [];

  for (const result of results) {
    const text = `${result.title} ${result.snippet}`.toLowerCase();

    // Extract entity names from search results
    const entityNames = extractEntityNames(text, category);

    for (const name of entityNames) {
      entities.push({
        entity_name: name,
        entity_type: classifyEntity(name, category),
        category,
        details: result.snippet.substring(0, 100),
      });
    }
  }

  return entities;
}

/**
 * Extract entity names from text
 */
function extractEntityNames(text: string, category: string): string[] {
  const names: string[] = [];

  // Common patterns for different entity types
  const patterns: Record<string, RegExp[]> = {
    auditor: [
      /(?:auditor|audit firm)[:\s]+([A-Z][a-zA-Z\s&]+?)(?:\.|,|$)/gi,
      /([A-Z][a-zA-Z\s&]*(?:BDO|Deloitte|EY|KPMG|PwC|Grant Thornton|Pitcher Partners)[a-zA-Z\s&]*)/gi,
    ],
    shareholder: [
      /(?:shareholder|investor|holds?)[:\s]+([A-Z][a-zA-Z\s&]+?)(?:\.|,|%|$)/gi,
      /([A-Z][a-zA-Z\s&]*(?:Sprott|Macquarie|Goldman|Morgan|Blackrock|Vanguard)[a-zA-Z\s&]*)/gi,
    ],
    broker: [
      /(?:broker|brokerage)[:\s]+([A-Z][a-zA-Z\s&]+?)(?:\.|,|$)/gi,
      /([A-Z][a-zA-Z\s&]*(?:Canaccord|Goldman|Morgan|Citi|JP Morgan)[a-zA-Z\s&]*)/gi,
    ],
    director: [
      /(?:director|chairman|ceo)[:\s]+([A-Z][a-zA-Z\s]+?)(?:\.|,|$)/gi,
      /([A-Z][a-z]+\s[A-Z][a-z]+)(?:\s+(?:director|chairman|ceo))/gi,
    ],
  };

  const categoryPatterns = patterns[category] || [];

  for (const pattern of categoryPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 2 && name.length < 100) {
        names.push(name);
      }
    }
  }

  return Array.from(new Set(names)); // Deduplicate
}

/**
 * Classify entity type based on name and category
 */
function classifyEntity(name: string, category: string): "company" | "person" | "firm" {
  const nameLower = name.toLowerCase();

  // Persons: typically have first and last names
  if (/^[a-z]+ [a-z]+$/.test(nameLower) && !nameLower.includes("&")) {
    return "person";
  }

  // Firms: contain "ltd", "pty", "inc", "corp", "group", etc.
  if (
    /(?:ltd|pty|inc|corp|group|firm|bank|fund|capital|partners|advisors?|management)/.test(
      nameLower
    )
  ) {
    return "firm";
  }

  // Default to company
  return "company";
}
