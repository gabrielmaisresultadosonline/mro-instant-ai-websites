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
        console.log(`[Public site] Request for slug: ${slug}`);

        const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
        const supabaseKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
        
        if (!supabaseUrl || !supabaseKey) {
          console.error("[Public site] Missing public database env vars");
          return new Response("Configuração do servidor incompleta (Missing SUPABASE_URL/KEY)", { status: 503 });
        }

        const publicDb = createClient<any>(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });

        // 1. First, check for an AI-generated site (published)
        const { data: site, error: siteError } = await publicDb
          .from("sites")
          .select("id, slug, html, pixels, is_published, owner_id")
          .eq("slug", slug)
          .eq("is_published", true)
          .maybeSingle();

        if (siteError) {
          console.error("[Public site] Load failed (sites query):", siteError);
          return new Response(`Erro ao carregar site: ${siteError.message}`, { status: 503 });
        }

        let renderedHtml = "";
        let sitePixels = (site?.pixels ?? {}) as Record<string, string>;
        let siteId = site?.id;
        let profileStatus = 'none';

        if (site && site.html) {
          // Manual profile fetch to avoid relationship errors
          const { data: prof } = await publicDb
            .from("profiles")
            .select("subscription_status")
            .eq("id", site.owner_id)
            .maybeSingle();
          
          profileStatus = prof?.subscription_status || 'none';

          if (profileStatus !== 'active') {
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
          // 2. If no AI site, check for a Standard Page
          // Priority 1: Check if the slug itself is a standard page
          let { data: stdPage, error: pageError } = await publicDb
            .from("site_pages")
            .select("*")
            .eq("slug", slug)
            .eq("is_active", true)
            .maybeSingle();

          // Priority 2: If not found by slug, check if the slug is the SITE slug and get its first active page
          if (!stdPage) {
            const { data: siteRecord } = await publicDb
              .from("sites")
              .select("id")
              .eq("slug", slug)
              .maybeSingle();
            
            if (siteRecord) {
              const { data: firstPage } = await publicDb
                .from("site_pages")
                .select("*")
                .eq("site_id", siteRecord.id)
                .eq("is_active", true)
                .limit(1)
                .maybeSingle();
              stdPage = firstPage;
            }
          }

          if (stdPage) {
            siteId = stdPage.site_id;
            
            // Get site info manually
            const { data: parentSite } = await publicDb
              .from("sites")
              .select("pixels, owner_id")
              .eq("id", stdPage.site_id)
              .maybeSingle();

            sitePixels = (parentSite?.pixels ?? {}) as Record<string, string>;
            if (stdPage.fb_pixel_id) sitePixels.meta = stdPage.fb_pixel_id;
            
            if (parentSite?.owner_id) {
              const { data: prof } = await publicDb
                .from("profiles")
                .select("subscription_status")
                .eq("id", parentSite.owner_id)
                .maybeSingle();
              profileStatus = prof?.subscription_status || 'none';
            }

            if (profileStatus !== 'active') {
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

            const bgStyle = stdPage.background_type === 'image' 
              ? `background-color: ${stdPage.background_color_under_image || '#000000'}; position: relative; overflow: hidden;`
              : `background: ${stdPage.background_type === 'gradient' ? stdPage.background_value : stdPage.background_value};`;

            const bgImageUrl = stdPage.background_value?.startsWith('http') 
              ? stdPage.background_value 
              : `${supabaseUrl}/storage/v1/object/public/site-assets-v3/${stdPage.background_value}`;

            const imageOverlay = stdPage.background_type === 'image' && stdPage.background_value
              ? `<div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background-image: url('${bgImageUrl}'); background-size: cover; background-position: center; opacity: ${stdPage.image_opacity ?? 1}; pointer-events: none;"></div>`
              : '';

            renderedHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${stdPage.title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { ${bgStyle} min-height: 100vh; color: ${stdPage.text_color || '#FFFFFF'}; font-family: system-ui, -apple-system, sans-serif; margin: 0; }
        .glass { background: rgba(0,0,0,0.4); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
        @keyframes pulse-gold { 0% { box-shadow: 0 0 0 0 rgba(255, 214, 0, 0.4); } 70% { box-shadow: 0 0 0 20px rgba(255, 214, 0, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 214, 0, 0); } }
        .btn-pulse { animation: pulse-gold 2s infinite; }
        .content-wrap { position: relative; z-index: 10; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; }
    </style>
</head>
<body>
    ${imageOverlay}
    <div class="content-wrap">
        <div class="max-w-md w-full glass rounded-[2.5rem] p-8 text-center shadow-2xl overflow-hidden">


        ${stdPage.logo_url ? `<img src="${stdPage.logo_url}" class="h-20 mx-auto mb-8 object-contain" alt="Logo">` : ''}
        <h1 class="text-3xl md:text-4xl font-bold mb-4 leading-tight">${stdPage.title}</h1>
        <p class="text-lg opacity-90 mb-8 font-medium whitespace-pre-wrap break-words">${stdPage.subtitle || ""}</p>
        
        <a href="${stdPage.cta_link?.startsWith('http') ? stdPage.cta_link : `https://${stdPage.cta_link}`}" id="cta-button" 
           class="block w-full bg-green-500 hover:bg-green-600 text-white font-black py-5 rounded-2xl text-xl uppercase tracking-wider transition-all transform hover:scale-105 active:scale-95 btn-pulse shadow-xl mb-6">
            ${stdPage.cta_text || 'Quero participar'}
        </a>

        <p class="text-sm opacity-70 leading-relaxed whitespace-pre-wrap break-words">${stdPage.description || ""}</p>
    </div>

    <script>
    document.getElementById('cta-button').addEventListener('click', function(e) {
        // Track meta lead
        if (window.fbq) {
            fbq('track', 'Lead', { content_name: '${stdPage.title}' });
        }
        
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
        
        // Pixel leads take a moment to fire, but we want direct navigation
        // The user wants direct link ("abrir o link direto nao mro.bio junto")
        // No e.preventDefault() here means it follows the href naturally.
    });
    </script>
    </div>
</body>
</html>`;
          }
        }

        if (!renderedHtml) {

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
