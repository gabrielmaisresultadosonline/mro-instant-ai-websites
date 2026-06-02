import { createFileRoute } from "@tanstack/react-router";

function buildPixelSnippets(pixels: Record<string, string>): string {
  const out: string[] = [];
  if (pixels.ga4) {
    const id = pixels.ga4.trim();
    out.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');</script>`);
  }
  if (pixels.gtm) {
    const id = pixels.gtm.trim();
    out.push(`<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');</script>`);
  }
  if (pixels.meta) {
    const id = pixels.meta.trim();
    out.push(`<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');</script>`);
  }
  if (pixels.tiktok) {
    const id = pixels.tiktok.trim();
    out.push(`<script>!function (w, d, t) {w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${id}');ttq.page();}(window, document, 'ttq');</script>`);
  }
  return out.join("\n");
}

function injectPixels(html: string, pixels: Record<string, string>): string {
  const snippets = buildPixelSnippets(pixels);
  if (!snippets) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${snippets}\n</head>`);
  return snippets + html;
}

export const Route = createFileRoute("/api/public/site/$slug")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const slug = String(params.slug).trim().toLowerCase();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: site } = await supabaseAdmin
          .from("sites")
          .select("id, slug, html, pixels, is_published")
          .eq("slug", slug)
          .maybeSingle();

        if (!site || !site.is_published || !site.html) {
          return new Response(
            `<!doctype html><meta charset="utf-8"><title>Site não encontrado</title>
            <style>body{font:16px/1.5 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#0A0A0A;color:#fff}</style>
            <div style="text-align:center;padding:2rem">
              <h1 style="font-size:2.5rem;margin:0 0 .5rem">404</h1>
              <p>Esse site ainda não foi publicado em <strong>${slug}.mro.bio</strong>.</p>
              <p><a href="https://mro.bio" style="color:#FFD600">Crie o seu agora →</a></p>
            </div>`,
            { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }

        // Fire-and-forget visit record
        try {
          const url = new URL(request.url);
          const cf = request.headers as Headers & { get(name: string): string | null };
          const ip = cf.get("cf-connecting-ip") ?? cf.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
          const country = cf.get("cf-ipcountry") ?? null;
          const region = cf.get("cf-region") ?? null;
          const city = cf.get("cf-ipcity") ?? null;
          const userAgent = cf.get("user-agent") ?? null;
          const referrer = cf.get("referer") ?? null;
          // do not await
          void supabaseAdmin.from("site_visits").insert({
            site_id: site.id,
            ip, country, region, city,
            user_agent: userAgent,
            referrer,
          });
          // touch url to keep var used (eslint)
          void url;
        } catch (e) { console.error("visit log failed", e); }

        const html = injectPixels(site.html, (site.pixels ?? {}) as Record<string, string>);
        return new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=30",
          },
        });
      },
    },
  },
});
