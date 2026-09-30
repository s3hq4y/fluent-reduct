/**
 * Fluent Reduct - minimal reactive state.
 */

type Listener<T> = (value: T, oldValue: T) => void;

export class State<T> {
  private current: T;
  private readonly listeners = new Set<Listener<T>>();

  constructor(initialValue: T) {
    this.current = initialValue;
  }

  get value(): T {
    return this.current;
  }

  set value(next: T) {
    const previous = this.current;
    if (previous === next) return;
    this.current = next;
    this.listeners.forEach((listener) => listener(next, previous));
  }

  update(updater: (current: T) => T): void {
    this.value = updater(this.current);
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export function createState<T>(initialValue: T): State<T> {
  return new State(initialValue);
}
