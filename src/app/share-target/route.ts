// The service worker normally answers shares (public/sw.js). This only runs if
// a share reaches the server, e.g. before the worker has installed.
export function POST(request: Request) {
  return Response.redirect(new URL("/?shared=unavailable", request.url), 303);
}
