"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AccountPasswordField({ id, required, error, disabled = false }: {
  id: string; required: boolean; error?: string; disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="field-group student-full-width">
    <Label htmlFor={id}>{required ? "Password" : "New password"}{!required && <span className="optional-label">Optional</span>}</Label>
    <div className="account-password-input">
      <Input id={id} name="password" type={visible ? "text" : "password"} required={required} disabled={disabled}
        autoComplete="new-password" minLength={12} maxLength={1024} defaultValue=""
        placeholder={required ? "At least 12 characters" : "Leave blank to keep current password"}
        aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
      <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff /> : <Eye />}
      </Button></TooltipTrigger><TooltipContent>{visible ? "Hide password" : "Show password"}</TooltipContent></Tooltip>
    </div>
    {error && <p className="student-field-error" id={`${id}-error`}>{error}</p>}
  </div>;
}