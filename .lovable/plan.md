# SSL wildcard automático na Hostinger

## Objetivo
Eliminar a troca manual do TXT a cada emissão ou renovação do certificado `*.mro.bio`.

## Alterações
- Substituir o fluxo manual do Certbot por atualização automática do DNS usando a API oficial da Hostinger.
- Solicitar o token da API uma única vez no terminal, sem exibi-lo, e armazená-lo com permissão restrita no VPS.
- Criar e remover automaticamente somente o TXT `_acme-challenge.mro.bio` durante a validação.
- Configurar renovação automática e recarregar o Nginx somente após uma renovação válida.
- Manter o certificado e a configuração exclusivos do MRO.BIO, sem alterar os outros sites do VPS.
- Preservar o certificado atual caso a API, o DNS ou a emissão falhem.

## Uso esperado
Na primeira execução, será informado uma única vez o token da API da Hostinger. Depois disso, emissão e renovações ocorrerão automaticamente, sem cadastrar novos valores TXT.

## Validação
- Validar a sintaxe de todos os scripts.
- Confirmar que nenhum segredo foi salvo no repositório.
- Confirmar que o certificado solicitado contém `DNS:*.mro.bio` antes de recarregar o Nginx.
