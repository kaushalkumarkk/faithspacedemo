"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input, Select } from "@/components/ui";
import { useAuth } from "@/lib/auth";

const schema = z.object({
  display_name: z.string().min(2, "At least 2 characters").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").max(72),
  role: z.enum(["viewer", "creator"]),
});
type Form = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: signUp } = useAuth();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { role: "viewer" } });
  const submit = async (v: Form) => {
    try { await signUp(v); toast.success("Account created"); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <AuthLayout>
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted">Join the community in under a minute.</p>
      </div>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Field label="Display name" error={errors.display_name?.message}><Input autoComplete="name" className="h-11" {...register("display_name")} /></Field>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" className="h-11" {...register("email")} /></Field>
        <Field label="Password" error={errors.password?.message} hint="8+ characters"><Input type="password" autoComplete="new-password" className="h-11" {...register("password")} /></Field>
        <Field label="I want to" error={errors.role?.message}>
          <Select className="h-11" {...register("role")}><option value="viewer">Watch and listen</option><option value="creator">Create videos and podcasts</option></Select>
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Create account</Button>
      </form>
      <p className="text-center text-sm text-muted">Already registered? <Link href="/login" className="font-medium text-brand">Log in</Link></p>
    </AuthLayout>
  );
}
