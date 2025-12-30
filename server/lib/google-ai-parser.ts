/**
 * Google AI Company Parser
 * Uses Google's Generative AI to intelligently extract companies from unstructured text
 * Design: Data-Driven Minimalism with Precision Accents
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { ParsedCompany } from "@/../../shared/types";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY || "");

/**
 * Parse companies from text using Google AI (Gemini)
 * Handles complex text formats, variations in company naming, and extracts stress signals
 */
export async function parseCompaniesWithGoogleAI(text: string): Promise<ParsedCompany[]> {
  if (!process.env.GOOGLE_AI_KEY) {
    console.warn("GOOGLE_AI_KEY not set, returning empty array");
    return [];
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Extract all company mentions from this text. For each company found, return a JSON array with this exact structure:
[
  {
    "name": "Full company name",
    "ticker": "Stock code (e.g., TER, BBN)",
    "exchange": "ASX or other exchange",
    "stress_signal": "Optional percentage like -26.67% or null"
  }
]

Text to analyze:
${text}

Return ONLY valid JSON array, no other text.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("No JSON found in Google AI response");
      return [];
    }

    const companies: ParsedCompany[] = JSON.parse(jsonMatch[0]);

    // Validate and normalize
    return companies.filter((c) => c.name && c.ticker).map((c) => ({
      name: c.name.trim(),
      ticker: c.ticker.toUpperCase(),
      exchange: c.exchange || "ASX",
      stress_signal: c.stress_signal || undefined,
    }));
  } catch (error) {
    console.error("Google AI parsing error:", error);
    return [];
  }
}
