import Markdown from "react-markdown";

// No raw HTML plugin, links, images or executable attributes. User text is never HTML.
export function SafeMarkdown({ children }: { readonly children: string }) {
  return <div className="break-words text-sm leading-6 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_pre]:overflow-x-auto">
    <Markdown skipHtml allowedElements={["p", "strong", "em", "ul", "ol", "li", "code", "pre", "br"]}>{children}</Markdown>
  </div>;
}
