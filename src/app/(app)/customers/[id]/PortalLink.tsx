"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Link2, Check, AlertTriangle } from "@/components/icons";
import { issuePortalLink, revokePortalLink } from "./portal-actions";

export function PortalLink({
  customerId,
  issuedAt,
  revokedAt,
}: {
  customerId: string;
  issuedAt: string | null;
  revokedAt: string | null;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const live = !!issuedAt && !revokedAt;

  const issue = () => {
    startTransition(async () => {
      const res = await issuePortalLink(customerId);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setUrl(res.url);
      setCopied(false);
    });
  };

  const revoke = () => {
    startTransition(async () => {
      const res = await revokePortalLink(customerId);
      if (!res.ok) {
        toast(res.error ?? "Could not revoke.", "error");
        return;
      }
      toast("Link revoked. The old one now shows nothing.", "ok");
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon={Link2} onClick={issue} disabled={pending}>
          {live ? "Re-issue portal link" : "Create portal link"}
        </Button>
        {live && (
          <Button variant="ghost" size="sm" onClick={revoke} disabled={pending}>
            Revoke
          </Button>
        )}
      </div>

      <Modal
        open={!!url}
        onClose={() => setUrl(null)}
        title="Portal link"
        description="Copy it now — you won't see it again."
        size="sm"
        footer={
          <Button variant="primary" size="sm" onClick={() => setUrl(null)}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {/*
            §3.26: shown ONCE. The database stores only a SHA-256, so this is
            genuinely the only moment the raw token exists anywhere readable —
            not a UI convention we could relax later.
          */}
          <div className="flex items-start gap-2 rounded-lg bg-warn-pale/50 px-3 py-2.5">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />
            <p className="text-[11.5px] font-medium text-ink-soft">
              This link is a password. We store only a fingerprint of it, so it
              can't be shown again — re-issuing creates a new link and kills this
              one.
            </p>
          </div>

          <code className="block break-all rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-[11.5px] text-ink">
            {url}
          </code>

          <Button
            variant="secondary"
            size="sm"
            icon={copied ? Check : Link2}
            onClick={async () => {
              if (!url) return;
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
