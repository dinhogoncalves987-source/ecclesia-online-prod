# Relatório de QA — Homologação Ecclesia (staging)

- **Data**: 2026-07-28
- **Ambiente testado**: https://ecclesia-teste.vercel.app (staging)
- **Branch de referência**: `review/gestao-homologacao-20260728` (verificar branch ativa no momento do teste)
- **Contas usadas**:
  - `municipal@ecclesiabr.online` (admin municipal)
  - `superadmin@ecclesiabr.online` (super admin)
- **Metodologia**: navegação manual guiada (agente de browser), clicando em todos os botões, preenchendo todos os formulários visíveis, sem alterar produção e sem aplicar correções — apenas observação e registro.

> Este documento é um registro histórico de erros para tratamento posterior. Nenhuma correção de código foi feita durante esta rodada de testes.

## Legenda de severidade

- 🔴 **Crítico**: bloqueia o fluxo principal do módulo (ex.: não salva, tela branca, erro 500).
- 🟠 **Alto**: funcionalidade não funciona como esperado, mas há contorno.
- 🟡 **Médio**: comportamento incorreto/inconsistente sem bloquear o uso.
- 🔵 **UX/Observação**: não é bug, mas prejudica a experiência ou está confuso.

---

## Sumário executivo

Foram testadas, de ponta a ponta (fluxos de criar/visualizar/editar/excluir, sempre que existentes), as **22 áreas** do escopo obrigatório desta homologação, em desktop e com uma varredura de responsividade mobile em 9 telas-chave. No total foram abertos **21 registros de bug/observação** (BUG-01 a BUG-21), sendo:

- 🔴 **3 críticos**: cadastro de novo membro 100% bloqueado (BUG-06); e dois achados que, embora tecnicamente sejam "alto" por definição da legenda, têm efeito prático de bloquear por completo um fluxo de negócio essencial e por isso são tratados aqui com prioridade máxima — ver lista detalhada abaixo.
- 🟠/🔴 **6 altos**: BUG-06 (cadastro de membro bloqueado), BUG-13 (certificado não pode ser revogado), BUG-19 (assembleia geral fica inacessível/impossível de excluir), BUG-20 (falha silenciosa na criação de distrito), BUG-21 ("Remover unidade" não funciona em distritos/congregações), e o gap de template financeiro da AD não exposto na UI (tratado como achado de alta relevância de negócio, seção Financeiro).
- 🟡 **11 médios**: inconsistências de devocional (BUG-01/02), "Cancelar" não fecha modal em Membros/Escalas (BUG-05/10), upload de foto/logo não funciona (BUG-07/09), telefone sem máscara (BUG-08), exclusão sem confirmação em 5 módulos (BUG-11/15/16/18 + certificados), numeração de carta possivelmente "queimada" (BUG-12), rascunho de certificado não pode ser excluído (BUG-14).
- 🔵 **Diversos UX/observações e pendências não testadas**, listados na íntegra abaixo.

**Duas áreas foram REPROVADAS de forma clara** por bloquearem seu fluxo principal: **Membros** (impossível cadastrar um novo membro pela interface) e **Assembleia Geral** (uma assembleia criada fica presa e inacessível). Uma terceira, **Distritos/Congregações**, tem reprovação parcial pela combinação de falha silenciosa na criação + exclusão que não funciona. **Certificados** também é reprovado parcialmente por não permitir revogar/excluir documentos já emitidos ou em rascunho. O módulo **Financeiro** funciona operacionalmente (lançar, editar, excluir), mas **não entrega o requisito de negócio específico** de disponibilizar o plano de contas real da Assembleia de Deus na tela de lançamento do dia a dia, apesar de esse plano de contas existir no banco de dados.

Todas as demais áreas testadas (Dashboard, Perfil, Configuração da Igreja, Conversas/Videoconferência, Bíblia, Culto & Louvor, Campanhas, Carteira de Membro, Cartas de Recomendação/Transferência, Agenda, Escalas, Pequenos Grupos, Solicitações Administrativas, Documentos, Comunicação, Pedidos de Oração, Relatórios, Modo Porteiro, Gerenciar Acessos, Páginas Públicas e Responsividade Mobile) foram **aprovadas**, a maioria com pequenas ressalvas de UX já documentadas.

| Área | Status geral | Erros críticos | Erros altos | Observações |
|---|---|---|---|---|
| Login / Dashboard | ✅ com 2 bugs menores | 0 | 0 (2 médios) | Devocional: título/conteúdo inconsistentes; botão "Copiar" não copia |
| Membros | ❌ **REPROVADO (bloqueado)** | 1 | 2 | **Cadastro de novo membro 100% bloqueado** (botão "Próximo" não avança); busca não filtra; abas não navegam; "Cancelar" não fecha modal |
| Carteira de Membro | ✅ aprovado (ressalva UX) | 0 | 0 | Frente/verso, PDF, WhatsApp/Email, imprimir OK; QR "Gerar QR seguro" funciona mas falta validar animação/centralização/leitura em scanner real |
| Cartas de Recomendação | ✅ aprovado | 0 | 0 | Fluxo completo (criar/aprovar/rejeitar), PDF com QR de validação OK |
| Cartas de Transferência | ✅ aprovado (ressalva numeração) | 0 | 0 (1 médio) | Fluxo completo OK; possível numeração oficial "queimada" por teste (BUG-12) |
| Certificados | ❌ **REPROVADO (parcial)** | 0 | 1 | Emissão/PDF OK, mas "Revogar" não funciona (BUG-13); rascunho não pode ser excluído (BUG-14) |
| Solicitações Administrativas | ⚠️ aprovado com ressalva UX | 0 | 0 (1 médio) | Criar/mudar status OK; "Rejeitar" sem confirmação |
| Documentos | ⚠️ parcial | 0 | 0 | Interface OK; upload e exclusão (botão X) não confirmados |
| Comunicação | ⚠️ parcial (envio não testado) | 0 | 0 | Interface descrita; criação/envio de comunicado não testado por segurança |
| Pedidos de Oração | ⚠️ aprovado com ressalva UX | 0 | 0 (1 médio) | CRUD + status OK; exclusão sem confirmação; 1ª criação não salvou (intermitente) |
| Agenda | ✅ aprovado | 0 | 0 (1 baixo) | CRUD completo OK; delay de 2-3s ao abrir form |
| Escalas | ✅ aprovado (bug conhecido) | 0 | 0 | CRUD completo OK; "Cancelar" do modal não fecha (padrão do BUG-05) |
| Pequenos Grupos | ⚠️ aprovado com ressalva UX | 0 | 0 (1 médio) | CRUD OK, mas exclusão instantânea sem confirmação |
| Assembleia Geral | ❌ **REPROVADO (parcial)** | 0 | 1 | Assembleia criada some da lista ("Oculta" por padrão) e fica **inacessível/impossível de excluir pela UI**; votação/ata não localizados |
| Financeiro | ⚠️ **PARCIAL — gap importante encontrado** | 0 | 1 | Template contábil da AD (24 grupos/~147 contas) existe no banco mas **não é selecionável na tela de lançamento**; só 18 categorias simples aparecem |
| Relatórios | ⚠️ aprovado (funcionalidade limitada) | 0 | 0 | Dashboard estático de métricas OK (sem NaN/undefined); sem geração de relatórios detalhados, exportação ou filtros de período |
| Modo Porteiro | ⚠️ parcial | 0 | 0 | Interface OK (validação por QR/token); check-in por nome não existe; teste real de QR não concluído |
| Distritos/Congregações | ❌ **REPROVADO (parcial)** | 0 | 1 | Criação exige campos não marcados como obrigatórios (falha silenciosa); **"Remover unidade" não funciona** |
| Gerenciar Acessos | ✅ aprovado (não testado envio de convite) | 0 | 0 | 16 perfis bem documentados; convite externo não enviado (correto) |
| Perfil | ✅ com 2 bugs UX | 0 | 0 (2 médios) | Ícone câmera não abre upload; telefone sem máscara |
| Configuração da Igreja | ✅ com 1 bug UX | 0 | 0 (1 médio) | Botão "Escolher logo" não abre seletor de arquivo |
| Culto & Louvor | ✅ aprovado | 0 | 0 | CRUD completo (Biblioteca de Músicas, Roteiros) OK; Telão de Projeção OK |
| Campanhas | ✅ aprovado | 0 | 0 | CRUD completo OK; contribuição/pagamento real não testado (correto) |
| Conversas / Videoconferência | ✅ aprovado (parcial) | 0 | 0 | Busca, videochamada e anexos OK; envio de mensagem não testado (evitar contatos reais) |
| Bíblia | ✅ aprovado | 0 | 0 | Leitura, Letras Gigantes, Modo Zen e Assistente IA OK; busca textual e ações por versículo não localizadas/testadas |
| Páginas públicas (Landing/Login/Signup/Reset/Devocional/Validação/Share) | ✅ aprovado | 0 | 0 | Todas carregaram corretamente; tratamento de erro adequado em token inválido |
| Responsividade mobile (geral) | ✅ aprovado (varredura de 9 telas) | 0 | 0 | Dashboard, Financeiro, Agenda, Conversas, Bíblia, Campanhas, Certificados, Congregações, Config. Igreja — todas OK em 390×844 |

