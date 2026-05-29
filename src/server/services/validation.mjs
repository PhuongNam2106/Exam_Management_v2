export const labels = ['A', 'B', 'C', 'D'];

export function requiredText(value, fieldName) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${fieldName} is required`);
  return text;
}

export function positiveInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return number;
}

export function optionLabel(value, fieldName = 'correct_option') {
  const label = String(value || '').trim().toUpperCase();
  if (!labels.includes(label)) throw new Error(`${fieldName} must be A, B, C, or D`);
  return label;
}
