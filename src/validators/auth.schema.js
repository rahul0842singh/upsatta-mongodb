const { z } = require('zod');

const email = z.string().email().transform((s) => s.toLowerCase().trim());
const password = z.string().min(6).max(100);
const name = z.string().min(1).max(120);

const registerSchema = z.object({
  name,
  email,
  password
});

const loginSchema = z.object({
  email,
  password
});

module.exports = { registerSchema, loginSchema };
