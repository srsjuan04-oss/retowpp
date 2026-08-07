"use client";

import { useRef, useState } from "react";
import { addTagToContact, removeTagFromContact } from "../actions";
import { Button } from "@/components/ui/button";

interface Tag {
  id: string;
  name: string;
  color: string;
}

export function TagsEditor({
  contactId,
  contactTags,
  allTags,
}: {
  contactId: string;
  contactTags: Tag[];
  allTags: Tag[];
}) {
  const [pending, setPending] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const availableTags = allTags.filter((t) => !contactTags.some((ct) => ct.id === t.id));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {contactTags.map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
            style={{ borderColor: tag.color }}
          >
            {tag.name}
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                await removeTagFromContact(contactId, tag.id);
                setPending(false);
              }}
            >
              ×
            </button>
          </span>
        ))}
        {contactTags.length === 0 && <span className="text-sm text-muted-foreground">Sin etiquetas.</span>}
      </div>

      {availableTags.length > 0 && (
        <div className="flex gap-2">
          <select ref={selectRef} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            {availableTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={async () => {
              const tagId = selectRef.current?.value;
              if (!tagId) return;
              setPending(true);
              await addTagToContact(contactId, tagId);
              setPending(false);
            }}
          >
            Agregar etiqueta
          </Button>
        </div>
      )}
    </div>
  );
}
