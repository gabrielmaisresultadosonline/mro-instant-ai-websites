# Restaurar SSL dos outros sites + colocar mro.bio atrás do nginx do host

O Caddy do nosso compose tinha ocupado as portas 80/443 da VPS inteira,
quebrando o SSL de `belezalisoperfeito.online` e outros sites do mesmo servidor.
A solução abaixo:

- devolve 80/443 ao **nginx do host** (que já servia seus outros sites);
- coloca o app `mro.bio` rodando numa porta interna (`127.0.0.1:3001`);
- adiciona um server block de nginx só para `mro.bio` e `*.mro.bio`;
- usa um **certificado wildcard `*.mro.bio` via DNS-01**, então qualquer
  cliente novo já entra sem pedir certificado individual.

---

## 1. Derrubar nosso Caddy e subir o app só em localhost

```bash
cd /var/www/mro.bio/deploy   # ou /opt/mro.bio/deploy, conforme o seu caminho
git pull

# para tudo o que estava na 80/443
sudo docker compose down --remove-orphans

# sobe só o container do app, escutando em 127.0.0.1:3001
sudo docker compose up -d --build
sudo docker compose ps
curl -I http://127.0.0.1:3001    # deve responder
```

## 2. Religar o nginx do host (que serve os outros sites)

```bash
sudo systemctl enable --now nginx
sudo systemctl status nginx --no-pager
sudo nginx -t        # confere se os blocos existentes seguem válidos
```

Neste momento `belezalisoperfeito.online` e seus outros sites já devem
voltar a abrir normalmente, porque ninguém está mais segurando 80/443.

## 3. Emitir o certificado wildcard `*.mro.bio` (uma vez só)

`*.mro.bio` exige validação por DNS (DNS-01). Use o plugin do certbot do
seu provedor — exemplo com **Cloudflare**:

```bash
sudo apt install -y certbot python3-certbot-nginx python3-certbot-dns-cloudflare

# Coloque seu token de API (Zone.DNS:Edit) em /root/.cloudflare.ini
sudo install -m 600 /dev/null /root/.cloudflare.ini
echo "dns_cloudflare_api_token = SEU_TOKEN_AQUI" | sudo tee /root/.cloudflare.ini

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.cloudflare.ini \
  -d 'mro.bio' -d '*.mro.bio' \
  --agree-tos -m admin@mro.bio --non-interactive
```

> Se você **não usa Cloudflare**, troque pelo plugin do seu provedor
> (`python3-certbot-dns-digitalocean`, `-dns-route53`, etc.) ou rode
> `sudo certbot certonly --manual --preferred-challenges dns -d 'mro.bio' -d '*.mro.bio'`
> e crie o registro `TXT _acme-challenge.mro.bio` manualmente.

## 4. Instalar o server block do nginx só para mro.bio

```bash
sudo cp /var/www/mro.bio/deploy/nginx/mro.bio.conf /etc/nginx/sites-available/mro.bio
sudo ln -sf /etc/nginx/sites-available/mro.bio /etc/nginx/sites-enabled/mro.bio
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Testar tudo

```bash
curl -I https://mro.bio
curl -I https://essenciadoscachos.mro.bio
curl -I https://belezalisoperfeito.online
```

Os três precisam responder **200/301/302** sem erro de SSL.

---

## Por que isso não vai mais derrubar os outros sites

- O nosso `docker-compose.yml` **não publica mais 80/443**, só
  `127.0.0.1:3001`. Não há como ele conflitar com nginx, certbot ou
  qualquer outro serviço público.
- O nginx do host continua dono de 80/443 e de todos os outros
  `server_name` que você já tinha. Adicionamos apenas um bloco extra
  específico para `mro.bio` / `*.mro.bio`.
- O certificado wildcard `*.mro.bio` cobre qualquer subdomínio futuro
  sem precisar gerar certificado por cliente, e **não toca** nos
  certificados dos outros domínios.
