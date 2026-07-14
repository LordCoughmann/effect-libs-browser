import { z } from '../../../playwright-core/src/mcpBundle.js';

const testAnnotationSchema = z.object({
  type: z.string(),
  description: z.string().optional()
});
const testDetailsSchema = z.object({
  tag: z.union([
    z.string().optional(),
    z.array(z.string())
  ]).transform((val) => Array.isArray(val) ? val : val !== void 0 ? [val] : []).refine((val) => val.every((v) => v.startsWith("@")), {
    message: "Tag must start with '@'"
  }),
  annotation: z.union([
    testAnnotationSchema,
    z.array(testAnnotationSchema).optional()
  ]).transform((val) => Array.isArray(val) ? val : val !== void 0 ? [val] : [])
});
function validateTestDetails(details, location) {
  try {
    const parsedDetails = testDetailsSchema.parse(details);
    return {
      annotations: parsedDetails.annotation.map((a) => ({ ...a, location })),
      tags: parsedDetails.tag,
      location
    };
  } catch (error) {
    throwZodError(error);
  }
}
function throwZodError(error) {
  throw new Error(error.issues.map((i) => i.message).join("\n"));
}

export { validateTestDetails };
