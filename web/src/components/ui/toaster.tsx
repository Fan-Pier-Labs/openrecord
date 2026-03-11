"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        style: {
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#b91c1c",
        },
      }}
    />
  );
}
