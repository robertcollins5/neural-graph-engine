/**
 * WhoCaresPanel Component
 * Design: Data-Driven Minimalism with Precision Accents
 * Displays entities with exposure to multiple companies
 */

import { Star, Lightbulb, Target, AlertCircle } from 'lucide-react';
import { WhoCaresEntity } from '@/../../shared/types';

interface NarrativeSummary {
  headline: string;
  key_findings: string[];
  suggested_approaches: Array<{
    target: string;
    angle: string;
    advisory_type: string;
  }>;
  disclaimer: string;
}

interface WhoCaresPanelProps {
  entities: WhoCaresEntity[];
  narrativeSummary?: NarrativeSummary;
  isLoading?: boolean;
}

export default function WhoCaresPanel({ entities, narrativeSummary, isLoading }: WhoCaresPanelProps) {
  const categoryColors: Record<string, string> = {
    auditor: 'bg-blue-100 text-blue-900',
    broker: 'bg-purple-100 text-purple-900',
    shareholder: 'bg-green-100 text-green-900',
    director: 'bg-amber-100 text-amber-900',
    advisor: 'bg-indigo-100 text-indigo-900',
    supplier: 'bg-rose-100 text-rose-900',
    government: 'bg-red-100 text-red-900',
    lender: 'bg-cyan-100 text-cyan-900',
    competitor: 'bg-orange-100 text-orange-900',
    pe_firm: 'bg-violet-100 text-violet-900',
  };

  const categoryEmoji: Record<string, string> = {
    auditor: '🔍',
    broker: '📊',
    shareholder: '💼',
    director: '👤',
    advisor: '💡',
    supplier: '🏭',
    government: '🏛️',
    lender: '🏦',
    competitor: '🔗',
    pe_firm: '💰',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Star className="w-5 h-5 text-primary fill-primary" />
        <h2 className="font-mono font-bold text-xl text-foreground">
          Multi-Company Exposure
        </h2>
      </div>

      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">
          <div className="animate-pulse">Analyzing cross-company patterns...</div>
        </div>
      )}

      {!isLoading && entities.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No entities with multi-company exposure found
        </div>
      )}

      {/* Narrative Summary Panel */}
      {!isLoading && narrativeSummary && entities.length > 0 && (
        <div className="border-2 border-primary/30 rounded-lg p-5 bg-primary/5">
          {/* Headline */}
          <div className="flex items-start gap-3 mb-4">
            <Lightbulb className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="font-semibold text-foreground">
              {narrativeSummary.headline}
            </p>
          </div>

          {/* Key Findings */}
          {narrativeSummary.key_findings && narrativeSummary.key_findings.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Key Findings
              </h4>
              <ul className="space-y-2">
                {narrativeSummary.key_findings.map((finding, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-primary font-bold">•</span>
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Approaches */}
          {narrativeSummary.suggested_approaches && narrativeSummary.suggested_approaches.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Suggested Approaches
              </h4>
              <div className="space-y-2">
                {narrativeSummary.suggested_approaches.map((approach, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm bg-card rounded p-3 border border-border">
                    <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-foreground">{approach.target}</span>
                      <span className="text-muted-foreground"> — {approach.angle}</span>
                      <span className="ml-2 inline-block px-2 py-0.5 rounded text-xs font-mono bg-primary/10 text-primary">
                        {approach.advisory_type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-3 mt-3">
            <AlertCircle className="w-3 h-3" />
            <span>{narrativeSummary.disclaimer}</span>
          </div>
        </div>
      )}

      {/* Entity Cards */}
      {!isLoading && entities.length > 0 && (
        <div className="space-y-3">
          {entities.map((entity, idx) => (
            <div
              key={idx}
              className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow duration-200 bg-card"
            >
              {/* Entity Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">
                      {categoryEmoji[entity.category] || '🔗'}
                    </span>
                    <h3 className="font-mono font-bold text-foreground truncate">
                      {entity.entity_name}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">
                    {entity.entity_type}
                  </p>
                </div>

                {/* Exposure Count Badge */}
                <div className="ml-2 flex-shrink-0">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 border border-primary/20">
                    <span className="font-mono font-bold text-primary text-sm">
                      {entity.exposure_count}
                    </span>
                  </div>
                </div>
              </div>

              {/* Category Badge */}
              <div className="mb-3">
                <span
                  className={`inline-block px-2 py-1 rounded text-xs font-mono font-semibold ${
                    categoryColors[entity.category] || 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {entity.category}
                </span>
              </div>

              {/* Exposed Companies */}
              <div className="space-y-2">
                <div className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wide">
                  Connected to:
                </div>
                <div className="flex flex-wrap gap-2">
                  {entity.exposure_details.map((detail, detailIdx) => (
                    <div
                      key={detailIdx}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-muted border border-border text-sm font-mono"
                    >
                      <span className="font-bold text-primary">
                        {detail.ticker}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({detail.relationship_type})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
