# Ecclesia Admin — Regra de Internacionalização

Idiomas obrigatórios:
- pt-BR
- en-US
- es-MX

## Regra principal

Todo texto novo visível ao usuário deve passar por `useLanguage()` e `t()`.

Não escrever texto novo direto no JSX.

Correto:
const { t, lang } = useLanguage();
<h1>{t("Membros")}</h1>

Errado:
<h1>Membros</h1>

## Novas chaves

Toda chave nova adicionada em `src/hooks/useLanguage.tsx` deve ter:
- pt
- en
- es

Exemplo:
"Membros": {
  pt: "Membros",
  en: "Members",
  es: "Miembros"
}

## Edge Functions e IA

Toda chamada para IA deve enviar o idioma atual:

body: JSON.stringify({
  messages: allMessages,
  locale: lang
})

Toda Edge Function de IA deve ler:

const { messages, locale } = await req.json();

## APIs externas

Toda API externa que entrega texto ao usuário deve receber idioma quando possível.

Exemplo:
- Bíblia: enviar `locale`
- IA: enviar `locale`

## Datasets

Todo dataset novo com texto exibido ao usuário deve:
- usar chaves traduzíveis; ou
- ter campos por idioma; ou
- receber tradução via `t()`

## Fallback

Se a tradução ainda não existir, usar português como fallback.

## Decisão operacional

Não vamos traduzir 100% do app agora.
Vamos apenas garantir que toda tela nova já nasça preparada para tradução.

A tradução fina de textos antigos fica para a etapa final de polimento.
