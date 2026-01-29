import { UpdatePasswordForm } from "@/components/update-password-form";

// Force this page to be dynamic so a lambda is generated for the /auth/update-password route.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
