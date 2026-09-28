import Validator from "@/components/Validator";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
      <div className="mb-10 max-w-2xl">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-accent">Content Credentials · C2PA</p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Check the label before you trust it.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Drop in an image, video or audio file, or paste a link. If it carries Content Credentials, you&apos;ll see who
          signed it, whether it was captured with a camera or made with AI, and what was edited, all checked for
          tampering. If it doesn&apos;t, we&apos;ll tell you that honestly.
        </p>
      </div>
      <Validator />
    </main>
  );
}
