const { z } = require("zod");

const createGameSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).transform((s) => s.toUpperCase()),
  orderIndex: z.number().int().min(1).max(999), // broaden from 10 if you want
  isActive: z.boolean().optional().default(true),
  defaultTime: z.string().nullable().optional()
});

const updateGameSchema = z.object({
  name: z.string().min(1).optional(),
  orderIndex: z.number().int().min(1).max(999).optional(),
  isActive: z.boolean().optional(),
  defaultTime: z.string().nullable().optional()
});

const bulkUpsertSchema = z.object({
  items: z.array(createGameSchema)
});

module.exports = { createGameSchema, updateGameSchema, bulkUpsertSchema };
