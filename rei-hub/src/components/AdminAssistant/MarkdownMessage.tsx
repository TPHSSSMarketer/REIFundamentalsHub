/**
 * MarkdownMessage — Lightweight markdown renderer for AI assistant messages.
 *
 * Handles the common markdown patterns the AI generates:
 * - **bold** → <strong>
 * - *italic* → <em>
 * - ## Headers → <h3>/<h4>
 * - `code` → <code>
 * - ```code blocks``` → <pre>
 * - Bullet lists (- item, * item)
 * - Numbered lists (1. item)
 * - Tables (| col | col |)
 * - Horizontal rules (---, ===)
 * - Links [text](url)
 *
 * No external dependencies.
 */

interface MarkdownMessageProps {
  content: string
  className?: string
}

export default function MarkdownMessage({ content, className = '' }: MarkdownMessageProps) {
  const html = markdownToHtml(content)
  return (
    <div
      className={`markdown-message ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function markdownToHtml(md: string): string {
  // Remove [TOOL_CALL: ...] markers
  md = md.replace(/\[TOOL_CALL:\s*\w+\s*\([^)]*\)\s*\]/g, '')

  // Split into lines for block-level processing
  const lines = md.split('\n')
  const output: string[] = []
  let inCodeBlock = false
  let codeBlockContent: string[] = []
  let inTable = false
  let tableHeaders: string[] = []
  let tableRows: string[][] = []
  let inList = false
  let listType: 'ul' | 'ol' = 'ul'
  let listItems: string[] = []

  function flushTable() {
    if (tableHeaders.length > 0 || tableRows.length > 0) {
      let html = '<div class="overflow-x-auto my-2"><table class="text-sm border-collapse w-full">'
      if (tableHeaders.length > 0) {
        html += '<thead><tr>' + tableHeaders.map(h => `<th class="border border-slate-300 px-2 py-1 bg-slate-50 text-left font-semibold text-slate-700">${inlineMarkdown(h)}</th>`).join('') + '</tr></thead>'
      }
      if (tableRows.length > 0) {
        html += '<tbody>' + tableRows.map(row =>
          '<tr>' + row.map(cell => `<td class="border border-slate-300 px-2 py-1 text-slate-600">${inlineMarkdown(cell)}</td>`).join('') + '</tr>'
        ).join('') + '</tbody>'
      }
      html += '</table></div>'
      output.push(html)
    }
    inTable = false
    tableHeaders = []
    tableRows = []
  }

  function flushList() {
    if (listItems.length > 0) {
      const tag = listType
      const listClass = listType === 'ol' ? 'list-decimal' : 'list-disc'
      output.push(`<${tag} class="${listClass} pl-5 my-2 space-y-1">` + listItems.map(item => `<li class="text-slate-700">${inlineMarkdown(item)}</li>`).join('') + `</${tag}>`)
    }
    inList = false
    listItems = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Code block toggle
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        output.push(`<pre class="bg-slate-100 rounded-lg p-3 text-xs overflow-x-auto my-2"><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`)
        codeBlockContent = []
        inCodeBlock = false
      } else {
        if (inTable) flushTable()
        if (inList) flushList()
        inCodeBlock = true
      }
      continue
    }
    if (inCodeBlock) {
      codeBlockContent.push(line)
      continue
    }

    // Horizontal rule
    if (/^[\-=\*]{3,}\s*$/.test(trimmed)) {
      if (inTable) flushTable()
      if (inList) flushList()
      output.push('<hr class="my-3 border-slate-200" />')
      continue
    }

    // Table separator row
    if (/^\|[\s\-:]+\|[\s\-:]+\|/.test(trimmed)) {
      inTable = true
      continue
    }

    // Table row
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 3) {
      if (inList) flushList()
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim())
      if (!inTable) {
        // First row = headers
        tableHeaders = cells
        inTable = true
      } else {
        tableRows.push(cells)
      }
      continue
    }

    // Non-table line — flush any pending table
    if (inTable) flushTable()

    // Empty line
    if (trimmed === '') {
      if (inList) flushList()
      output.push('')
      continue
    }

    // Headers
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      if (inList) flushList()
      const level = Math.min(headerMatch[1].length, 4)
      const sizes: Record<number, string> = { 1: 'text-base font-bold', 2: 'text-sm font-bold', 3: 'text-sm font-semibold', 4: 'text-sm font-medium' }
      output.push(`<div class="${sizes[level] || sizes[4]} text-slate-800 mt-3 mb-1">${inlineMarkdown(headerMatch[2])}</div>`)
      continue
    }

    // Unordered list item (- item, * item)
    const ulMatch = trimmed.match(/^[\-\*]\s+(.+)$/)
    if (ulMatch) {
      if (inList && listType !== 'ul') flushList()
      inList = true
      listType = 'ul'
      listItems.push(ulMatch[1])
      continue
    }

    // Ordered list item (1. item)
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/)
    if (olMatch) {
      if (inList && listType !== 'ol') flushList()
      inList = true
      listType = 'ol'
      listItems.push(olMatch[1])
      continue
    }

    // Regular paragraph
    if (inList) flushList()
    output.push(`<p class="text-slate-700 my-1">${inlineMarkdown(trimmed)}</p>`)
  }

  // Flush remaining
  if (inCodeBlock) {
    output.push(`<pre class="bg-slate-100 rounded-lg p-3 text-xs overflow-x-auto my-2"><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`)
  }
  if (inTable) flushTable()
  if (inList) flushList()

  return output.join('\n')
}

/** Convert inline markdown (bold, italic, code, links) to HTML */
function inlineMarkdown(text: string): string {
  // Escape HTML first (but preserve any existing HTML tags from the AI)
  // Actually, don't escape since the AI might send HTML tags intentionally
  // Just handle markdown patterns

  // Code: `text`
  text = text.replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1 rounded text-xs">$1</code>')

  // Bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Italic: *text*
  text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>')

  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary-500 underline" target="_blank" rel="noopener">$1</a>')

  // Strikethrough: ~~text~~
  text = text.replace(/~~(.+?)~~/g, '<s>$1</s>')

  return text
}
