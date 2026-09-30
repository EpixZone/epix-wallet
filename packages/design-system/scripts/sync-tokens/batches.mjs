// Complete each batch before starting the next, so callers can process parallel
// results in input order and release their contents without retaining all items.
export async function forEachBatch(items, batchSize, processBatch) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("Batch size must be a positive integer");
  }

  async function nextBatch(offset) {
    if (offset >= items.length) return;
    await processBatch(items.slice(offset, offset + batchSize));
    return nextBatch(offset + batchSize);
  }

  return nextBatch(0);
}
