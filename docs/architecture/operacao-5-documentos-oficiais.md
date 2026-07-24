# Operação 5 — Documentos Oficiais da Secretaria

## Escopo

Esta operação acrescenta ao cockpit moderno:

- Carta de Transferência interna ou externa;
- certificados de Apresentação de Criança, Batismo em Águas, Casamento e reconhecimento Ministerial;
- certificados de Curso/Discipulado e Formação Teológica;
- numeração oficial por organização, tipo e ano;
- PDF A4, impressão, compartilhamento e validação pública por QR permanente.

As telas administrativas ficam dentro da **Secretaria**. A operação permanece
`staging-only` até a homologação funcional e de segurança.

## Reutilização obrigatória

Não foi criado cadastro paralelo:

- a pessoa continua sendo `public.members`;
- dependentes/crianças vêm de `public.member_family`;
- transferências continuam em `public.member_transfers`;
- o arquivo institucional continua em `public.documents`;
- conclusões vêm de `discipleship_enrollments` e `theology_enrollments`;
- acontecimentos são registrados em `public.member_history`;
- identidade visual vem de `public.organizations.logo_url` e demais campos
  institucionais.

O QR usa a mesma renderização já adotada pela Carteira de Membro, mas não usa
seu token efêmero de cinco minutos. Cada documento recebe um UUID permanente,
pois precisa continuar verificável depois de impresso.

## Banco e segurança

Migrations:

- `20260801090000_official_transfer_letters.sql`;
- `20260801100000_institutional_certificates.sql`.

As escritas críticas são RPCs `SECURITY DEFINER` com verificação de
capabilities. `official_document_counters` não é acessível ao cliente. A tabela
de certificados tem RLS, leitura escopada e não concede INSERT/UPDATE/DELETE
diretos ao papel autenticado.

As funções públicas de QR retornam somente os dados necessários para verificar
autenticidade e situação (`válido`, `cancelado` ou `revogado`), sem CPF,
telefone, endereço pessoal ou observações internas.

## Fluxos

### Carta de Transferência

1. secretaria seleciona uma pessoa existente;
2. informa destino interno ou igreja externa;
3. registra a solicitação;
4. aprova ou rejeita;
5. ao emitir, o banco gera número, token e registro em `documents`;
6. cancelamento posterior preserva o documento e faz o QR mostrar a situação
   real.

### Certificado

1. cria-se um rascunho;
2. a secretaria revisa conteúdo, data, local e assinaturas;
3. a emissão gera número, token e documento;
4. cursos só aparecem quando a matrícula está concluída e ainda não foi
   certificada;
5. a emissão acadêmica marca a matrícula correspondente no Discipulado ou
   Teologia;
6. revogação preserva o registro e mantém a validação pública transparente.

## Identidade visual

Existe um único desenho A4 paisagem. O tipo selecionado muda título, texto,
destinatário e dados acadêmicos. O logo principal configurado pela organização
é usado no cabeçalho e, com baixa opacidade, como marca d’água. Nenhum logo de
igreja é gravado ou fixado no código do modelo.

## Fora desta entrega

- nenhuma migration é aplicada por este patch;
- nenhum deploy ou promoção para produção;
- assinatura criptográfica ICP-Brasil;
- importação automática de documentos WinTechi.
