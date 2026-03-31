import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VERSES = [
  { ref: "Salmos 23:1", text: "O Senhor é o meu pastor; nada me faltará." },
  { ref: "Provérbios 3:5-6", text: "Confia no Senhor de todo o teu coração e não te estribes no teu próprio entendimento. Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas." },
  { ref: "Isaías 41:10", text: "Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus; eu te fortaleço, e te ajudo, e te sustento com a minha destra fiel." },
  { ref: "Filipenses 4:13", text: "Posso todas as coisas naquele que me fortalece." },
  { ref: "Romanos 8:28", text: "E sabemos que todas as coisas contribuem juntamente para o bem daqueles que amam a Deus, daqueles que são chamados por seu decreto." },
  { ref: "Jeremias 29:11", text: "Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o Senhor; pensamentos de paz e não de mal, para vos dar o fim que esperais." },
  { ref: "Josué 1:9", text: "Não to mandei eu? Esforça-te e tem bom ânimo; não pasmes, nem te espantes, porque o Senhor, teu Deus, é contigo, por onde quer que andares." },
  { ref: "Mateus 11:28", text: "Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei." },
  { ref: "João 3:16", text: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna." },
  { ref: "Salmos 46:10", text: "Aquietai-vos e sabei que eu sou Deus; serei exaltado entre os gentios; serei exaltado sobre a terra." },
  { ref: "2 Timóteo 1:7", text: "Porque Deus não nos deu o espírito de temor, mas de fortaleza, e de amor, e de moderação." },
  { ref: "Salmos 91:1-2", text: "Aquele que habita no esconderijo do Altíssimo, à sombra do Onipotente descansará. Direi do Senhor: Ele é o meu Deus, o meu refúgio, a minha fortaleza, e nele confiarei." },
  { ref: "Gálatas 5:22-23", text: "Mas o fruto do Espírito é: amor, gozo, paz, longanimidade, benignidade, bondade, fé, mansidão, temperança. Contra essas coisas não há lei." },
  { ref: "Salmos 119:105", text: "Lâmpada para os meus pés é tua palavra e luz para o meu caminho." },
  { ref: "Romanos 12:2", text: "E não sede conformados com este mundo, mas sede transformados pela renovação do vosso entendimento, para que experimenteis qual seja a boa, agradável e perfeita vontade de Deus." },
  { ref: "Hebreus 11:1", text: "Ora, a fé é o firme fundamento das coisas que se esperam e a prova das coisas que se não veem." },
  { ref: "1 Coríntios 13:4-7", text: "O amor é sofredor, é benigno; o amor não é invejoso; o amor não trata com leviandade, não se ensoberbece, não se porta com indecência, não busca os seus interesses, não se irrita, não suspeita mal." },
  { ref: "Efésios 2:8-9", text: "Porque pela graça sois salvos, por meio da fé; e isso não vem de vós; é dom de Deus. Não vem das obras, para que ninguém se glorie." },
  { ref: "Salmos 37:4", text: "Deleita-te também no Senhor, e ele te concederá os desejos do teu coração." },
  { ref: "Mateus 6:33", text: "Mas buscai primeiro o Reino de Deus, e a sua justiça, e todas essas coisas vos serão acrescentadas." },
  { ref: "Salmos 27:1", text: "O Senhor é a minha luz e a minha salvação; a quem temerei? O Senhor é a força da minha vida; de quem me recearei?" },
  { ref: "Isaías 40:31", text: "Mas os que esperam no Senhor renovarão as suas forças, subirão com asas como águias, correrão e não se cansarão, caminharão e não se fatigarão." },
  { ref: "Tiago 1:5", text: "E, se algum de vós tem falta de sabedoria, peça-a a Deus, que a todos dá liberalmente e o não lança em rosto; e ser-lhe-á dada." },
  { ref: "1 Pedro 5:7", text: "Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós." },
  { ref: "Salmos 34:18", text: "Perto está o Senhor dos que têm o coração quebrantado e salva os contritos de espírito." },
  { ref: "Colossenses 3:23", text: "E, tudo quanto fizerdes, fazei-o de todo o coração, como ao Senhor e não aos homens." },
  { ref: "Provérbios 16:3", text: "Confia ao Senhor as tuas obras, e teus pensamentos serão estabelecidos." },
  { ref: "Salmos 121:1-2", text: "Elevarei os meus olhos para os montes, de onde vem o meu socorro. O meu socorro vem do Senhor, que fez o céu e a terra." },
  { ref: "2 Coríntios 5:17", text: "Assim que, se alguém está em Cristo, nova criatura é: as coisas velhas já passaram; eis que tudo se fez novo." },
  { ref: "Apocalipse 21:4", text: "E Deus limpará de seus olhos toda lágrima, e não haverá mais morte, nem pranto, nem clamor, nem dor, porque já as primeiras coisas são passadas." },
  { ref: "Salmos 139:14", text: "Eu te louvarei, porque de um modo assombroso e tão maravilhoso fui formado; maravilhosas são as tuas obras, e a minha alma o sabe muito bem." },
];

// Period contexts for different times of day
const PERIOD_PROMPTS: Record<string, string> = {
  manha: "Você é um pastor evangélico sábio e acolhedor. Escreva uma reflexão devocional MATINAL curta (2-3 frases) baseada no versículo fornecido. O tom deve ser de encorajamento para começar o dia com fé e disposição. Seja inspirador e prático. NÃO repita o versículo. NÃO use markdown.",
  tarde: "Você é um pastor evangélico sábio e acolhedor. Escreva uma reflexão devocional para o meio do dia, curta (2-3 frases) baseada no versículo fornecido. O tom deve ser de renovação de forças e perseverança para continuar o dia. Seja inspirador e prático. NÃO repita o versículo. NÃO use markdown.",
  noite: "Você é um pastor evangélico sábio e acolhedor. Escreva uma reflexão devocional NOTURNA curta (2-3 frases) baseada no versículo fornecido. O tom deve ser de gratidão pelo dia vivido e paz para o descanso. Seja inspirador e prático. NÃO repita o versículo. NÃO use markdown.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "manha"; // manha | tarde | noite

    // Pick verse based on day of year + period offset for variety
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
    
    const periodOffset = period === "manha" ? 0 : period === "tarde" ? 10 : 20;
    const verse = VERSES[(dayOfYear + periodOffset) % VERSES.length];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ verse: verse.text, reference: verse.ref, reflection: "", period }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = PERIOD_PROMPTS[period] || PERIOD_PROMPTS.manha;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Versículo: "${verse.text}" (${verse.ref}). Escreva a reflexão.` }
        ],
      }),
    });

    let reflection = "";
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      reflection = aiData.choices?.[0]?.message?.content || "";
    } else {
      const errText = await aiResponse.text();
      if (aiResponse.status !== 429 && aiResponse.status !== 402) {
        console.error("AI error:", aiResponse.status, errText);
      }
    }

    return new Response(
      JSON.stringify({ verse: verse.text, reference: verse.ref, reflection, period }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("daily-devotional error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
