export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Esta página não carregou - MRO.BIO</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #0A0A0A; color: #fff; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.5rem; margin: 0 0 0.5rem; color: #FFD600; }
      p { color: #9ca3af; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.75rem 1.5rem; border-radius: 0.5rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; font-weight: 600; transition: all 0.2s; }
      .primary { background: #FFD600; color: #000; }
      .primary:hover { opacity: 0.9; }
      .secondary { background: transparent; color: #fff; border-color: #374151; }
      .secondary:hover { background: #1f2937; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>⚠ Algo deu errado</h1>
      <p>Ocorreu um problema ao carregar esta página. Pode ser um erro temporário ou o site ainda não foi configurado corretamente.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Tentar novamente</button>
        <a class="secondary" href="https://mro.bio">Ir para o início</a>
      </div>
    </div>
  </body>
</html>`;
}
