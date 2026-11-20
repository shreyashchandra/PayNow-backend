/**
 * Small helpers shared by every route so errors are handled the same way
 * everywhere and never crash the process.
 */

class HttpError extends Error {
  constructor(status, msg, extra = {}) {
    super(msg);
    this.status = status;
    this.extra = extra;
  }
}

// Express 4 does not catch rejected promises from async handlers on its own.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Turns a zod error into { field: "message" } for the frontend to show inline.
const fieldErrors = (zodError) => {
  const out = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
};

const parseBody = (schema, body) => {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const fields = fieldErrors(result.error);
    throw new HttpError(400, Object.values(fields)[0] || "Invalid input", { fields });
  }
  return result.data;
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = { HttpError, asyncHandler, parseBody, escapeRegex };
