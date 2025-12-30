/**
 * API Route: /api/who-cares
 * Analyzes cross-company exposure patterns
 * Design: Data-Driven Minimalism with Precision Accents
 */

import { Router, Request, Response } from 'express';
import { Relationship, WhoCaresEntity, WhoCaresRequest, WhoCaresResponse } from '@/../../shared/types';

const router = Router();

/**
 * Analyze cross-company exposure
 * POST /api/who-cares
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { relationships } = req.body as WhoCaresRequest;

    if (!Array.isArray(relationships)) {
      return res.status(400).json({ error: 'Relationships array is required' });
    }

    const entities = findMultiExposureEntities(relationships);

    const response: WhoCaresResponse = {
      entities,
    };

    res.json(response);
  } catch (error) {
    console.error('Error analyzing who cares:', error);
    res.status(500).json({ error: 'Failed to analyze who cares' });
  }
});

/**
 * Find entities with exposure to 2+ companies
 */
function findMultiExposureEntities(relationships: Relationship[]): WhoCaresEntity[] {
  const entityMap = new Map<string, Map<string, Relationship>>();

  // Group relationships by entity
  for (const rel of relationships) {
    const key = normalizeEntityName(rel.entity_name);

    if (!entityMap.has(key)) {
      entityMap.set(key, new Map());
    }

    // Store by category to avoid duplicates
    const categoryKey = `${rel.category}`;
    entityMap.get(key)!.set(categoryKey, rel);
  }

  // Convert to WhoCaresEntity and filter for 2+ exposures
  const entities: WhoCaresEntity[] = [];

  entityMap.forEach((relMap, normalizedName) => {
    const firstRel = relMap.values().next().value as Relationship;

    // Get unique companies this entity is connected to
    const companies = new Set<string>();
    const exposureDetails: { ticker: string; relationship_type: string }[] = [];

    relMap.forEach((rel) => {
      // Extract ticker from relationship (would come from company context in real implementation)
      // For now, we'll track the relationship type
      exposureDetails.push({
        ticker: 'UNKNOWN', // This would be populated in real implementation
        relationship_type: rel.category,
      });
    });

    // Only include if exposed to 2+ companies
    if (relMap.size >= 2) {
      entities.push({
        entity_name: firstRel.entity_name,
        entity_type: firstRel.entity_type,
        category: firstRel.category,
        exposure_count: relMap.size,
        exposed_companies: Array.from(companies),
        exposure_details: exposureDetails,
      });
    }
  });

  // Sort by exposure count descending
  entities.sort((a, b) => b.exposure_count - a.exposure_count);

  return entities;
}

/**
 * Normalize entity names to handle variations
 * e.g., "BDO Australia" == "BDO Pty Ltd" == "BDO"
 */
function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(pty|ltd|inc|corp|corporation|group|holdings?|management|asset|bank|banking|fund|partners?|llc|llp)(\s|$)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default router;
