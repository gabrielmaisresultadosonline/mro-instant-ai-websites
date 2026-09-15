#!/usr/bin/env python3
import json
import os
import requests
import sys

# Script para acme-dns-client simplificado
ACME_DNS_URL = "https://auth.acme-dns.io"
STORAGE_PATH = "/etc/letsencrypt/acmedns.json"

def main():
    domain = os.environ.get("CERTBOT_DOMAIN")
    token = os.environ.get("CERTBOT_VALIDATION")
    
    if not domain or not token:
        print("Certbot variables missing")
        sys.exit(1)

    # Limpa o domínio do wildcard para a chave do JSON
    domain_key = domain.replace("*.", "")
    
    accounts = {}
    if os.path.exists(STORAGE_PATH):
        with open(STORAGE_PATH, "r") as f:
            accounts = json.load(f)

    if domain_key not in accounts:
        # Registra nova conta se não existir
        reg = requests.post(f"{ACME_DNS_URL}/register").json()
        accounts[domain_key] = reg
        with open(STORAGE_PATH, "w") as f:
            json.dump(accounts, f)
        
        print("\n" + "="*60)
        print("PRIMEIRA CONFIGURAÇÃO NECESSÁRIA:")
        print(f"Crie o seguinte CNAME no seu DNS (Hostinger):")
        print(f"Nome: _acme-challenge.{domain_key}")
        print(f"Alvo: {reg['fulldomain']}")
        print("="*60)
        input("Após criar o CNAME e aguardar a propagação, pressione Enter para continuar...")

    # Atualiza o TXT no acme-dns
    acct = accounts[domain_key]
    data = {"subdomain": acct["subdomain"], "txt": token}
    headers = {"X-Api-User": acct["username"], "X-Api-Key": acct["password"]}
    
    res = requests.post(f"{ACME_DNS_URL}/update", json=data, headers=headers)
    if res.status_code == 200:
        print(f"DNS atualizado com sucesso para {domain}")
    else:
        print(f"Erro ao atualizar DNS: {res.text}")
        sys.exit(1)

if __name__ == "__main__":
    main()