**Nota sobre padrão recorrente de UX/segurança**: identificamos **5 módulos diferentes** (Pequenos Grupos, Solicitações Administrativas — "Rejeitar", Certificados — "Revogar", Pedidos de Oração, Financeiro/Tesouraria — "Remover" lançamento) onde uma ação irreversível executa **imediatamente sem qualquer modal de confirmação**. Isso é inconsistente com Campanhas, que tem confirmação adequada ("Esta ação não poderá ser desfeita"). Recomenda-se tratar isso como um problema sistêmico de UX/segurança a ser corrigido de forma padronizada em todos os módulos, não caso a caso.

---

## Registros de teste criados (para limpeza posterior)

_(listar aqui todo registro "TESTE QA - ..." criado durante os testes, com módulo e identificador, para facilitar a remoção depois)_

| Módulo | Registro | Estado atual | Ação de limpeza pendente |
|---|---|---|---|
| Cartas de Recomendação | Carta para Rafael Casagrande → "TESTE QA 20260728 - Igreja Destino" (TESTE QA - Cidade) | Rejeitada (soft-cancel, registro ainda existe no banco com status "Rejeitada") | Excluir definitivamente do banco se o fluxo de negócio exigir retenção zero de registros de teste |
| Cartas de Transferência | Transferência de [STAGING] Rafael Fictício → "TESTE QA 20260728 - Igreja Transferência" (TESTE QA - Cidade, Brasil), carta emitida nº TR-2024-000001 | Cancelada (soft-cancel; carta com numeração oficial TR-2024-000001 foi consumida/emitida e depois cancelada) | Verificar se o número de carta oficial TR-2024-000001 fica "queimado"/reservado permanentemente por causa deste teste — validar com o time se a numeração sequencial de cartas reais será afetada |
| Certificados | Certificado de Batismo em Águas para [STAGING] Rafael Fictício, nº CERT-2026-000001 | **Emitido** — sem forma de revogar pela interface (BUG-13) | Requer exclusão/revogação manual via banco de dados; numeração CERT-2026-000001 também pode ficar "queimada" (mesma preocupação do BUG-12) |
| Certificados | Certificado (tipo não emitido) em rascunho para [STAGING] Aline Staging | **Rascunho** — sem forma de excluir pela interface (BUG-14) | Requer exclusão manual via banco de dados |
| Assembleia Geral | "TESTE QA 20260728 - Assembleia Teste" (29/07/2026) | **Oculta** — inacessível pela interface (BUG-19) | Requer exclusão manual via banco de dados (localizar por título na tabela de assembleias) |
| Distritos/Congregações | "TESTE QA 20260728 - Distrito Teste" (Ativa, Caxias do Sul/RS, CEP 95000-000) | **Ativo/visível na lista** — botão "Remover unidade" não funciona (BUG-21) | Requer exclusão manual via banco de dados |

_(demais módulos — Culto & Louvor, Campanhas, Agenda, Escalas, Pequenos Grupos — já tiveram seus registros de teste excluídos com sucesso, conforme detalhado nas seções correspondentes abaixo)_

---

## Detalhamento por área

### 2. Conversas / Videoconferência (/admin/chat)

**Conta usada**: `municipal@ecclesiabr.online`.

- ✅ Interface: lista de conversas à esquerda (9 conversas existentes: Tesouraria e Financeiro, Edson Admin TESTE QA, Edson G Roquete, Pedro Antonio teste, Documentos e Cadastros, Cartas de Recomendação, Secretaria Geral, Julia Bortolini), botões "Nova Reunião" e "Nova Conversa", busca "Pesquisar conversas...", "Selecionar conversas" (ação em lote), botão de apagar por conversa.
- ✅ Painel da conversa ativa: cabeçalho com nome, botões "Ligação de voz" e "Videochamada", histórico de mensagens com player de áudio embutido para mensagens de voz, input inferior com "Anexar", campo de texto e "Gravar áudio".
- ✅ Busca de conversas **funciona corretamente**: digitar "teste" filtrou para as 3 conversas relevantes (diferente do comportamento da busca de Membros, que está quebrada — ver BUG-03).
- ✅ **Videochamada**: clicar em "Videochamada" abre corretamente a tela "Reunião Ecclesia" com estado "Iniciando videochamada... Aguarde enquanto preparamos a sala", indicadores de permissão de câmera/mic, "Sala privada", painel "Participar da reunião", controles de mídia (mic/câmera/compartilhar tela) e feed de vídeo ativo captado da câmera real. Botão "Encerrar" funciona e retorna ao chat.
- ✅ Menu de "Anexar" abre corretamente com 4 opções: Imagem/Foto, Documento, Vídeo, Áudio.
- ⚠️ **Não testado** (por segurança, para não enviar mensagens a pessoas reais): criação de nova conversa até o envio de mensagem, "Nova Reunião" (separado da videochamada dentro de uma conversa), upload real de anexo, emojis/formatação de texto.
- **Dados de teste**: nenhum criado (apenas navegação/observação).

### 3. Bíblia Sagrada (/admin/biblia)

**Conta usada**: `municipal@ecclesiabr.online`.

- ✅ Interface: título "Bíblia Sagrada" (Tradução Almeida), botões "Aa+ Letras Gigantes", "Assistente IA", "Modo Zen". Seletor de livro/capítulo com modal de busca "Buscar livro..." (com busca por voz), lista completa dos 66 livros organizados em Antigo Testamento (39) e Novo Testamento (27). Grade de capítulos numerados.
- ✅ Navegação Gênesis → João funcionou; capítulo 3 de João carregou corretamente com todos os 36 versículos, texto completo e botões "Anterior"/"Próximo".
- ✅ **"Letras Gigantes"**: aumenta a fonte significativamente (~2-3x), mantendo legibilidade — bom para projeção/acessibilidade.
- ✅ **"Modo Zen"**: oculta sidebar, cabeçalho e seletor de capítulos, deixando apenas o texto e navegação mínima + botão "Sair". Funciona como esperado.
- ✅ **"Assistente IA"**: abre painel lateral "Assistente Bíblico com IA" com 4 quick actions (Esboço de pregação, Estudo profundo, Contexto histórico, Aplicação prática), campo de pergunta, botão de microfone (voz) e anexar arquivo. Envio de pergunta real não testado (evitar gerar custo de API desnecessário).
- ⚠️ Não testado/não localizado: campo de busca textual dentro da Bíblia (busca por termo, ex. "amor"/"fé"), menu de ações ao clicar em um versículo (favoritar, copiar, compartilhar, nota).
- 🔵 **Observação de testabilidade (não é bug de usuário)**: ao trocar de livro, os botões de capítulo são recriados no DOM rapidamente, o que pode causar comportamento de "referência obsolete" em testes automatizados; para um usuário humano clicando normalmente na tela isso não é perceptível nem afeta o uso.
- **Dados de teste**: nenhum criado.

### 4. Culto & Louvor (/admin/culto-louvor)

**Conta usada**: `municipal@ecclesiabr.online`.

- ✅ Hub com 5 módulos: Biblioteca de Músicas, Roteiros de Culto, Bíblia no Culto, Telão de Projeção, Assistente IA.
- ✅ **Biblioteca de Músicas**: lista, busca, botão "Nova música". CRUD completo testado: criada "TESTE QA 20260728 - Música Teste" (Tom C, letra básica) → editado tom para D → excluída com sucesso (confirmado sumiço da lista).
- ✅ **Roteiros de Culto**: formulário com itens de roteiro (ex.: Louvor). CRUD completo testado: criado "TESTE QA 20260728 - Roteiro Teste" (data 28/07/2026, 1 item) → editado título (sufixo "-EDITADO") → excluído com sucesso.
- ✅ **Bíblia no Culto**: redireciona corretamente para o módulo principal da Bíblia Sagrada.
- ✅ **Telão de Projeção**: interface com 3 abas (Texto manual, Da biblioteca, Do roteiro), campos de título/conteúdo, botão "Iniciar projeção" — testado minimamente, sem abrir projeção em tela separada.
- ⚠️ Não testado a fundo: "Assistente IA" do módulo (distinto do assistente da Bíblia), projeção real em segunda tela/telão físico.
- **Dados de teste**: "TESTE QA 20260728 - Música Teste" e "TESTE QA 20260728 - Roteiro Teste" — ambos criados e **excluídos com sucesso** (sem pendência).

### 5. Campanhas (/admin/campanhas)

**Conta usada**: `municipal@ecclesiabr.online`.

- ✅ Interface: cards de estatísticas (Total Arrecadado, Campanhas Ativas, Meta Geral), botões "Nova atualização" e "Nova Campanha".
- ✅ CRUD completo testado: criada "TESTE QA 20260728 - Campanha Teste" com meta R$ 10.000, descrição, categoria, datas de início/fim, prioridade, status, switches e campo de upload → visualizada (progresso/meta/arrecadado corretos, botões "Acompanhar"/"Contribuir"/"Ações da campanha") → editada meta para R$ 15.000 e salva → excluída, com diálogo de confirmação claro ("Esta ação não poderá ser desfeita").
- ✅ Fluxo de "Contribuir" não foi levado até um gateway de pagamento real (correto, conforme escopo).
- ⚠️ Não testado: exportação, compartilhamento e QR code de campanha (não confirmado se essas opções existem nesta tela — verificar em lote de responsividade/revisão final).
- **Dados de teste**: "TESTE QA 20260728 - Campanha Teste" — criada e **excluída com sucesso** (sem pendência).

