/**
 * Running transcript of recognized signs.
 *
 * An immediate repeat of the previous word inside `repeatGapMs` is ignored, so a sign that
 * flickers out and back in does not get written twice. Only the newest `maxItems` words are kept.
 *
 * @param {{ maxItems?: number, repeatGapMs?: number }} options
 */
export const createTranscript = ({ maxItems = 50, repeatGapMs = 1500 } = {}) => {
  let entries = [];
  let last = null;

  const add = (label, t) => {
    if (!label) return false;
    if (last && last.label === label && t - last.t < repeatGapMs) return false;
    last = { label, t };
    entries.push(last);
    if (entries.length > maxItems) entries = entries.slice(entries.length - maxItems);
    return true;
  };

  return {
    add,
    items: () => entries.slice(),
    text: () => entries.map((e) => e.label).join(" "),
    clear: () => { entries = []; last = null; },
  };
};
