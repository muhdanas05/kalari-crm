"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/Toast";
import { Plus, ShieldCheck } from "@/components/icons";
import { createUser, setUserRoleActive, setUserPermissions } from "./users-actions";
import type { UserRow } from "@/lib/db/users";
import { PAGES, PAGE_GROUPS, DEFAULT_MANAGER_PERMISSIONS, type PageKey } from "@/lib/auth/pages";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin — sees everything" },
  { value: "employee", label: "Manager — pick which tabs" },
];

/**
 * The per-tab checkbox grid — "indepth options to select each tab, which he
 * can see, which he can't." Grouped the same way the nav is, so it reads as
 * the same map the sidebar itself uses.
 */
function PermissionGrid({
  value,
  onChange,
}: {
  value: PageKey[];
  onChange: (next: PageKey[]) => void;
}) {
  const set = new Set(value);
  const toggle = (key: PageKey) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  };

  return (
    <div className="flex flex-col gap-4">
      {PAGE_GROUPS.map((group) => {
        const items = PAGES.filter((p) => p.group === group);
        return (
          <div key={group}>
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[1px] text-ink-faint">
              {group}
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {items.map((p) => (
                <label
                  key={p.key}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-2 text-[12.5px] font-medium text-ink transition-colors hover:border-line-strong"
                >
                  <input
                    type="checkbox"
                    checked={set.has(p.key)}
                    onChange={() => toggle(p.key)}
                    className="h-3.5 w-3.5 shrink-0 accent-accent"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UsersSection({ users, meId }: { users: UserRow[]; meId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const [permissions, setPermissions] = useState<PageKey[]>(DEFAULT_MANAGER_PERMISSIONS);
  const [error, setError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editPerms, setEditPerms] = useState<PageKey[]>([]);

  const openForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("employee");
    setPermissions(DEFAULT_MANAGER_PERMISSIONS);
    setError(null);
    setOpen(true);
  };

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await createUser({ name, email, password, role, permissions });
      if (!res.ok) return setError(res.error);
      toast(`${name} can now sign in.`, "ok");
      setOpen(false);
    });
  };

  const changeRole = (u: UserRow, role: string) => {
    start(async () => {
      const res = await setUserRoleActive(u.id, { role: role as "admin" | "employee" });
      if (!res.ok) return toast(res.error, "error");
      toast(`${u.name} is now ${role === "admin" ? "an admin" : "a manager"}.`, "ok");
    });
  };

  const openPermissions = (u: UserRow) => {
    setEditingUser(u);
    setEditPerms(u.permissions ?? []);
  };

  const savePermissions = () => {
    if (!editingUser) return;
    start(async () => {
      const res = await setUserPermissions(editingUser.id, editPerms);
      if (!res.ok) return toast(res.error, "error");
      toast(`${editingUser.name}'s tabs updated.`, "ok");
      setEditingUser(null);
    });
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold tracking-[-0.2px] text-ink">Users</h2>
        <Button variant="secondary" size="sm" icon={Plus} onClick={openForm}>
          Add user
        </Button>
      </div>
      <p className="mb-4 text-[12px] font-medium text-ink-faint">
        Admins see everything, including money. A manager sees exactly the
        tabs granted to them — set per person, not a fixed split.
      </p>

      <ul className="flex flex-col">
        {users.map((u) => {
          const isSelf = u.id === meId;
          const isManager = u.role === "employee";
          return (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
                  {u.name}
                  {isSelf && <Tag tone="accent">You</Tag>}
                  {!u.active && <Tag tone="alert">Deactivated</Tag>}
                </p>
                <p className="font-mono text-[11.5px] text-ink-mid">{u.email}</p>
                {isManager && (
                  <p className="mt-0.5 text-[11px] font-medium text-ink-faint">
                    {u.permissions?.length ?? 0} tab{u.permissions?.length === 1 ? "" : "s"} granted
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="w-[210px]">
                  <Select
                    value={u.role}
                    onChange={(v) => changeRole(u, v)}
                    ariaLabel={`Role for ${u.name}`}
                    disabled={isSelf || pending}
                    options={ROLE_OPTIONS}
                  />
                </div>
                {isManager && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ShieldCheck}
                    onClick={() => openPermissions(u)}
                    disabled={pending}
                  >
                    Tabs
                  </Button>
                )}
                {isSelf ? (
                  <Tag tone="ok">Active</Tag>
                ) : (
                  <Switch
                    checked={u.active}
                    size="sm"
                    label={`${u.name} active`}
                    onToggle={(next) => setUserRoleActive(u.id, { active: next })}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Add a user"
        description="They can sign in immediately with the password you set here."
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
              Email
            </span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="h-10 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
              Password
            </span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="text"
              placeholder="At least 8 characters"
              className="h-10 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
              Role
            </span>
            <Select
              value={role}
              onChange={(v) => setRole(v as "admin" | "employee")}
              ariaLabel="Role"
              options={ROLE_OPTIONS}
            />
          </label>

          {role === "employee" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
                Tabs they can see
              </span>
              <PermissionGrid value={permissions} onChange={setPermissions} />
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-alert-pale px-3 py-2 text-[12px] font-medium text-alert">
              {error}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={!!editingUser}
        onClose={() => !pending && setEditingUser(null)}
        title={editingUser ? `${editingUser.name}'s tabs` : "Tabs"}
        description="Which pages they can see. Everything else stays hidden."
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditingUser(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={savePermissions} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <PermissionGrid value={editPerms} onChange={setEditPerms} />
      </Modal>
    </section>
  );
}
