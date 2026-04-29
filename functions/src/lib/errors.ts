/**
 * Domain errors shared across admin handlers. Throwing one of these inside a
 * handler signals "reject the request with a specific HTTP status" — callers
 * catch it and translate to a JSON response.
 */

export class InsufficientStockError extends Error {
  readonly productName: string;
  readonly available: number;

  constructor(productName: string, available: number) {
    super(`Only ${available} of ${productName} in stock`);
    this.name = "InsufficientStockError";
    this.productName = productName;
    this.available = available;
  }
}
