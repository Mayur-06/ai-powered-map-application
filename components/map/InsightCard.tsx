import type { PoiSummary } from '@/lib/poi/actions';
import { Sparkles, ThumbsUp, ThumbsDown, Target } from 'lucide-react';

interface InsightCardProps {
  summary: PoiSummary | null;
}

function getSentimentWord(score: number): { label: string; className: string } {
  if (score >= 0.67) {
    return {
      label: 'Mostly positive',
      className:
        'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
    };
  }
  if (score >= 0.34) {
    return {
      label: 'Mixed',
      className:
        'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
    };
  }
  return {
    label: 'Mostly negative',
    className:
      'bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-500/30',
  };
}

export default function InsightCard({ summary }: InsightCardProps) {
  if (!summary) return null;

  const sentiment = getSentimentWord(summary.sentimentScore);

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 dark:bg-muted/30 p-3.5 space-y-3 shadow-xs">
      {/* Top row: Vibe and Sentiment visual cue */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Community Insights</span>
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${sentiment.className}`}
          >
            {sentiment.label}
          </span>
        </div>

        {summary.vibe && (
          <p className="text-xs italic text-foreground font-medium leading-snug">
            &ldquo;{summary.vibe}&rdquo;
          </p>
        )}
      </div>

      {/* Highlights grid: Pros and Cons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
        {/* Pros */}
        {summary.pros && summary.pros.length > 0 && (
          <div className="rounded-lg bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 p-2.5 space-y-1.5">
            <h5 className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <ThumbsUp className="h-3 w-3 shrink-0" />
              <span>Pros</span>
            </h5>
            <ul className="space-y-1 text-xs text-foreground/90 pl-3.5 list-disc">
              {summary.pros.map((pro, idx) => (
                <li key={idx} className="leading-snug">
                  {pro}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cons */}
        {summary.cons && summary.cons.length > 0 && (
          <div className="rounded-lg bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 p-2.5 space-y-1.5">
            <h5 className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
              <ThumbsDown className="h-3 w-3 shrink-0" />
              <span>Cons</span>
            </h5>
            <ul className="space-y-1 text-xs text-foreground/90 pl-3.5 list-disc">
              {summary.cons.map((con, idx) => (
                <li key={idx} className="leading-snug">
                  {con}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Best For */}
      {summary.bestFor && summary.bestFor.length > 0 && (
        <div className="rounded-lg bg-muted/40 border border-border/50 p-2.5 space-y-1.5">
          <h5 className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <Target className="h-3 w-3 text-primary shrink-0" />
            <span>Best For</span>
          </h5>
          <ul className="space-y-1 text-xs text-muted-foreground pl-3.5 list-disc">
            {summary.bestFor.map((item, idx) => (
              <li key={idx} className="leading-snug text-foreground/90">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Caption footer */}
      <div className="pt-0.5 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>AI summary of sample reviews</span>
      </div>
    </div>
  );
}
