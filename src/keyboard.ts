import {z} from 'zod';

export const defaults = {
  capture:'n', search:'/', next:'j', previous:'k', archive:'e', later:'l', notebook:'b',
} as const;
export type ShortcutAction = keyof typeof defaults;
export type ShortcutOverrides = Partial<Record<ShortcutAction,string>>;
export const shortcutLabels: Record<ShortcutAction,string> = {
  capture:'Save a document', search:'Search library', next:'Next document', previous:'Previous document',
  archive:'Archive document', later:'Move to Later', notebook:'Open notebook',
};
export const shortcutActions = Object.keys(defaults) as ShortcutAction[];

export function effectiveShortcuts(overrides?:ShortcutOverrides): Record<ShortcutAction,string> {
  return Object.fromEntries(shortcutActions.map(action=>[action,overrides?.[action]??defaults[action]])) as Record<ShortcutAction,string>;
}

const keySchema=z.string().transform(key=>key.toLowerCase()).refine(key=>key===''||(
  [...key].length===1&&!/[\s\p{C}]/u.test(key)
),'Use one printable key, or leave blank to disable.');
export const shortcutsSchema=z.object({
  capture:keySchema.optional(),search:keySchema.optional(),next:keySchema.optional(),previous:keySchema.optional(),
  archive:keySchema.optional(),later:keySchema.optional(),notebook:keySchema.optional(),
}).strict().superRefine((overrides,context)=>{
  const assigned=new Map<string,ShortcutAction>();
  for(const action of shortcutActions){
    const key=effectiveShortcuts(overrides)[action];
    if(!key)continue;
    const previous=assigned.get(key);
    if(previous)context.addIssue({code:'custom',path:[action],message:`“${key}” is already assigned to ${shortcutLabels[previous]}.`});
    else assigned.set(key,action);
  }
});

type ShortcutEvent = {
  key:string;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;shiftKey?:boolean;
  repeat?:boolean;isComposing?:boolean;defaultPrevented?:boolean;target?:EventTarget|null;
};
export function shortcutAction(event:ShortcutEvent,overrides?:ShortcutOverrides):ShortcutAction|null {
  if(event.ctrlKey||event.metaKey||event.altKey||event.repeat||event.isComposing||event.defaultPrevented)return null;
  const target=event.target as (Element & {isContentEditable?:boolean})|null|undefined;
  if(target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return null;
  const bindings=effectiveShortcuts(overrides);
  const key=event.key.toLowerCase();
  return shortcutActions.find(action=>bindings[action]!==''&&bindings[action]===key)??null;
}
