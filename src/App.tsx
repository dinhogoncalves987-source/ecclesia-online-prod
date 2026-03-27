import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Financeiro from "./pages/Financeiro";
import Membros from "./pages/Membros";
import Agenda from "./pages/Agenda";
import Biblia from "./pages/Biblia";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/financeiro" element={<Financeiro />} />
          <Route path="/admin/membros" element={<Membros />} />
          <Route path="/admin/agenda" element={<Agenda />} />
          <Route path="/admin/biblia" element={<Biblia />} />
          <Route path="/admin/oracoes" element={<PlaceholderPage title="Pedidos de Oração" description="Módulo de pedidos de oração e intercessão em desenvolvimento." />} />
          <Route path="/admin/comunicacao" element={<PlaceholderPage title="Comunicação" description="Módulo de comunicação interna em desenvolvimento." />} />
          <Route path="/admin/grupos" element={<PlaceholderPage title="Pequenos Grupos" description="Módulo de gestão de pequenos grupos em desenvolvimento." />} />
          <Route path="/admin/documentos" element={<PlaceholderPage title="Documentos" description="Biblioteca de documentos em desenvolvimento." />} />
          <Route path="/admin/relatorios" element={<PlaceholderPage title="Relatórios" description="Módulo de relatórios em desenvolvimento." />} />
          <Route path="/admin/escalas" element={<PlaceholderPage title="Escalas" description="Módulo de escalas de serviço em desenvolvimento." />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
