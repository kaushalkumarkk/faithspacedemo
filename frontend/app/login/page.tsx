"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";

const schema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Password is required") });
type Form = z.infer<typeof schema>;

const DEMO_PASSWORD = "Demo1234!";
const DEMOS = [
  { label: "Admin", email: "admin@faithspace.demo", hint: "Moderate content" },
  { label: "Creator", email: "creator@faithspace.demo", hint: "Upload & publish" },
  { label: "Viewer", email: "viewer@faithspace.demo", hint: "Watch & listen" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  // Redirect after login is handled by the app shell (role-based).
  const submit = async (v: Form) => {
    try {
      const u = await login(v.email, v.password);
      toast.success(`Welcome back, ${u.display_name}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AuthLayout>
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Log in to watch, listen and create.</p>
      </div>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" placeholder="you@example.com" className="h-11" {...register("email")} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" placeholder="••••••••" className="h-11" {...register("password")} /></Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Log in</Button>
      </form>
      <p className="text-center text-sm text-muted">New here? <Link href="/register" className="font-medium text-brand">Create an account</Link></p>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Demo accounts · password {DEMO_PASSWORD}</p>
        <div className="grid grid-cols-3 gap-2">
          {DEMOS.map((d) => (
            <button key={d.label} type="button" data-testid={`demo-${d.label.toLowerCase()}`} disabled={isSubmitting}
              onClick={() => { setValue("email", d.email); setValue("password", DEMO_PASSWORD); handleSubmit(submit)(); }}
              className="rounded-xl border border-line bg-bg p-3 text-left transition hover:border-brand hover:bg-brand/5 disabled:opacity-50">
              <span className="block text-sm font-semibold">{d.label}</span>
              <span className="block text-[11px] leading-tight text-muted">{d.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