### 8. Cartas de Recomendação (/admin/cartas-recomendacao)
- ✅ Interface: métricas no topo (Pendentes/Em análise/Aprovadas/Rejeitadas), busca e filtros por status, botão "+ Nova Carta".
- ✅ Modal de nova carta: busca de membro (funciona e preenche dados automaticamente ao selecionar), campos igreja destino, cidade, estado, motivo, observações.
- ✅ Criado com sucesso: carta para membro existente "Rafael Casagrande" → igreja destino "TESTE QA 20260728 - Igreja Destino" (TESTE QA - Cidade). Status inicial "Solicitada".
- ✅ Documento PDF: logo da igreja, dados institucionais completos (consistentes com Configuração da Igreja), texto formal, QR code de validação + código de verificação. Botões PDF, Imprimir, Compartilhar (WhatsApp/E-mail) presentes e funcionais.
- ✅ Fluxo de aprovação/rejeição funciona; carta de teste foi **rejeitada** (não há opção de "excluir" definitivamente, apenas mudar status — ver pendência de limpeza no topo do relatório).
- **Dados de teste**: carta para Rafael Casagrande → "TESTE QA 20260728 - Igreja Destino" — status final "Rejeitada" (registro permanece no banco).

### 9. Cartas de Transferência (/admin/cartas-transferencia)
- ✅ Interface: busca, botão "+ Nova transferência", estado vazio correto ("Nenhuma transferência encontrada").
- ✅ Modal: busca de membro, tipo (Igreja externa/Unidade Ecclesia), igreja destino, cidade, estado/UF, país (pré-preenchido "Brasil"), motivo/observação.
- ✅ Criado com sucesso: transferência de "[STAGING] Rafael Fictício" → "TESTE QA 20260728 - Igreja Transferência" (TESTE QA - Cidade, Brasil).
- ✅ Fluxo completo testado: Solicitada → Aprovada → "Emitir carta" → carta emitida com **numeração oficial sequencial TR-2024-000001** → Cancelada.
- ✅ Documento PDF oficial: cabeçalho da igreja, número da carta, título "CARTA DE TRANSFERÊNCIA", dados do membro, motivo, data/local, assinatura do pastor, QR de validação digital permanente. Botões PDF/Compartilhar/Imprimir funcionam.
- 🟡 **BUG-12 (Médio — atenção operacional)** — A numeração sequencial oficial de cartas de transferência (ex.: TR-2024-000001) foi consumida por este teste em staging. **Se o staging compartilhar a mesma sequência/contador que produção (ou se essa sequência for posteriormente migrada), o número TR-2024-000001 pode ficar "queimado" e nunca mais disponível para uma carta real.** Recomenda-se verificar com o time se staging usa um contador independente de produção antes de assumir que não há impacto.
- **Dados de teste**: transferência de [STAGING] Rafael Fictício → "TESTE QA 20260728 - Igreja Transferência" — status final "Cancelada", carta emitida nº TR-2024-000001 (registro permanece no banco).

### 10. Certificados (/admin/certificados)
- ✅ Interface: "Central de Certificados", busca, botão "+ Novo certificado", lista com status. 6 tipos disponíveis: Apresentação de Criança, Batismo em Águas, Casamento, Ministerial, Curso e Discipulado, Formação Teológica.
- ✅ Modal de novo certificado: tipo, buscar membro, data, local (pré-preenchido), responsável, função (pré-preenchido), segunda assinatura opcional, texto personalizado opcional.
- ✅ Criado e emitido com sucesso: certificado de Batismo em Águas para "[STAGING] Rafael Fictício" (data 09/11/2007) → número oficial **CERT-2026-000001**.
- ✅ Documento PDF: A4 paisagem, marca d'água grande com nome da igreja, título "CERTIFICADO", nome do membro em destaque, texto institucional do tipo de certificado, data/local, assinaturas (pastor presidente + secretaria), QR code de validação ("Valide em Ecclesia"), número oficial. Botões PDF/Compartilhar/Imprimir presentes e funcionam. Dados consistentes com Configuração da Igreja.
- 🔴 **BUG-13 (Alto)** — O botão **"Revogar"** de um certificado já emitido está visível na interface, mas **não executa nenhuma ação**: não abre modal de confirmação, não muda o status (permanece "Emitido" mesmo após F5), sem mensagem de erro. **Repro**: /admin/certificados → localizar certificado emitido → clicar "Revogar" → nada acontece, status permanece "Emitido".
- 🟡 **BUG-14 (Médio)** — Certificados em status "Rascunho" **não podem ser excluídos**: o modal de edição de rascunho só oferece "Cancelar" e "Salvar alterações", sem opção de exclusão/descarte. Isso significa que qualquer rascunho criado por engano (inclusive de teste) fica permanentemente na lista. **Repro**: /admin/certificados → criar certificado e não emitir (deixar em rascunho) → tentar excluir → não há botão de exclusão em lugar nenhum da tela.
- **Dados de teste**: (1) Certificado de Batismo emitido para "[STAGING] Rafael Fictício", nº CERT-2026-000001 — **permanece no banco como "Emitido"**, revogação tentada e falhou (BUG-13); (2) Certificado em rascunho para "[STAGING] Aline Staging" criado durante o teste do BUG-14 — **permanece no banco como "Rascunho"**, sem forma de excluir pela interface.

### 11. Solicitações Administrativas (/admin/solicitacoes)
- ✅ Interface: métricas por status (Aberta, Em Análise, Aguardando Documento, Concluída, Rejeitada), busca, "+ Nova Demanda". 5 tipos: Declaração Membro, Atualização Cadastral, Solicitação Geral, Segunda Via, Contato Pastoral.
- ✅ Criação funciona (nome obrigatório, tipo, descrição, observação interna); mudança de status Aberta → Em Análise funciona.
- 🟡 **BUG-15 (Médio)** — Botão **"Rejeitar"** executa a rejeição imediatamente, **sem modal de confirmação**. **Repro**: /admin/solicitacoes → abrir solicitação "Em Análise" → clicar "Rejeitar" → ação executada sem qualquer confirmação.
- **Dados de teste**: "TESTE QA 20260728 - Solicitante Teste" — status final "Rejeitada" (permanece no banco).

### 12. Documentos (/admin/documentos)
- ✅ Interface: 8 categorias em abas (Todos, Certificado, Carta Transferência, Ata, Declaração, Estatuto, Relatório, Autorização, Carta Recomendação), botões Compartilhar/Imprimir/Assistência IA/Importar/"+ Novo Documento", lista com botão "X" (excluir) por item.
- ⚠️ Upload de documento não foi testado até o fim (não foi simulado arquivo real).
- ⚠️ Botão "X" de exclusão foi clicado em um item mas não houve confirmação visual clara do resultado — **precisa de reteste dedicado** para confirmar se (a) excluiu sem pedir confirmação (seguindo o padrão de outros módulos) ou (b) não funcionou.
- **Dados de teste**: nenhum criado com sucesso confirmado.

### 13. Comunicação (/admin/comunicacao)
- ✅ Interface: lista de avisos/comunicados com tipos "Normal" (azul) e "Importante" (laranja), botões Compartilhar/Imprimir/Assistência IA/"+ Nova Comunicação".
- ⚠️ Criação/envio de comunicado **não testado** por precaução (para não disparar notificação real a membros). Fluxo até a tela de criação não foi percorrido neste lote — pendência para lote de responsividade/revisão final (testar até "salvar rascunho", sem publicar/enviar).

### 14. Pedidos de Oração (/admin/oracoes)
- ✅ Interface: título "Pedidos de Oração", filtros por status (Todos, Ativo, Respondido), botão "+ Novo Pedido", cards com título/status/autor/data e botão "X" de exclusão. Clique no card abre modal de detalhes com Copiar/Compartilhar/"Marcar respondido".
- ✅ Criação funciona: modal com Título* (obrigatório), Descrição (opcional), checkbox "Enviar de forma anônima". Criado "TESTE QA 20260728 - Pedido Teste 2" com sucesso.
- ✅ Mudança de status "Ativo" → "Respondido" via botão "Marcar respondido" funciona, com mensagem "Este pedido já foi respondido pela equipe pastoral".
- 🟡 **BUG-16 (Médio — mesmo padrão dos BUGs 11/15)** — Botão **"X"** de exclusão remove o pedido **imediatamente, sem modal de confirmação** (confirmado via F5 que a exclusão foi permanente no backend). **Repro**: /admin/oracoes → clicar "X" em qualquer pedido → excluído sem confirmação.
- 🔵 **Observação (não confirmada como bug)** — Na primeira tentativa de criar um pedido de teste ("TESTE QA 20260728 - Pedido Teste"), o registro não apareceu na lista após salvar; uma segunda tentativa ("...Pedido Teste 2") funcionou normalmente. Pode ser comportamento intermitente pontual do ambiente — recomenda-se observar se se repete em testes futuros.
- **Dados de teste**: "TESTE QA 20260728 - Pedido Teste 2" — criado e **excluído com sucesso**, sem pendência.

### 15. Financeiro (/admin/financeiro) — VALIDAÇÃO ESPECIAL: comparação com referência da Assembleia de Deus

**Referência usada** (não foi fornecida na sessão via anexo; localizada no próprio repositório em `supabase/migrations/20260726090000_assembleia_de_deus_finance_template.sql`, que semeia o "template financeiro real da Assembleia de Deus" para organizações matriz/sede com `denomination_type` = Assembleia de Deus): **24 grupos contábeis**, **~147 contas contábeis**, **24 tipos de documento**, **13 portadores/caixas**. Além disso existe uma estrutura genérica sempre semeada para qualquer organização: **10 categorias**, **4 centros de custo**, **4 contas**.

