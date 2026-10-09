export interface OtlpAnyValue {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values?: OtlpAnyValue[] };
  kvlistValue?: { values?: OtlpKeyValue[] };
  bytesValue?: string;
  [key: string]: unknown;
}

export interface OtlpKeyValue {
  key: string;
  value?: OtlpAnyValue;
}

export function extractAnyValue(val: unknown): unknown {
  if (val === null || val === undefined) {
    return undefined;
  }
  if (
    typeof val === 'string' ||
    typeof val === 'number' ||
    typeof val === 'boolean'
  ) {
    return val;
  }
  if (typeof val === 'object') {
    const v = val as Record<string, unknown>;
    if (v.stringValue !== undefined) {
      return v.stringValue;
    }
    if (v.intValue !== undefined) {
      if (typeof v.intValue === 'string' && v.intValue.trim() === '') {
        return undefined;
      }
      const num = Number(v.intValue);
      return Number.isNaN(num) ? v.intValue : num;
    }
    if (v.doubleValue !== undefined) {
      if (typeof v.doubleValue === 'string' && (v.doubleValue as string).trim() === '') {
        return undefined;
      }
      const num = Number(v.doubleValue);
      return Number.isNaN(num) ? v.doubleValue : num;
    }
    if (v.boolValue !== undefined) {
      return Boolean(v.boolValue);
    }
    if (v.value !== undefined) {
      return extractAnyValue(v.value);
    }
  }
  return undefined;
}

export function attrsToObject(
  attrs?: OtlpKeyValue[],
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!attrs || !Array.isArray(attrs)) {
    return result;
  }
  for (const item of attrs) {
    if (!item || typeof item.key !== 'string') {
      continue;
    }
    const val = extractAnyValue(item.value);
    if (
      typeof val === 'string' ||
      typeof val === 'number' ||
      typeof val === 'boolean'
    ) {
      result[item.key] = val;
    }
  }
  return result;
}
