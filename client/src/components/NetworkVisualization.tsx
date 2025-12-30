/**
 * Network Visualization Component
 * SVG-based graph showing relationships between companies and multi-exposure entities
 * Design: Data-Driven Minimalism with Precision Accents
 */

import { CompanyWithRelationships, WhoCaresEntity } from '@/../../shared/types';

interface NetworkVisualizationProps {
  companies: CompanyWithRelationships[];
  whoCaresEntities: WhoCaresEntity[];
  height?: number;
}

interface Node {
  id: string;
  label: string;
  type: 'company' | 'entity';
  x: number;
  y: number;
  stress?: string;
  exposure?: number;
}

interface Link {
  source: string;
  target: string;
  category: string;
}

export default function NetworkVisualization({
  companies,
  whoCaresEntities,
  height = 400,
}: NetworkVisualizationProps) {
  // Build nodes and links
  const nodes: Node[] = [];
  const links: Link[] = [];
  const nodeMap = new Map<string, Node>();

  // Add company nodes in a circle on the left
  const companyCount = companies.length;
  companies.forEach((company, index) => {
    const angle = (index / companyCount) * Math.PI * 2;
    const x = 150 + 100 * Math.cos(angle);
    const y = 200 + 100 * Math.sin(angle);

    const node: Node = {
      id: company.ticker,
      label: company.ticker,
      type: 'company',
      x,
      y,
      stress: company.stress_signal,
    };

    nodes.push(node);
    nodeMap.set(company.ticker, node);

    // Add links from company to its relationships
    company.relationships.forEach((rel) => {
      links.push({
        source: company.ticker,
        target: rel.entity_name,
        category: rel.category,
      });
    });
  });

  // Add entity nodes on the right
  const entityCount = whoCaresEntities.length;
  whoCaresEntities.forEach((entity, index) => {
    const angle = (index / Math.max(entityCount, 1)) * Math.PI * 2;
    const x = 450 + 80 * Math.cos(angle);
    const y = 200 + 80 * Math.sin(angle);

    const node: Node = {
      id: entity.entity_name,
      label: entity.entity_name,
      type: 'entity',
      x,
      y,
      exposure: entity.exposure_count,
    };

    nodes.push(node);
    nodeMap.set(entity.entity_name, node);
  });

  // Category colors
  const categoryColors: Record<string, string> = {
    auditor: '#ef4444',
    shareholder: '#3b82f6',
    broker: '#f59e0b',
    director: '#8b5cf6',
    advisor: '#10b981',
  };

  return (
    <div className="w-full border border-border rounded-lg bg-card overflow-hidden">
      <svg
        viewBox="0 0 600 400"
        className="w-full"
        style={{ minHeight: `${height}px` }}
      >
        {/* Draw links */}
        {links.map((link, idx) => {
          const source = nodeMap.get(link.source);
          const target = nodeMap.get(link.target);

          if (!source || !target) return null;

          return (
            <g key={`link-${idx}`}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={categoryColors[link.category] || '#d1d5db'}
                strokeWidth="1.5"
                opacity="0.6"
              />
            </g>
          );
        })}

        {/* Draw nodes */}
        {nodes.map((node) => (
          <g key={node.id}>
            {/* Node circle */}
            <circle
              cx={node.x}
              cy={node.y}
              r={node.type === 'entity' ? 14 : 10}
              fill={node.type === 'entity' ? '#06b6d4' : '#0ea5e9'}
              stroke="#ffffff"
              strokeWidth="2"
            />

            {/* Node label */}
            <text
              x={node.x}
              y={node.y}
              textAnchor="middle"
              dy="0.3em"
              className="font-mono font-bold text-xs"
              fill="#1e293b"
              pointerEvents="none"
            >
              {node.label.length > 8 ? node.label.substring(0, 8) : node.label}
            </text>

            {/* Stress signal or exposure count */}
            {node.stress && (
              <text
                x={node.x}
                y={node.y + 20}
                textAnchor="middle"
                className="font-mono text-xs font-semibold"
                fill="#f97316"
                pointerEvents="none"
              >
                {node.stress}
              </text>
            )}
            {node.exposure && (
              <text
                x={node.x}
                y={node.y + 20}
                textAnchor="middle"
                className="font-mono text-xs font-semibold"
                fill="#06b6d4"
                pointerEvents="none"
              >
                {node.exposure}x
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="p-4 bg-muted/30 border-t border-border">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          {Object.entries(categoryColors).map(([category, color]) => (
            <div key={category} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-muted-foreground capitalize">{category}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-sky-500" />
              <span>Companies</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-500" />
              <span>Multi-Exposure Entities</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
