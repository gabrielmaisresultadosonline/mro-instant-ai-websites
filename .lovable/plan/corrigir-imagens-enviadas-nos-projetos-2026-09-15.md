# Corrigir imagens enviadas nos projetos

## Objetivo
Fazer endereços `/uploads/...` entregarem as imagens salvas, sem depender de uma pasta fixa ou incorreta do servidor.

## Alterações
- Criar uma rota segura no aplicativo para servir somente imagens válidas da pasta persistente de uploads.
- Impedir que `/uploads/` seja tratado como uma página de subdomínio.
- Ajustar a configuração do servidor para encaminhar `/uploads/` ao aplicativo, eliminando o caminho antigo `/var/www/mro.bio`.
- Manter o volume persistente atual para que novas imagens sobrevivam às atualizações.

## Validação
- Confirmar que o endereço informado retorna uma imagem, não uma página 404.
- Testar domínio principal e subdomínios sem afetar outros sites do VPS.
