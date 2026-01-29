import { ForgotPasswordForm } from "@/components/forgot-password-form";

// Force this page to be dynamic so the build emits a lambda instead of a static asset.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
