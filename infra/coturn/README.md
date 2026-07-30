# Relay próprio de chamadas Eclésia

Este diretório instala um Coturn soberano para as chamadas individuais do
Chat Eclésia. Ele não usa Meta, Google STUN, Jitsi ou outro relay de terceiros.

## Topologia recomendada

Cada ambiente deve ter instância, domínio e segredo próprios:

| Ambiente | Realm sugerido | Portas de controle | Relay UDP |
|---|---|---|---|
| staging | `turn-staging.ecclesiabr.online` | 3479 UDP/TCP, 5350 TCP/TLS | 49160–49259 |
| produção | `turn.ecclesiabr.online` | 3478 UDP/TCP, 5349 TCP/TLS | 49300–49499 |

Os dois ambientes podem residir na mesma VPS apenas se cada instância usar
portas e faixa de relay diferentes. O caminho mais simples e mais seguro é
homologar staging primeiro e criar a instância de produção a partir do mesmo
diretório em outro caminho.

## Requisitos do servidor

- Debian/Ubuntu com Docker Compose;
- IPv4 público fixo;
- DNS `A` do realm apontando diretamente para a VPS, sem proxy HTTP;
- certificado Let's Encrypt válido;
- firewall liberando 3478 UDP/TCP, 5349 TCP e toda a faixa UDP de relay;
- `turn.env` com permissão 600, fora do Git.

O container usa a imagem oficial imutável `coturn/coturn:4.14.0-r0`, rede do
host, filesystem somente leitura, capabilities mínimas e bloqueio de peers em
redes privadas.

## Preparação operacional

1. Copiar este diretório para a VPS.
2. Copiar `turn.env.example` para `turn.env`.
3. Gerar `TURN_SHARED_SECRET` no próprio servidor:
   `openssl rand -base64 48 | tr '+/' '-_' | tr -d '='`.
4. Preencher domínio, IPv4, portas, faixa e caminhos do certificado.
5. Executar `chmod 600 turn.env`.
6. Executar `sudo ./deploy.sh`.

`deploy.sh` renderiza, valida, baixa a imagem fixada, sobe o serviço e executa
o health-check. Os scripts não imprimem o segredo.

## Segredos correspondentes no Supabase

Na Edge Function do mesmo ambiente:

- `TURN_URLS`: deve incluir UDP, TCP e TLS do realm;
- `TURN_SHARED_SECRET`: exatamente o segredo da instância;
- `TURN_FORCE_RELAY=true`;
- `TURN_CREDENTIAL_TTL_SECONDS=600`;
- `TURN_ALLOWED_ORIGINS`: origens web do ambiente separadas por vírgula.

Exemplo de formato de `TURN_URLS`:

`turn:turn.example:3478?transport=udp,turn:turn.example:3478?transport=tcp,turns:turn.example:5349?transport=tcp`

Nunca reutilize o segredo de staging em produção.

Valores esperados no projeto atual:

| Ambiente | `TURN_ALLOWED_ORIGINS` | `TURN_URLS` |
|---|---|---|
| staging | `https://ecclesia-teste.vercel.app` | `turn:turn-staging.ecclesiabr.online:3479?transport=udp,turn:turn-staging.ecclesiabr.online:3479?transport=tcp,turns:turn-staging.ecclesiabr.online:5350?transport=tcp` |
| produção | `https://ecclesiabr.online,https://www.ecclesiabr.online` | `turn:turn.ecclesiabr.online:3478?transport=udp,turn:turn.ecclesiabr.online:3478?transport=tcp,turns:turn.ecclesiabr.online:5349?transport=tcp` |

## Renovação de certificado

Após o Certbot renovar os arquivos montados em `/etc/letsencrypt`, reinicie
somente o container Coturn e execute `verify-service.sh`. A renovação não exige
alterar o segredo compartilhado.

## Rotação do segredo

1. Gerar um novo valor no servidor.
2. Atualizar `turn.env` e renderizar.
3. Atualizar `TURN_SHARED_SECRET` na Edge Function do mesmo ambiente.
4. Reiniciar Coturn e republicar/reiniciar a Edge Function.
5. Testar nova chamada entre Wi-Fi e 4G/5G.

Chamadas iniciadas com credenciais antigas podem cair durante a rotação; faça
a operação em janela curta de manutenção.
