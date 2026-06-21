import Image from "next/image";
import Link from "next/link";

export function AuthPageShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 terminal-grid">
      <div className="mx-auto w-full max-w-xl">
        <Link href="/" className="mb-6 flex justify-center"><Image src="/cmip-logo.jpg" alt="CMIP" width={202} height={99} priority className="h-20 w-auto object-contain invert mix-blend-screen" /></Link>
        <section className="rounded-lg border border-[#2f3d58] bg-[#111827]/95 p-5 shadow-2xl sm:p-7">
          <h1 className="text-xl font-black text-foreground sm:text-2xl">{title}</h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </main>
  );
}