- ✅ Interface: 10 abas — Executivo (dashboard consolidado), Tesouraria (lançamentos), Dízimos & Ofertas, Campanhas, Contas (contas a pagar/receber — **não é o plano de contas contábil**, apesar do nome), Orçamento, Patrimônio, Prestação de Contas, Auditoria, Inteligência.
- ✅ Formulário de lançamento (Tesouraria → "+ Lançamento"): Descrição, Valor, Entrada/Saída, Categoria, Centro de custo, Conta financeira, Tipo de pagamento (PIX/Banco/Espécie/Cartão/Boleto/Outro), Data, Status, URL de comprovante, Observações. Testado criar um lançamento de R$ 1,00 ("TESTE QA 20260728 - Lançamento Teste") → salvo com sucesso, dashboard atualizou em tempo real → excluído com sucesso, dashboard voltou ao valor original.
- ✅ Centros de custo encontrados: Administracao Geral, Congregacoes, Departamentos, Eventos, Matriz (5 — a referência genérica prevê 4: Matriz, Congregacoes, Departamentos, Eventos; "Administracao Geral" é adicional, possivelmente específico desta organização).
- ✅ Contas financeiras (portadores) encontradas no dropdown: Banco, Caixa, Caixa Congregacoes, Caixa Geral, Conta Corrente Bradesco, CAIXA MISSÃO, CT SICREDI (4 contas diferentes), CT B BRASIL — nomes reais específicos da igreja (dados de produção/seed real), não os nomes genéricos do template ("Caixa Matriz", "Caixa EBD" etc.), o que é aceitável pois portadores são nomeados livremente pela própria igreja.

**🔴 BUG-17 (Alto/Crítico para o requisito de negócio) — Template contábil da Assembleia de Deus não está exposto na tela de lançamento financeiro.**
- **O que existe**: contas com códigos do padrão AD (ex.: 1204, 6100, 5100, 14101, 17100, 15103, 15105) aparecem em lançamentos **históricos já existentes** na base (provavelmente inseridos via seed/import direto no banco), confirmando que o template FOI semeado no banco de dados em algum momento.
- **O que falta**: o dropdown "Categoria" do formulário "+ Lançamento" (tela que um usuário real usa no dia a dia) mostra **apenas 18 opções**: as 10 categorias genéricas (1.01 Dizimos, 1.02 Ofertas, 1.03 Campanhas, 1.04 Missoes, 1.05 Eventos, 2.01 Administrativo, 2.02 Manutencao, 2.03 Folha/Pastoral, 2.04 Missoes, 2.05 Eventos) + 8 categorias customizadas de demonstração com prefixo "DD-" (DD-DEP-01 Aluguel Manutencao, DD-DEP-02 Energia Eletrica, DD-DEP-03 Material Suprimentos, DD-DEP-04 Acao Social, DD-REC-01 Dizimos, DD-REC-02 Ofertas, DD-REC-03 Missoes Doacao, DD-REC-04 Fundo Construcao). **Nenhuma das ~147 contas nem os 24 grupos contábeis oficiais do CONFIADCS/AD aparecem como opção selecionável para novos lançamentos.**
- **O que está diferente**: não existe, em nenhum lugar da interface (menu Configurações, dentro do próprio Financeiro, ou uma aba "Plano de Contas"/"Grupos Contábeis"), uma tela de configuração/visualização do plano de contas completo. A aba "Contas" do módulo Financeiro, apesar do nome, é apenas uma lista de contas a pagar/receber, não o plano de contas contábil.
- **Impacto**: usuários da Assembleia de Deus não conseguem lançar despesas/receitas usando a classificação contábil real da denominação (a mesma que a migration diz ser "o plano de contas real usado pela Assembleia de Deus"), apenas categorias genéricas — o que pode gerar prestação de contas e relatórios financeiros divergentes do padrão da denominação.
- **Severidade sugerida**: **Alto** (não impede lançar valores, mas compromete diretamente um requisito de negócio específico e explicitamente citado pelo solicitante do QA).

**Tipos de documento (24 esperados: DM, DMI, DS, DV, DOC, CUP, NFS, NFE, TI, TED, PIX, RC, RDO, GUI, FAT, COM, NC, NP, BOL, FOL, DIN, CRN, OS, S/D + variantes)**:
- ⚠️ **Não aparecem em lugar nenhum da interface do dia a dia** (nem no formulário de lançamento, nem nos modais de importação "Importar" e "Importar com IA", que descrevem apenas formatos de arquivo aceitos — .xlsm/.xlsx/.csv para "Importar", e PDF/imagem/CSV/texto com IA para "Importar com IA" — sem menção às siglas de tipo de documento).
- 🔵 Verificado no código-fonte (`src/components/financeiro/SpreadsheetImportModal.tsx`) que a tabela `finance_document_types` é referenciada no fluxo de importação, então é possível que os tipos de documento só apareçam durante o processamento real de uma planilha de importação (mapeamento de colunas), não como um campo visível antecipadamente. **Não foi possível confirmar isso na prática** sem completar uma importação real — recomenda-se um teste dedicado fazendo upload de uma planilha de exemplo contendo uma coluna de tipo de documento.

**Resumo da comparação**:
| Item da referência (migration AD) | Esperado | Encontrado na UI | Status |
|---|---|---|---|
| Grupos contábeis (24) | 24 grupos com código 0–71 | 0 visíveis na UI de lançamento | ❌ Ausente da UI (existe só no banco) |
| Contas contábeis (~147) | ~147 contas ligadas aos grupos | 0 no dropdown de lançamento (aparecem só em lançamentos históricos herdados) | ❌ Ausente da UI de criação |
| Tipos de documento (24) | 24 siglas (DM, NFS, PIX, RC...) | Não encontrados em nenhuma tela do dia a dia | ⚠️ Não confirmado (possivelmente só no import) |
| Portadores (13 nomes-modelo) | Caixa Matriz, Caixa Missão, Caixa EBD... | Nomes reais específicos da igreja (contas bancárias reais) — estrutura presente, nomenclatura diferente do modelo | ✅ Presente (nomenclatura própria, aceitável) |
| Estrutura genérica (10 categorias / 4 centros de custo / 4 contas) | 10 / 4 / 4 | 10 categorias genéricas + 8 "DD-" demo / 5 centros de custo / múltiplas contas reais | ✅ Presente, com adições |

- **Dados de teste**: lançamento "TESTE QA 20260728 - Lançamento Teste" (R$ 1,00) — criado e **excluído com sucesso**.
- 🟡 **BUG-18 (Médio — padrão recorrente)** — Botão "Remover" de um lançamento na Tesouraria exclui **imediatamente, sem modal de confirmação** (6º módulo com esse padrão: ver nota no sumário executivo).

### 16. Assembleia Geral (/admin/assembleia-geral)
- ✅ Interface: cards de assembleias existentes (título, data, período, descrição), botões globais Compartilhar/Imprimir/"Nova Assembleia". Cada card tem visualização, impressão, expandir e badge de status (Visível/Oculta). 3 assembleias pré-existentes vistas (2026 Ordinária, Extraordinária Crédito, 2025 Ordinária).
- ✅ Modal "Nova Assembleia": Título*, Período de Referência*, Data*, Descrição (opcional), Link do YouTube (opcional) — **sem nenhum campo de visibilidade/status**.
- 🔴 **BUG-19 (Alto)** — Ao criar uma assembleia, ela é salva com status **"Oculta" por padrão** (comportamento definido apenas no backend, já que o formulário não oferece essa opção) e, após um refresh da página, **desaparece completamente da listagem**, sem que exista em lugar nenhum da tela um filtro, toggle ou aba para exibir assembleias ocultas. Como consequência, **é impossível acessar, editar ou excluir uma assembleia recém-criada** pela interface. **Repro**: /admin/assembleia-geral → "Nova Assembleia" → preencher Título/Período/Data → salvar → F5 → a assembleia criada não aparece mais em lugar nenhum.
- ⚠️ Não foi possível testar (por causa do BUG-19, que impediu reabrir a assembleia de teste): votação, geração de ata/documento, presença/quórum. Essas funcionalidades podem existir dentro do detalhamento de uma assembleia, mas não foram alcançadas.
- **Dados de teste**: "TESTE QA 20260728 - Assembleia Teste" (29/07/2026) — **criada, mas presa em estado "Oculta" sem forma de acessar/excluir pela interface. Requer limpeza manual via banco de dados.**

### 17. Relatórios (/admin/relatorios)
- ✅ Interface: dashboard com 8 cards de métricas (Total de Membros 87, Receita do Mês R$ 8.730.290,28, Despesas do Mês R$ 4.888.163,66, Saldo R$ 3.842.126,62, Eventos no Mês 0, Pedidos de Oração 6, Pequenos Grupos 5, Documentos 7) — todos os valores formatados corretamente, sem `undefined`/`NaN`.
- ⚠️ **Funcionalidade limitada em relação ao esperado pelo nome do módulo**: não há botões para gerar relatórios detalhados por área (membros, financeiro, eventos), não há exportação (PDF/Excel/CSV), não há filtros de período/data (mês fixo em "julho 2026"), não há gráficos — é apenas um dashboard resumido estático. Isso não é necessariamente um "bug", mas diverge da expectativa de um módulo de "Relatórios" completo — recomenda-se validar com o time de produto se esse é o escopo pretendido para a versão atual ou se há relatórios detalhados esperados em outro lugar (ex.: dentro de Financeiro/Membros).

