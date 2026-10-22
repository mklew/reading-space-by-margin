'use client';
import {useState} from 'react';
import {defaults,effectiveShortcuts,shortcutActions,shortcutLabels,shortcutsSchema,type ShortcutOverrides} from '@/keyboard';

export default function KeyboardSettings({value,onSave}:{value:ShortcutOverrides|undefined;onSave:(value:ShortcutOverrides)=>Promise<void>}) {
  const current=effectiveShortcuts(value);
  const currentKey=JSON.stringify(current);
  const [baseline,setBaseline]=useState(currentKey);
  const [draft,setDraft]=useState(()=>current);
  const changedElsewhere=currentKey!==baseline;
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const validation=shortcutsSchema.safeParse(draft);
  return <section className="settings-section"><h3>Keyboard shortcuts</h3>
    <p>Choose one key per action. Leave a field blank to disable it. Shortcuts pause while you type in a field and when Control, Command, or Alt is held. Document actions apply while reading.</p>
    <form onSubmit={async event=>{
      event.preventDefault();if(!validation.success||busy||changedElsewhere)return;
      setBusy(true);setError('');setMessage('');
      try{await onSave(validation.data);setDraft(effectiveShortcuts(validation.data));setBaseline(JSON.stringify(effectiveShortcuts(validation.data)));setMessage('Keyboard shortcuts saved.');}
      catch(cause){setError(cause instanceof Error?cause.message:'Unable to save shortcuts.');}
      finally{setBusy(false);}
    }}>
      {shortcutActions.map(action=><label key={action}>{shortcutLabels[action]}
        <input aria-label={`${shortcutLabels[action]} shortcut`} value={draft[action]} disabled={busy} autoCapitalize="none" autoComplete="off" spellCheck={false}
          onChange={event=>{setDraft({...draft,[action]:event.target.value.toLowerCase()});setMessage('');}}/>
      </label>)}
      {changedElsewhere&&<p role="alert">Saved shortcuts changed while this form was open. <button type="button" disabled={busy} onClick={()=>{setDraft(current);setBaseline(currentKey);setMessage('Current shortcuts loaded.');setError('');}}>Load current shortcuts</button></p>}
      {!validation.success&&<p role="alert">{validation.error.issues[0]?.message}</p>}
      {error&&<p role="alert">{error}</p>}
      <div className="button-row"><button disabled={busy||!validation.success||changedElsewhere}>{busy?'Saving…':'Save shortcuts'}</button>
        <button type="button" disabled={busy} onClick={()=>{setDraft({...defaults});setError('');setMessage('Default shortcuts restored. Save to apply them.');}}>Reset to defaults</button>
      </div><p role="status">{message}</p>
    </form>
  </section>;
}
