import { z } from 'zod';

export const isoStringSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().date());

export const rangeSchema = z.object({
  from: isoStringSchema.optional(),
  to: isoStringSchema.optional(),
  model: z.string().optional(),
  bucket: z.enum(['hour', 'day']).optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type RangeQuery = z.infer<typeof rangeSchema>;

export function parseRangeQuery(query: unknown):
  | { success: true; data: RangeQuery }
  | { success: false; error: string } {
  const parsed = rangeSchema.safeParse(query);
  if (!parsed.success) {
    const msg =
      parsed.error.issues
        .map((i) => `${i.path.join('.') || 'field'}: ${i.message}`)
        .join(', ') || 'Invalid query parameters';
    return { success: false, error: msg };
  }
  return { success: true, data: parsed.data };
}

export function buildEventFilters(
  filters: { from?: string; to?: string; model?: string },
  startIndex = 1,
  extraConditions: string[] = [],
): { whereClause: string; params: unknown[]; nextIndex: number } {
  const conditions = [...extraConditions];
  const params: unknown[] = [];
  let idx = startIndex;

  if (filters.from !== undefined) {
    conditions.push(`ts >= $${idx++}::timestamptz`);
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    conditions.push(`ts <= $${idx++}::timestamptz`);
    params.push(filters.to);
  }
  if (filters.model !== undefined) {
    conditions.push(`model = $${idx++}::text`);
    params.push(filters.model);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params, nextIndex: idx };
}
