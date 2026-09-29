import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy · AI Label Check",
  description: "What AI Label Check does with the files and links you check, and what it records.",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-col gap-3 leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Privacy</p>
        <h1 className="text-4xl font-semibold tracking-tight">What happens to what you check</h1>
        <p className="text-lg leading-relaxed text-muted">
          Short version: files you upload never leave your device. Links you paste are downloaded through our server and
          passed straight to your browser, not stored. We count visits without cookies, and log crashes without any of
          your content.
        </p>
        <p className="text-sm text-muted">Last updated 28 September 2026</p>
      </header>

      <Section title="Files you upload or share to the app">
        <p>
          Checking happens entirely in your browser. The file is read on your device and is never sent to our server or
          anyone else.
        </p>
        <p>
          When you share a file to the installed app from another app, your browser holds it briefly so the page can
          open it, then deletes it.
        </p>
        <p>
          One exception you should know about: some files say their Content Credentials are stored online. To read them,
          your browser fetches them from the address in the file, so that site can see your IP address, as with any web
          request.
        </p>
      </Section>

      <Section title="Invisible watermark check">
        <p>
          For images without Content Credentials, you can check for an invisible Adobe TrustMark watermark. The image is
          checked on your device and isn&apos;t uploaded. The first time, your browser downloads the detector (about 45
          MB) from Adobe&apos;s server, so Adobe sees that download request from your IP address, but not your image.
          The detector is then saved in your browser for later checks.
        </p>
      </Section>

      <Section title="Links you paste">
        <p>
          Most sites don&apos;t let browsers download their files directly, so our server downloads the file and streams it
          to your browser, which checks it. We don&apos;t store the file.
        </p>
        <p>
          The link is sent in the body of the request, not the web address, so it isn&apos;t written into our request
          logs. The site you link to sees a request from our server, not from you.
        </p>
      </Section>

      <Section title="Visitor statistics">
        <p>
          We use Vercel Web Analytics to count page views. It doesn&apos;t use cookies. We remove anything after the
          &quot;?&quot; in page addresses before a view is recorded, so only the page path is counted. See{" "}
          <a href="https://vercel.com/docs/analytics/privacy-policy" className="underline underline-offset-4">
            Vercel&apos;s analytics privacy notice
          </a>{" "}
          for what it collects.
        </p>
      </Section>

      <Section title="Error reports">
        <p>
          If the page crashes, it sends a report so we can fix it: the error message, where in the code it happened, the
          page path and your browser type. Reports never include file names, file contents or the links you check.
        </p>
      </Section>

      <Section title="Our hosting and abuse protection">
        <p>
          The app is hosted on Vercel, which keeps standard request logs (such as IP address, time and page requested)
          for operating and securing the service. To stop abuse, the link checker counts requests per IP address in
          memory for a minute at a time; those counts aren&apos;t saved.
        </p>
      </Section>

      <Section title="What we don't do">
        <p>
          No accounts, no advertising trackers, and we don&apos;t sell or share data. If you install the app, it saves
          its own files in your browser so it works offline; you can remove them by uninstalling it or clearing site
          data.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about privacy:{" "}
          <a href="mailto:hello.ailabelcheck@gmail.com" className="underline underline-offset-4">
            hello.ailabelcheck@gmail.com
          </a>
        </p>
      </Section>

      <Link href="/" className="self-start text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
        ← Back to the checker
      </Link>
    </main>
  );
}
