import { Fragment } from "react";

// Formato de texto: WhatsApp nativo (*negrilla*, _cursiva_, ~tachado~) y también
// **negrilla** estilo Markdown (así la generan algunos mensajes automáticos), que
// WhatsApp no interpreta y por eso llegaban los asteriscos literales en pantalla.
const FORMAT_PATTERN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

function renderLine(line: string, lineKey: string) {
  const parts = line.split(FORMAT_PATTERN).filter((part) => part !== "");
  return parts.map((part, i) => {
    const key = `${lineKey}-${i}`;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
      return <strong key={key}>{part.slice(1, -1)}</strong>;
    }
    if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.length > 2 && part.startsWith("~") && part.endsWith("~")) {
      return <s key={key}>{part.slice(1, -1)}</s>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

/** Renderiza negrilla/cursiva/tachado (WhatsApp nativo o Markdown) como HTML real. */
export function WhatsAppText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {renderLine(line, String(i))}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </>
  );
}
