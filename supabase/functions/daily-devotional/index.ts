import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Verse banks ──────────────────────────────────────────────────────────────
// Each entry has the verse in PT, EN, and ES for full multilingual support.

const VERSES: Array<{ ref: string; pt: string; en: string; es: string }> = [
  {
    ref: "Salmos 23:1 / Psalm 23:1 / Salmos 23:1",
    pt: "O Senhor é o meu pastor; nada me faltará.",
    en: "The Lord is my shepherd; I shall not want.",
    es: "El Señor es mi pastor; nada me faltará.",
  },
  {
    ref: "Provérbios 3:5-6",
    pt: "Confia no Senhor de todo o teu coração e não te estribes no teu próprio entendimento. Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas.",
    en: "Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.",
    es: "Confía en el Señor con todo tu corazón, y no te apoyes en tu propia prudencia. Reconócelo en todos tus caminos, y él enderezará tus veredas.",
  },
  {
    ref: "Isaías 41:10",
    pt: "Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus; eu te fortaleço, e te ajudo, e te sustento com a minha destra fiel.",
    en: "Do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you; I will uphold you with my righteous right hand.",
    es: "No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo; siempre te ayudaré, siempre te sustentaré con la diestra de mi justicia.",
  },
  {
    ref: "Filipenses 4:13",
    pt: "Posso todas as coisas naquele que me fortalece.",
    en: "I can do all things through Christ who strengthens me.",
    es: "Todo lo puedo en Cristo que me fortalece.",
  },
  {
    ref: "Romanos 8:28",
    pt: "E sabemos que todas as coisas contribuem juntamente para o bem daqueles que amam a Deus, daqueles que são chamados por seu decreto.",
    en: "And we know that in all things God works for the good of those who love him, who have been called according to his purpose.",
    es: "Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien, esto es, a los que conforme a su propósito son llamados.",
  },
  {
    ref: "Jeremias 29:11",
    pt: "Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o Senhor; pensamentos de paz e não de mal, para vos dar o fim que esperais.",
    en: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.",
    es: "Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová, pensamientos de paz, y no de mal, para daros el fin que esperáis.",
  },
  {
    ref: "Josué 1:9",
    pt: "Não to mandei eu? Esforça-te e tem bom ânimo; não pasmes, nem te espantes, porque o Senhor, teu Deus, é contigo, por onde quer que andares.",
    en: "Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.",
    es: "Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque el Señor tu Dios estará contigo en dondequiera que vayas.",
  },
  {
    ref: "Mateus 11:28 / Matthew 11:28",
    pt: "Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei.",
    en: "Come to me, all you who are weary and burdened, and I will give you rest.",
    es: "Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.",
  },
  {
    ref: "João 3:16 / John 3:16 / Juan 3:16",
    pt: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.",
    en: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.",
    es: "Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.",
  },
  {
    ref: "Salmos 46:10 / Psalm 46:10",
    pt: "Aquietai-vos e sabei que eu sou Deus; serei exaltado entre os gentios; serei exaltado sobre a terra.",
    en: "Be still, and know that I am God; I will be exalted among the nations, I will be exalted in the earth.",
    es: "Estad quietos y conoced que yo soy Dios; seré exaltado entre las naciones; enaltecido seré en la tierra.",
  },
  {
    ref: "2 Timóteo 1:7 / 2 Timothy 1:7",
    pt: "Porque Deus não nos deu o espírito de temor, mas de fortaleza, e de amor, e de moderação.",
    en: "For the Spirit God gave us does not make us timid, but gives us power, love and self-discipline.",
    es: "Porque no nos ha dado Dios espíritu de cobardía, sino de poder, de amor y de dominio propio.",
  },
  {
    ref: "Salmos 91:1-2 / Psalm 91:1-2",
    pt: "Aquele que habita no esconderijo do Altíssimo, à sombra do Onipotente descansará. Direi do Senhor: Ele é o meu Deus, o meu refúgio, a minha fortaleza, e nele confiarei.",
    en: "Whoever dwells in the shelter of the Most High will rest in the shadow of the Almighty. I will say of the Lord, He is my refuge and my fortress, my God, in whom I trust.",
    es: "El que habita al abrigo del Altísimo morará bajo la sombra del Omnipotente. Diré yo a Jehová: Esperanza mía y castillo mío; mi Dios, en quien confiaré.",
  },
  {
    ref: "Salmos 119:105 / Psalm 119:105",
    pt: "Lâmpada para os meus pés é tua palavra e luz para o meu caminho.",
    en: "Your word is a lamp for my feet, a light on my path.",
    es: "Lámpara es a mis pies tu palabra, y lumbrera a mi camino.",
  },
  {
    ref: "Hebreus 11:1 / Hebrews 11:1 / Hebreos 11:1",
    pt: "Ora, a fé é o firme fundamento das coisas que se esperam e a prova das coisas que se não veem.",
    en: "Now faith is confidence in what we hope for and assurance about what we do not see.",
    es: "Es, pues, la fe la certeza de lo que se espera, la convicción de lo que no se ve.",
  },
  {
    ref: "1 Coríntios 13:4-7 / 1 Corinthians 13:4-7",
    pt: "O amor é sofredor, é benigno; o amor não é invejoso; o amor não trata com leviandade, não se ensoberbece.",
    en: "Love is patient, love is kind. It does not envy, it does not boast, it is not proud.",
    es: "El amor es sufrido, es benigno; el amor no tiene envidia, el amor no es jactancioso, no se envanece.",
  },
  {
    ref: "Efésios 2:8-9 / Ephesians 2:8-9",
    pt: "Porque pela graça sois salvos, por meio da fé; e isso não vem de vós; é dom de Deus. Não vem das obras, para que ninguém se glorie.",
    en: "For it is by grace you have been saved, through faith — and this is not from yourselves, it is the gift of God — not by works, so that no one can boast.",
    es: "Porque por gracia sois salvos por medio de la fe; y esto no de vosotros, pues es don de Dios; no por obras, para que nadie se gloríe.",
  },
  {
    ref: "Salmos 37:4 / Psalm 37:4",
    pt: "Deleita-te também no Senhor, e ele te concederá os desejos do teu coração.",
    en: "Take delight in the Lord, and he will give you the desires of your heart.",
    es: "Deléitate asimismo en el Señor, y él te concederá las peticiones de tu corazón.",
  },
  {
    ref: "Mateus 6:33 / Matthew 6:33",
    pt: "Mas buscai primeiro o Reino de Deus, e a sua justiça, e todas essas coisas vos serão acrescentadas.",
    en: "But seek first his kingdom and his righteousness, and all these things will be given to you as well.",
    es: "Mas buscad primeramente el reino de Dios y su justicia, y todas estas coisas os serán añadidas.",
  },
  {
    ref: "Isaías 40:31",
    pt: "Mas os que esperam no Senhor renovarão as suas forças, subirão com asas como águias, correrão e não se cansarão, caminharão e não se fatigarão.",
    en: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.",
    es: "Pero los que esperan en el Señor renovarán sus fuerzas; levantarán alas como las águilas; correrán, y no se cansarán; caminarán, y no se fatigarán.",
  },
  {
    ref: "1 Pedro 5:7 / 1 Peter 5:7",
    pt: "Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.",
    en: "Cast all your anxiety on him because he cares for you.",
    es: "Echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros.",
  },
  {
    ref: "Salmos 34:18 / Psalm 34:18",
    pt: "Perto está o Senhor dos que têm o coração quebrantado e salva os contritos de espírito.",
    en: "The Lord is close to the brokenhearted and saves those who are crushed in spirit.",
    es: "Cercano está el Señor a los quebrantados de corazón; y salva a los contritos de espíritu.",
  },
  {
    ref: "Colossenses 3:23 / Colossians 3:23",
    pt: "E, tudo quanto fizerdes, fazei-o de todo o coração, como ao Senhor e não aos homens.",
    en: "Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.",
    es: "Y todo lo que hagáis, hacedlo de corazón, como para el Señor y no para los hombres.",
  },
  {
    ref: "2 Coríntios 5:17 / 2 Corinthians 5:17",
    pt: "Assim que, se alguém está em Cristo, nova criatura é: as coisas velhas já passaram; eis que tudo se fez novo.",
    en: "Therefore, if anyone is in Christ, the new creation has come: The old has gone, the new is here!",
    es: "De modo que si alguno está en Cristo, nueva criatura es; las cosas viejas pasaron; he aquí todas son hechas nuevas.",
  },
  {
    ref: "Salmos 139:14 / Psalm 139:14",
    pt: "Eu te louvarei, porque de um modo assombroso e tão maravilhoso fui formado; maravilhosas são as tuas obras, e a minha alma o sabe muito bem.",
    en: "I praise you because I am fearfully and wonderfully made; your works are wonderful, I know that full well.",
    es: "Te alabaré; porque formidables, maravillosas son tus obras; estoy maravillado, y mi alma lo sabe muy bien.",
  },
  {
    ref: "Gálatas 5:22-23 / Galatians 5:22-23",
    pt: "Mas o fruto do Espírito é: amor, gozo, paz, longanimidade, benignidade, bondade, fé, mansidão, temperança.",
    en: "But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control.",
    es: "Mas el fruto del Espíritu es: amor, gozo, paz, paciencia, benignidad, bondad, fe, mansedumbre, templanza.",
  },
  {
    ref: "Romanos 12:2",
    pt: "E não sede conformados com este mundo, mas sede transformados pela renovação do vosso entendimento, para que experimenteis qual seja a boa, agradável e perfeita vontade de Deus.",
    en: "Do not conform to the pattern of this world, but be transformed by the renewing of your mind. Then you will be able to test and approve what God's will is—his good, pleasing and perfect will.",
    es: "No os conforméis a este siglo, sino transformaos por medio de la renovación de vuestro entendimiento, para que comprobéis cuál sea la buena voluntad de Dios, agradable y perfecta.",
  },
  {
    ref: "Salmos 121:1-2 / Psalm 121:1-2",
    pt: "Elevarei os meus olhos para os montes, de onde vem o meu socorro. O meu socorro vem do Senhor, que fez o céu e a terra.",
    en: "I lift up my eyes to the mountains — where does my help come from? My help comes from the Lord, the Maker of heaven and earth.",
    es: "Alzaré mis ojos a los montes; ¿de dónde vendrá mi socorro? Mi socorro viene del Señor, que hizo los cielos y la tierra.",
  },
  {
    ref: "Tiago 1:5 / James 1:5",
    pt: "E, se algum de vós tem falta de sabedoria, peça-a a Deus, que a todos dá liberalmente e o não lança em rosto; e ser-lhe-á dada.",
    en: "If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault, and it will be given to you.",
    es: "Y si alguno de vosotros tiene falta de sabiduría, pídala a Dios, el cual da a todos abundantemente y sin reproche, y le será dada.",
  },
  {
    ref: "Salmos 27:1 / Psalm 27:1",
    pt: "O Senhor é a minha luz e a minha salvação; a quem temerei? O Senhor é a força da minha vida; de quem me recearei?",
    en: "The Lord is my light and my salvation — whom shall I fear? The Lord is the stronghold of my life — of whom shall I be afraid?",
    es: "El Señor es mi luz y mi salvación; ¿a quién temeré? El Señor es la fortaleza de mi vida; ¿de quién me he de atemorizar?",
  },
  {
    ref: "Apocalipse 21:4 / Revelation 21:4",
    pt: "E Deus limpará de seus olhos toda lágrima, e não haverá mais morte, nem pranto, nem clamor, nem dor, porque já as primeiras coisas são passadas.",
    en: "He will wipe every tear from their eyes. There will be no more death or mourning or crying or pain, for the old order of things has passed away.",
    es: "Y Dios enjugará toda lágrima de los ojos de ellos; y ya no habrá muerte, ni habrá más llanto, ni clamor, ni dolor; porque las primeras coisas pasaron.",
  },
];

