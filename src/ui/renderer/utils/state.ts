/**
 * Fluent Reduct - State management
 * A simple reactive state system
 */

type Listener<T> = (value: T, oldValue: T) => void;

// Simple reactive state class
export class State<T> {
  private _value: T;
  private listeners: Set<Listener<T>> = new Set();

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  // Get value
  get value(): T {
    return this._value;
  }

  // Set value
  set value(newValue: T) {
    const oldValue = this._value;
    if (oldValue !== newValue) {
      this._value = newValue;
      this.notify(newValue, oldValue);
    }
  }

  // Update value (using an updater function)
  update(updater: (current: T) => T): void {
    this.value = updater(this._value);
  }

  // Subscribe to changes
  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify listeners
  private notify(value: T, oldValue: T): void {
    this.listeners.forEach(listener => listener(value, oldValue));
  }
}

// Create state
export function createState<T>(initialValue: T): State<T> {
  return new State<T>(initialValue);
}

// Derived state
export function derived<T, R>(
  source: State<T>,
  transform: (value: T) => R
): State<R> {
  const derived = new State(transform(source.value));
  source.subscribe((value) => {
    derived.value = transform(value);
  });
  return derived;
}
