"use client";

import { useRef, useState, useTransition } from "react";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/Toast";
import { ChevronUp, ChevronDown, X, Plus, Mail, PhoneCall, GripVertical } from "@/components/icons";
import {
  createStage,
  addStageToPath,
  removeStageFromPath,
  moveStage,
  saveStageConfig,
} from "./actions";
import type { StagePathRow } from "@/lib/db/stages";

export function StagePathEditor({
  serviceId,
  path,
  available,
}: {
  serviceId: string;
  path: StagePathRow[];
  available: { id: string; name: string }[];
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  const [addExisting, setAddExisting] = useState("");
  const [openConfig, setOpenConfig] = useState<string | null>(null);

  const runAction = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error ?? "Something went wrong.", "error");
      toast(okMsg, "ok");
    });
  };

  const addNew = () => {
    if (!newName.trim()) return;
    start(async () => {
      const created = await createStage(newName.trim());
      if (!created.ok || !created.stageId) {
        return toast(created.ok ? "Could not add the stage." : created.error, "error");
      }
      const added = await addStageToPath(serviceId, created.stageId);
      if (!added.ok) return toast(added.error, "error");
      toast(`"${newName.trim()}" added to the path.`, "ok");
      setNewName("");
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-surface">
        {path.length === 0 ? (
          <p className="py-10 text-center text-[13px] font-medium text-ink-faint">
            No stages yet — add the first one below.
          </p>
        ) : (
          <ol className="flex flex-col">
            {path.map((stage, i) => (
              <li key={stage.stage_id} className="border-b border-line last:border-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      disabled={pending || i === 0}
                      onClick={() =>
                        runAction(
                          () => moveStage(serviceId, stage.stage_id, "up"),
                          "Reordered.",
                        )
                      }
                      className="flex h-5 w-5 items-center justify-center text-ink-faint hover:text-ink disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={pending || i === path.length - 1}
                      onClick={() =>
                        runAction(
                          () => moveStage(serviceId, stage.stage_id, "down"),
                          "Reordered.",
                        )
                      }
                      className="flex h-5 w-5 items-center justify-center text-ink-faint hover:text-ink disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  <span className="w-6 shrink-0 font-mono text-[11px] text-ink-ghost">
                    {i + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-ink">
                        {stage.name}
                      </span>
                      {stage.is_terminal && <Tag tone="neutral">Terminal</Tag>}
                      {stage.enabled && (
                        <Tag tone="accent">
                          <Mail size={10} className="mr-1 inline" />
                          Update
                        </Tag>
                      )}
                      {stage.requires_input && (
                        <Tag tone="warn">
                          <Mail size={10} className="mr-1 inline" />
                          Checkpoint
                        </Tag>
                      )}
                    </span>
                  </span>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setOpenConfig(openConfig === stage.stage_id ? null : stage.stage_id)
                    }
                  >
                    {openConfig === stage.stage_id ? "Close" : "Configure"}
                  </Button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      runAction(
                        () => removeStageFromPath(serviceId, stage.stage_id),
                        "Removed from the path.",
                      )
                    }
                    aria-label={`Remove ${stage.name} from this path`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-alert-pale hover:text-alert"
                  >
                    <X size={15} />
                  </button>
                </div>

                {openConfig === stage.stage_id && (
                  <StageConfigForm
                    stage={stage}
                    onSaved={() => setOpenConfig(null)}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Add to the path — an existing unused stage, or a brand new one. */}
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line p-4 sm:flex-row sm:items-end">
        {available.length > 0 && (
          <div className="flex-1">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
              Add an existing stage
            </span>
            <div className="flex gap-2">
              <Select
                value={addExisting}
                onChange={setAddExisting}
                ariaLabel="Existing stage"
                options={available.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Choose…"
                className="flex-1"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!addExisting || pending}
                onClick={() =>
                  runAction(
                    () => addStageToPath(serviceId, addExisting),
                    "Added to the path.",
                  )
                }
              >
                Add
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
            Or create a new one — call it anything
          </span>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Waiting on Bank Transfer"
              className="h-10 flex-1 rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
            />
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              disabled={!newName.trim() || pending}
              onClick={addNew}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const VARIABLES = [
  { token: "{{customer_name}}", label: "Customer name" },
  { token: "{{service_name}}", label: "Service" },
  { token: "{{stage_name}}", label: "Stage" },
  { token: "{{next_step}}", label: "Next step" },
  { token: "{{portal_url}}", label: "Portal link" },
  { token: "{{payment_instructions}}", label: "Payment instructions" },
];

/**
 * Drag a chip into the Subject or Message field, or just click it — it lands
 * wherever the cursor last was. Built so nobody has to remember or type
 * "{{customer_name}}" by hand.
 */
function VariableChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {VARIABLES.map((v) => (
        <button
          key={v.token}
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", v.token);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => onInsert(v.token)}
          title={`Drag into a field below, or click to insert — ${v.token}`}
          className="inline-flex cursor-grab items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-soft transition-colors hover:border-accent hover:bg-accent-mist hover:text-accent active:cursor-grabbing"
        >
          <GripVertical size={10} className="text-ink-ghost" />
          {v.label}
        </button>
      ))}
    </div>
  );
}

type FieldEl = HTMLInputElement | HTMLTextAreaElement;

/** Insert `text` at the field's current cursor position, then restore focus + caret. */
function insertAtCursor(el: FieldEl, text: string, value: string, setValue: (v: string) => void) {
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  setValue(value.slice(0, start) + text + value.slice(end));
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
  });
}

function StageConfigForm({
  stage,
  onSaved,
}: {
  stage: StagePathRow;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(stage.enabled);
  const [requiresInput, setRequiresInput] = useState(stage.requires_input);
  const [subject, setSubject] = useState(stage.custom_subject ?? "");
  const [body, setBody] = useState(
    stage.custom_body ?? `Dear {{customer_name}},\n\n\n\n${"Your Kalari team"}`,
  );
  const [error, setError] = useState<string | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  const insertToken = (token: string) => {
    if (activeField === "subject" && subjectRef.current) {
      insertAtCursor(subjectRef.current, token, subject, setSubject);
    } else if (bodyRef.current) {
      insertAtCursor(bodyRef.current, token, body, setBody);
    }
  };

  const onDrop = (field: "subject" | "body") => (e: React.DragEvent<FieldEl>) => {
    e.preventDefault();
    const token = e.dataTransfer.getData("text/plain");
    if (!token) return;
    if (field === "subject") insertAtCursor(e.currentTarget, token, subject, setSubject);
    else insertAtCursor(e.currentTarget, token, body, setBody);
  };

  const save = () => {
    setError(null);
    start(async () => {
      const res = await saveStageConfig(stage.stage_id, {
        enabled,
        requiresInput,
        customSubject: subject,
        customBody: body,
      });
      if (!res.ok) return setError(res.error);
      toast(
        enabled && requiresInput
          ? "Saved — this stage now sends two emails: the update and the checkpoint request."
          : "Stage settings saved.",
        "ok",
      );
      onSaved();
    });
  };

  return (
    <div className="border-t border-line bg-paper px-4 py-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3.5">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          <span>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <Mail size={13} className="text-ink-faint" />
              Send our normal status update
            </span>
            <span className="mt-0.5 block text-[11.5px] font-medium leading-[1.5] text-ink-mid">
              The plain "you're now at {stage.name}" email, worded the same
              way for every stage.
            </span>
          </span>
        </label>

        <label className="flex flex-1 cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3.5">
          <input
            type="checkbox"
            checked={requiresInput}
            onChange={(e) => setRequiresInput(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          <span>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <PhoneCall size={13} className="text-ink-faint" />
              This is also a checkpoint
            </span>
            <span className="mt-0.5 block text-[11.5px] font-medium leading-[1.5] text-ink-mid">
              Needs something from the customer — sends the custom message
              below and raises a call task, so it happens whether or not the
              email is opened.
            </span>
          </span>
        </label>
      </div>

      {enabled && requiresInput && (
        <p className="mt-2 rounded-lg bg-accent-mist px-3 py-2 text-[11.5px] font-medium text-accent">
          Both are on — a customer entering {stage.name} gets two separate
          emails: the status update, then this checkpoint request.
        </p>
      )}

      {requiresInput && (
        <div className="mt-3 flex flex-col gap-3">
          <VariableChips onInsert={insertToken} />

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
              Subject
            </span>
            <input
              ref={subjectRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => setActiveField("subject")}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop("subject")}
              placeholder="e.g. We need your bank transfer receipt"
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
              Message
            </span>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onFocus={() => setActiveField("body")}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop("body")}
              rows={7}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-ghost focus:border-accent"
            />
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-alert-pale px-3 py-2 text-[12px] font-medium text-alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <Button variant="primary" size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