// ─── Language helpers ─────────────────────────────────────────────────────────

function getLang(locale: string): "pt" | "en" | "es" {
  const l = (locale || "pt").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  return "pt";
}

function getLangLabel(lang: "pt" | "en" | "es"): string {
  return lang === "en" ? "English" : lang === "es" ? "español latinoamericano" : "português brasileiro";
}

function getVerseText(verse: typeof VERSES[0], lang: "pt" | "en" | "es"): string {
  return verse[lang];
}

function getVerseRef(verse: typeof VERSES[0]): string {
  // Return just the first ref part (portuguese canonical)
  return verse.ref.split(" / ")[0];
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function extractGeminiText(data: Record<string, unknown>): string {
  const candidates = data?.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  const parts = candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

const MIN_REFLECTION_CHARS = 180;
const MIN_REFLECTION_SENTENCES = 4;

function countSentences(text: string): number {
  return text.split(/[.!?…]+/).filter((s) => s.trim().length > 8).length;
}

function isReflectionTooShort(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length < MIN_REFLECTION_CHARS) return true;
  if (countSentences(trimmed) < MIN_REFLECTION_SENTENCES) return true;
  return false;
}

function sanitizeReflection(text: string, verseText: string): string {
  let cleaned = text
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .trim();

  const verseSnippet = verseText.slice(0, 40).toLowerCase();
  if (verseSnippet.length > 12 && cleaned.toLowerCase().includes(verseSnippet)) {
    cleaned = cleaned
      .split("\n")
      .filter((line) => !line.toLowerCase().includes(verseSnippet))
      .join("\n")
      .trim();
  }

  return cleaned;
}

function staticReflection(lang: "pt" | "en" | "es", period: string, ref?: string): string {
  const refHint = ref ? ` (${ref})` : "";
  const reflections: Record<string, Record<"pt" | "en" | "es", string>> = {
    manha: {
      pt: `Que esta manhã encontre um coração aberto à voz de Deus${refHint ? ` — a Palavra de hoje${refHint} nos convida a confiar antes de agir` : ""}.
Antes das demandas do dia, reserve um momento para ouvir o Senhor e entregar a Ele suas expectativas.
Esta palavra é direção, não apenas inspiração: ela quer moldar suas atitudes, palavras e decisões.
Quando surgir pressa ou ansiedade, volte a esta verdade e caminhe com calma, sabendo que Deus vai à sua frente.
Pratique hoje uma fé concreta: cumprimente alguém com gentileza, cumpra uma tarefa com integridade ou ore antes de responder.
Não precisa resolver tudo de uma vez; basta dar o próximo passo confiando na fidelidade dEle.
Que a luz desta manhã ilumine cada escolha e que você sinta a presença do Senhor em cada detalhe do dia.`,
      en: `May this morning find your heart open to God's voice${refHint ? ` — today's Word${refHint} invites you to trust before you act` : ""}.
Before the day's demands, take a moment to listen to the Lord and surrender your expectations to Him.
This word is guidance, not just inspiration: it is meant to shape your attitudes, words, and decisions.
When hurry or anxiety arise, return to this truth and walk calmly, knowing God goes before you.
Practice faith in a concrete way today: greet someone kindly, work with integrity, or pray before you respond.
You do not need to solve everything at once; simply take the next step trusting in His faithfulness.
May the light of this morning guide every choice, and may you sense the Lord's presence in each detail of the day.`,
      es: `Que esta mañana encuentre tu corazón abierto a la voz de Dios${refHint ? ` — la Palabra de hoy${refHint} te invita a confiar antes de actuar` : ""}.
Antes de las exigencias del día, dedica un momento para escuchar al Señor y entregarle tus expectativas.
Esta palabra es dirección, no solo inspiración: quiere moldear tus actitudes, palabras y decisiones.
Cuando surjan prisa o ansiedad, vuelve a esta verdad y camina con calma, sabiendo que Dios va delante de ti.
Practica hoy una fe concreta: saluda con amabilidad, trabaja con integridad u ora antes de responder.
No necesitas resolverlo todo de una vez; da el siguiente paso confiando en Su fidelidad.
Que la luz de esta mañana guíe cada elección y sientas la presencia del Señor en cada detalle del día.`,
    },
    tarde: {
      pt: `No meio deste dia, faça uma pausa e renove suas forças na presença do Senhor${refHint ? ` — a mensagem de${refHint} ainda fala ao seu coração` : ""}.
Talvez a manhã tenha sido corrida ou cansativa; mesmo assim, Deus não se afastou de você.
Esta palavra é um lembrete de que você não caminha sozinho e que há graça para continuar.
Reavalié o que ainda pode ser feito com paz: priorize o essencial e entregue a Deus o que não depende de você.
Escolha uma aplicação prática para esta tarde — pedir perdão, ajudar alguém ou concluir algo com excelência.
Não compare seu ritmo com o dos outros; caminhe fielmente no tempo que o Senhor lhe deu.
Que esta tarde seja marcada por perseverança serena e pela certeza de que Ele sustenta cada passo.`,
      en: `In the middle of this day, pause and renew your strength in the Lord's presence${refHint ? ` — the message from${refHint} still speaks to your heart` : ""}.
Perhaps the morning was busy or tiring; even so, God has not moved away from you.
This word reminds you that you do not walk alone and that there is grace to keep going.
Reassess what can still be done with peace: prioritize what matters and surrender what is beyond your control.
Choose one practical application for this afternoon — ask forgiveness, help someone, or finish a task with excellence.
Do not compare your pace with others; walk faithfully in the time the Lord has given you.
May this afternoon be marked by calm perseverance and the certainty that He upholds every step.`,
      es: `En medio de este día, haz una pausa y renueva tus fuerzas en la presencia del Señor${refHint ? ` — el mensaje de${refHint} aún habla a tu corazón` : ""}.
Quizá la mañana fue apresurada o cansada; aun así, Dios no se ha alejado de ti.
Esta palabra te recuerda que no caminas solo y que hay gracia para continuar.
Reevalúa lo que aún puede hacerse con paz: prioriza lo esencial y entrégale a Dios lo que no depende de ti.
Elige una aplicación práctica para esta tarde — pedir perdón, ayudar a alguien o terminar algo con excelencia.
No compares tu ritmo con el de otros; camina fielmente en el tiempo que el Señor te ha dado.
Que esta tarde esté marcada por perseverancia serena y la certeza de que Él sostiene cada paso.`,
    },
    noite: {
      pt: `Ao encerrar este dia, descanse na paz de quem confia em Deus${refHint ? ` — medite na Palavra de${refHint} antes de dormir` : ""}.
Olhe para trás com gratidão pelas provisões recebidas, mesmo nas pequenas coisas que passaram despercebidas.
Perdoe o que ficou pendente em você e entregue a Deus o que ainda pesa no coração.
Esta palavra convida ao descanso da alma, não apenas do corpo — o Senhor cuida de quem Lhe pertence.
Antes de dormir, nomeie uma bênção do dia e uma preocupação que você coloca nas mãos dEle.
Amanhã é nova graça; hoje, apenas receba o amor do Pai e deixe que Ele acalme seus pensamentos.
Que a paz de Cristo guarde seu coração e que você durma seguro sob o cuidado fiel do Senhor.`,
      en: `As you close this day, rest in the peace of those who trust in God${refHint ? ` — meditate on the Word from${refHint} before you sleep` : ""}.
Look back with gratitude for the provisions received, even in small things that went unnoticed.
Forgive what remains unfinished in you and surrender to God what still weighs on your heart.
This word invites rest for the soul, not just the body — the Lord cares for those who belong to Him.
Before sleeping, name one blessing from the day and one worry you place in His hands.
Tomorrow is new grace; tonight, simply receive the Father's love and let Him quiet your thoughts.
May the peace of Christ guard your heart, and may you sleep secure under the Lord's faithful care.`,
      es: `Al cerrar este día, descansa en la paz de quien confía en Dios${refHint ? ` — medita en la Palabra de${refHint} antes de dormir` : ""}.
Mira atrás con gratitud por las provisiones recibidas, incluso en las cosas pequeñas que pasaron desapercibidas.
Perdona lo que quedó pendiente en ti y entrégale a Dios lo que aún pesa en tu corazón.
Esta palabra invita al descanso del alma, no solo del cuerpo — el Señor cuida de quien Le pertenece.
Antes de dormir, nombra una bendición del día y una preocupación que pones en Sus manos.
Mañana es nueva gracia; esta noche, recibe el amor del Padre y deja que Él calme tus pensamientos.
Que la paz de Cristo guarde tu corazón y duermas seguro bajo el cuidado fiel del Señor.`,
    },
  };
  return reflections[period]?.[lang] ?? reflections.manha[lang];
}

// ─── Period prompts ───────────────────────────────────────────────────────────

function buildReflectionPrompt(
  verseText: string,
  ref: string,
  period: string,
  lang: "pt" | "en" | "es",
): string {
  const outputLang = getLangLabel(lang);

  const periodContext: Record<string, Record<"pt" | "en" | "es", string>> = {
    manha: {
      pt: "matinal — encorajador para começar o dia com fé, disposição e propósito",
      en: "morning — encouraging to start the day with faith, energy, and purpose",
      es: "matutino — alentador para comenzar el día con fe, energía y propósito",
    },
    tarde: {
      pt: "do meio do dia — renovação de forças, perseverança para continuar o dia",
      en: "midday — renewal of strength, perseverance to continue through the day",
      es: "del mediodía — renovación de fuerzas, perseverancia para continuar el día",
    },
    noite: {
      pt: "noturno — gratidão pelo dia vivido, paz e descanso na presença de Deus",
      en: "evening — gratitude for the day, peace and rest in God's presence",
      es: "nocturno — gratitud por el día vivido, paz y descanso en la presencia de Dios",
    },
  };

  const tone = periodContext[period]?.[lang] ?? periodContext.manha[lang];

  const structure = lang === "pt"
    ? "Estrutura sugerida (5 a 8 linhas curtas, separadas por quebra de linha):\n1) Abertura acolhedora ligada ao momento do dia\n2) Insight espiritual sobre o versículo (sem citá-lo)\n3) Aplicação prática concreta para hoje\n4) Encorajamento pastoral para encerrar"
    : lang === "en"
      ? "Suggested structure (5 to 8 short lines, separated by line breaks):\n1) Warm opening tied to the time of day\n2) Spiritual insight about the verse (without quoting it)\n3) Concrete practical application for today\n4) Pastoral encouragement to close"
      : "Estructura sugerida (5 a 8 líneas cortas, separadas por salto de línea):\n1) Apertura acogedora ligada al momento del día\n2) Insight espiritual sobre el versículo (sin citarlo)\n3) Aplicación práctica concreta para hoy\n4) Ánimo pastoral para cerrar";

  return lang === "pt"
    ? `Você é um pastor evangélico experiente, acolhedor e claro. Escreva uma reflexão devocional ${tone}, com 5 a 8 linhas (cada linha = uma frase completa).

Regras:
- NÃO repita o versículo, NÃO cite a referência, NÃO use markdown ou listas.
- Linguagem simples, espiritual e acolhedora — como uma conversa pastoral breve.
- Inclua uma aplicação prática específica para o dia de hoje.
- Evite frases genéricas vazias; seja concreto e pessoal.
- Responda APENAS em ${outputLang}.

${structure}

Versículo base (não repita): "${verseText}" (${ref})

Reflexão:`
    : lang === "en"
      ? `You are a warm, experienced evangelical pastor. Write a ${tone} devotional reflection with 5 to 8 lines (each line = one complete sentence).

Rules:
- Do NOT repeat the verse, do NOT cite the reference, do NOT use markdown or bullet lists.
- Use simple, spiritual, welcoming language — like a brief pastoral conversation.
- Include a specific practical application for today.
- Avoid empty generic phrases; be concrete and personal.
- Respond ONLY in ${outputLang}.

${structure}

Base verse (do not repeat): "${verseText}" (${ref})

Reflection:`
      : `Eres un pastor evangélico experimentado, cálido y claro. Escribe una reflexión devocional ${tone}, con 5 a 8 líneas (cada línea = una oración completa).

Reglas:
- NO repitas el versículo, NO cites la referencia, NO uses markdown ni listas.
- Lenguaje simple, espiritual y acogedor — como una conversación pastoral breve.
- Incluye una aplicación práctica específica para hoy.
- Evita frases genéricas vacías; sé concreto y personal.
- Responde SOLO en ${outputLang}.

${structure}

Versículo base (no repetir): "${verseText}" (${ref})

Reflexión:`;
}

function buildRetryPrompt(
  verseText: string,
  ref: string,
  period: string,
  lang: "pt" | "en" | "es",
  previous: string,
): string {
  const base = buildReflectionPrompt(verseText, ref, period, lang);
  const retryNote = lang === "pt"
    ? `\n\nSua resposta anterior ficou curta demais:\n"${previous.slice(0, 120)}..."\n\nReescreva com 5 a 8 linhas completas, mais profundas e práticas.`
    : lang === "en"
      ? `\n\nYour previous answer was too short:\n"${previous.slice(0, 120)}..."\n\nRewrite with 5 to 8 complete lines, deeper and more practical.`
      : `\n\nTu respuesta anterior fue demasiado corta:\n"${previous.slice(0, 120)}..."\n\nReescribe con 5 a 8 líneas completas, más profundas y prácticas.`;
  return base + retryNote;
}

async function generateReflection(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const geminiResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.75,
          topP: 0.92,
          maxOutputTokens: 768,
        },
        thinkingConfig: { thinkingBudget: 0 },
      }),
    },
  );

  if (!geminiResp.ok) {
    const errText = await geminiResp.text();
    console.error("Gemini devotional error:", geminiResp.status, errText);
    return "";
  }

  const geminiData = await geminiResp.json();
  return extractGeminiText(geminiData);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "manha"; // manha | tarde | noite
    const locale = url.searchParams.get("locale") || "pt";
    const lang = getLang(locale);

    // Pick verse based on day of year + period offset for variety
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);

    const periodOffset = period === "manha" ? 0 : period === "tarde" ? 10 : 20;
    const refreshSeed = url.searchParams.get("seed") ?? url.searchParams.get("refreshSeed");
    const forceRefresh = url.searchParams.get("forceRefresh") === "1";

    let verseIndex: number;
    if (refreshSeed || forceRefresh) {
      const seed = refreshSeed ?? String(now.getTime());
      const h1 = hashSeed(`${seed}:${period}:${locale}`);
      const h2 = hashSeed(`${seed}-v2-${period}`);
      const h3 = parseInt(seed.replace(/\D/g, "").slice(-8), 10) || 0;
      verseIndex = (h1 + h2 + h3) % VERSES.length;
    } else {
      verseIndex = (dayOfYear + periodOffset) % VERSES.length;
    }
    const verseEntry = VERSES[verseIndex];
    const verseText = getVerseText(verseEntry, lang);
    const verseRef = getVerseRef(verseEntry);

    // Always return the verse immediately; reflection is AI-generated if key exists
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({
          verse: verseText,
          reference: verseRef,
          reflection: staticReflection(lang, period, verseRef),
          period,
          reflectionSource: "static",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const prompt = buildReflectionPrompt(verseText, verseRef, period, lang);
    let reflection = sanitizeReflection(
      await generateReflection(GEMINI_API_KEY, prompt),
      verseText,
    );
    let reflectionSource = reflection ? "ai" : "static";

    if (reflection && isReflectionTooShort(reflection)) {
      const retryPrompt = buildRetryPrompt(verseText, verseRef, period, lang, reflection);
      const retryReflection = sanitizeReflection(
        await generateReflection(GEMINI_API_KEY, retryPrompt),
        verseText,
      );
      if (retryReflection && !isReflectionTooShort(retryReflection)) {
        reflection = retryReflection;
        reflectionSource = "ai";
      }
    }

    if (!reflection || isReflectionTooShort(reflection)) {
      reflection = staticReflection(lang, period, verseRef);
      reflectionSource = "static";
    }

    return new Response(
      JSON.stringify({ verse: verseText, reference: verseRef, reflection, period, reflectionSource }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("daily-devotional error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
