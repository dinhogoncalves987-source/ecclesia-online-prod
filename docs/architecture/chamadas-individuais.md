# Chamadas individuais do Chat Eclésia

## Contrato do produto

- Telefone em conversa direta: ligação individual de voz.
- Câmera em conversa direta: videochamada individual.
- `Nova reunião` / `Entrar na reunião`: reunião em grupo, isolada das chamadas individuais.
- Nenhum botão individual abre Jitsi ou uma sala de reunião.
- A mídia individual usa WebRTC e não é gravada no Supabase. O banco mantém somente estado auditável e sinalização efêmera.

## Infraestrutura própria obrigatória

Para funcionar de forma confiável entre 4G/5G, Wi-Fi corporativo e operadoras com NAT restritivo, produção e staging precisam de um relay Coturn próprio. O código de release exige credenciais do relay e usa `iceTransportPolicy: relay` por padrão. A aplicação não declara a chamada pronta usando apenas uma conexão direta ocasional.

Configuração esperada no Coturn:

- `use-auth-secret`
- `static-auth-secret` com valor forte e exclusivo por ambiente
- realm pertencente à Eclésia
- listener UDP/TCP 3478
- listener TLS 5349 com certificado válido
- faixa UDP de relay liberada no firewall

Segredos da Edge Function `get-internal-call-ice`:

- `TURN_URLS`: lista separada por vírgula, por exemplo com endpoints `turn:` e `turns:` do relay próprio
- `TURN_SHARED_SECRET`: exatamente o mesmo `static-auth-secret` do Coturn
- `TURN_FORCE_RELAY=true`: torna obrigatório o relay próprio
- `TURN_CREDENTIAL_TTL_SECONDS=600`: credencial curta, limitada entre 5 e 30 minutos
- `TURN_ALLOWED_ORIGINS`: origens web autorizadas daquele ambiente

A Edge Function só entrega credenciais temporárias quando o usuário é participante
de uma chamada ativa em `internal_calls`. O segredo compartilhado nunca vai para o
navegador. As respostas não podem ser armazenadas em cache.

O pacote instalável e o procedimento operacional estão em `infra/coturn`.

## Notificação de chamada

Com o app aberto, a chamada chega por Supabase Realtime. Com o app fechado ou em segundo plano, `send-chat-push` usa as inscrições Web Push existentes e acorda o destinatário. É necessário manter os segredos VAPID já usados pelo chat e o usuário precisa ter autorizado notificações.

## Homologação mínima antes de produção

1. Aplicar a migration `20260803170000_internal_calls_foundation.sql` no staging.
2. Publicar `get-internal-call-ice` e a versão atualizada de `send-chat-push`.
3. Configurar o Coturn e os dois segredos somente no staging.
   Também configurar origem permitida, TTL e `TURN_FORCE_RELAY=true`.
4. Testar voz e vídeo entre dois usuários reais de teste, um em Wi-Fi e outro em 4G/5G.
5. Confirmar atender, recusar, cancelar, encerrar, microfone, câmera frontal/traseira e chamada não atendida.
6. Repetir com o aplicativo do destinatário em primeiro plano, em segundo plano e fechado.
7. Confirmar no banco que apenas os participantes leem a chamada e que os sinais são removidos ao encerrar.
8. Confirmar via WebRTC stats que o candidato selecionado tem tipo `relay`.
9. Repetir o mesmo roteiro em produção somente depois de promover código, migrations, Edge Functions e configuração equivalente.

Não considerar a chamada homologada apenas porque dois dispositivos conectaram na mesma rede Wi-Fi.
