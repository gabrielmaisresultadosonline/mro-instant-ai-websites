import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

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
        const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
        const supabaseKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
        if (!supabaseUrl || !supabaseKey) {
          console.error("[Public site] Missing public database env vars");
          return new Response("Site indisponível", { status: 503 });
        }

        const publicDb = createClient<any>(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });

        const { data: site, error: siteError } = await publicDb
          .from("sites")
          .select("id, slug, html, pixels, is_published, profiles(subscription_status)")
          .eq("slug", slug)
          .eq("is_published", true)
          .maybeSingle();

        if (siteError) {
          console.error("[Public site] load failed:", siteError);
          return new Response("Site indisponível", { status: 503 });
        }

        let renderedHtml = "";
        let sitePixels = (site?.pixels ?? {}) as Record<string, string>;
        let siteId = site?.id;

        if (site && site.html) {
          const status = (site.profiles as any)?.subscription_status || 'none';
          if (status !== 'active') {
            return new Response(
              `<!doctype html><meta charset="utf-8"><title>Site temporariamente indisponível</title>
              <style>body{font:16px/1.5 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#0A0A0A;color:#fff;text-align:center;padding:2rem}h1{font-size:2rem;color:#FFD600}</style>
              <div>
                <h1>⚠ Site temporariamente indisponível</h1>
                <p>Este site encontra-se fora do ar por falta de assinatura ativa.</p>
                <p style="opacity:.7">Se você é o proprietário, regularize seu plano no painel MRO.BIO.</p>
              </div>`,
              { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
            );
          }
          renderedHtml = site.html;
        } else {
          // Check if it's a Standard Page before returning 404
          const { data: stdPage } = await publicDb
            .from("site_pages")
            .select("*, sites(slug, pixels, is_blocked)")
            .eq("slug", slug)
            .eq("is_active", true)
            .maybeSingle();

          if (stdPage && stdPage.sites) {
            siteId = stdPage.site_id;
            sitePixels = (stdPage.sites.pixels ?? {}) as Record<string, string>;
            if (stdPage.fb_pixel_id) sitePixels.meta = stdPage.fb_pixel_id;

            if (stdPage.sites.is_blocked) {
              return new Response(
                `<!doctype html><meta charset="utf-8"><title>Site temporariamente indisponível</title>
                <style>body{font:16px/1.5 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#0A0A0A;color:#fff;text-align:center;padding:2rem}h1{font-size:2rem;color:#FFD600}</style>
                <div>
                  <h1>⚠ Site temporariamente indisponível</h1>
                  <p>Este site encontra-se fora do ar por falta de pagamento.</p>
                  <p style="opacity:.7">Se você é o proprietário, regularize sua assinatura para reativar.</p>
                </div>`,
                { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
              );
            }

            const bg = stdPage.background_type === 'image' 
              ? `url('${stdPage.background_value}') center/cover fixed no-repeat` 
              : stdPage.background_type === 'color' 
                ? stdPage.background_value 
                : stdPage.background_value;

            const bgOpacity = 1; // Default opacity for background layer


            renderedHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${stdPage.title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: ${bg}; min-height: 100vh; color: white; font-family: system-ui, -apple-system, sans-serif; }
        .glass { background: rgba(0,0,0,0.4); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
        @keyframes pulse-gold { 0% { box-shadow: 0 0 0 0 rgba(255, 214, 0, 0.4); } 70% { box-shadow: 0 0 0 20px rgba(255, 214, 0, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 214, 0, 0); } }
        .btn-pulse { animation: pulse-gold 2s infinite; }
    </style>
</head>
<body class="flex items-center justify-center p-4">
    <div class="max-w-md w-full glass rounded-[2.5rem] p-8 text-center shadow-2xl overflow-hidden">

        ${stdPage.logo_url ? `<img src="${stdPage.logo_url}" class="h-20 mx-auto mb-8 object-contain" alt="Logo">` : ''}
        <h1 class="text-3xl md:text-4xl font-bold mb-4 leading-tight">${stdPage.title}</h1>
        <p class="text-lg opacity-90 mb-8 font-medium whitespace-pre-wrap break-words">${stdPage.subtitle || ""}</p>
        
        <a href="${stdPage.cta_link || '#'}" id="cta-button" 
           class="block w-full bg-green-500 hover:bg-green-600 text-white font-black py-5 rounded-2xl text-xl uppercase tracking-wider transition-all transform hover:scale-105 active:scale-95 btn-pulse shadow-xl mb-6">
            ${stdPage.cta_text || 'Quero participar'}
        </a>

        <p class="text-sm opacity-70 leading-relaxed whitespace-pre-wrap break-words">${stdPage.description || ""}</p>
    </div>

    <script>
    document.getElementById('cta-button').addEventListener('click', function(e) {
        if (window.fbq) fbq('track', 'Lead', { content_name: '${stdPage.title}' });
        
        // Track locally
        fetch('/_serverFn/trackLead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                siteId: '${stdPage.site_id}', 
                pageId: '${stdPage.id}', 
                eventName: 'Lead' 
            })
        }).catch(() => {});
    });
    </script>
</body>
</html>`;
          }
        }

        if (!renderedHtml) {
          // One final check: if it's not a Standard Page, maybe it's an I.A site that was published
          // but the owner doesn't have an active subscription (view filter checks subscription_status).
          // We check the 'sites' table directly to give a better error message.
          const { data: siteRaw } = await publicDb
            .from("sites")
            .select("id, is_published, html, profiles(subscription_status)")
            .eq("slug", slug)
            .maybeSingle();

          if (siteRaw && siteRaw.is_published && siteRaw.html) {
            const status = (siteRaw.profiles as any)?.subscription_status || 'none';
            if (status !== 'active') {
              return new Response(
                `<!doctype html><meta charset="utf-8"><title>Site temporariamente indisponível - MRO.BIO</title>
                <style>body{font:16px/1.5 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#0A0A0A;color:#fff;text-align:center;padding:2rem}h1{font-size:2rem;color:#FFD600}</style>
                <div>
                  <h1>⚠ Site temporariamente indisponível</h1>
                  <p>O site <strong>${slug}.mro.bio</strong> foi publicado, mas requer uma assinatura ativa para ficar online.</p>
                  <p style="opacity:.7">Se você é o proprietário, acesse o painel e verifique seu plano.</p>
                </div>`,
                { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
              );
            }
          }

          return new Response(
            `<!doctype html><meta charset="utf-8"><title>Site não cadastrado - MRO.BIO</title>
            <style>body{font:16px/1.5 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#0A0A0A;color:#fff;text-align:center;padding:2rem}h1{font-size:2.5rem;margin:0 0 .5rem;color:#FFD600}.btn{display:inline-block;margin-top:1.5rem;padding:.8rem 1.5rem;background:#FFD600;color:#000;text-decoration:none;border-radius:.5rem;font-weight:700}</style>
            <div>
              <h1>⚠ Domínio disponível!</h1>
              <p>O subdomínio <strong>${slug}.mro.bio</strong> ainda não está sendo usado.</p>
              <p>Ele pode ser seu agora mesmo!</p>
              <a href="https://mro.bio" class="btn">Criar meu site agora →</a>
            </div>`,
            { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }

        // Fire-and-forget visit record
        if (siteId) {
          try {
            const cf = request.headers as Headers & { get(name: string): string | null };
            const ip = cf.get("cf-connecting-ip") ?? cf.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
            const country = cf.get("cf-ipcountry") ?? null;
            const region = cf.get("cf-region") ?? null;
            const city = cf.get("cf-ipcity") ?? null;
            const userAgent = cf.get("user-agent") ?? null;
            const referrer = cf.get("referer") ?? null;
            void publicDb.from("site_visits").insert({
              site_id: siteId,
              ip, country, region, city,
              user_agent: userAgent,
              referrer,
            });
          } catch (e) { console.error("visit log failed", e); }
        }

        const htmlWithPixels = injectPixels(renderedHtml, sitePixels);
        return new Response(htmlWithPixels, {

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
