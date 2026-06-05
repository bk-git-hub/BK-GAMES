"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { useState } from "react";
import { Loader2, LogIn, UserPlus, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

type AuthModeConfig = {
  description: string;
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
    description: "Use your BK Games account to continue.",
    icon: LogIn,
    submitLabel: "Sign in",
    tabLabel: "Sign in",
  },
  "sign-up": {
    description: "Create a local account for the BK Games platform.",
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
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>{modeConfig.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={mode}
          onValueChange={handleModeChange}
          className="gap-6"
        >
          <TabsList className="grid w-full grid-cols-2">
            {authModes.map((authMode) => (
              <TabsTrigger key={authMode} value={authMode}>
                {authModeConfig[authMode].tabLabel}
              </TabsTrigger>
            ))}
          </TabsList>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <TabsContent value={mode} className="mt-0 flex flex-col gap-4">
              <AuthFields mode={mode} disabled={isSubmitting} />
            </TabsContent>

            <AuthError>{error}</AuthError>

            <AuthSubmitButton
              disabled={isSubmitting}
              icon={modeConfig.icon}
              isSubmitting={isSubmitting}
            >
              {modeConfig.submitLabel}
            </AuthSubmitButton>
          </form>
        </Tabs>
      </CardContent>
    </Card>
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
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...inputProps} />
    </div>
  );
}

function AuthError({ children }: { children: string | null }) {
  if (!children) {
    return null;
  }

  return (
    <p
      className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
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
    <Button type="submit" disabled={disabled} className="w-full">
      {isSubmitting ? <Loader2 className="animate-spin" /> : <Icon />}
      {children}
    </Button>
  );
}