### 18. Modo Porteiro (/admin/porteiro)
- ✅ Interface: "Modo Porteiro - Validação segura de membros por QR Code temporário", com 2 métodos: "Iniciar câmera" (leitura ao vivo) ou colar link/token do QR manualmente, botão "Validar" (desabilitado até preencher). Status "Aguardando leitura".
- ⚠️ Não há busca de membro por nome nesta tela — é exclusivamente validação por QR/token. Não foi possível completar um check-in real por falta de um QR válido gerado durante o teste (ver seção Carteira de Membro, que também tem pendência de validar o QR com scanner físico).
- ⚠️ Não testado: fluxo completo de leitura de câmera até confirmação de entrada.

### 19. Distritos, Subdistritos e Congregações (/admin/congregacoes)
- ✅ Estrutura hierárquica: Matriz Municipal (Assembleia de Deus Caxias do Sul) → Distritos/Setores (10 listados, ex.: Setor Centro, Setor Leste, Setor Norte) → Congregações ("unidades" dentro de cada distrito). Nomenclatura configurável exibida como "Distrito / Congregação".
- ❓ Campo "Denominação"/"Tipo de denominação" **não encontrado** nesta tela (nem em Configuração da Igreja — ver pendência já registrada na seção 3). Campos do formulário "Novo Distrito": Nome da distrito* (único com asterisco), Status operacional (Ativa/Em implantação/Inativa/Arquivada), Localização (Cidade, Estado, CEP, Bairro, Rua, Número, Complemento), Contato (Telefone, E-mail, Site).
- 🔴 **BUG-20 (Alto)** — **Validação de obrigatoriedade enganosa e falha silenciosa**: apenas o campo "Nome da distrito" tem asterisco de obrigatório, mas a criação **falha silenciosamente** (sem nenhuma mensagem de erro ou sucesso, formulário simplesmente fecha) se os campos de localização (Cidade/Estado/CEP) não forem preenchidos, mesmo sem indicação visual de que são obrigatórios. Ao preencher também Cidade/Estado/CEP, a criação funciona normalmente. **Repro**: /admin/congregacoes → "Novo Distrito" → preencher apenas "Nome" → "Criar distrito" → nada acontece, nenhum feedback, distrito não é criado (confirmado por contagem antes/depois e F5).
- 🔴 **BUG-21 (Alto)** — Botão **"Remover unidade"** de um distrito/congregação **não executa nenhuma ação**: sem confirmação, sem erro, sem mudança de estado, mesmo após F5. **Repro**: /admin/congregacoes → expandir um distrito → clicar "Remover unidade" → nada acontece.
- **Dados de teste**: "TESTE QA 20260728 - Distrito Teste" (Ativa, Caxias do Sul/RS, CEP 95000-000) — **criado com sucesso, mas impossível de excluir pela interface (BUG-21). Requer exclusão manual via banco de dados.**

### 20. Gerenciar Acessos (/admin/gerenciar-acessos)
- ✅ Interface: "Gerenciador de Acessos - Delegação hierárquica de trabalhos — sem alterar o perfil-base do membro". Estatísticas: 4 pessoas com trabalhos, 4 responsabilidades ativas, 1 convite pendente. Botões "Autorizar membro" e "Convidar externo".
- ✅ Equipe autorizada listada corretamente (4 pessoas com suas funções). Convite externo pendente exibido com botões "Copiar"/"Revogar".
- ✅ **16 perfis/responsabilidades** documentados e categorizados: Governo e Delegação (Administrador da unidade, Pastor responsável, Gestor de acessos), Secretaria (Secretário(a), Subsecretário(a), Operador de membros), Financeiro (Tesoureiro(a), Subtesoureiro(a), Contador(a)), Operações (Operador de documentos, Coordenador de agenda e escalas, Responsável por comunicação, Porteiro/recepção), Grupos e Ministérios (Operador de solicitações, Responsável por culto e louvor, Coordenador de grupos e departamentos). Cada perfil tem descrição clara do escopo de atuação.
- ✅ Nota de sistema clara: "Funções de governo desta unidade são definidas pela unidade superior. Aqui você pode distribuir todos os trabalhos operacionais."
- ⚠️ Fluxo de "Convidar externo" não foi levado até o envio real (correto, por segurança). Não foi possível validar em detalhe, para cada perfil, exatamente quais telas/ações ficam bloqueadas/liberadas na prática (isso exigiria logar com um usuário de cada perfil, o que não foi feito neste lote).
- **Dados de teste**: nenhum criado.

### 21. Páginas Públicas
- ✅ **Landing (/)**: hero "A excelência na gestão a serviço do Reino", botões "Acessar o Sistema"/"Conhecer Módulos", seção com 8 cards de módulos, CTA final, toggle de tema, banner de staging visível. Design profissional e consistente.
- ✅ **Login (/login)**: campos E-mail/Senha (required), link "Esqueci a senha", botão "Entrar com Google", link "Criar conta". **Observação de automação**: preencher os campos via JavaScript/CDP direto (setar `.value`) não funciona corretamente porque não dispara os eventos que o React escuta — usando digitação real (tecla por tecla) o login funciona normalmente. Isso não é um bug para usuários reais (que sempre digitam), mas reforça que qualquer teste automatizado futuro deve simular digitação real.
- ✅ **Signup (/signup)**: Nome completo, E-mail, Senha (mínimo 6 caracteres) — todos required, botão "Cadastrar com Google", link para login. Cadastro real não foi completado (correto).
- ✅ **Esqueci senha (/forgot-password)**: campo E-mail, botão "Enviar link", texto explicativo, link "Voltar ao login". Envio real não testado.
- ✅ **Devocional público (/devocional)**: carrega sem login, card com título e reflexão pastoral.
- 🔵 **Observação (não é bug crítico, mas merece nota)** — O conteúdo do devocional público carregado durante o teste estava **em inglês** ("Morning Devotional... The Lord is my shepherd; I shall not want" — Salmos 23:1), enquanto o site e o devocional dentro do Dashboard (`/admin`) são em português. Combinado com o **BUG-01/BUG-02** já registrados (inconsistência de título/período e botão "Copiar" trocando o conteúdo no card de devocional do Dashboard), isso sugere que o módulo de devocionais tem mais de um problema de consistência de conteúdo/idioma que vale a pena investigar de forma unificada.
- ✅ **Validação de documento com token inválido** (`/validar/certificado/token-invalido-teste`): trata o erro corretamente, exibindo "Certificado não encontrado" com mensagem explicativa e botão de retorno — sem tela branca ou quebra.
- ✅ **Compartilhamento sem parâmetros** (`/share`): exibe página genérica "Mensagem Pastoral / Assistente Bíblico" com CTAs, sem erro.
- ⚠️ Não testado: acessar uma URL de validação com um token **válido** de um documento real emitido durante os testes (ex.: a carta de transferência TR-2024-000001 ou o certificado CERT-2026-000001) para confirmar que a validação pública funciona de ponta a ponta com dado real.

### 22. Responsividade Mobile — varredura geral (viewport 390×844)
Testadas as seguintes telas, todas **sem problemas visuais** (menu hambúrguer funcional, cards em coluna vertical, textos legíveis sem necessidade de zoom, botões acessíveis, sem sobreposição de elementos, navegação inferior presente): Dashboard, Financeiro (dashboard/cards/métricas), Agenda (tabs, botões, navegação de mês), Conversas (lista vertical, avatares, busca), Bíblia (seletor de livro/capítulo, grade de capítulos, botões de recursos), Campanhas (cards de métricas e listagem), Certificados (lista em cards, botões de ação), Congregações/Distritos (estrutura hierárquica em cards expansíveis), Configuração da Igreja (abas e formulário).
- ⚠️ Esta varredura foi rápida (1 tela + descrição por página, sem testar formulários a fundo em mobile). O teste mais profundo de responsividade (modal de cadastro de membro, carteira digital) já havia sido feito anteriormente na seção de Membros. Recomenda-se, em uma rodada futura, repetir os fluxos de CRUD completos (não só visual) em pelo menos 2-3 módulos adicionais em viewport mobile.

### 1. Login + Dashboard + Membros + Agenda + Perfil

**Conta usada**: `municipal@ecclesiabr.online`. Ambiente confirmado como staging (banner laranja visível). Login em ~3s, sem erros.

#### Dashboard (/admin)
- ✅ Cards de métricas OK (Receita R$ 8.730.290, Despesas R$ 0, Membros Ativos 42, Eventos no Mês 0) — sem `NaN`/`undefined`.
- ✅ Menu lateral completo (Dashboard, Conversas, Bíblia Sagrada, Culto & Louvor, Campanhas, Secretaria › Financeiro/Relatórios, Portaria › Distritos/Gerenciar Acessos, Administração › Configurações).
- ✅ Toggle dark/light mode funciona sem quebrar layout.
- ⚠️ Botão "Tela cheia" sem feedback visual claro (indeterminado se funciona).
- 🟡 **BUG-01 (Médio)** — Devocional dinâmico: conteúdo do texto não corresponde ao período selecionado (ex.: ao clicar "Manhã" o texto ainda fala de encerrar o dia; ao clicar "Tarde" o texto fala "esta manhã"). **Repro**: Dashboard → alternar Manhã/Tarde/Noite no card de devocional e comparar título vs. corpo do texto.
- 🟡 **BUG-02 (Médio)** — Botão "Copiar" do card de devocional não copia para a área de transferência; em vez disso, troca o conteúdo exibido (ex.: mudou de Apocalipse 21:4 para Salmos 46:10). **Repro**: Dashboard → clicar "Copiar" no card de devocional.
- ✅ "Próximos Eventos" e "Avisos" mostram estados vazios corretos. "Acesso Rápido" com 4 atalhos funcionais.

