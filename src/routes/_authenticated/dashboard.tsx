import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { listMySites } from "@/lib/sites.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Meu site — MRO.BIO" }] }),
  component: Dashboard,
});

function Dashboard() {
  const nav = useNavigate();
  const fn = useServerFn(listMySites);
  const { data, isLoading } = useQuery({ queryKey: ["my-sites"], queryFn: () => fn() });

  useEffect(() => {
    if (isLoading || !data) return;
    const site = data.sites[0];
    if (site) {
      nav({ to: "/sites/$id", params: { id: site.id }, replace: true });
    } else {
      nav({ to: "/sites/novo", replace: true });
    }
  }, [data, isLoading, nav]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-20 text-center">
      <p className="text-sm text-muted-foreground">Carregando seu site...</p>
    </main>
  );
}
