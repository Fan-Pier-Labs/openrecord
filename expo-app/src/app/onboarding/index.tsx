import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  setSecureValue,
  getClaudeApiKey,
  type StoredMyChartAccount,
} from "@/lib/storage/secure-store";
import { getBackendSession } from "@/lib/backend/session";
import { prefetchInstances, type MyChartInstance } from "@/lib/mychart-instances";
import { WelcomeStep } from "./steps/welcome-step";
import { GoogleStep } from "./steps/google-step";
import { PickerStep } from "./steps/picker-step";
import { AccountChoiceStep, type AccountChoice } from "./steps/account-choice-step";
import { MyChartStep } from "./steps/mychart-step";
import { ActivateStep } from "./steps/activate-step";
import { SignupStep } from "./steps/signup-step";
import { RecoverStep } from "./steps/recover-step";
import { TwoFaStep } from "./steps/twofa-step";
import { PasskeyStep } from "./steps/passkey-step";

type Step =
  | "welcome"
  | "google"
  | "picker"
  | "account-choice"
  | "mychart"
  | "activate"
  | "signup"
  | "recover"
  | "twofa"
  | "passkey";

/**
 * Onboarding orchestrator. Owns the current step and the cross-step state
 * (signed-in email, selected provider, resolved hostname, connected MyChart
 * account, 2FA delivery label) and renders one step component at a time. Each
 * step owns its own UI-local state (form fields, in-flight flags) and reports
 * back through callbacks.
 *
 * Google sign-in is required: AI (including BYO keys) is gated behind it,
 * and it is what unlocks the $50/month included AI credit — the Lambda
 * verifies the Google ID token server-side.
 *
 * After picking a provider, the account-choice hub branches into the existing
 * sign-in flow or the no-account / forgot-login flows: activation code,
 * self-signup, and account recovery. All branches converge on a connected
 * account → passkey setup → done.
 */
export default function OnboardingScreen() {
  const { setSetupComplete } = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<MyChartInstance | null>(null);
  const [hostname, setHostname] = useState<string>("");
  const [account, setAccount] = useState<StoredMyChartAccount | null>(null);
  const [twoFaDelivery, setTwoFaDelivery] = useState<string>("your inbox");

  // Dev shortcut: BYO Claude key + Google session → straight to chat.
  // Also pre-warm the MyChart instance list so the picker is instant.
  useEffect(() => {
    (async () => {
      const [byoKey, session] = await Promise.all([
        getClaudeApiKey(),
        getBackendSession(),
      ]);
      if (session) setSignedInEmail(session.user.email);
      if (__DEV__ && byoKey && session) {
        await setSecureValue("setup_complete", "true");
        setSetupComplete();
        return;
      }
      prefetchInstances().catch(() => undefined);
    })();
  }, [setSetupComplete]);

  async function finishSetup() {
    await setSecureValue("setup_complete", "true");
    setSetupComplete();
  }

  if (step === "welcome") {
    return <WelcomeStep onGetStarted={() => setStep("google")} />;
  }

  if (step === "google") {
    return (
      <GoogleStep
        initialEmail={signedInEmail}
        onSignedIn={(email) => {
          setSignedInEmail(email);
          setStep("picker");
        }}
      />
    );
  }

  if (step === "picker") {
    return (
      <PickerStep
        onPick={(instance) => {
          setSelectedInstance(instance);
          setStep("account-choice");
        }}
        onManualEntry={() => {
          setSelectedInstance(null);
          setStep("account-choice");
        }}
      />
    );
  }

  if (step === "account-choice") {
    const route: Record<AccountChoice, Step> = {
      "sign-in": "mychart",
      activate: "activate",
      signup: "signup",
      recover: "recover",
    };
    return (
      <AccountChoiceStep
        instance={selectedInstance}
        onChangeInstance={() => setStep("picker")}
        onChoose={(choice, host) => {
          setHostname(host);
          setStep(route[choice]);
        }}
      />
    );
  }

  if (step === "mychart") {
    return (
      <MyChartStep
        instance={selectedInstance}
        hostname={hostname}
        onChangeInstance={() => setStep("account-choice")}
        onLoggedIn={(acc) => {
          setAccount(acc);
          setStep("passkey");
        }}
        onNeed2fa={(acc, label) => {
          setAccount(acc);
          setTwoFaDelivery(label);
          setStep("twofa");
        }}
      />
    );
  }

  if (step === "activate") {
    return (
      <ActivateStep
        hostname={hostname}
        onBack={() => setStep("account-choice")}
        onLoggedIn={(acc) => {
          setAccount(acc);
          setStep("passkey");
        }}
      />
    );
  }

  if (step === "signup") {
    return (
      <SignupStep
        hostname={hostname}
        onBack={() => setStep("account-choice")}
        onLoggedIn={(acc) => {
          setAccount(acc);
          setStep("passkey");
        }}
      />
    );
  }

  if (step === "recover") {
    return (
      <RecoverStep
        hostname={hostname}
        onBack={() => setStep("account-choice")}
        onLoggedIn={(acc) => {
          setAccount(acc);
          setStep("passkey");
        }}
      />
    );
  }

  if (step === "twofa") {
    return (
      <TwoFaStep
        accountId={account!.id}
        deliveryLabel={twoFaDelivery}
        onLoggedIn={() => setStep("passkey")}
      />
    );
  }

  return <PasskeyStep accountId={account?.id ?? null} onDone={finishSetup} />;
}