#### Membros (/admin/membros)
- ✅ Lista carrega com 87 registros (todos com tag [STAGING]); estatísticas no topo (87 cadastrados / 42 ativos / 6 visitantes / 8 falecidos / 8 transferidos) coerentes.
- ✅ Tabs de filtro por status visíveis (Todos, Ativo, Inativo, Transferido, Em disciplina, Afastado, Falecido, Visitante, Congregado) — clique não testado ainda.
- 🔴 **BUG-03 (Alto)** — Campo de busca de membros não filtra a lista. Digitar "Bruno" e aguardar não reduz os 87 resultados exibidos. **Repro**: /admin/membros → digitar um nome no campo de busca → lista permanece completa. Evidência: `page-2026-07-28T22-55-05-429Z.png` (gerado pelo agente de teste).
- 🔴 **BUG-04 (Alto)** — No modal "Cadastrar Membro" (formulário com 8 abas: Dados Pessoais, Documentos, Contato, Endereço, Dados Eclesiásticos, Função/Cargo, Família, Observações), clicar diretamente nas abas do topo não navega — permanece sempre em "Dados Pessoais". **Repro**: Membros → "Novo Membro" → clicar em qualquer aba além da primeira (ex. "Contato") → nada muda.
- 🟠 **BUG-05 (Médio)** — Botão "Cancelar" do formulário de cadastro de membro não fecha o modal. Workaround: tecla ESC fecha corretamente. **Repro**: Membros → "Novo Membro" → clicar "Cancelar".
- ⚠️ Não testado neste lote: botões de ação por linha (Carteira/Editar/Excluir), dropdown de status por membro, exportação/ações em massa, filtros avançados, abas internas do perfil de um membro (não confundir com abas do formulário de cadastro).

#### Membros — continuação (lote 2)

- ✅ **Tabs de filtro por status funcionam corretamente**: testado "Todos" (87), "Ativo" (42), "Visitante" (8) — lista atualiza corretamente para cada filtro (ao contrário da busca por texto, que está quebrada).
- 🔴 **BUG-06 (CRÍTICO)** — O botão "Próximo ›" do formulário multi-etapas "Novo Membro" **não avança da etapa 1/8 para a etapa 2/8**, mesmo com os únicos dois campos obrigatórios (Nome completo*, CPF*) preenchidos corretamente e o botão habilitado (`disabled: false`). Nenhuma mensagem de erro, nenhum erro de JavaScript no console, nenhum feedback visual. O botão possui `onClick` e event listeners anexados, mas a navegação para o próximo passo não ocorre. **Isso bloqueia 100% da criação de novos membros pela interface.** **Repro exato**: `/admin/membros` → "Novo Membro" → preencher "Nome completo" e "CPF" (ex.: "123.456.789-09") → clicar "Próximo ›" → nada acontece, permanece em 1/8. Testado também: pressionar Enter no campo, clicar fora antes de clicar em Próximo — sem sucesso em nenhum caso.
- ⚠️ Combinado com o **BUG-04** (abas do topo do formulário não navegam — na verdade parecem ser links do menu lateral que ficam sobrepostos/atrás do modal, pois clicar em "Documentos" navegou para a página de Documentos do sistema, fechando o modal), **não existe NENHUM caminho funcional para avançar além da etapa 1 do cadastro de membro no momento do teste**.
- ⚠️ Por consequência do BUG-06, os seguintes itens do escopo **não puderam ser testados**: preenchimento completo das 8 etapas, botões de ação por linha em um membro recém-criado, exclusão/desativação de membro de teste, fluxo de "Convite" de acesso (não testado por dependência do fluxo, ainda que a tela de lista tenha o botão visível), importação de membros (não testado neste lote por priorização do bug crítico).
- ✅ **Responsividade mobile (390×844)**: tabela de membros vira lista de cards verticais; menu lateral vira "hambúrguer" (≡); aparece barra de navegação inferior (Início, Agenda, Chat, Bíblia, Mais); o modal "Novo Membro" cabe na tela, com abas do topo dispostas em 2 linhas horizontais e campos empilhados verticalmente; botões "Cancelar"/"Próximo" visíveis no rodapé do modal. Nenhum problema de corte de layout observado (mas o cadastro em si está bloqueado pelo BUG-06 também no mobile).

### 5.1 Carteira de Membro (a partir de /admin/membros → ação "Carteira" em um membro existente)

- ✅ **Frente do cartão**: foto, nome, função, número de identificação, datas.
- ✅ **Verso do cartão**: dados pessoais (RG, CPF, etc.).
- ✅ Alternância frente/verso funciona.
- ✅ Botão **"Gerar QR seguro"** funciona e exibe um QR code no cartão, com aviso de expiração em 5 minutos.
- ✅ Botões presentes: PDF, Compartilhar, WhatsApp/Business, E-mail, Imprimir (ações reais de download/envio não completadas neste lote, apenas presença e clique inicial verificados).
- 🔵 **Observação/pendência importante (requisito explícito do QA)**: é necessário validar especificamente se, ao ampliar/abrir o QR code em uma visualização dedicada, ele aparece: (a) com alguma animação de abertura, (b) grande e centralizado na tela, (c) com contraste/resolução suficiente para ser lido por um leitor de QR code real (scanner de celular). O teste atual confirmou que o QR é gerado e aparece no cartão, mas **não confirmou** os três critérios acima com um scanner real — recomenda-se um teste dedicado com celular físico escaneando a tela antes de aprovar este item definitivamente.
- **Dados usados**: carteira de um membro já existente na base de staging (não foi possível usar um membro "TESTE QA 20260728" próprio devido ao BUG-06). Nenhum dado novo criado nesta seção.

#### Agenda (/admin/agenda)
- ✅ Página carrega em ~3s, título "Agenda da Igreja", 0 eventos no mês, mensagem de estado vazio correta.
- ✅ Botões presentes: Lista, Calendário, Compartilhar, Imprimir, "+ Evento", navegação de mês.
- 🔵 **BUG-06 (Baixo/UX)** — Ao clicar em "+ Evento", o formulário demora ~2-3s para aparecer visualmente (delay de renderização perceptível). **Repro**: Agenda → "+ Evento" → cronometrar.
- ✅ Formulário de novo evento tem todos os campos esperados (título, data, horário inicial/final, local, cor, descrição, checkbox "evento público") e aceita entrada.
- ⚠️ Não testado neste lote: salvar evento até o fim, editar/excluir evento, alternância Lista/Calendário, compartilhar/imprimir, recorrência.

#### Agenda — continuação (lote 2)
- ✅ Criado evento "TESTE QA 20260728 - Evento Teste" (28/07/2026, local "Templo Principal") → salvo com sucesso, aparece na lista e no calendário no dia correto.
- ✅ Editado (local alterado para "Salão de Reuniões") e salvo com sucesso.
- ✅ Alternância Lista ↔ Calendário funciona, evento consistente nas duas visões.
- ✅ Botões Compartilhar e Imprimir presentes e abrem (ação completa não finalizada, por escopo).
- ✅ Excluído ("Remover") com sucesso, sumiu da lista.
- ⚠️ Recorrência de eventos (repetir semanalmente etc.) não identificada/testada nesta tela — verificar se existe.
- **Dados de teste**: "TESTE QA 20260728 - Evento Teste" — criado e **excluído com sucesso**.

### 6. Escalas (/admin/escalas)
- ✅ Interface: lista de escalas por data (ex.: Intercessão Junho, Recepção 21/06, Louvor 21/06), filtros por ministério (Todos, Louvor, Infantil, Mídia, Recepção, Intercessão, Pregação, Geral), status (publicada/rascunho), indicador "Nenhum escalado", botões Compartilhar/Imprimir/"+ Nova Escala".
- ✅ CRUD completo testado: criada escala de teste (Título "TESTE QA 20260728 - Escala Teste", Data 28/07/2026, Horário 09:00, Ministério Louvor, Status rascunho) → salva com sucesso → excluída ("Excluir escala") com sucesso.
- 🟠 **BUG-10 (mesmo padrão do BUG-05, Alto/Médio)** — Botão "Cancelar" do modal "Nova Escala" não fecha o modal; apenas ESC funciona. **Repro**: /admin/escalas → "+ Nova Escala" → "Cancelar".
- ⚠️ Não testado: atribuir um membro específico a uma função dentro da escala (associação membro↔função↔data).
- **Dados de teste**: "TESTE QA 20260728 - Escala Teste" — criada e **excluída com sucesso**.

