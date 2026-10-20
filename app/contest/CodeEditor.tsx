"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, indentUnit, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { tags as t } from "@lezer/highlight";

/** Сайттың түс токендеріне сай Python бояуы. */
const palette = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.operatorKeyword], color: "#9b7bff" },
  { tag: [t.string, t.special(t.string)], color: "#f2a93b" },
  { tag: [t.number, t.bool, t.null], color: "#ff9f7a" },
  { tag: t.comment, color: "#41566a", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#34e0c4" },
  { tag: t.definition(t.variableName), color: "#f2f8fc" },
  { tag: [t.className, t.standard(t.variableName)], color: "#7fd4ff" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "#8aa1b4" },
]);

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "rgba(6,10,15,0.66)", color: "#dce7ef", fontSize: "14px", height: "100%" },
    ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.6", overflow: "auto" },
    ".cm-content": { padding: "12px 0", caretColor: "#34e0c4" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#41566a", border: "none", paddingLeft: "6px" },
    ".cm-activeLine": { backgroundColor: "rgba(52,224,196,0.05)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#6e869b" },
    ".cm-cursor": { borderLeftColor: "#34e0c4", borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgba(52,224,196,0.22)" },
    ".cm-matchingBracket": { backgroundColor: "rgba(52,224,196,0.18)", outline: "none" },
    ".cm-changed": { backgroundColor: "rgba(242,169,59,0.09)" },
    "&.cm-focused": { outline: "none" },
  },
  { dark: true },
);

/** Бір әрекетпен осыдан көп таңба кірсе — бұл теру емес, қою (кейбір телефон пернетақталары paste оқиғасын бермейді). */
const MAX_INSERT_PER_INPUT = 40;

/**
 * Көшіру мен қоюды бұғаттау (жарыстың Debug/Build кезеңдері):
 *  - редакторға сырттан қою (Ctrl+V, мәзір, сүйреп тастау) жүрмейді;
 *  - редактордан көшіріп алу (copy/cut) жүрмейді.
 * Бұл көшіруді қиындатады, бірақ толық жоймайды: кодты қолмен қайта теруге болады.
 */
function clipboardGuard(onBlocked: () => void) {
  const stop = (e: Event) => {
    e.preventDefault();
    onBlocked();
    return true;
  };
  return [
    EditorView.domEventHandlers({
      paste: stop,
      drop: stop,
      copy: stop,
      cut: stop,
      dragstart: stop,
      beforeinput: (e) => {
        const t = (e as InputEvent).inputType;
        return t === "insertFromPaste" || t === "insertFromDrop" || t === "insertFromYank" ? stop(e) : false;
      },
    }),
    EditorState.transactionFilter.of((tr) => {
      if (!tr.docChanged) return tr;
      if (tr.isUserEvent("input.paste") || tr.isUserEvent("input.drop") || tr.isUserEvent("delete.cut")) {
        onBlocked();
        return [];
      }
      if (tr.isUserEvent("input")) {
        let inserted = 0;
        tr.changes.iterChanges((_fa, _ta, _fb, _tb, text) => {
          inserted += text.length;
        });
        if (inserted > MAX_INSERT_PER_INPUT) {
          onBlocked();
          return [];
        }
      }
      return tr;
    }),
  ];
}

export default function CodeEditor({
  value,
  onChange,
  readOnly = false,
  minHeight = 260,
  noClipboard = false,
  onClipboardBlocked,
  onEdit,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  minHeight?: number;
  /** Көшіру мен қоюды өшіру */
  noClipboard?: boolean;
  onClipboardBlocked?: () => void;
  /** Оқушының әр өзгерісі: қанша таңба қосылды / өшірілді (бақылау дерегі үшін; мазмұны берілмейді) */
  onEdit?: (inserted: number, deleted: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onBlockedRef = useRef(onClipboardBlocked);
  onBlockedRef.current = onClipboardBlocked;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          indentOnInput(),
          indentUnit.of("    "),
          bracketMatching(),
          python(),
          syntaxHighlighting(palette),
          theme,
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          ...(noClipboard ? clipboardGuard(() => onBlockedRef.current?.()) : []),
          EditorView.contentAttributes.of({ autocapitalize: "off", autocorrect: "off", spellcheck: "false" }),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            onChangeRef.current(u.state.doc.toString());
            // Тек оқушының өз әрекеттері (теру, өшіру); бағдарламалық ауыстыру есептелмейді
            if (onEditRef.current) {
              let ins = 0, del = 0;
              for (const tr of u.transactions) {
                if (!tr.docChanged || !(tr.isUserEvent("input") || tr.isUserEvent("delete"))) continue;
                tr.changes.iterChanges((fromA, toA, _fromB, _toB, text) => {
                  ins += text.length;
                  del += toA - fromA;
                });
              }
              if (ins || del) onEditRef.current(ins, del);
            }
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // Редактор бір рет құрылады; сырттан мән ауысса — төмендегі эффект
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, noClipboard]);

  // Сырттан берілген мән (мысалы «бастапқы кодқа қайтару») редактордағыдан өзгеше болса ғана ауыстырамыз
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return (
    <div
      ref={host}
      className="code-editor"
      style={{ minHeight, border: "1px solid var(--hairline)", borderRadius: 10, overflow: "hidden" }}
    />
  );
}
