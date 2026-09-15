export type FinanceIdempotencyKeyFactory = () => string;

export class FinanceIdempotencyAction {
  private current: { fingerprint: string; key: string } | null = null;

  constructor(private readonly createKey: FinanceIdempotencyKeyFactory) {}

  begin(): string {
    const key = this.createKey();
    this.current = { fingerprint: '', key };
    return key;
  }

  reset(): void {
    this.current = null;
  }

  keyFor(fingerprint: string): string {
    if (!this.current || (this.current.fingerprint && this.current.fingerprint !== fingerprint)) {
      this.current = { fingerprint, key: this.createKey() };
    } else {
      this.current.fingerprint = fingerprint;
    }
    return this.current.key;
  }

  complete(): void {
    this.current = null;
  }
}
