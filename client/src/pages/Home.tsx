/**
 * Home Page - Neural Graph Engine
 * Design: Data-Driven Minimalism with Precision Accents
 * Main interface for batch analysis with AI-powered parsing
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Zap, Upload, AlertCircle } from 'lucide-react';
import CompanyCard from '@/components/CompanyCard';
import WhoCaresPanel from '@/components/WhoCaresPanel';
import { BatchOutput, ParsedCompany } from '@/../../shared/types';
import { mockParseCompanies, mockDiscoverBatch } from '@/lib/mock-api';

type AppState = 'landing' | 'input' | 'confirmation' | 'analyzing' | 'results';

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

interface ExtendedBatchOutput extends BatchOutput {
  narrative_summary?: NarrativeSummary;
}

export default function Home() {
  const [appState, setAppState] = useState<AppState>('landing');
  const [pastedText, setPastedText] = useState('');
  const [companies, setCompanies] = useState<ParsedCompany[]>([]);
  const [batchOutput, setBatchOutput] = useState<ExtendedBatchOutput | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<string>('');

  // Load demo batch
  const handleLoadSample = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      setProcessingProgress('Loading demo batch...');
      const response = await fetch('/demo-batch.json');
      const data: ExtendedBatchOutput = await response.json();
      setBatchOutput(data);
      setAppState('results');
      setProcessingProgress('');
    } catch (err) {
      setError('Failed to load demo batch');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Parse pasted text with Google AI or fallback
  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) {
      setError('Please paste some text');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      setProcessingProgress('Parsing companies with AI...');

      // Try Google AI API first
      const response = await fetch('/api/parse-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedText }),
      });

      let parsedCompanies: ParsedCompany[];

      if (!response.ok) {
        // Fall back to regex if API fails
        parsedCompanies = mockParseCompanies(pastedText);
      } else {
        const data = await response.json() as any;
        parsedCompanies = data.companies;
      }

      if (parsedCompanies.length === 0) {
        throw new Error('No companies found. Try including ticker codes like (TER) or (BBN)');
      }

      setCompanies(parsedCompanies);
      setAppState('confirmation');
      setProcessingProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse companies');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Analyze with Google Search or fallback
  const handleConfirmAndAnalyze = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      setAppState('analyzing');
      setProcessingProgress('Discovering relationships with AI...');

      // Try real API first
      const response = await fetch('/api/discover-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies }),
      });

      let batchData: ExtendedBatchOutput;

      if (!response.ok) {
        // Fall back to mock discovery
        batchData = mockDiscoverBatch(companies);
      } else {
        batchData = await response.json();
      }

      setBatchOutput(batchData);
      setAppState('results');
      setProcessingProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze batch');
      setAppState('confirmation');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setAppState('landing');
    setPastedText('');
    setCompanies([]);
    setBatchOutput(null);
    setError(null);
    setProcessingProgress('');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <h1 className="font-mono font-bold text-xl text-foreground">
              Neural Graph Engine
            </h1>
          </div>
          {appState !== 'landing' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isProcessing}
              className="text-xs"
            >
              New Analysis
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Landing State */}
        {appState === 'landing' && (
          <div className="space-y-8">
            {/* Hero Section */}
            <div className="text-center space-y-4 py-12">
              <h2 className="font-mono font-bold text-4xl text-foreground">
                Batch Company Analysis
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Analyze multiple stressed companies simultaneously and discover cross-company exposure patterns that reveal high-priority leads.
              </p>
            </div>

            {/* Action Cards */}
            <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              {/* Load Sample */}
              <button
                onClick={handleLoadSample}
                disabled={isProcessing}
                className="group border border-border rounded-lg p-6 hover:shadow-lg hover:border-primary transition-all duration-200 bg-card hover:bg-muted/50 text-left"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  {isProcessing && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                </div>
                <h3 className="font-mono font-bold text-lg text-foreground mb-2">
                  Load Sample Alert
                </h3>
                <p className="text-sm text-muted-foreground">
                  See a pre-analyzed batch of 8 stressed companies with full relationship data
                </p>
              </button>

              {/* Paste Text */}
              <button
                onClick={() => setAppState('input')}
                disabled={isProcessing}
                className="group border border-border rounded-lg p-6 hover:shadow-lg hover:border-primary transition-all duration-200 bg-card hover:bg-muted/50 text-left"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                </div>
                <h3 className="font-mono font-bold text-lg text-foreground mb-2">
                  Paste Alert Text
                </h3>
                <p className="text-sm text-muted-foreground">
                  Paste Signal6 output or any text with company names and tickers
                </p>
              </button>
            </div>

            {/* Info Section */}
            <div className="bg-muted/30 border border-border rounded-lg p-6 space-y-4">
              <h3 className="font-mono font-bold text-foreground">How It Works</h3>
              <div className="grid md:grid-cols-2 gap-6 text-sm">
                <div>
                  <div className="font-mono font-semibold text-primary mb-2">
                    WHO ELSE?
                  </div>
                  <p className="text-muted-foreground">
                    Discover relationships for each company: auditors, shareholders, brokers, directors, and advisors
                  </p>
                </div>
                <div>
                  <div className="font-mono font-semibold text-primary mb-2">
                    WHO CARES?
                  </div>
                  <p className="text-muted-foreground">
                    Find entities connected to 2+ companies—these are your highest-priority leads
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Input State */}
        {appState === 'input' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h2 className="font-mono font-bold text-2xl text-foreground mb-2">
                Paste Alert Text
              </h2>
              <p className="text-muted-foreground">
                Paste any text containing company names and stock tickers, or pre-processor JSON output
              </p>
            </div>

            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={`Example formats:

Plain text:
Terracom Ltd (TER) experienced a significant drop of 26.67%...
Healius (HLS) CEO Paul Anderson, strategic review, -35% YTD.

Or JSON from pre-processor:
[{"entity_name": "ASX", "event_type": "regulatory_penalty", ...}]`}
              className="w-full h-48 p-4 border border-border rounded-lg bg-card text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {error && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm flex gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handlePasteSubmit}
                disabled={isProcessing || !pastedText.trim()}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  'Parse Companies'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setAppState('landing')}
                disabled={isProcessing}
              >
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation State */}
        {appState === 'confirmation' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h2 className="font-mono font-bold text-2xl text-foreground mb-2">
                Confirm Companies
              </h2>
              <p className="text-muted-foreground">
                Found {companies.length} companies. Review and confirm to proceed with analysis.
              </p>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {companies.map((company) => (
                <div
                  key={company.ticker}
                  className="p-3 border border-border rounded-lg bg-card flex items-center justify-between"
                >
                  <div>
                    <div className="font-mono font-bold text-foreground">
                      {company.ticker}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {company.name}
                    </div>
                  </div>
                  {company.stress_signal && (
                    <div className="text-sm font-mono text-secondary font-semibold max-w-xs truncate">
                      {company.stress_signal}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm flex gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleConfirmAndAnalyze}
                disabled={isProcessing}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Analyze Network'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setAppState('input')}
                disabled={isProcessing}
              >
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Analyzing State */}
        {appState === 'analyzing' && (
          <div className="max-w-2xl mx-auto space-y-6 text-center py-12">
            <div className="flex justify-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
            </div>
            <h2 className="font-mono font-bold text-2xl text-foreground">
              {processingProgress || 'Processing...'}
            </h2>
            <p className="text-muted-foreground">
              This may take a minute or two as we discover relationships across the companies.
            </p>
          </div>
        )}

        {/* Results State */}
        {appState === 'results' && batchOutput && (
          <div className="space-y-8">
            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border border-border rounded-lg p-4 bg-card">
                <div className="text-xs font-mono text-muted-foreground uppercase mb-1">
                  Companies
                </div>
                <div className="font-mono font-bold text-2xl text-foreground">
                  {batchOutput.processing_stats.total_companies}
                </div>
              </div>
              <div className="border border-border rounded-lg p-4 bg-card">
                <div className="text-xs font-mono text-muted-foreground uppercase mb-1">
                  Relationships
                </div>
                <div className="font-mono font-bold text-2xl text-foreground">
                  {batchOutput.processing_stats.total_relationships}
                </div>
              </div>
              <div className="border border-border rounded-lg p-4 bg-card">
                <div className="text-xs font-mono text-muted-foreground uppercase mb-1">
                  Multi-Exposure
                </div>
                <div className="font-mono font-bold text-2xl text-primary">
                  {batchOutput.processing_stats.multi_exposure_entities}
                </div>
              </div>
              <div className="border border-border rounded-lg p-4 bg-card">
                <div className="text-xs font-mono text-muted-foreground uppercase mb-1">
                  Leads
                </div>
                <div className="font-mono font-bold text-2xl text-secondary">
                  {batchOutput.who_cares.length}
                </div>
              </div>
            </div>

            {/* Two-Column Layout */}
            <div className="grid lg:grid-cols-2 gap-8">
              {/* WHO ELSE Panel */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">?</span>
                  </div>
                  <h2 className="font-mono font-bold text-xl text-foreground">
                    WHO ELSE
                  </h2>
                </div>
                <div className="space-y-3">
                  {batchOutput.companies.map((company) => (
                    <CompanyCard key={company.ticker} company={company} />
                  ))}
                </div>
              </div>

              {/* WHO CARES Panel */}
              <div className="space-y-4">
                <WhoCaresPanel
                  entities={batchOutput.who_cares}
                  narrativeSummary={batchOutput.narrative_summary}
                  isLoading={isProcessing}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
