-- Documentos demo: higienizar conteúdo para Assembleia de Deus Caxias do Sul.
-- Atualiza somente os 3 registros demo da Congregação Jardim América.
-- Seguro para remoto já seedado: UPDATE por id + organization_id.

DO $$
DECLARE
  v_org uuid := '11111111-0000-0000-0000-000000000004';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE NOTICE 'documents AD Caxias update skipped: demo org not found';
    RETURN;
  END IF;

  UPDATE public.documents
  SET
    title = 'Estatuto Interno — Assembleia de Deus Caxias do Sul',
    content = E'ESTATUTO INTERNO — CONGREGAÇÃO JARDIM AMÉRICA
ASSEMBLEIA DE DEUS EM CAXIAS DO SUL

CAPÍTULO I — DA IDENTIFICAÇÃO
Art. 1º — A Congregação Jardim América, localizada em Caxias do Sul/RS, é congregação da Assembleia de Deus em Caxias do Sul, entidade religiosa sem fins lucrativos, sob orientação pastoral e regimento interno da Secretaria administrativa da obra.

CAPÍTULO II — DOS OBJETIVOS
Art. 2º — São objetivos da Congregação:
a) Pregar o Evangelho de Jesus Cristo;
b) Promover adoração, discipulado e santa comunhão;
c) Servir à cidade de Caxias do Sul em missões e ação social.

CAPÍTULO III — DOS MEMBROS
Art. 3º — São membros os que confessam fé evangélica, são integrados pela liderança pastoral e acompanhados pela Secretaria da congregação.

CAPÍTULO IV — DA ADMINISTRAÇÃO
Art. 4º — A Congregação é administrada pelo Pastor local, pastores auxiliares, presbíteros, diáconos e lideranças ministeriais, em harmonia com a direção da Assembleia de Deus em Caxias do Sul.',
    document_type = 'Estatuto',
    updated_at = now()
  WHERE id = '55555555-0000-0000-0000-000000000001'
    AND organization_id = v_org;

  UPDATE public.documents
  SET
    title = 'Ata de Reunião Ministerial — Maio 2026',
    content = E'ATA DE REUNIÃO MINISTERIAL
Assembleia de Deus em Caxias do Sul — Congregação Jardim América
Data: 10 de maio de 2026 | Horário: 19h30 | Local: Salão de Reuniões

Presentes: Pr. João Paulo Ferreira (Pastor), Fernanda Maria Alves (Secretaria), lideranças dos ministérios de Louvor, Infantil, Jovens, Recepção e Intercessão.

PAUTA:
1. Abertura em oração e leitura bíblica.
2. Planejamento dos cultos e atividades de junho/2026 na sede de Caxias do Sul.
3. Escalas ministeriais: confirmação das equipes de Louvor e Recepção.
4. Mobilização da EBD e dos Pequenos Grupos (Jovens Resgate e Casais Ágape).
5. Orientações da Secretaria sobre cadastro de membros e documentação congregacional.

Encerramento às 21h00, com benção apostólica.

Pr. João Paulo Ferreira — Pastor
Fernanda Maria Alves — Secretaria AD Caxias do Sul / Congregação Jardim América',
    document_type = 'Ata',
    updated_at = now()
  WHERE id = '55555555-0000-0000-0000-000000000002'
    AND organization_id = v_org;

  UPDATE public.documents
  SET
    title = 'Manual de Integração de Novos Membros — AD Caxias do Sul',
    content = E'MANUAL DE INTEGRAÇÃO DE NOVOS MEMBROS
Assembleia de Deus em Caxias do Sul — Congregação Jardim América

BEM-VINDO À FAMÍLIA DE DEUS!

A Secretaria da Congregação Jardim América preparou este material para ajudá-lo a integrar-se à vida congregacional da Assembleia de Deus em Caxias do Sul.

NOSSA IDENTIDADE
Somos uma congregação evangélica pentecostal, comprometida com a Palavra de Deus, a oração e a obra missionária na cidade de Caxias do Sul.

MINISTÉRIOS DA CONGREGAÇÃO
• Louvor e Adoração
• Infantil
• Jovens Resgate
• Casais Ágape
• Recepção e Acolhimento
• Intercessão
• Escola Bíblica Dominical

PRIMEIROS PASSOS
1. Participar do culto de boas-vindas
2. Encontro com a liderança pastoral
3. Cadastro na Secretaria (documento com foto e dados pessoais)
4. Inscrição em um ministério ou pequeno grupo

CONTATOS
Pastor João Paulo Ferreira — (11) 99999-0001
Secretaria AD Caxias do Sul / Congregação Jardim América — seg a sex, 9h às 17h',
    document_type = 'Geral',
    updated_at = now()
  WHERE id = '55555555-0000-0000-0000-000000000003'
    AND organization_id = v_org;
END $$;
