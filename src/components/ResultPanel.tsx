import type { ReactNode } from "react";
import type { CredentialSummary, TrustLevel, ValidationOutcome } from "@/lib/credentials";
import { sourceTypeName } from "@/lib/credentials";

const TRUST_COPY: Record<TrustLevel, { title: string; body: string; tone: string; dot: string }> = {
  trusted: {
    title: "Content Credentials verified",
    body: "The signature is intact, and the signing certificate chains to a certificate authority on the official C2PA trust list.",
    tone: "border-valid/40 bg-valid/[0.07]",
    dot: "bg-valid",
  },
  valid: {
    title: "Content Credentials found",
    body: "The signature is intact and the image matches what was signed.",
    tone: "border-valid/40 bg-valid/[0.07]",
    dot: "bg-valid",
  },
  invalid: {
    title: "Credentials failed validation",
    body: "This file carries Content Credentials, but they don't check out — the image may have been altered after signing, or the signature is broken.",
    tone: "border-danger/50 bg-danger/[0.08]",
    dot: "bg-danger",
  },
};

function formatDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-t border-border py-3 text-sm first:border-t-0 sm:grid-cols-[150px_minmax(0,1fr)]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Missing({ children = "Not stated" }: { children?: ReactNode }) {
  return <span className="text-muted">{children}</span>;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-muted">{title}</h3>
      {children}
    </div>
  );
}

function AiBadge({ summary }: { summary: CredentialSummary }) {
  const { ai } = summary;
  if (ai.kind === "none-declared") {
    return (
      <div className="flex items-start gap-3" data-testid="ai-usage">
        <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-md border border-border px-2 py-0.5 font-mono text-xs text-muted">NONE DECLARED</span>
        <p className="text-sm text-muted">
          The credentials don&apos;t declare any generative-AI use. That&apos;s what the signer stated, not a detection result.
        </p>
      </div>
    );
  }
  const generated = ai.kind === "generated";
  return (
    <div className="flex items-start gap-3" data-testid="ai-usage">
      <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-md border border-ai/40 bg-ai/10 px-2 py-0.5 font-mono text-xs text-ai">
        {generated ? "AI GENERATED" : "AI ASSISTED"}
      </span>
      <p className="text-sm">
        {generated
          ? "Declared as created with a generative AI model."
          : "Declared as combining captured or edited content with AI-generated elements."}
        <span className="mt-1 block font-mono text-xs text-muted">digitalSourceType: {ai.sourceType}</span>
      </p>
    </div>
  );
}

function Credentials({ summary, onReset }: { summary: CredentialSummary; onReset: () => void }) {
  const trust = TRUST_COPY[summary.trust];
  return (
    <div className="flex flex-col gap-4" data-testid="result-credentials" data-trust={summary.trust}>
      <div className={`rounded-2xl border p-5 ${trust.tone}`}>
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${trust.dot}`} aria-hidden />
          <h2 className="text-lg font-semibold">{trust.title}</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{trust.body}</p>
        {summary.trust !== "trusted" && (summary.untrustedSigner || !summary.trustListLoaded) && (
          <p className="mt-3 text-sm text-warn" data-testid="untrusted-signer">
            {summary.trustListLoaded
              ? "The signing certificate isn't on the official C2PA trust list, so treat the issuer name as unconfirmed."
              : "The C2PA trust list couldn't be loaded, so the issuer wasn't checked. Treat the issuer name as unconfirmed."}
          </p>
        )}
        {summary.failures.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5 border-t border-danger/30 pt-3" data-testid="failures">
            {summary.failures.map((f, i) => (
              <li key={`${f.code}-${i}`} className="text-sm">
                <span className="font-mono text-xs text-danger">{f.code}</span>
                {f.explanation && <span className="text-foreground/75"> — {f.explanation}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Card title="Signature">
        <dl>
          <Row label="Author">
            {summary.authors.length ? summary.authors.join(", ") : <Missing />}
          </Row>
          <Row label="Issuer">
            <span data-testid="issuer">{summary.issuer ?? <Missing>Unknown</Missing>}</span>
          </Row>
          {summary.signer && summary.signer !== summary.issuer && (
            <Row label="Signed by">{summary.signer}</Row>
          )}
          <Row label="Signed on">{formatDate(summary.signedAt) ?? <Missing>No trusted timestamp</Missing>}</Row>
          <Row label="App or device">{summary.claimGenerator ?? <Missing />}</Row>
          {summary.title && <Row label="Title">{summary.title}</Row>}
          {summary.algorithm && (
            <Row label="Algorithm"><span className="font-mono text-xs">{summary.algorithm}</span></Row>
          )}
        </dl>
      </Card>

      <Card title="AI usage">
        <AiBadge summary={summary} />
      </Card>

      <Card title={`Actions (${summary.actions.length})`}>
        {summary.actions.length === 0 ? (
          <p className="text-sm text-muted">No edit history was recorded.</p>
        ) : (
          <ol className="flex flex-col" data-testid="actions">
            {summary.actions.map((a, i) => (
              <li key={`${a.action}-${i}`} className="flex gap-3 border-t border-border py-3 first:border-t-0">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{a.label}</p>
                  <p className="text-muted">
                    {[a.softwareAgent, formatDate(a.when)].filter(Boolean).join(" · ") || a.action}
                  </p>
                  {a.description && <p className="mt-1 text-foreground/75">{a.description}</p>}
                  {a.digitalSourceType && (
                    <p className="mt-1 font-mono text-xs text-muted">source: {sourceTypeName(a.digitalSourceType)}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {summary.ingredients.length > 0 && (
        <Card title={`Ingredients (${summary.ingredients.length})`}>
          <ul className="flex flex-col">
            {summary.ingredients.map((ing, i) => (
              <li key={`${ing.title}-${i}`} className="flex items-center justify-between gap-3 border-t border-border py-2.5 text-sm first:border-t-0">
                <span className="truncate">{ing.title}</span>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {ing.hasCredentials ? "has credentials" : "no credentials"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <button type="button" onClick={onReset} className="self-start text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
        Start over
      </button>
    </div>
  );
}

export default function ResultPanel({ outcome, onReset }: { outcome: ValidationOutcome; onReset: () => void }) {
  if (outcome.status === "credentials") {
    return <Credentials summary={outcome.summary} onReset={onReset} />;
  }

  if (outcome.status === "none") {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface p-8 text-center" data-testid="result-none">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" />
            <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
          </svg>
        </span>
        <div className="flex max-w-sm flex-col gap-2">
          <h2 className="text-lg font-semibold">No digital signature found</h2>
          <p className="text-sm leading-relaxed text-muted">
            This image has no Content Credentials. That doesn&apos;t mean it&apos;s fake — most images don&apos;t carry
            them yet, and many sites strip them on upload.
          </p>
        </div>
        <button type="button" onClick={onReset} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-surface-2">
          Check another image
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-warn/40 bg-warn/[0.06] p-6" data-testid="result-error">
      <h2 className="text-lg font-semibold">Couldn&apos;t read this file</h2>
      <p className="break-words font-mono text-xs text-foreground/80">{outcome.message}</p>
      <button type="button" onClick={onReset} className="self-start rounded-full border border-border px-4 py-2 text-sm hover:bg-surface-2">
        Try another image
      </button>
    </div>
  );
}
