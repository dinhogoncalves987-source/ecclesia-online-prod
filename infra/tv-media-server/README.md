# Ecclesia TV Media Server — Guia de Setup da VPS

Servidor de streaming que recebe transmissões do OBS, celular e computador via RTMP/SRT,  
gera HLS, grava automaticamente e publica as gravações no Cloudflare R2 e no Canal Ecclesia.

---

## Arquitetura

```
OBS / Celular / Computador
        │ RTMP (porta 1935)
        ▼
┌──────────────────────┐
│     MediaMTX         │  ←  recebe e roteamulti-source
│  HLS:8888  API:9997  │  →  gera HLS ao vivo
└────────┬─────────────┘
         │ hooks: on_publish / on_unpublish
         ▼
   Scripts Bash  ──→  Supabase Edge Functions
   FFmpeg         ──→  Cloudflare R2 (gravações + thumbnails)
         │
         ▼
┌──────────────────────┐
│      Nginx           │  ←  HTTPS + servir HLS
│  443 (HLS público)   │
└──────────────────────┘
         │
         ▼
     HLS.js Player (Ecclesia Frontend)
```

---

## Pré-requisitos

- VPS Ubuntu 24.04 (mínimo 2 vCPU, 4 GB RAM, 50 GB disco SSD)
- Domínio apontando para o IP da VPS (ex: `media-test.ecclesia.com.br`)
- Conta Cloudflare R2 ativa
- Projeto Supabase de **TESTE** com as migrations aplicadas

---

## 1. Instalar Docker

```bash
# Atualizar o sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências
sudo apt install -y ca-certificates curl gnupg lsb-release

# Adicionar repositório oficial Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verificar
docker --version && docker compose version

# Opcional: rodar Docker sem sudo
sudo usermod -aG docker $USER && newgrp docker
```

---

## 2. Instalar dependências de script

```bash
# FFmpeg (para gravação e thumbnail)
sudo apt install -y ffmpeg

# AWS CLI (para upload ao R2)
sudo apt install -y awscli

# Verificar
ffmpeg -version | head -1
aws --version
```

---

## 3. Clonar e configurar o servidor

```bash
# Clonar o repositório (ou apenas copiar a pasta infra/tv-media-server)
git clone https://github.com/sua-org/snuggle-db-hub.git
cd snuggle-db-hub/infra/tv-media-server

# Criar .env a partir do exemplo
cp .env.example .env
nano .env   # preencher com valores reais
```

### Variáveis obrigatórias no `.env`:

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase de teste |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (não expor!) |
| `MEDIAMTX_WEBHOOK_SECRET` | Segredo compartilhado MediaMTX ↔ Edge Functions |
| `R2_ACCOUNT_ID` | ID da conta Cloudflare |
| `R2_ACCESS_KEY_ID` | Chave de acesso R2 |
| `R2_SECRET_ACCESS_KEY` | Chave secreta R2 |
| `R2_BUCKET_TV` | Nome do bucket para gravações |
| `R2_PUBLIC_URL` | URL pública do R2 ou domínio customizado |
| `MEDIA_SERVER_HOST` | Domínio do servidor (ex: media-test.ecclesia.com.br) |

---

## 4. Liberar portas no firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP (Let's Encrypt + redirect)
sudo ufw allow 443/tcp     # HTTPS (HLS público)
sudo ufw allow 1935/tcp    # RTMP (OBS)
sudo ufw allow 8554/tcp    # RTSP (opcional)
sudo ufw allow 8889/tcp    # WebRTC (opcional)
sudo ufw enable

# Verificar
sudo ufw status
```

---

## 5. Configurar SSL com Let's Encrypt

```bash
# Instalar Certbot
sudo apt install -y certbot

# Gerar certificado (antes de subir o Nginx)
sudo certbot certonly --standalone \
  -d media-test.ecclesia.com.br \
  --email ti@ecclesia.com.br \
  --agree-tos --non-interactive

