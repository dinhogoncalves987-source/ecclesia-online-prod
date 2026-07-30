import { NavLink } from "react-router-dom";
import { Radio, CalendarDays, Archive, Settings2 } from "lucide-react";

const tabs = [
  { to: "/admin/tv/ao-vivo",       label: "Ao Vivo",      icon: Radio,        end: false },
  { to: "/admin/tv/programacao",   label: "Programação",  icon: CalendarDays, end: false },
  { to: "/admin/tv/biblioteca",    label: "Biblioteca",   icon: Archive,      end: false },
  { to: "/admin/tv/configuracoes", label: "Configurações",icon: Settings2,    end: false },
];

export function TvAdminNav() {
  return (
    <nav className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
      {tabs.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`
          }
        >
          <Icon className="w-4 h-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
