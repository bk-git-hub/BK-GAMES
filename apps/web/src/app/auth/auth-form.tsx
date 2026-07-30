"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { useState } from "react";
import {
  BadgeCheck,
  Loader2,
  LogIn,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

type AuthModeConfig = {
  description: string;
  heading: string;
  icon: LucideIcon;
  submitLabel: string;
  tabLabel: string;
};

type AuthFormValues = {
  email: string;
  name: string;
  password: string;
};

const defaultError = "Authentication failed. Please try again.";

const authModeConfig: Record<AuthMode, AuthModeConfig> = {
  "sign-in": {
    description: "Use your account to keep playing.",
    heading: "Welcome back",
    icon: LogIn,
    submitLabel: "Sign in",
    tabLabel: "Sign in",
  },
  "sign-up": {
    description: "Create an account for points and rewards.",
    heading: "Join BK Games",
    icon: UserPlus,
    submitLabel: "Create account",
    tabLabel: "Sign up",
  },
};

const authModes = Object.keys(authModeConfig) as AuthMode[];

function isAuthMode(value: string): value is AuthMode {
  return value in authModeConfig;
}

function getFormValues(form: HTMLFormElement): AuthFormValues {
  const formData = new FormData(form);

  return {
    email: String(formData.get("email") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

async function submitAuthForm(mode: AuthMode, values: AuthFormValues) {
  if (mode === "sign-up") {
    return authClient.signUp.email({
      email: values.email,
      password: values.password,
      name: values.name,
      callbackURL: "/",
    });
  }

  return authClient.signIn.email({
    email: values.email,
    password: values.password,
    callbackURL: "/",
  });
}

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modeConfig = authModeConfig[mode];
  const ModeIcon = modeConfig.icon;

  const handleModeChange = (value: string) => {
    if (!isAuthMode(value)) {
      return;
    }

    setError(null);
    setMode(value);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await submitAuthForm(
        mode,
        getFormValues(event.currentTarget)
      );

      if (result.error) {
        setError(result.error.message ?? defaultError);
        return;
      }

      router.replace("/");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[1.35rem] border-[2px] border-[#111827] bg-[#f1f7fd] shadow-[8px_9px_0_#0b3b73]">
      <div className="border-b border-[#b8c7da] bg-white p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-md border border-[#071c3f] bg-[#d8ecff] text-[#111827] shadow-[0_5px_0_#071c3f]">
            <ModeIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black tracking-normal text-[#c8272e] uppercase">
              Account access
            </p>
            <h2 className="mt-1 text-3xl leading-none font-black tracking-normal text-[#111827]">
              {modeConfig.heading}
            </h2>
            <p className="mt-2 text-sm leading-6 font-bold text-[#4b5874]">
              {modeConfig.description}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div
          aria-label="Choose account mode"
          className="grid grid-cols-2 gap-2 rounded-[0.95rem] border border-[#071c3f] bg-[#071c3f] p-1"
        >
          {authModes.map((authMode) => {
            const isActive = authMode === mode;

            return (
              <button
                aria-pressed={isActive}
                className={cn(
                  "inline-flex min-h-12 items-center justify-center rounded-[0.7rem] px-3 text-sm font-black tracking-normal uppercase transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#8fc4e8]",
                  isActive
                    ? "bg-[#eef7ff] text-[#071c3f] shadow-[0_3px_0_#c8272e]"
                    : "text-[#d8ecff] hover:bg-white/10 hover:text-white",
                )}
                disabled={isSubmitting}
                id={`${authMode}-tab`}
                key={authMode}
                onClick={() => handleModeChange(authMode)}
                type="button"
              >
                {authModeConfig[authMode].tabLabel}
              </button>
            );
          })}
        </div>

        <form
          aria-labelledby={`${mode}-tab`}
          className="mt-6 flex flex-col gap-4"
          onSubmit={handleSubmit}
        >
          <AuthFields mode={mode} disabled={isSubmitting} />

          <AuthError>{error}</AuthError>

          <AuthSubmitButton
            disabled={isSubmitting}
            icon={modeConfig.icon}
            isSubmitting={isSubmitting}
          >
            {modeConfig.submitLabel}
          </AuthSubmitButton>
        </form>

        <div className="mt-5 flex items-start gap-2 rounded-[0.95rem] border border-[#b8c7da] bg-white px-4 py-3 text-sm leading-6 font-bold text-[#4b5874]">
          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-[#0b3b73]" />
          Login is only needed when you claim points or place a bet.
        </div>
      </div>
    </section>
  );
}

function AuthFields({
  disabled,
  mode,
}: {
  disabled: boolean;
  mode: AuthMode;
}) {
  return (
    <>
      {mode === "sign-up" ? (
        <AuthField
          autoComplete="name"
          disabled={disabled}
          id="name"
          label="Name"
          minLength={2}
          name="name"
          required
        />
      ) : null}

      <AuthField
        autoComplete="email"
        disabled={disabled}
        id="email"
        label="Email"
        name="email"
        required
        type="email"
      />

      <AuthField
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        disabled={disabled}
        id="password"
        label="Password"
        minLength={8}
        name="password"
        required
        type="password"
      />
    </>
  );
}

function AuthField({
  id,
  label,
  ...inputProps
}: {
  id: string;
  label: string;
} & ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-2">
      <Label
        className="text-xs font-black tracking-normal text-[#071c3f] uppercase"
        htmlFor={id}
      >
        {label}
      </Label>
      <Input
        className="h-12 rounded-md border-[#071c3f] bg-white px-3 text-base font-bold text-[#111827] shadow-[0_3px_0_#b8c7da] focus-visible:border-[#0b3b73] focus-visible:ring-[#8fc4e8]/60 disabled:bg-[#edf4fb]"
        id={id}
        {...inputProps}
      />
    </div>
  );
}

function AuthError({ children }: { children: string | null }) {
  if (!children) {
    return null;
  }

  return (
    <p
      className="rounded-md border border-[#c8272e] bg-[#fff0ef] px-3 py-2 text-sm leading-6 font-bold text-[#c8272e]"
      role="alert"
    >
      {children}
    </p>
  );
}

function AuthSubmitButton({
  children,
  disabled,
  icon: Icon,
  isSubmitting,
}: {
  children: ReactNode;
  disabled: boolean;
  icon: LucideIcon;
  isSubmitting: boolean;
}) {
  return (
    <Button
      type="submit"
      disabled={disabled}
      className="h-12 w-full rounded-md border border-[#071c3f] bg-[#0b3b73] px-5 text-sm font-black tracking-normal text-white uppercase shadow-[0_5px_0_#071c3f] transition hover:-translate-y-0.5 hover:bg-[#c8272e] hover:shadow-[0_6px_0_#7d161b] disabled:translate-y-0 disabled:bg-[#4b5874] disabled:shadow-[0_3px_0_#071c3f]"
    >
      {isSubmitting ? <Loader2 className="animate-spin" /> : <Icon />}
      {children}
    </Button>
  );
}
