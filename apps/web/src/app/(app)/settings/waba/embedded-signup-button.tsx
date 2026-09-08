"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { completeEmbeddedSignup } from "./actions";
import { Button } from "@/components/ui/button";

interface FBLoginResponse {
  authResponse?: { code?: string };
}

interface FBLoginOptions {
  config_id: string;
  response_type: "code";
  override_default_response_type: true;
  extras: { setup: Record<string, unknown> };
}

declare global {
  interface Window {
    FB?: {
      init: (config: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (callback: (response: FBLoginResponse) => void, options: FBLoginOptions) => void;
    };
  }
}

type SignupStatus = "idle" | "waiting" | "processing" | "error" | "success";

/**
 * Embedded Signup v4 (Facebook Login for Business): el negocio crea o conecta su WhatsApp
 * en un popup de Meta, sin copiar WABA ID/access token a mano. El popup manda dos cosas por
 * separado y en cualquier orden: FB.login() devuelve un `code` de un solo uso (30s de vida),
 * y un postMessage WA_EMBEDDED_SIGNUP manda el waba_id/phone_number_id — solo se puede llamar
 * al servidor cuando se tienen ambos.
 */
export function EmbeddedSignupButton({
  appId,
  configId,
  graphApiVersion,
}: {
  appId: string;
  configId: string;
  graphApiVersion: string;
}) {
  const router = useRouter();
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<SignupStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<string | null>(null);
  const signupDataRef = useRef<{ wabaId: string; phoneNumberId: string } | null>(null);
  const completingRef = useRef(false);

  const tryComplete = useCallback(() => {
    const code = codeRef.current;
    const signupData = signupDataRef.current;
    if (!code || !signupData || completingRef.current) return;
    completingRef.current = true;
    setStatus("processing");

    void (async () => {
      const result = await completeEmbeddedSignup({ code, wabaId: signupData.wabaId, phoneNumberId: signupData.phoneNumberId });
      if (result.error) {
        setError(result.error);
        setStatus("error");
        completingRef.current = false;
      } else {
        setStatus("success");
        router.refresh();
      }
    })();
  }, [router]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return;
      let data: { type?: string; event?: string; data?: Record<string, unknown> };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type !== "WA_EMBEDDED_SIGNUP") return;

      if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
        const wabaId = data.data?.waba_id as string | undefined;
        const phoneNumberId = data.data?.phone_number_id as string | undefined;
        if (wabaId && phoneNumberId) {
          signupDataRef.current = { wabaId, phoneNumberId };
          tryComplete();
        }
      } else if (data.event === "CANCEL") {
        const errorMessage = data.data?.error_message as string | undefined;
        if (errorMessage) {
          setError(errorMessage);
          setStatus("error");
        } else if (status === "waiting") {
          setStatus("idle");
        }
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryComplete]);

  const launchSignup = () => {
    if (!window.FB) return;
    setError(null);
    setStatus("waiting");
    codeRef.current = null;
    signupDataRef.current = null;
    completingRef.current = false;

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          codeRef.current = response.authResponse.code;
          tryComplete();
        } else {
          setStatus("idle");
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Script
        src="https://connect.facebook.net/es_LA/sdk.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version: graphApiVersion });
          setSdkReady(true);
        }}
      />
      <Button type="button" onClick={launchSignup} disabled={!sdkReady || status === "waiting" || status === "processing"}>
        {status === "processing" ? "Conectando…" : "Conectar con Facebook"}
      </Button>
      {status === "success" && <p className="text-sm text-emerald-600">WhatsApp conectado correctamente.</p>}
      {status === "error" && error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
