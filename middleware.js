// EdgeOne Pages middleware: pass requests through for deployment diagnosis.
// Cloudflare Pages middleware remains in functions/_middleware.js.
export function middleware(context) {
  return context.next();
}
