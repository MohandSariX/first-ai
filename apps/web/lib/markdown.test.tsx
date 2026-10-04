import { SafeMarkdown } from "@first-ai/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

it("renders basic Markdown without unsafe HTML or executable links", () => {
  const html = renderToStaticMarkup(<SafeMarkdown>{"**services** et *clients*\n\n- Un\n- Deux\n\n1. Premier\n2. Second\n\n`code`\n\n<script>alert('x')</script>\n\n[attaque](javascript:alert(1))"}</SafeMarkdown>);
  expect(html).toContain("<strong>services</strong>"); expect(html).toContain("<em>clients</em>");
  expect(html).toContain("<ul>"); expect(html).toContain("<ol>"); expect(html).toContain("<code>code</code>");
  expect(html).not.toContain("<script>"); expect(html).not.toContain("javascript:"); expect(html).not.toContain("href=");
});
