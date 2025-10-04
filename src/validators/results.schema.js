const { z } = require("zod");

const createResultSchema = z.object({
  gameCode: z.string().min(1),
  dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(3),
  value: z.string().min(1).max(4),
  note: z.string().optional()
});

const snapshotQuerySchema = z.object({
  dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(3)
});

const timewiseQuerySchema = z.object({
  dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const monthlyChartQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  games: z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim().toUpperCase()))
    .optional()
});

module.exports = {
  createResultSchema,
  snapshotQuerySchema,
  timewiseQuerySchema,
  monthlyChartQuerySchema
};
