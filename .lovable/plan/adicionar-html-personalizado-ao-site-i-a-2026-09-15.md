# Adicionar HTML personalizado ao Site I.A

## Objetivo
Permitir que o cliente cole um site HTML completo criado fora da plataforma, veja a prévia, salve como uma versão e ative essa versão no próprio domínio.

## Alterações
- Adicionar a opção **HTML personalizado** junto das opções do Site I.A.
- Criar um editor para colar HTML, alternar entre código e prévia e salvar sem consumir gerações de I.A.
- Salvar o HTML como uma versão no histórico, identificada como “HTML personalizado”.
- Permitir ativar a versão salva usando o fluxo de publicação existente.
- Validar tamanho, estrutura mínima e propriedade do site no servidor.
- Isolar a prévia para que o código colado não acesse o painel.
- Preparar um bloco único de atualização da VPS que reconstrói somente o contêiner do MRO.BIO e valida o Nginx antes de recarregar.

## Validação
- Testar colagem, prévia, salvamento e ativação.
- Confirmar que o HTML personalizado aparece no histórico e não reduz a cota mensal de I.A.
- Confirmar que a atualização usa somente a porta e a pasta do MRO.BIO, sem alterar outros sites.
