-- Culto & Louvor demo seed for Congregação Jardim América (AD Caxias do Sul).
-- Idempotent: safe to run multiple times.

DO $$
DECLARE
  v_congr uuid := '11111111-0000-0000-0000-000000000004';
BEGIN

  -- ── Songs ──────────────────────────────────────────────────────────────────
  INSERT INTO public.worship_songs (id, organization_id, title, lyrics, musical_key, category)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', v_congr, 'Sublime Graça',
     E'Sublime graça! Quão doce o som\nQue a um pecador como eu salvou!',
     'G', 'Hino clássico'),
    ('bbbbbbbb-0000-0000-0000-000000000002', v_congr, 'Santo, Santo, Santo',
     E'Santo, Santo, Santo!\nSenhor onipotente!',
     'D', 'Adoração'),
    ('bbbbbbbb-0000-0000-0000-000000000003', v_congr, 'Grandioso És Tu',
     E'Senhor, meu Deus, ao contemplar\nOs céus, o mar, a imensidão!',
     'C', 'Adoração'),
    ('bbbbbbbb-0000-0000-0000-000000000004', v_congr, 'Em Cristo Só',
     E'Em Cristo só firmado estou,\nNão vacilo, pois nele confio!',
     'A', 'Confiança'),
    ('bbbbbbbb-0000-0000-0000-000000000005', v_congr, 'Teu Fiel Amor',
     E'Teu fiel amor me guia neste vale escuro,\nNão temerei, pois estás comigo!',
     'E', 'Consolo'),
    ('bbbbbbbb-0000-0000-0000-000000000006', v_congr, 'Bendito Seja o Deus de Amor',
     E'Bendito seja o Deus de amor,\nQue enviou seu Filho amado!',
     'F', 'Gratidão'),
    ('bbbbbbbb-0000-0000-0000-000000000007', v_congr, 'Cristo Meu Mestre',
     E'Cristo, meu Mestre, guia-me sempre,\nEm tua luz eu quero caminhar!',
     'Bb', 'Discipulado'),
    ('bbbbbbbb-0000-0000-0000-000000000008', v_congr, 'Canta Aleluia ao Senhor',
     E'Canta aleluia ao Senhor,\nExaltai o seu santo nome!',
     'G', 'Louvor'),
    ('bbbbbbbb-0000-0000-0000-000000000009', v_congr, 'Quão Grande És Tu',
     E'Senhor, meu Deus, quando eu maravilhado\nContemplo toda a tua criação!',
     'D', 'Adoração'),
    ('bbbbbbbb-0000-0000-0000-000000000010', v_congr, 'Vindo a Cristo',
     E'Vem a Cristo, vem agora,\nEle te chama com amor!',
     'C', 'Convite')
  ON CONFLICT (id) DO NOTHING;

  -- ── Setlists ───────────────────────────────────────────────────────────────
  INSERT INTO public.worship_setlists (id, organization_id, title, service_date, steps)
  VALUES
    ('cccccccc-0000-0000-0000-000000000001', v_congr, 'Domingo Manhã', '2026-06-07',
     '[
       {"id":"s1","type":"abertura","title":"Abertura","content":"Bem-vindos ao culto de adoração dominical."},
       {"id":"s2","type":"louvor","title":"Sublime Graça","content":"","songId":"bbbbbbbb-0000-0000-0000-000000000001"},
       {"id":"s3","type":"louvor","title":"Santo, Santo, Santo","content":"","songId":"bbbbbbbb-0000-0000-0000-000000000002"},
       {"id":"s4","type":"leitura","title":"Leitura bíblica","content":"Salmos 100"},
       {"id":"s5","type":"mensagem","title":"Mensagem","content":"Tema: A graça que transforma"},
       {"id":"s6","type":"encerramento","title":"Encerramento","content":"Oremos e recebam a bênção apostólica."}
     ]'::jsonb),
    ('cccccccc-0000-0000-0000-000000000002', v_congr, 'Domingo Noite', '2026-06-07',
     '[
       {"id":"s1","type":"abertura","title":"Abertura","content":"Culto da família — boa noite!"},
       {"id":"s2","type":"louvor","title":"Grandioso És Tu","content":"","songId":"bbbbbbbb-0000-0000-0000-000000000003"},
       {"id":"s3","type":"louvor","title":"Em Cristo Só","content":"","songId":"bbbbbbbb-0000-0000-0000-000000000004"},
       {"id":"s4","type":"oracao","title":"Oração","content":"Momento de intercessão pela família."},
       {"id":"s5","type":"mensagem","title":"Mensagem","content":"Tema: Famílias firmadas em Cristo"},
       {"id":"s6","type":"louvor","title":"Teu Fiel Amor","content":"","songId":"bbbbbbbb-0000-0000-0000-000000000005"},
       {"id":"s7","type":"encerramento","title":"Encerramento","content":"Bênção e despedida."}
     ]'::jsonb),
    ('cccccccc-0000-0000-0000-000000000003', v_congr, 'Santa Ceia', '2026-06-14',
     '[
       {"id":"s1","type":"abertura","title":"Abertura","content":"Celebração da Santa Ceia do Senhor."},
       {"id":"s2","type":"louvor","title":"Bendito Seja o Deus de Amor","content":"","songId":"bbbbbbbb-0000-0000-0000-000000000006"},
       {"id":"s3","type":"leitura","title":"Leitura bíblica","content":"1 Coríntios 11:23-26"},
       {"id":"s4","type":"oracao","title":"Oração de preparação","content":"Momento de examinar o coração."},
       {"id":"s5","type":"mensagem","title":"Meditação","content":"O significado da Ceia"},
       {"id":"s6","type":"louvor","title":"Cristo Meu Mestre","content":"","songId":"bbbbbbbb-0000-0000-0000-000000000007"},
       {"id":"s7","type":"encerramento","title":"Encerramento","content":"Partilhem o pão e o cálice com reverência."}
     ]'::jsonb),
    ('cccccccc-0000-0000-0000-000000000004', v_congr, 'Culto Jovem', '2026-06-21',
     '[
       {"id":"s1","type":"abertura","title":"Abertura","content":"Culto dos jovens — sejam bem-vindos!"},
       {"id":"s2","type":"louvor","title":"Canta Aleluia ao Senhor","content":"","songId":"bbbbbbbb-0000-0000-0000-000000000008"},
       {"id":"s3","type":"louvor","title":"Quão Grande És Tu","content":"","songId":"bbbbbbbb-0000-0000-0000-000000000009"},
       {"id":"s4","type":"louvor","title":"Vindo a Cristo","content":"","songId":"bbbbbbbb-0000-0000-0000-000000000010"},
       {"id":"s5","type":"mensagem","title":"Mensagem","content":"Tema: Jovens que brilham no mundo"},
       {"id":"s6","type":"encerramento","title":"Encerramento","content":"Oração final e convite."}
     ]'::jsonb)
  ON CONFLICT (id) DO NOTHING;

END $$;
