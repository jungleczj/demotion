import { createVercelHandler } from '../server/vercel-api.mjs';

export default { fetch: createVercelHandler() };
