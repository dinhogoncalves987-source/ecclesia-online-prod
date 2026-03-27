import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface ExecutiveCardProps {
  title: string;
  value: string;
  trend?: string;
  trendLabel?: string;
  icon: LucideIcon;
  index?: number;
}

export function ExecutiveCard({ title, value, trend, trendLabel, icon: Icon, index = 0 }: ExecutiveCardProps) {
  const isNegative = trend?.startsWith("-");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], delay: index * 0.05 }}
      className="bg-card p-5 sm:p-6 rounded-xl shadow-executive hover:shadow-executive-hover transition-shadow duration-300"
    >
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl sm:text-3xl font-semibold mt-1.5 tracking-tight tabular-nums font-sans">{value}</h3>
        </div>
        <div className="p-2.5 bg-primary/5 rounded-lg flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" strokeWidth={1.5} />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5 text-sm">
          <span className={`font-medium ${isNegative ? "text-destructive" : "text-success"}`}>{trend}</span>
          <span className="text-muted-foreground text-xs">{trendLabel || "vs. mês anterior"}</span>
        </div>
      )}
    </motion.div>
  );
}
