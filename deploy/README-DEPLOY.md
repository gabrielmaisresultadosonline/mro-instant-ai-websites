# Deploy MRO.BIO no Hostinger VPS (Ubuntu 24.04 LTS)

Este pacote roda o app **MRO.BIO** em uma VPS Ubuntu. A configuração utiliza o **Nginx do Host** com um **Certificado SSL Wildcard (`*.mro.bio`)**, garantindo que o domínio principal e TODOS os subdomínios dos usuários tenham HTTPS instantâneo e automático.

---

## 1. Pré-requisitos

- VPS Ubuntu 24.04 LTS.
- Domínio `mro.bio` apontando para o IP da VPS.
- **Nginx instalado no host** (permite coexistir com outros sites no mesmo servidor).

Configure no seu DNS/registrador:

| Tipo | Nome        | Conteúdo     |
| ---- | ----------- | ------------ |
| A    | `mro.bio`   | IP do VPS    |
| A    | `*`         | IP do VPS    |
| A    | `www`       | IP do VPS    |

---

## 2. Instalação Automática (Rápida)

Acesse o VPS via SSH e execute os comandos abaixo para instalar o app e o SSL Wildcard:

```bash
# 1. Clone o projeto
sudo mkdir -p /var/www/mro.bio && sudo chown $USER /var/www/mro.bio
git clone https://github.com/SEU_USUARIO/SEU_REPO.git /var/www/mro.bio
cd /var/www/mro.bio

# 2. Instala Docker + Dependências + Firewall
sudo bash deploy/install.sh

# 3. ATIVAÇÃO AUTOMÁTICA DE SSL (WILDCARD)
# Este script resolve o erro de "Conexão Insegura" para sempre.
sudo bash deploy/setup-wildcard-ssl.sh
```

---

## 3. Configurar Variáveis de Ambiente

Edite o arquivo de ambiente para conectar ao backend:

```bash
sudo nano /var/www/mro.bio/deploy/app.env
```

Cole as chaves do seu projeto Lovable Cloud (Connectors -> Supabase).

---

## 4. Por que o SSL agora é automático?

Diferente da configuração anterior que dependia do Caddy gerar certificados individuais, nossa nova arquitetura usa um **Certificado Wildcard**:
- O script `setup-wildcard-ssl.sh` gera um certificado único que cobre `*.mro.bio`.
- Qualquer novo site (`novo-cliente.mro.bio`) já nasce com HTTPS funcionando.
- Não há conflitos com `belezalisoperfeito.online` ou outros domínios na mesma VPS, pois o Nginx do host gerencia tudo.

---

## 5. Atualizar o sistema

Para subir novas versões do código:

```bash
cd /var/www/mro.bio
git pull
cd deploy
sudo docker compose up -d --build
```

---

## 6. Backup e Segurança

- Os dados (usuários, sites, imagens) estão seguros no **Lovable Cloud**.
- O VPS é apenas a camada de exibição; se precisar trocar de servidor, basta rodar os comandos do item 2 novamente.
