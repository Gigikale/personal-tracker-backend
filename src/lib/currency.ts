const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  NGN: '₦',
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? '$';
}

export function formatMoney(amount: number, code: string): string {
  const sign = amount < 0 ? '-' : '';
  const formatted = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${currencySymbol(code)}${formatted}`;
}
