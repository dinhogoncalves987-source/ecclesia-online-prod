import { AdminLayout } from "@/components/AdminLayout";
import { Construction } from "lucide-react";

export default function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <AdminLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 bg-accent/10 rounded-2xl mb-4">
          <Construction size={32} strokeWidth={1.5} className="text-accent" />
        </div>
        <h1 className="text-2xl font-serif tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">{description}</p>
      </div>
    </AdminLayout>
  );
}
