'use client';
import {useState} from 'react';

export default function UploadBook({onSaved}:{onSaved:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  return <section className="settings-section"><h3>Upload a document</h3><p>Read a PDF or EPUB in your library, with search, notes and highlights. Original files remain downloadable. PDF text is extracted page by page. Scanned pages need the original viewer. EPUB images and chapter links are included. Fixed-layout books are presented as flowing text.</p><label>PDF or EPUB file<input type="file" accept=".epub,.pdf,application/epub+zip,application/pdf" disabled={busy} onChange={async event=>{
    const file=event.target.files?.[0];if(!file)return;
    const input=event.target;
    if(file.size>4*1024*1024){setMessage('Choose a file smaller than 4 MB. Larger uploads are not yet supported.');input.value='';return;}
    setBusy(true);setMessage('Importing document…');
    try {
      const response=await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`,{method:'POST',body:file});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed.');
      await onSaved();setMessage(`Saved ${result.title}. Open your library to read it.`);
    }catch(error){setMessage(error instanceof Error?error.message:'Upload failed.');}
    finally{setBusy(false);input.value='';}
  }}/></label><p role="status">{message}</p></section>;
}
