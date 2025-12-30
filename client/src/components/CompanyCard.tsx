/**
 * CompanyCard Component
 * Design: Data-Driven Minimalism with Precision Accents
 * Displays a single company with expandable relationships
 */

import { ChevronDown, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { CompanyWithRelationships } from '@/../../shared/types';

interface CompanyCardProps {
  company: CompanyWithRelationships;
}

export default function CompanyCard({ company }: CompanyCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const categoryIcons: Record<string, string> = {
    auditor: '🔍',
    broker: '📊',
    shareholder: '💼',
    director: '👤',
    advisor: '💡',
    supplier: '🏭',
  };

  const groupedRelationships = company.relationships.reduce((acc, rel) => {
    if (!acc[rel.category]) {
      acc[rel.category] = [];
    }
    acc[rel.category].push(rel);
    return acc;
  }, {} as Record<string, typeof company.relationships>);

  const isLoading = company.processing_status === 'processing';
  const hasError = company.processing_status === 'error';

  return (
    <div className="border border-border rounded-lg bg-card hover:shadow-md transition-shadow duration-200">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-start justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="font-mono font-bold text-lg text-foreground">
              {company.ticker}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {company.name}
            </p>
          </div>
          {company.stress_signal && (
            <div className="flex items-start gap-1 text-secondary font-mono font-semibold text-sm">
              <TrendingDown className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="break-words">{company.stress_signal}</span>
            </div>
          )}
        </div>
        <div className="ml-4 flex-shrink-0">
          {isLoading && (
            <div className="animate-spin">⏳</div>
          )}
          {hasError && (
            <div className="text-destructive">⚠</div>
          )}
          {!isLoading && !hasError && (
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border px-6 py-4 space-y-4 bg-muted/20">
          {hasError && (
            <div className="text-sm text-destructive">
              {company.error_message || 'Error processing company'}
            </div>
          )}

          {isLoading && (
            <div className="text-sm text-muted-foreground">
              Analyzing relationships...
            </div>
          )}

          {!isLoading && !hasError && company.relationships.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No relationships found
            </div>
          )}

          {!isLoading && !hasError && company.relationships.length > 0 && (
            <div className="space-y-3">
              {Object.entries(groupedRelationships).map(([category, relationships]) => (
                <div key={category}>
                  <div className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {categoryIcons[category]} {category}
                  </div>
                  <div className="space-y-1 ml-4">
                    {relationships.map((rel, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="font-medium text-foreground">
                          {rel.entity_name}
                        </div>
                        {rel.details && (
                          <div className="text-xs text-muted-foreground">
                            {rel.details}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
