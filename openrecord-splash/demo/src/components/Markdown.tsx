import { Fragment, type ReactNode } from 'react';
import { parseMarkdown, type Block, type InlineSpan } from '../markdown';
import { Radiograph } from './Radiograph';

/**
 * Renders an assistant reply.
 *
 * Every text node goes through React, which escapes it. There is no
 * `dangerouslySetInnerHTML` here and there must never be one — the input is
 * model output, which is untrusted.
 */

function renderSpans(spans: InlineSpan[]): ReactNode {
  return spans.map((span, i) => {
    switch (span.kind) {
      case 'bold':
        return <strong key={i}>{span.text}</strong>;
      case 'italic':
        return <em key={i}>{span.text}</em>;
      case 'code':
        return <code key={i}>{span.text}</code>;
      default:
        return <Fragment key={i}>{span.text}</Fragment>;
    }
  });
}

/** Lines within one paragraph are separated by a soft break, not a new block. */
function renderLines(lines: InlineSpan[][]): ReactNode {
  return lines.map((spans, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderSpans(spans)}
    </Fragment>
  ));
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case 'heading': {
      // Demote by two so an assistant's `##` doesn't compete with page headings.
      // level is 1-4 (the parser only matches 1-4 hashes), so the index is 0-3.
      const Tag = (['h3', 'h4', 'h5', 'h6'] as const)[Math.min(block.level, 4) - 1] ?? 'h6';
      return <Tag key={key}>{renderSpans(block.spans)}</Tag>;
    }
    case 'list':
      return (
        <ul key={key}>
          {block.items.map((spans, i) => (
            <li key={i}>{renderSpans(spans)}</li>
          ))}
        </ul>
      );
    case 'quote':
      return (
        <blockquote key={key}>
          {block.lines.map((spans, i) => (
            <p key={i}>{renderSpans(spans)}</p>
          ))}
        </blockquote>
      );
    case 'image':
      // Only known placeholders render; anything else is dropped rather than
      // guessed at, so a model can never point the page at an arbitrary source.
      if (block.name !== 'xray') return null;
      return (
        <figure className="md-image" key={key}>
          <Radiograph />
          <figcaption>
            Simulated radiograph — the real app decodes the portal&rsquo;s wavelet image format to JPEG.
          </figcaption>
        </figure>
      );
    default:
      return <p key={key}>{renderLines(block.lines)}</p>;
  }
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={className}>{parseMarkdown(source).map(renderBlock)}</div>;
}
