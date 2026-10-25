/**
 * A small serial task queue.
 *
 * Work submitted through `run` is executed one item at a time, in the order
 * it arrived. This keeps two saves of the same exercise from reaching the
 * server at the same time, which would otherwise race each other.
 */
export class SaveQueue {
  private tail: Promise<unknown> = Promise.resolve();

  /** Queues a task and resolves with its result. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    // The queue itself must not break when a task rejects, otherwise every
    // later task would be skipped.
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Resolves once everything currently queued has finished. */
  async drain(): Promise<void> {
    await this.tail;
  }
}
