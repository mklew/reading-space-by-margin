import {z} from 'zod';
import {shortcutsSchema} from './keyboard';
export const preferencesSchema = z.object({shortcuts:shortcutsSchema.optional(),workflow:z.enum(['triage','shortlist','classic']).optional(),autoAdvance:z.boolean().optional(),defaultView:z.enum(['library','feed','notebook','search']).optional(),readerPanel:z.enum(['notebook','info','hidden']).optional(),theme:z.enum(['light','dark','system']),font:z.enum(['serif','sans']),fontSize:z.number().min(14).max(30),width:z.enum(['narrow','medium','wide'])});
