import { createContext, useContext, useState, ReactNode } from "react";

type Lang = "pt" | "en" | "es";

const translations: Record<string, Record<Lang, string>> = {
  // Layout
  "Bem-vindo de volta": { pt: "Bem-vindo de volta", en: "Welcome back", es: "Bienvenido de vuelta" },
  "VER EM TELA CHEIA": { pt: "VER EM TELA CHEIA", en: "FULLSCREEN", es: "PANTALLA COMPLETA" },
  "SAIR TELA CHEIA": { pt: "SAIR TELA CHEIA", en: "EXIT FULLSCREEN", es: "SALIR PANTALLA" },
  "Recolher": { pt: "Recolher", en: "Collapse", es: "Contraer" },
  "Configurações": { pt: "Configurações", en: "Settings", es: "Configuración" },
  "Sair": { pt: "Sair", en: "Sign out", es: "Salir" },
  // Nav
  "Dashboard": { pt: "Dashboard", en: "Dashboard", es: "Panel" },
  "Financeiro": { pt: "Financeiro", en: "Finances", es: "Finanzas" },
  "Membros": { pt: "Membros", en: "Members", es: "Miembros" },
  "Agenda": { pt: "Agenda", en: "Calendar", es: "Agenda" },
  "Bíblia Sagrada": { pt: "Bíblia Sagrada", en: "Holy Bible", es: "Santa Biblia" },
  "Pedidos de Oração": { pt: "Pedidos de Oração", en: "Prayer Requests", es: "Peticiones de Oración" },
  "Comunicação": { pt: "Comunicação", en: "Communication", es: "Comunicación" },
  "Pequenos Grupos": { pt: "Pequenos Grupos", en: "Small Groups", es: "Grupos Pequeños" },
  "Documentos": { pt: "Documentos", en: "Documents", es: "Documentos" },
  "Relatórios": { pt: "Relatórios", en: "Reports", es: "Informes" },
  "Escalas": { pt: "Escalas", en: "Schedules", es: "Escalas" },
  // Mobile nav
  "Início": { pt: "Início", en: "Home", es: "Inicio" },
  "Finanças": { pt: "Finanças", en: "Finances", es: "Finanzas" },
  "Bíblia": { pt: "Bíblia", en: "Bible", es: "Biblia" },
  "Perfil": { pt: "Perfil", en: "Profile", es: "Perfil" },
  // Dashboard
  "Visão geral da administração": { pt: "Visão geral da administração", en: "Administration overview", es: "Visión general" },
  "Receita do Mês": { pt: "Receita do Mês", en: "Monthly Revenue", es: "Ingresos del Mes" },
  "Despesas do Mês": { pt: "Despesas do Mês", en: "Monthly Expenses", es: "Gastos del Mes" },
  "Membros Ativos": { pt: "Membros Ativos", en: "Active Members", es: "Miembros Activos" },
  "Eventos no Mês": { pt: "Eventos no Mês", en: "Monthly Events", es: "Eventos del Mes" },
  "Próximos Eventos": { pt: "Próximos Eventos", en: "Upcoming Events", es: "Próximos Eventos" },
  "Ver todos": { pt: "Ver todos", en: "View all", es: "Ver todos" },
  "Nenhum evento próximo": { pt: "Nenhum evento próximo", en: "No upcoming events", es: "Sin eventos próximos" },
  "Avisos": { pt: "Avisos", en: "Notices", es: "Avisos" },
  "Acesso Rápido": { pt: "Acesso Rápido", en: "Quick Access", es: "Acceso Rápido" },
  "Novo Evento": { pt: "Novo Evento", en: "New Event", es: "Nuevo Evento" },
  "Marcar todos como lidos": { pt: "Marcar todos como lidos", en: "Mark all as read", es: "Marcar todos como leídos" },
  // Financeiro
  "Tesouraria e controle contábil": { pt: "Tesouraria e controle contábil", en: "Treasury and accounting", es: "Tesorería y contabilidad" },
  "Exportar": { pt: "Exportar", en: "Export", es: "Exportar" },
  "Lançamento": { pt: "Lançamento", en: "New Entry", es: "Nuevo Registro" },
  "Novo Lançamento": { pt: "Novo Lançamento", en: "New Entry", es: "Nuevo Registro" },
  "Salvar Lançamento": { pt: "Salvar Lançamento", en: "Save Entry", es: "Guardar Registro" },
  "Movimentações Recentes": { pt: "Movimentações Recentes", en: "Recent Transactions", es: "Movimientos Recientes" },
  "Receita Total": { pt: "Receita Total", en: "Total Revenue", es: "Ingresos Totales" },
  "Despesas Totais": { pt: "Despesas Totais", en: "Total Expenses", es: "Gastos Totales" },
  "Saldo Atual": { pt: "Saldo Atual", en: "Current Balance", es: "Saldo Actual" },
  "Reserva": { pt: "Reserva", en: "Reserve", es: "Reserva" },
  "Chave PIX da Igreja": { pt: "Chave PIX da Igreja", en: "Church PIX Key", es: "Clave PIX de la Iglesia" },
  "Copiar Chave PIX": { pt: "Copiar Chave PIX", en: "Copy PIX Key", es: "Copiar Clave PIX" },
  "Chave copiada!": { pt: "Chave copiada!", en: "Key copied!", es: "¡Clave copiada!" },
  "Dizimar via PIX": { pt: "Dizimar via PIX", en: "Tithe via PIX", es: "Diezmo via PIX" },
  // Oracoes
  "Compartilhe e interceda pelos pedidos da comunidade": { pt: "Compartilhe e interceda pelos pedidos da comunidade", en: "Share and pray for community requests", es: "Comparte e intercede por los pedidos de la comunidad" },
  "Novo Pedido": { pt: "Novo Pedido", en: "New Request", es: "Nuevo Pedido" },
  "Todos": { pt: "Todos", en: "All", es: "Todos" },
  "Ativo": { pt: "Ativo", en: "Active", es: "Activo" },
  "Respondido": { pt: "Respondido", en: "Answered", es: "Respondido" },
  "Nenhum pedido de oração encontrado": { pt: "Nenhum pedido de oração encontrado", en: "No prayer requests found", es: "No se encontraron peticiones" },
  "Anônimo": { pt: "Anônimo", en: "Anonymous", es: "Anónimo" },
  "Membro": { pt: "Membro", en: "Member", es: "Miembro" },
  "orando": { pt: "orando", en: "praying", es: "orando" },
  "Estou orando": { pt: "🙏 Estou orando", en: "🙏 Praying", es: "🙏 Orando" },
  "AMÉM": { pt: "🙌 AMÉM", en: "🙌 AMEN", es: "🙌 AMÉN" },
  "Novo Pedido de Oração": { pt: "Novo Pedido de Oração", en: "New Prayer Request", es: "Nuevo Pedido de Oración" },
  "Título do pedido": { pt: "Título do pedido", en: "Request title", es: "Título del pedido" },
  "Descrição (opcional)": { pt: "Descrição (opcional)", en: "Description (optional)", es: "Descripción (opcional)" },
  "Enviar de forma anônima": { pt: "Enviar de forma anônima", en: "Send anonymously", es: "Enviar de forma anónima" },
  "Cancelar": { pt: "Cancelar", en: "Cancel", es: "Cancelar" },
  "Enviar Pedido": { pt: "Enviar Pedido", en: "Submit Request", es: "Enviar Pedido" },
  "Pedido registrado!": { pt: "Pedido registrado!", en: "Request submitted!", es: "¡Pedido registrado!" },
  "Carregando...": { pt: "Carregando...", en: "Loading...", es: "Cargando..." },
  "Erro": { pt: "Erro", en: "Error", es: "Error" },
  // Bible
  "Leitura e meditação — Tradução Almeida": { pt: "Leitura e meditação — Tradução Almeida", en: "Reading & meditation — Almeida Translation", es: "Lectura y meditación — Traducción Almeida" },
  "Letras Gigantes": { pt: "Letras Gigantes", en: "Large Font", es: "Letra Grande" },
  "Assistente IA": { pt: "Assistente IA", en: "AI Assistant", es: "Asistente IA" },
  "Modo Zen": { pt: "Modo Zen", en: "Zen Mode", es: "Modo Zen" },
  "Selecionar Livro": { pt: "Selecionar Livro", en: "Select Book", es: "Seleccionar Libro" },
  "Buscar livro...": { pt: "Buscar livro...", en: "Search book...", es: "Buscar libro..." },
  "Antigo Testamento": { pt: "Antigo Testamento", en: "Old Testament", es: "Antiguo Testamento" },
  "Novo Testamento": { pt: "Novo Testamento", en: "New Testament", es: "Nuevo Testamento" },
  "capítulos": { pt: "capítulos", en: "chapters", es: "capítulos" },
  "Pergunte sobre a Bíblia...": { pt: "Pergunte sobre a Bíblia...", en: "Ask about the Bible...", es: "Pregunta sobre la Biblia..." },
  "Assistente Bíblico": { pt: "Assistente Bíblico", en: "Bible Assistant", es: "Asistente Bíblico" },
  "Assistente Bíblico com IA": { pt: "Assistente Bíblico com IA", en: "AI Bible Assistant", es: "Asistente Bíblico con IA" },
  "Faça perguntas, peça esboços e estudos profundos.": { pt: "Faça perguntas, peça esboços e estudos profundos.", en: "Ask questions, request outlines and deep studies.", es: "Haz preguntas, pide bosquejos y estudios profundos." },
  "Anterior": { pt: "Anterior", en: "Previous", es: "Anterior" },
  "Próximo": { pt: "Próximo", en: "Next", es: "Siguiente" },
};

type LanguageContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  lang: "pt",
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("app-lang");
    return (saved as Lang) || "pt";
  });

  const changeLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem("app-lang", l);
  };

  const t = (key: string): string => {
    return translations[key]?.[lang] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
