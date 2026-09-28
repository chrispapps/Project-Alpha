// Turns cloud-storage share links, which open a preview page, into links
// that download the file itself. Pure functions, so they're easy to test.

export type ShareLink =
  | { kind: "file"; url: URL; provider: "Dropbox" | "Google Drive" }
  | { kind: "folder"; provider: "Dropbox" | "Google Drive" }
  | { kind: "none" };

const DROPBOX_HOST = /^(www\.)?dropbox\.com$/i;
const DRIVE_HOST = /^drive\.google\.com$/i;
const DRIVE_ID = /^[\w-]{10,}$/;

function driveDownload(id: string): URL {
  // confirm=t skips Google's "can't scan for viruses" page where Google allows it.
  const url = new URL("https://drive.usercontent.google.com/download");
  url.searchParams.set("id", id);
  url.searchParams.set("export", "download");
  url.searchParams.set("confirm", "t");
  return url;
}

export function rewriteShareLink(input: URL): ShareLink {
  const host = input.hostname.toLowerCase();

  if (DROPBOX_HOST.test(host)) {
    // Folders (/sh/, /scl/fo/) can't be downloaded as one media file.
    if (/^\/(sh|scl\/fo)\//.test(input.pathname)) return { kind: "folder", provider: "Dropbox" };
    // Files: /s/<id>/<name> and /scl/fi/<id>/<name>?rlkey=… ; dl=1 downloads instead of previewing.
    if (/^\/(s|scl\/fi)\//.test(input.pathname)) {
      const url = new URL(input.href);
      url.searchParams.delete("raw");
      url.searchParams.set("dl", "1");
      return { kind: "file", url, provider: "Dropbox" };
    }
    return { kind: "none" };
  }

  if (DRIVE_HOST.test(host)) {
    if (/^\/drive\/(u\/\d+\/)?folders\//.test(input.pathname)) return { kind: "folder", provider: "Google Drive" };
    // /file/d/<id>/view, /file/d/<id>/preview, /file/u/0/d/<id>/view
    const fromPath = /^\/file\/(?:u\/\d+\/)?d\/([\w-]+)/.exec(input.pathname)?.[1];
    // /open?id=<id> and /uc?id=<id>
    const fromQuery = /^\/(open|uc)$/.test(input.pathname) ? input.searchParams.get("id") : null;
    const id = fromPath ?? fromQuery;
    if (id && DRIVE_ID.test(id)) return { kind: "file", url: driveDownload(id), provider: "Google Drive" };
    return { kind: "none" };
  }

  return { kind: "none" };
}

/** When a storage service answers with a web page instead of the file, explain why. */
export function providerPageMessage(finalUrl: URL): string | undefined {
  const host = finalUrl.hostname.toLowerCase();
  if (DRIVE_HOST.test(host) || /^(drive\.usercontent|docs|accounts)\.google\.com$/.test(host)) {
    return (
      "Google Drive showed a page instead of the file. Check the file is shared with \"Anyone with the link\". " +
      "Large files also get a virus-scan page that can't be skipped automatically: download the file and upload it instead."
    );
  }
  if (DROPBOX_HOST.test(host) || /dropboxusercontent\.com$/.test(host)) {
    return "Dropbox showed a page instead of the file. Check the link is shared publicly, or download the file and upload it instead.";
  }
  return undefined;
}
