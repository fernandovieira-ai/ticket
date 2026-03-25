"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import {
  useImperativeHandle,
  forwardRef,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link as LinkIcon,
  Minus,
  Quote,
  Heading2,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Tiptap v3: StarterKit já inclui Bold, Italic, Underline, Link,
// HorizontalRule, BulletList, OrderedList, Blockquote, Heading.
// Adicionamos TextAlign e Placeholder (não estão no StarterKit).

export interface RichTextEditorRef {
  clear: () => void;
}

interface RichTextEditorProps {
  value?: string;
  onChange: (html: string) => void;
  onAttach?: (files: File[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface TBtnProps {
  onMouseDown: (e: React.MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function TBtn({ onMouseDown, active, disabled, title, children }: TBtnProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={onMouseDown}
      className={cn(
        "p-1.5 rounded transition-colors select-none",
        active
          ? "bg-gray-200 text-gray-900"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
        disabled && "opacity-40 cursor-not-allowed pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}

function getFileIcon(file: File) {
  if (file.type.startsWith("image/")) return <ImageIcon size={12} />;
  if (file.type.startsWith("video/")) return <Film size={12} />;
  return <FileText size={12} />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const RichTextEditor = forwardRef<
  RichTextEditorRef,
  RichTextEditorProps
>(function RichTextEditor(
  { value = "", onChange, onAttach, placeholder, className, disabled },
  ref,
) {
  // Guard de montagem: evita hydration mismatch no SSR
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? []);
    if (!newFiles.length) return;
    setAttachedFiles((prev) => {
      const merged = [...prev, ...newFiles];
      onAttach?.(merged);
      return merged;
    });
    // Reset o input para permitir re-selecionar o mesmo arquivo
    e.target.value = "";
  }

  function removeFile(index: number) {
    setAttachedFiles((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      onAttach?.(updated);
      return updated;
    });
  }

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder ?? "Digite aqui..." }),
    ],
    content: value || "",
    editable: !disabled,
    onUpdate({ editor }) {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  useImperativeHandle(ref, () => ({
    clear: () => {
      editor?.commands.clearContent(true);
      setAttachedFiles([]);
      onAttach?.([]);
    },
  }));

  // Antes de montar no cliente: renderiza placeholder vazio
  if (!mounted) {
    return (
      <div
        className={cn(
          "border border-input rounded-md bg-background min-h-[160px]",
          className,
        )}
      />
    );
  }

  const isDisabled = !editor || !!disabled;
  const sep = <span className="w-px h-4 bg-gray-200 mx-0.5 self-center" />;

  function setLink() {
    const prev = editor?.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link:", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor?.chain().focus().unsetLink().run();
      return;
    }
    editor?.chain().focus().setLink({ href: url }).run();
  }

  return (
    <div
      className={cn(
        "border border-input rounded-md bg-background overflow-hidden",
        "focus-within:ring-1 focus-within:ring-ring",
        className,
      )}
    >
      {/* Toolbar — todos os botões usam editor?.chain() com optional chaining */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-2 py-1 bg-gray-50">
        <TBtn
          disabled={isDisabled}
          active={editor?.isActive("bold")}
          title="Negrito (Ctrl+B)"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleBold().run();
          }}
        >
          <Bold size={13} />
        </TBtn>

        <TBtn
          disabled={isDisabled}
          active={editor?.isActive("italic")}
          title="Itálico (Ctrl+I)"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleItalic().run();
          }}
        >
          <Italic size={13} />
        </TBtn>

        <TBtn
          disabled={isDisabled}
          active={editor?.isActive("underline")}
          title="Sublinhado (Ctrl+U)"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleUnderline().run();
          }}
        >
          <UnderlineIcon size={13} />
        </TBtn>

        <TBtn
          disabled={isDisabled}
          active={editor?.isActive("heading", { level: 2 })}
          title="Título"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleHeading({ level: 2 }).run();
          }}
        >
          <Heading2 size={13} />
        </TBtn>

        {sep}

        <TBtn
          disabled={isDisabled}
          active={editor?.isActive({ textAlign: "left" })}
          title="Alinhar esquerda"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().setTextAlign("left").run();
          }}
        >
          <AlignLeft size={13} />
        </TBtn>

        <TBtn
          disabled={isDisabled}
          active={editor?.isActive({ textAlign: "center" })}
          title="Centralizar"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().setTextAlign("center").run();
          }}
        >
          <AlignCenter size={13} />
        </TBtn>

        <TBtn
          disabled={isDisabled}
          active={editor?.isActive({ textAlign: "right" })}
          title="Alinhar direita"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().setTextAlign("right").run();
          }}
        >
          <AlignRight size={13} />
        </TBtn>

        {sep}

        <TBtn
          disabled={isDisabled}
          active={editor?.isActive("bulletList")}
          title="Lista"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleBulletList().run();
          }}
        >
          <List size={13} />
        </TBtn>

        <TBtn
          disabled={isDisabled}
          active={editor?.isActive("orderedList")}
          title="Lista numerada"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleOrderedList().run();
          }}
        >
          <ListOrdered size={13} />
        </TBtn>

        <TBtn
          disabled={isDisabled}
          active={editor?.isActive("blockquote")}
          title="Citação"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleBlockquote().run();
          }}
        >
          <Quote size={13} />
        </TBtn>

        {sep}

        <TBtn
          disabled={isDisabled}
          active={editor?.isActive("link")}
          title="Link"
          onMouseDown={(e) => {
            e.preventDefault();
            setLink();
          }}
        >
          <LinkIcon size={13} />
        </TBtn>

        <TBtn
          disabled={isDisabled}
          title="Linha horizontal"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().setHorizontalRule().run();
          }}
        >
          <Minus size={13} />
        </TBtn>

        {sep}

        {/* Botão de anexar arquivo */}
        <TBtn
          disabled={!!disabled}
          title="Anexar imagem, arquivo ou vídeo"
          onMouseDown={(e) => {
            e.preventDefault();
            fileInputRef.current?.click();
          }}
        >
          <Paperclip size={13} />
        </TBtn>

        {/* Input de arquivo oculto */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,.csv"
          className="hidden"
          onChange={handleFilesSelected}
          disabled={!!disabled}
        />
      </div>

      {/* Área de edição */}
      <EditorContent
        editor={editor}
        className={cn(
          "px-3 py-2 text-sm",
          "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[120px]",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
          "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ul]:my-1",
          "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ol]:my-1",
          "[&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mt-2 [&_.ProseMirror_h2]:mb-1",
          "[&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-gray-300 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-gray-500",
          "[&_.ProseMirror_a]:text-blue-600 [&_.ProseMirror_a]:underline",
          "[&_.ProseMirror_hr]:border-gray-200 [&_.ProseMirror_hr]:my-2",
          disabled && "opacity-60 pointer-events-none",
        )}
      />

      {/* Lista de arquivos anexados */}
      {attachedFiles.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5 border-t border-gray-100 pt-2">
          {attachedFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1 bg-gray-100 rounded-md px-2 py-1 text-xs text-gray-700 max-w-[200px]"
            >
              <span className="text-gray-400 flex-shrink-0">
                {getFileIcon(file)}
              </span>
              <span className="truncate flex-1" title={file.name}>
                {file.name}
              </span>
              <span className="text-gray-400 flex-shrink-0 text-[10px]">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                title="Remover anexo"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
