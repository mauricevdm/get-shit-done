#!/usr/bin/env node
// state-merge.cjs - STATE.md parsing and section extraction
// Provides infrastructure for section-based state merging
//
// Note: Uses dynamic imports because remark ecosystem is ESM-only

let processor = null;
let stringifier = null;
let headingRange = null;
let initialized = false;

/**
 * Initialize the markdown processing libraries (ESM modules)
 * Must be called before using other functions
 */
async function init() {
  if (initialized) return;

  const { unified } = await import('unified');
  const remarkParse = (await import('remark-parse')).default;
  const remarkStringify = (await import('remark-stringify')).default;
  const remarkGfm = (await import('remark-gfm')).default;
  const headingRangeModule = await import('mdast-util-heading-range');
  headingRange = headingRangeModule.headingRange;

  // Create processor with GFM support for tables and task lists
  processor = unified()
    .use(remarkParse)
    .use(remarkGfm);

  // Create stringifier for markdown output
  stringifier = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: '-',
      listItemIndent: 'one',
      fences: true,
      rule: '-'
    });

  initialized = true;
}

/**
 * Parse STATE.md content into mdast tree
 * @param {string} content - Raw markdown content
 * @returns {object} mdast tree with type 'root'
 */
function parseStateFile(content) {
  if (!initialized) {
    throw new Error('Call init() before using parseStateFile');
  }
  return processor.parse(content);
}

/**
 * Extract section content by heading text
 * Returns nodes between the heading and the next same-level (or higher) heading
 *
 * @param {object} tree - mdast tree from parseStateFile
 * @param {string} headingText - Exact text of the heading to find (e.g., "Key Decisions")
 * @returns {object|null} Section object with heading, content, end properties, or null if not found
 */
function extractSection(tree, headingText) {
  if (!initialized) {
    throw new Error('Call init() before using extractSection');
  }

  let sectionNodes = null;

  // headingRange finds the heading and calls the handler with:
  // - start: the heading node
  // - nodes: array of nodes between this heading and the next same-level heading
  // - end: the next heading node (or undefined if at end)
  headingRange(tree, headingText, (start, nodes, end) => {
    sectionNodes = {
      heading: start,
      content: nodes,
      end: end
    };
  });

  return sectionNodes;
}

/**
 * Serialize section nodes back to markdown
 * Preserves GFM features like tables and task list checkboxes
 *
 * @param {object} section - Section object from extractSection
 * @returns {string} Markdown string (empty string if section is null/invalid)
 */
function serializeSection(section) {
  if (!initialized) {
    throw new Error('Call init() before using serializeSection');
  }

  if (!section || !section.content) return '';

  // Create temporary root with just the section content
  const tempTree = {
    type: 'root',
    children: section.content
  };

  return stringifier.stringify(tempTree);
}

module.exports = { init, parseStateFile, extractSection, serializeSection };
