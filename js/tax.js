// Tax is calculated ONLY here. GST is not active: no tax is added and the receipt is a plain bill.
// When GST registration is done, the GST rules go into this file. Each bill stores the result it
// was created with, so turning GST on later never changes old bills.
export function computeTax(lines, subtotal, discount, settings) {
  return {mode: 'none', taxTotal: 0, breakdown: []};
}
