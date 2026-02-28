/*
 * Copyright 2025 Adrian Kucharczuk
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Additional Commercial Use Condition:
 * Commercial use of this software requires explicit permission from the author.
 * See LICENSE-COMMERCIAL.txt for details.
 */

const SentenceTools = {
  isVisibleNode(node) {
    // Skip empty or whitespace-only
    if (!node.textContent.trim()) return false;

    // Skip ruby annotation <rt>
    if (node.parentElement && node.parentElement.tagName === "RT") return false;

    // Skip nodes inside display:none elements
    let el = node.parentElement;
    while (el) {
      const style = window.getComputedStyle(el);
      if (style.display === "none") return false;
      el = el.parentElement;
    }

    return true;
  },

  isVisibleTextNode(node) {
    if (node.nodeType !== Node.TEXT_NODE) return false;
    return SentenceTools.isVisibleNode(node);
  },

  walkVisibleTextNodes(root) {
    if (root.nodeType === Node.TEXT_NODE && SentenceTools.isVisibleTextNode(root)) {
      return [root];
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return SentenceTools.isVisibleTextNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodes = [];
    let current;

    while (current = walker.nextNode()) {
      nodes.push(current);
    }
    console.debug(`SentenceTools.walkVisibleTextNodes returns: ${nodes.map(n => n.textContent).join("")}`);
    return nodes;
  },

  getClosestP(node) {
    let cur = node;
    while (cur && cur.nodeType !== Node.ELEMENT_NODE) {
      cur = cur.parentNode;
    }
    return cur.closest("p");
  },

  getNextNode(node) {
    let current = node.nextSibling;
    while (current && !SentenceTools.isVisibleNode(current)) {
      current = current.nextSibling;
    }
    if (current) {
      return current;
    } else {
      const parent = node.parentNode;
      return SentenceTools.getNextNode(parent);
    }
  },

  getSentenceSuffix(currentNode, offset, depth) {
    if (depth === undefined) {
      depth = SentenceTools.getDepth(currentNode, offset);
      console.debug(`Depth for the ending of the word was found to be: ${depth}`)
    }
    const ends = "。！？.!?";
    const visibleNodes = SentenceTools.walkVisibleTextNodes(currentNode);
    const nextPart = visibleNodes.map(n => n.textContent).join("");
    let foundEnding = null;
    for (let i = offset; i < nextPart.length; i++) {
      const c = nextPart[i];

      if (c === "「") depth++;
      if (c === "」") depth--;

      if (depth <= 0 && ends.includes(c)) {
        foundEnding = i;
        break;
      }
    }
    if (foundEnding != null) {
      console.debug(`Suffix finding finished, last part: ${nextPart.slice(offset, foundEnding + 1)}`)
      return nextPart.slice(offset, foundEnding + 1); // include splitting character
    } else {
      const nextNode = SentenceTools.getNextNode(currentNode);
      if (SentenceTools.getClosestP(nextNode) != SentenceTools.getClosestP(currentNode)) { // we dont want to look inside other paragraphs
        console.debug(`Suffix finding finished because of the paragraph end, last part: ${nextPart.slice(offset)}`)
        return nextPart.slice(offset);
      } else {
        console.debug(`Suffix finding continues, this part: ${nextPart.slice(offset)}`)
        return nextPart.slice(offset) + SentenceTools.getSentenceSuffix(nextNode, 0, depth);
      }
    }
  },

  getPrevNode(node) {
    let current = node.previousSibling;
    while (current && !SentenceTools.isVisibleNode(current)) {
      current = current.previousSibling;
    }
    if (current) {
      return current;
    } else {
      const parent = node.parentNode;
      return SentenceTools.getPrevNode(parent);
    }
  },

  getSentencePrefix(currentNode, offset, depth) {
    if (depth === undefined) {
      depth = SentenceTools.getDepth(currentNode, offset);
      console.debug(`Depth for the beginning of the word was found to be: ${depth}`)
    }
    const ends = "。！？.!?";
    const visibleNodes = SentenceTools.walkVisibleTextNodes(currentNode);
    const prevPart = visibleNodes.map(n => n.textContent).join("");
    if (offset === -1) offset = prevPart.length;
    let foundBeginning = null;
    for (let i = offset - 1; i >= 0; i--) {
      const c = prevPart[i];

      if (c === "「") depth--;
      if (c === "」") depth++;

      if (depth <= 0 && ends.includes(c)) {
        foundBeginning = i;
        break;
      }
    }
    if (foundBeginning != null) {
      console.debug(`Prefix finding finished, last part: ${prevPart.slice(foundBeginning + 1, offset)}`)
      return prevPart.slice(foundBeginning + 1, offset); // Don't include splitting character
    } else {
      const prevNode = SentenceTools.getPrevNode(currentNode);
      if (SentenceTools.getClosestP(currentNode) != SentenceTools.getClosestP(prevNode)) {
        console.debug(`Prefix finding finished because of the paragraph end, last part: ${prevPart.slice(0, offset)}`)
        return prevPart.slice(0, offset);
      } else {
        console.debug(`Prefix finding continues, this part: ${prevPart.slice(0, offset)}`)
        return SentenceTools.getSentencePrefix(SentenceTools.getPrevNode(currentNode), -1, depth) + prevPart.slice(0, offset);
      }
    }
  },

  getDepth(currentNode, offset) {
    const visibleNodes = SentenceTools.walkVisibleTextNodes(currentNode);
    const prevPart = visibleNodes.map(n => n.textContent).join("");
    if (offset === -1) offset = prevPart.length;
    let depth = 0;
    for (let i = offset - 1; i >= 0; i--) {
      const c = prevPart[i];

      if (c === "「") depth++;
      if (c === "」") depth--;
    }
    
    const prevNode = SentenceTools.getPrevNode(currentNode);
    if (SentenceTools.getClosestP(currentNode) != SentenceTools.getClosestP(prevNode)) {
      console.debug(`Depth finding finished because of the paragraph end, last depth: ${depth}`)
      return depth;
    } else {
      console.debug(`Depth finding continues, this depth: ${depth}`)
      return SentenceTools.getDepth(SentenceTools.getPrevNode(currentNode), -1) + depth;
    }
  },

  getSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "";

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    let inside = "";
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          // Only visible text nodes
          if (!SentenceTools.isVisibleTextNode(node)) return NodeFilter.FILTER_REJECT;

          const nodeRange = document.createRange();
          nodeRange.selectNodeContents(node);
          const fullyInside =
            range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0 &&
            range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0;
          if (fullyInside && node != startNode && node != endNode) {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_REJECT;
        }
      }
    );
    while ((current = walker.nextNode())) {
      inside += current.textContent;
    }

    if (endNode.nodeType === Node.TEXT_NODE) {
      if (startNode === endNode) {
        return endNode.textContent.slice(startOffset, endOffset);
      }
      inside = inside + endNode.textContent.slice(0, endOffset);
    }

    if (startNode.nodeType === Node.TEXT_NODE) {
      inside = startNode.textContent.slice(startOffset) + inside;
    }

    return inside;
  },

  getSentenceAroundSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "";

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    let before = "";
    let after = "";
    let inside = SentenceTools.getSelection();

    if (endNode.nodeType === Node.TEXT_NODE) {
      after = SentenceTools.getSentenceSuffix(endNode, endOffset);
    } else {
      let nextNode;
      if (endOffset < endNode.childNodes.length)
        nextNode = endNode.childNodes[endOffset];
      else
        nextNode = SentenceTools.getNextNode(endNode);
      after = SentenceTools.getSentenceSuffix(nextNode, 0);
    }
    console.log(`after: ${after}`);

    if (startNode.nodeType === Node.TEXT_NODE) {
      before = SentenceTools.getSentencePrefix(startNode, startOffset);
    } else {
      let prevNode;
      if (startOffset > 0)
        prevNode = startNode.childNodes[startOffset - 1];
      else
        prevNode = SentenceTools.getPrevNode(startNode);
      before = SentenceTools.getSentencePrefix(prevNode, -1);
    }
    console.log(`before: ${before}`);

    return {sentence: before + inside + after, index: before.length};
  }
}