### 7. Pequenos Grupos / Grupos e Departamentos (/admin/grupos)
- ✅ Interface: lista de grupos em cards (nome, tipo, dia/horário, local, status), botão "+ Novo Grupo".
- ✅ CRUD testado: criado "TESTE QA 20260728 - Grupo Teste" (nome, tipo, dia, horário, local, descrição) → salvo com sucesso → apareceu corretamente na lista → excluído.
- 🟡 **BUG-11 (Médio/UX — segurança de ação destrutiva)** — O botão "Remover" de um grupo exclui **instantaneamente, sem modal de confirmação**. Isso viola a diretriz de "confirmação de ações destrutivas" esperada no app (contraste com Campanhas, que tem diálogo "Esta ação não poderá ser desfeita"). **Repro**: /admin/grupos → clicar "Remover" em qualquer card de grupo → grupo é excluído imediatamente sem qualquer confirmação.
- **Dados de teste**: "TESTE QA 20260728 - Grupo Teste" — criado e **excluído com sucesso**.

#### Perfil (/admin/perfil)
- ✅ Campos: Foto (avatar circular), Nome Completo (editável), E-mail (readonly/disabled — correto), Telefone (editável, com placeholder "(11) 99999-9999"), Função na Igreja (editável). Botão único "Salvar Alterações".
- ✅ Edição do campo "Função na Igreja" → salvar → F5 → persistiu corretamente. Revertido ao valor original ("Administrador Matriz") e salvo de novo. Sem dado de teste residual.
- ✅ Botão "Salvar Alterações" desabilita durante o request (bom feedback), mas não há toast/mensagem de sucesso visível após salvar — apenas o botão volta ao normal.
- 🟡 **BUG-07 (Médio/UX)** — Ícone de câmera sobre a foto de perfil não abre seletor de arquivo ao clicar; existe um `<input type="file">` oculto no DOM mas não está conectado ao clique do ícone. **Repro**: /admin/perfil → clicar no ícone de câmera sobre a foto → nada acontece.
- 🟡 **BUG-08 (Médio/UX)** — Campo "Telefone" não aplica máscara de formatação automática durante a digitação, apesar do placeholder sugerir formato `(11) 99999-9999`. Valor é salvo sem formatação (ex.: "54999999999"). **Repro**: /admin/perfil → apagar telefone → digitar apenas dígitos → observar ausência de formatação.
- ⚠️ Não testado: troca de senha (não há campo de senha nesta tela — verificar se existe em outro lugar, ex. fluxo "esqueci senha").

#### Configuração da Igreja (/admin/configuracao-igreja)
- ✅ Duas abas: "Dados institucionais" (padrão) e "Logo & visual" — navegação entre abas funciona.
- ✅ Aba "Dados institucionais" com seções Identificação (Nome oficial*, Nome curto, Sigla/iniciais, CNPJ), Responsável (Pastor presidente), Endereço (Logradouro, Número, Complemento, Bairro, CEP, Cidade, UF), Contato (Telefone, E-mail institucional, Site). Botão "Salvar" no topo.
- ✅ Edição do campo "Nome curto" → salvar → F5 → persistiu. Revertido a "AD MATRIZ" e salvo novamente. Sem dado de teste residual.
- ✅ Aba "Logo & visual": mostra logo atual (URL do Supabase Storage), descrição "Usado na carteira de membro, documentos e cabeçalhos. PNG ou JPEG, máx. 2 MB", e card de "Prévia da identidade visual" que reflete corretamente os dados institucionais (nome, sigla, pastor, endereço, telefone, e-mail, CNPJ, rodapé).
- 🟡 **BUG-09 (Médio/UX)** — Botão "Escolher logo" não abre seletor de arquivo ao clicar (mesmo padrão do BUG-07: input file oculto não conectado ao botão). **Repro**: /admin/configuracao-igreja → aba "Logo & visual" → clicar "Escolher logo" → nada acontece.
- ❓ Não foi encontrado campo explícito de "Denominação"/"Tipo de denominação" nesta tela (relevante para o teste do template financeiro da AD — ver seção Financeiro). A denominação parece estar apenas implícita no "Nome oficial" ou configurada em outro local (ex.: tela "Congregações" conforme código-fonte `src/pages/Congregacoes.tsx`), não exposta aqui. **Pendência**: verificar na tela de Congregações/Distritos se há campo `denomination_type` explícito.
- ⚠️ Não testado: botão "Cancelar"/"Restaurar padrão" (não observado se existe), validações de campo obrigatório (Nome oficial vazio), upload real de logo até o fim (bloqueado pelo BUG-09).
- **Atualização (lote de Portaria)**: confirmado que a tela de Distritos/Congregações (`/admin/congregacoes`) também não expõe um campo de "Denominação" no formulário de criação de distrito. O campo `denomination_type` citado no código (`organizations.denomination_type`) não tem, aparentemente, nenhuma tela de UI dedicada para o usuário final visualizar/editar — ele provavelmente só é setado via banco de dados/onboarding inicial da organização. Isso é relevante porque é esse campo que decide, segundo a migration `20260726090000_assembleia_de_deus_finance_template.sql`, se o template contábil da AD é semeado — mas como não há UI para o admin ver/alterar esse valor, não é possível confirmar ou corrigir pela interface caso esteja incorreto.

---

## Lista completa de erros por severidade

### 🔴 Críticos (bloqueiam o fluxo principal do módulo)
1. **BUG-06** — Membros: botão "Próximo ›" do cadastro multi-etapas não avança da etapa 1/8. **Bloqueia 100% da criação de novos membros.** (`/admin/membros`)

### 🟠 Altos (funcionalidade não funciona como esperado, com ou sem contorno)
2. **BUG-03** — Membros: busca por texto não filtra a lista. (`/admin/membros`)
3. **BUG-04** — Membros: abas do formulário de cadastro não navegam ao clicar (na prática, sobrepõem-se a links do menu lateral). (`/admin/membros`)
4. **BUG-13** — Certificados: botão "Revogar" de certificado emitido não executa nenhuma ação. (`/admin/certificados`)
5. **BUG-14** — Certificados: certificado em rascunho não pode ser excluído pela interface. (`/admin/certificados`)
6. **BUG-19** — Assembleia Geral: assembleia criada fica "Oculta" por padrão e inacessível/impossível de excluir pela UI. (`/admin/assembleia-geral`)
7. **BUG-20** — Distritos/Congregações: criação falha silenciosamente se campos não marcados como obrigatórios (Cidade/Estado/CEP) não forem preenchidos. (`/admin/congregacoes`)
8. **BUG-21** — Distritos/Congregações: botão "Remover unidade" não executa nenhuma ação. (`/admin/congregacoes`)
9. **Gap Financeiro** — Template contábil da Assembleia de Deus (24 grupos / ~147 contas) existe no banco mas não está disponível para seleção na tela de lançamento financeiro do dia a dia. (`/admin/financeiro`)

### 🟡 Médios (comportamento incorreto/inconsistente, sem bloquear o uso)
10. **BUG-01** — Dashboard: texto do devocional inconsistente com o período (Manhã/Tarde/Noite) selecionado.
11. **BUG-02** — Dashboard: botão "Copiar" do devocional troca o conteúdo em vez de copiar para a área de transferência.
12. **BUG-05** — Membros: botão "Cancelar" do formulário de cadastro não fecha o modal (ESC funciona).
13. **BUG-07** — Perfil: ícone de câmera não abre seletor de arquivo para trocar foto.
14. **BUG-08** — Perfil: campo telefone sem máscara de formatação automática.
15. **BUG-09** — Configuração da Igreja: botão "Escolher logo" não abre seletor de arquivo.
16. **BUG-10** — Escalas: botão "Cancelar" do modal "Nova Escala" não fecha (mesmo padrão do BUG-05).
17. **BUG-11** — Pequenos Grupos: exclusão de grupo é instantânea, sem modal de confirmação.
18. **BUG-12** — Cartas de Transferência: numeração oficial sequencial (TR-2024-000001) pode ficar "queimada" por ter sido usada em teste.
19. **BUG-15** — Solicitações Administrativas: botão "Rejeitar" executa sem confirmação.
20. **BUG-16** — Pedidos de Oração: exclusão ("X") executa sem confirmação.
21. **BUG-18** — Financeiro/Tesouraria: botão "Remover" de lançamento executa sem confirmação.

### 🔵 UX / Observações (não bloqueiam, mas merecem atenção)
- Botão "Tela cheia" do Dashboard sem feedback visual claro.
- Delay perceptível (2-3s) ao abrir o formulário de novo evento na Agenda.
- QR code da Carteira de Membro ("Gerar QR seguro") gera corretamente, mas **falta validar** com um leitor de QR físico se a visualização ampliada tem animação, é grande/centralizada e é legível por scanner — requisito explícito do QA que não pôde ser fechado sem um teste com celular físico.
- Devocional público (`/devocional`) aparece em inglês, enquanto o devocional do Dashboard é em português — possível problema de consistência de conteúdo/idioma no mesmo módulo dos BUG-01/02.
- Documentos (`/admin/documentos`): botão "X" de exclusão não teve o resultado confirmado visualmente — precisa reteste dedicado.
- Pedidos de Oração: primeira tentativa de criação de um registro de teste não salvou (intermitente, não reproduzido na 2ª tentativa).
- Relatórios (`/admin/relatorios`): módulo é apenas um dashboard estático de métricas, sem geração de relatórios detalhados, exportação (PDF/Excel/CSV) ou filtros de período — validar com produto se é o escopo pretendido.
- Não existe, em nenhuma tela testada, uma interface de usuário para visualizar/editar o campo `denomination_type` da organização (relevante para o template financeiro da AD).

---

## Matriz de cobertura — o que foi realmente testado

