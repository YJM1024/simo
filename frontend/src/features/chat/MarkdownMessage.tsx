// features/chat/MarkdownMessage.tsx —— 消息富文本渲染（M8，agent 与 user 共用）
//
// 契约：docs/m8-contract.md §1/§4。解析在 platform/markdown.ts；这里只做 React 渲染：
//   - 原始 HTML 永远不会成为 DOM（只有文本节点，React 自动转义）；
//   - 链接只渲染解析器给出的 http(s) 安全链接，并加 target/rel；
//   - 代码块 <pre>、表格可横向滚动；不加载任何外部资源。

import { parseInline, parseMarkdown, type InlineNode, type MarkdownBlock } from '../../platform/markdown.ts'

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case 'strong':
            return <strong key={index} className="font-semibold text-ink">{node.text}</strong>
          case 'em':
            return <em key={index} className="italic">{node.text}</em>
          case 'code':
            return (
              <code key={index} className="rounded-xs border border-border-subtle bg-surface-sunken px-1 font-mono text-2xs text-ink-secondary">
                {node.text}
              </code>
            )
          case 'link':
            return (
              <a
                key={index}
                href={node.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="break-all text-accent-hover underline underline-offset-2 hover:text-accent"
              >
                {node.text}
              </a>
            )
          default:
            return <span key={index}>{node.text}</span>
        }
      })}
    </>
  )
}

function Block({ block }: { block: MarkdownBlock }) {
  switch (block.kind) {
    case 'heading': {
      const size = block.level <= 2 ? 'text-lg' : block.level === 3 ? 'text-md' : 'text-sm'
      return <p className={`m-0 mt-2 mb-1 font-semibold text-ink first:mt-0 ${size}`}><Inline nodes={parseInline(block.text)} /></p>
    }
    case 'list':
      return block.ordered ? (
        <ol className="m-0 my-1 list-decimal pl-5 text-ink">
          {block.items.map((item, index) => (
            <li key={index} className="break-words"><Inline nodes={parseInline(item)} /></li>
          ))}
        </ol>
      ) : (
        <ul className="m-0 my-1 list-disc pl-5 text-ink">
          {block.items.map((item, index) => (
            <li key={index} className="break-words"><Inline nodes={parseInline(item)} /></li>
          ))}
        </ul>
      )
    case 'code':
      return (
        <pre className="my-1.5 max-h-80 overflow-x-auto overflow-y-auto rounded-md border border-border-subtle bg-surface-sunken p-2 font-mono text-2xs leading-relaxed text-ink-secondary">
          <code>{block.text}</code>
        </pre>
      )
    case 'quote':
      return (
        <blockquote className="m-0 my-1.5 border-l-2 border-accent-border pl-3 text-sm italic text-ink-secondary">
          <Inline nodes={parseInline(block.text)} />
        </blockquote>
      )
    case 'rule':
      return <hr className="my-2 border-border-subtle" />
    case 'table':
      return (
        <div className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.headers.map((header, index) => (
                  <th key={index} className="border border-border-subtle bg-surface-sunken px-2 py-1 text-left font-medium text-ink">
                    <Inline nodes={parseInline(header)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border border-border-subtle px-2 py-1 align-top text-ink-secondary break-words">
                      <Inline nodes={parseInline(cell)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    default:
      return (
        <p className="m-0 my-0.5 whitespace-pre-wrap break-words text-ink">
          <Inline nodes={parseInline(block.text)} />
        </p>
      )
  }
}

export default function MarkdownMessage({ text }: { text: string }) {
  const blocks = parseMarkdown(text)
  if (blocks.length === 0) return <>{text}</>
  return (
    <div className="m-0 flex flex-col">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}
