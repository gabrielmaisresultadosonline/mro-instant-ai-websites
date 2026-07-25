// Sanitização de HTML de e-mail recebido.
// O HTML é exibido em um <iframe sandbox> no painel (defesa em profundidade),
// mas ainda assim removemos tudo que possa executar código ou vazar dados.

const DANGEROUS_TAGS = [
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "svg",
  "math",
];

/**
 * Remove tags executáveis, handlers inline e URLs perigosas.
 * Retorna string vazia se a entrada não for utilizável.
 */
export function sanitizeEmailHtml(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";

  let html = input;

  // 1. Remove comentários condicionais e comuns (podem esconder markup).
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // 2. Remove blocos completos das tags perigosas (com conteúdo).
  for (const tag of DANGEROUS_TAGS) {
    const block = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
    const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    html = html.replace(block, "").replace(selfClosing, "");
  }

  // 3. Remove atributos de evento (onclick, onerror, onload...).
  html = html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");

  // 4. Neutraliza protocolos executáveis em href/src/action.
  html = html.replace(
    /\b(href|src|action|formaction|xlink:href)\s*=\s*("|')?\s*(javascript|vbscript|data):[^"'\s>]*("|')?/gi,
    '$1="#"',
  );

  // 5. Remove srcdoc e atributos de import de estilo remoto.
  html = html.replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/@import[^;]+;/gi, "");

  // 6. Limite de tamanho para não travar o painel.
  const MAX = 400_000;
  return html.length > MAX ? `${html.slice(0, MAX)}\n<!-- conteúdo truncado -->` : html;
}

/**
 * Detecta um código de verificação (4 a 8 dígitos) no assunto ou corpo.
 * Prioriza números próximos de palavras-chave típicas (código, code, verification...).
 */
export function extractVerificationCode(subject: string, text: string): string | null {
  const haystack = `${subject}\n${text}`;

  const keyed = haystack.match(
    /(?:c[oó]digo|code|verifica(?:[cç][aã]o|tion)?|confirma(?:[cç][aã]o|tion)?|otp|pin|token)[^\d]{0,40}(\d{4,8})/i,
  );
  if (keyed?.[1]) return keyed[1];

  const spaced = haystack.match(/\b(\d{3}[\s-]\d{3})\b/);
  if (spaced?.[1]) return spaced[1].replace(/[\s-]/g, "");

  const standalone = haystack.match(/(?:^|[\s>:])(\d{6})(?:[\s<.,!]|$)/);
  if (standalone?.[1]) return standalone[1];

  return null;
}