| Área do escopo | Criar | Visualizar | Editar | Excluir/Desativar | Buscar/Filtrar | Responsividade mobile | Observação |
|---|---|---|---|---|---|---|---|
| Dashboard | — | ✅ | — | — | — | ✅ | |
| Conversas / Videoconferência | ⚠️ não | ✅ | — | ✅ (apagar conversa não testado) | ✅ | ✅ | Envio de mensagem evitado (contatos reais) |
| Bíblia | — | ✅ | — | — | ⚠️ não localizada | ✅ | Ações por versículo não localizadas |
| Culto & Louvor (Músicas/Roteiros) | ✅ | ✅ | ✅ | ✅ | — | — | Telão testado parcialmente |
| Campanhas | ✅ | ✅ | ✅ | ✅ | — | ✅ | Contribuição real não testada (correto) |
| Membros | ❌ **bloqueado** | ✅ | ⚠️ não (depende de criação) | ⚠️ não | ❌ **quebrado** | ✅ | Ver BUG-06/03/04 |
| Carteira de Membro | — | ✅ | — | — | — | ⚠️ não | QR pendente validação física |
| Cartas de Recomendação | ✅ | ✅ | ⚠️ não | ✅ (rejeitar) | ✅ | — | |
| Cartas de Transferência | ✅ | ✅ | ⚠️ não | ✅ (cancelar) | ✅ | — | |
| Certificados | ✅ | ✅ | ⚠️ não | ❌ **quebrado** | ✅ | ✅ | Ver BUG-13/14 |
| Solicitações Administrativas | ✅ | ✅ | ⚠️ status apenas | ✅ (rejeitar, sem confirmação) | ✅ | — | |
| Documentos | ⚠️ não confirmado | ✅ | ⚠️ não | ⚠️ não confirmado | — | — | Upload não testado a fundo |
| Comunicação | ⚠️ não | ✅ | — | — | — | — | Envio evitado por segurança |
| Pedidos de Oração | ✅ | ✅ | ✅ (status) | ✅ (sem confirmação) | ⚠️ apenas tabs | — | |
| Agenda | ✅ | ✅ | ✅ | ✅ | — | ✅ | Recorrência não testada |
| Escalas | ✅ | ✅ | ⚠️ não | ✅ | ✅ (filtro ministério) | — | Atribuição de membro/função não testada |
| Pequenos Grupos | ✅ | ✅ | ⚠️ não | ✅ (sem confirmação) | — | — | |
| Assembleia Geral | ✅ (mas presa) | ⚠️ não (ficou oculta) | ❌ | ❌ **quebrado** | — | — | Ver BUG-19; votação/ata não alcançados |
| Financeiro | ✅ | ✅ | ⚠️ não | ✅ (sem confirmação) | ✅ | ✅ | Gap do plano de contas AD — ver seção dedicada |
| Relatórios | — | ✅ | — | — | — | — | Sem geração/exportação/filtros |
| Modo Porteiro | — | ✅ | — | — | — | — | Check-in real com QR não concluído |
| Distritos/Subdistritos/Congregações | ✅ | ✅ | ⚠️ não | ❌ **quebrado** | — | ✅ | Ver BUG-20/21; sem campo de denominação |
| Gerenciar Acessos | ⚠️ não (convite) | ✅ | — | — | — | — | 16 perfis documentados; envio de convite evitado |
| Perfil | — | ✅ | ✅ | — | — | — | Upload de foto quebrado (BUG-07) |
| Configuração da Igreja | — | ✅ | ✅ | — | — | ✅ | Upload de logo quebrado (BUG-09) |
| Páginas Públicas (Landing/Login/Signup/Reset/Devocional/Validação/Share) | — | ✅ | — | — | — | ⚠️ não testado mobile | Token de validação real não testado |

Legenda: ✅ testado e funcionando · ❌ testado e quebrado · ⚠️ não testado / parcialmente testado · — não aplicável a esta operação neste módulo.

---

## O que ficou bloqueado ou não testado

- **Membros**: preenchimento completo das 8 etapas de cadastro, ações por linha em um membro (Editar/Excluir/Status) usando um registro de teste próprio, fluxo de "Convite" de acesso, importação de membros — todos bloqueados/adiados por causa do BUG-06.
- **Carteira de Membro**: validação do QR code ("Gerar QR seguro") com um leitor de QR físico real, para confirmar animação, tamanho, centralização e legibilidade em scanner — não é possível confirmar isso apenas via automação de navegador.
- **Assembleia Geral**: votação, geração de ata/documento, registro de presença/quórum — inacessíveis por causa do BUG-19 (assembleia de teste ficou presa em "Oculta").
- **Financeiro**: teste do fluxo real de importação de planilha (Importar / Importar com IA) até o fim, para confirmar se os 24 tipos de documento (DM, NFS, PIX, RC, BOL etc.) aparecem durante o mapeamento de colunas da planilha.
- **Documentos**: upload real de arquivo até o fim; confirmação exata do resultado do botão de exclusão ("X").
- **Comunicação**: criação de comunicado até salvar rascunho (não avançado, por segurança, para evitar envio a membros reais).
- **Conversas**: envio de mensagem de texto/mídia real, criação de nova conversa até o fim, "Nova Reunião" (distinta de iniciar chamada de vídeo dentro de uma conversa existente) — evitados por não haver certeza de que os contatos eram fictícios.
- **Modo Porteiro**: check-in real usando um QR code válido gerado por um membro (não foi possível gerar e validar um QR de ponta a ponta no mesmo teste).
- **Gerenciar Acessos**: teste prático de "o que cada perfil pode ver/alterar" logando com um usuário de cada um dos 16 perfis — foi feita apenas a documentação estática dos perfis, não a validação funcional de permissões por login.
- **Páginas de validação pública**: não foi testado abrir `/validar/carta/:token`, `/validar/transferencia/:token` ou `/validar/certificado/:token` com um token **real e válido** de um documento emitido durante os testes (só foi testado o caminho de token inválido).
- **Responsividade mobile**: a varredura mobile cobriu 9 telas em nível visual (1 screenshot cada), mas não repetiu os fluxos completos de CRUD em viewport mobile (exceto Membros, testado a fundo). Recomenda-se uma rodada dedicada de CRUD mobile em pelo menos Financeiro, Certificados e Campanhas.
- **Super Admin** (`/admin/super-admin`): não testado nesta rodada — está fora do escopo listado explicitamente pelo solicitante, mas a rota existe no sistema.

---

## Lista de registros temporários para limpeza

_(consolidado de todas as seções acima — todos identificáveis pelo prefixo "TESTE QA 20260728" ou pela tag "[STAGING]" já existente na massa de dados)_

| # | Módulo | Registro | Estado final | Requer limpeza manual (banco)? |
|---|---|---|---|---|
| 1 | Cartas de Recomendação | Carta para Rafael Casagrande → "TESTE QA 20260728 - Igreja Destino" | Rejeitada | Opcional (já "cancelada" logicamente) |
| 2 | Cartas de Transferência | Transferência de [STAGING] Rafael Fictício → "TESTE QA 20260728 - Igreja Transferência", carta nº TR-2024-000001 | Cancelada | Opcional; **validar se numeração TR-2024-000001 fica reservada indevidamente** |
| 3 | Certificados | Certificado de Batismo para [STAGING] Rafael Fictício, nº CERT-2026-000001 | Emitido (não revogável pela UI — BUG-13) | **Sim** |
| 4 | Certificados | Certificado em rascunho para [STAGING] Aline Staging | Rascunho (não excluível pela UI — BUG-14) | **Sim** |
| 5 | Assembleia Geral | "TESTE QA 20260728 - Assembleia Teste" (29/07/2026) | Oculta, inacessível pela UI (BUG-19) | **Sim** |
| 6 | Distritos/Congregações | "TESTE QA 20260728 - Distrito Teste" (Ativa, Caxias do Sul/RS) | Ativo/visível, não excluível pela UI (BUG-21) | **Sim** |

**Registros criados e já excluídos com sucesso pela própria interface durante os testes** (não precisam de limpeza adicional): música "TESTE QA 20260728 - Música Teste" e roteiro "TESTE QA 20260728 - Roteiro Teste" (Culto & Louvor); campanha "TESTE QA 20260728 - Campanha Teste"; evento "TESTE QA 20260728 - Evento Teste" (Agenda); escala "TESTE QA 20260728 - Escala Teste"; grupo "TESTE QA 20260728 - Grupo Teste" (Pequenos Grupos); pedido de oração "TESTE QA 20260728 - Pedido Teste 2"; lançamento financeiro "TESTE QA 20260728 - Lançamento Teste"; solicitação administrativa "TESTE QA 20260728 - Solicitante Teste" (rejeitada, considerar remoção opcional como os itens 1-2 acima).

Nenhuma mensagem, convite, e-mail, SMS ou OTP foi enviado a pessoa real durante os testes.

---

## Git status final

- **Branch de trabalho**: `review/gestao-homologacao-20260728` (confirmada como branch ativa durante toda a operação).
- **Nenhum arquivo de código-fonte ou migration foi criado, editado ou commitado** durante esta rodada de QA — apenas este arquivo de relatório (`docs/qa/homologacao-20260728-erros.md`) foi criado/editado, permanecendo como **untracked** no repositório (não commitado, conforme escopo: "não faça commit, push ou deploy").
- Branch local está à frente de `origin/review/gestao-homologacao-20260728` por 1 commit pré-existente (anterior a esta sessão de QA, não gerado por este trabalho).
- Nenhuma alteração foi feita em produção. Nenhum deploy foi acionado.

