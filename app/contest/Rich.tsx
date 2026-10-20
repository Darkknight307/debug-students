/** Тапсырма шарты: қарапайым мәтін + ``` ішіндегі код блоктары. */
export default function Rich({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/```[a-z]*\n?/i);
  return (
    <div className="rich">
      {parts.map((p, i) =>
        i % 2 ? (
          <pre key={i} className="snippet">{p.replace(/\n$/, "")}</pre>
        ) : p.trim() ? (
          <p key={i} className="prose">{p.trim()}</p>
        ) : null,
      )}
    </div>
  );
}
