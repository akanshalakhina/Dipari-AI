/// <reference types="vite/client" />

interface CashfreeCheckoutResult {
  error?: { message?: string };
  redirect?: boolean;
}

interface CashfreeInstance {
  checkout(options: {
    paymentSessionId: string;
    redirectTarget?: '_self' | '_blank' | '_top' | '_modal';
  }): Promise<CashfreeCheckoutResult>;
}

interface Window {
  Cashfree?: (options: { mode: 'sandbox' | 'production' }) => CashfreeInstance;
}