# Copiar certificados para o diretório do projeto
sudo mkdir -p ssl
sudo cp /etc/letsencrypt/live/media-test.ecclesia.com.br/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/media-test.ecclesia.com.br/privkey.pem ssl/
sudo chmod 644 ssl/*.pem

# Renovação automática
sudo crontab -e
# Adicionar:
# 0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/media-test.ecclesia.com.br/*.pem /caminho/ssl/
```

---

## 6. Subir o servidor

```bash
# Copiar nginx.conf.example como config real e ajustar domínio
cp nginx.conf.example nginx.conf
# Editar nginx.conf e substituir media-test.ecclesia.com.br pelo domínio real

# Tornar scripts executáveis
chmod +x scripts/*.sh

# Subir todos os serviços
docker compose up -d

# Verificar status
docker compose ps
docker compose logs -f mediamtx
```

---

## 7. Testar RTMP (sem OBS)

```bash
# Instalar ffmpeg localmente ou usar outro servidor
# Simular transmissão RTMP por 30 segundos
ffmpeg -re \
  -f lavfi -i "testsrc=size=1280x720:rate=30" \
  -f lavfi -i "sine=frequency=1000:sample_rate=44100" \
  -c:v libx264 -preset veryfast -b:v 2000k -maxrate 2500k -bufsize 5000k \
  -c:a aac -b:a 128k \
  -f flv "rtmp://media-test.ecclesia.com.br/live/STREAM_KEY_AQUI" \
  -t 30

# Deve aparecer nos logs do MediaMTX:
# INF [RTMP] [conn ...] is publishing to path 'live/STREAM_KEY_AQUI'
```

---

## 8. Testar HLS

```bash
# Enquanto o ffmpeg está transmitindo (passo anterior):

# Verificar que o HLS foi criado
curl -I https://media-test.ecclesia.com.br/hls/live/STREAM_KEY_AQUI/index.m3u8
# Deve retornar: HTTP/2 200

# Testar com ffplay
ffplay "https://media-test.ecclesia.com.br/hls/live/STREAM_KEY_AQUI/index.m3u8"
```

---

## 9. Configurar OBS

No OBS Studio:

1. **Configurações → Stream**
   - Serviço: **Personalizado**
   - Servidor: `rtmp://media-test.ecclesia.com.br/live`
   - Chave de transmissão: (gerar no painel TV Digital do Ecclesia)

2. **Configurações → Saída → Streaming**
   - Encoder: `x264` ou `NVENC H.264` (se GPU disponível)
   - Taxa de bits: `2500 Kbps` (recomendado)
   - Keyframe: `2 segundos`
   - Preset: `veryfast`

3. **Configurações → Vídeo**
   - Resolução base: `1280x720`
   - FPS: `30`

4. Clicar em **Iniciar transmissão**. O painel TV Digital deve mostrar o status mudando para **AO VIVO**.

---

## 10. Validar stream_key

A validação é automática via hook `on_publish.sh` → Edge Function `validate-tv-stream-key`.

Para testar manualmente:

```bash
# Gerar hash SHA-256 de uma chave
echo -n "ecclesia_abc123" | sha256sum

# Chamar a Edge Function diretamente
curl -X POST \
  "https://SEU_PROJETO.supabase.co/functions/v1/validate-tv-stream-key" \
  -H "Content-Type: application/json" \
  -H "x-mediamtx-secret: SEU_MEDIAMTX_WEBHOOK_SECRET" \
  -d '{"stream_key": "ecclesia_abc123", "source_type": "obs"}'

# Resposta esperada (chave válida):
# {"valid": true, "session_id": "uuid-...", "hls_url": "..."}
```

---

## 11. Testar gravação

```bash
# Transmitir por 60 segundos via ffmpeg (passo 7)
# Aguardar a gravação no diretório /recordings

# Verificar arquivos gravados
docker exec ecclesia-mediamtx ls -lh /recordings/live/STREAM_KEY_AQUI/

# Após encerrar a transmissão, o record_stream.sh processa automaticamente
# Acompanhar o log:
tail -f /tmp/ecclesia/record_SESSION_ID.log
```

---

## 12. Testar upload R2

```bash
# Testar credenciais R2 manualmente
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
AWS_DEFAULT_REGION="auto" \
aws s3 ls "s3://ecclesia-tv-recordings" \
  --endpoint-url "https://SEU_R2_ACCOUNT_ID.r2.cloudflarestorage.com"

# Upload de arquivo de teste
echo "teste" > /tmp/test.txt
bash scripts/upload_to_r2.sh /tmp/test.txt ecclesia-tv-recordings test/test.txt text/plain
```

---

## 13. Testar TV → Canal (auto-publish)

1. No painel Ecclesia, habilitar **"Publicar automaticamente no Canal"** nas configurações do canal de TV.
2. Selecionar o canal do Canal Ecclesia padrão.
3. Realizar uma transmissão.
4. Após upload da gravação (`recording_status = uploaded`), verificar se o vídeo apareceu no Canal Ecclesia.
5. Ou usar o botão **"Publicar no Canal"** manualmente no painel `/admin/tv/ao-vivo`.

---

## 14. Testar heartbeat

```bash
# Ver sessões live ativas
curl -s \
  "https://SEU_PROJETO.supabase.co/rest/v1/tv_live_sessions?status_transmissao=eq.live&select=id,last_heartbeat_at" \
  -H "apikey: SEU_ANON_KEY" | jq .

# Chamar heartbeat manualmente
curl -X POST \
  "https://SEU_PROJETO.supabase.co/functions/v1/update-tv-heartbeat" \
  -H "Content-Type: application/json" \
  -H "x-mediamtx-secret: SEU_MEDIAMTX_WEBHOOK_SECRET" \
  -d '{"session_id": "SESSION_UUID_AQUI"}'

# Testar detecção de sessões stale (parar transmissão e aguardar 2 minutos)
curl -X GET \
  "https://SEU_PROJETO.supabase.co/functions/v1/check-stale-sessions" \
  -H "Authorization: Bearer SEU_SERVICE_ROLE_KEY"
```

---

## 15. Testar viewer count

O viewer count é atualizado automaticamente pelo hook `useTvViewer` no frontend.  
Para verificar:

```bash
# Ver viewer_count e peak_viewer_count
curl -s \
  "https://SEU_PROJETO.supabase.co/rest/v1/tv_live_sessions?status_transmissao=eq.live&select=id,viewer_count,peak_viewer_count" \
  -H "apikey: SEU_ANON_KEY" | jq .
```

---

## Portas e serviços

| Porta | Protocolo | Serviço | Descrição |
|---|---|---|---|
| 80 | TCP | Nginx | HTTP → HTTPS redirect + Let's Encrypt |
| 443 | TCP | Nginx | HTTPS: serve HLS público |
| 1935 | TCP | MediaMTX | RTMP ingest (OBS, celular, ffmpeg) |
| 8554 | TCP | MediaMTX | RTSP (opcional) |
| 8888 | TCP | MediaMTX | HLS interno (acessado via Nginx) |
| 8889 | TCP | MediaMTX | WebRTC (preview) |
| 9997 | TCP | MediaMTX | API interna (health, status) |

---

## Configurar Cloudflare R2

1. Acessar [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage**
2. Criar bucket `ecclesia-tv-recordings` (região: Automatic)
3. Criar bucket `ecclesia-canal-videos` (região: Automatic)
4. **R2 → Manage R2 API Tokens** → Criar token com permissão `Edit` em ambos os buckets
5. Salvar `Access Key ID` e `Secret Access Key` no `.env`
6. (Opcional) Configurar domínio customizado em **Settings → Custom Domains** do bucket
7. Ativar **Public Access** se os vídeos precisarem ser acessíveis diretamente

---

## Pendências externas

| Item | Descrição |
|---|---|
| VPS | Contratar servidor Ubuntu 24.04 (DigitalOcean, Contabo, etc.) |
| Domínio | Apontar `media-test.ecclesia.com.br` para o IP da VPS |
| Certificado SSL | Gerar via Let's Encrypt (passo 5) |
| Cloudflare R2 | Criar buckets e API tokens (passo acima) |
| Supabase pg_cron | Habilitar extensão em Dashboard → Extensions |
| Supabase Secrets | Configurar `MEDIAMTX_WEBHOOK_SECRET`, `R2_*` nas Edge Functions |

---

## Riscos

| Risco | Mitigação |
|---|---|
| Stream key exposta nos logs | Os scripts nunca logam a key completa, apenas os últimos 4 caracteres |
| VPS com disco cheio por gravações | Configurar `recordDeleteAfter` no MediaMTX e monitorar disco |
| RTMP sem TLS | Aceitar risco em testes; usar RTMPS em produção com cert válido |
| Service role key nos scripts | Usar `.env` fora do repositório e nunca commitar |
| R2 sem CORS configurado | Configurar CORS no bucket R2 para o domínio do frontend |

---

*Gerado automaticamente pelo Ecclesia DevAgent — ambiente de TESTE*
