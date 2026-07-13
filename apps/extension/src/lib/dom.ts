/**
 * Construction DOM sûre (textContent, jamais innerHTML) pour les pages
 * checking/blocked — même écran de blocage, même helper.
 */
export function el(tag: string, className: string | null, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
