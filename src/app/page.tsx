import Validator from "@/components/Validator";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
      <div className="mb-10 max-w-2xl">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-accent">C2PA · Content Credentials</p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Is this image what it claims to be?
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Drop in an image to read its Content Credentials: who signed it, what tools touched it,
          and whether generative AI was declared.
        </p>
      </div>
      <Validator />
    </main>
  );
}
