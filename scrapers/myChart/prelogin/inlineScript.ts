/**
 * Values Epic inlines into a pre-login page's `<script>` blocks.
 *
 * An instance publishes its configuration as JavaScript source rather than as
 * JSON or data attributes — the string mnemonics on every page, the estimate
 * tool's service areas and location model on its own:
 *
 *   $$WP.Strings.addMnemonic("@MYCHART@ORGNAME@",HTMLUnencode("Springfield General"), false, "Global")
 *   $$WP.Estimates.OtherSAs = [{"Id":"…","Title":"…"}];
 *   $(function () { var model = {"Locations":[…]}; var c = new $$WP.Estimates.EstimatesLocationController('', model); });
 *
 * Reading those with regexes means finding where a value ends and undoing JS
 * string escaping by hand, which is what this module exists to avoid: cheerio
 * finds the inline scripts, acorn parses them, and acorn-walk finds the call,
 * assignment or declaration. Values come off the syntax tree, so a `]` inside
 * a title, an escaped quote, and a second statement on the same line are the
 * parser's problem rather than ours.
 */

import { parse, type AnyNode, type Program } from 'acorn';
import * as walk from 'acorn-walk';
import * as cheerio from 'cheerio';

import { logger } from '../../../shared/logger';

/**
 * Every inline `<script>` whose source mentions `names`, parsed.
 *
 * A script that never names the thing being read cannot define it, and the
 * filter keeps Epic's own inline bundles away from the parser. One that does
 * mention it but fails to parse is skipped rather than thrown: a pre-login
 * page carries plenty of JavaScript that is none of our business.
 */
export function parseInlineScripts(html: string, names: string): Program[] {
  const $ = cheerio.load(html);
  const programs: Program[] = [];
  $('script').each((_, element) => {
    const source = $(element).text();
    if (!source.includes(names)) return;
    try {
      programs.push(parse(source, { ecmaVersion: 'latest' }));
    } catch (error) {
      logger.debug('inline script did not parse as JavaScript:', error);
    }
  });
  return programs;
}

/**
 * A literal expression's value, or `undefined` for anything that isn't one.
 *
 * Reading the value off the tree rather than slicing the source and calling
 * `JSON.parse` costs a `switch` and buys independence from how the instance's
 * serializer quotes things: unquoted keys and single-quoted strings are both
 * legal JavaScript and neither is legal JSON.
 */
function literalValue(node: AnyNode | null | undefined): unknown {
  switch (node?.type) {
    case 'Literal':
      return node.value;

    case 'ArrayExpression':
      return node.elements.map((element) => (element?.type === 'SpreadElement' ? undefined : literalValue(element)));

    case 'ObjectExpression': {
      const object: Record<string, unknown> = {};
      for (const property of node.properties) {
        if (property.type !== 'Property') continue;
        const key =
          property.key.type === 'Identifier'
            ? property.key.name
            : property.key.type === 'Literal'
              ? String(property.key.value)
              : null;
        if (key !== null) object[key] = literalValue(property.value);
      }
      return object;
    }

    // A serializer writes a negative number as negation applied to a literal.
    case 'UnaryExpression': {
      if (node.operator !== '-' && node.operator !== '+') return undefined;
      const value = literalValue(node.argument);
      if (typeof value !== 'number') return undefined;
      return node.operator === '-' ? -value : value;
    }

    // Epic wraps its text mnemonics in `HTMLUnencode(…)`. The wrapper says how
    // the value was encoded, not what it is, so it reads through.
    case 'CallExpression':
      return node.arguments.length === 1 ? literalValue(node.arguments[0]) : undefined;

    default:
      return undefined;
  }
}

/** `a.b.c` for a dotted member expression, or null for anything else. */
function memberPath(node: AnyNode): string | null {
  if (node.type === 'Identifier') return node.name;
  if (node.type !== 'MemberExpression' || node.computed) return null;
  const object = memberPath(node.object);
  return object !== null && node.property.type === 'Identifier' ? `${object}.${node.property.name}` : null;
}

/** The literal assigned by `<path> = <literal>`, e.g. `$$WP.Estimates.OtherSAs`. */
export function readAssignedLiteral(programs: Program[], path: string): unknown {
  let found: unknown;
  for (const program of programs) {
    walk.simple(program, {
      AssignmentExpression(node) {
        if (node.operator === '=' && memberPath(node.left) === path) found = literalValue(node.right);
      },
    });
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The literal declared by `var <name> = <literal>`, at any nesting depth. */
export function readDeclaredLiteral(programs: Program[], name: string): unknown {
  let found: unknown;
  for (const program of programs) {
    walk.simple(program, {
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && node.id.name === name) found = literalValue(node.init);
      },
    });
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Every call of `<path>(…)`, each as its arguments' literal values. */
export function readCallArguments(programs: Program[], path: string): unknown[][] {
  const calls: unknown[][] = [];
  for (const program of programs) {
    walk.simple(program, {
      CallExpression(node) {
        if (memberPath(node.callee) === path) calls.push(node.arguments.map((argument) => literalValue(argument)));
      },
    });
  }
  return calls;
}
