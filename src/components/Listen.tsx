'use client';
import {useEffect,useRef,useState} from 'react';
export default function Listen({text}:{text:string}) {
 const [supported,setSupported]=useState(false),[voices,setVoices]=useState<SpeechSynthesisVoice[]>([]);
 const [voice,setVoice]=useState(''),[rate,setRate]=useState(1),[status,setStatus]=useState<'stopped'|'playing'|'paused'>('stopped');
 const [error,setError]=useState('');
 const generation=useRef(0),utterance=useRef<SpeechSynthesisUtterance|null>(null);
 useEffect(()=>{
  if(!('speechSynthesis' in window))return;
  setSupported(true);
  const load=()=>setVoices(window.speechSynthesis.getVoices());load();
  window.speechSynthesis.addEventListener('voiceschanged',load);
  return()=>{generation.current++;window.speechSynthesis.cancel();window.speechSynthesis.removeEventListener('voiceschanged',load);};
 },[]);
 function stop(){generation.current++;window.speechSynthesis.cancel();utterance.current=null;setStatus('stopped');}
 function play(){
  setError('');
  if(status==='paused'){window.speechSynthesis.resume();setStatus('playing');return;}
  stop();const current=generation.current;
  const chunks=text.match(/[\s\S]{1,400}(?:\s|$)|[\s\S]{1,400}/g)??[];
  let index=0;
  function next(){
   if(generation.current!==current)return;
   if(index>=chunks.length){setStatus('stopped');return;}
   const speech=new SpeechSynthesisUtterance(chunks[index++]);utterance.current=speech;
   speech.rate=rate;speech.voice=voices.find(v=>v.voiceURI===voice)??null;
   speech.onend=next;
   speech.onerror=event=>{if(generation.current!==current)return;setStatus('stopped');setError(`Audio could not play (${event.error}). Try another voice.`);};
   window.speechSynthesis.speak(speech);
  }
  setStatus('playing');next();
 }
 return <details className="listen-controls"><summary>Listen to this article</summary>{supported?<><p>Uses your browser’s available voices. Some voices require a network connection.</p><label>Voice<select value={voice} disabled={status!=='stopped'} onChange={e=>setVoice(e.target.value)}><option value="">System default</option>{voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select></label><label>Speed<select value={rate} disabled={status!=='stopped'} onChange={e=>setRate(Number(e.target.value))}>{[0.75,1,1.25,1.5,1.75,2].map(n=><option key={n} value={n}>{n}×</option>)}</select></label><div className="button-row"><button disabled={!text||status==='playing'} onClick={play}>{status==='paused'?'Resume':'Play'}</button><button disabled={status!=='playing'} onClick={()=>{window.speechSynthesis.pause();setStatus('paused');}}>Pause</button><button disabled={status==='stopped'} onClick={stop}>Stop</button></div>{error&&<p role="alert">{error}</p>}</>:<p>Text-to-speech is unavailable in this browser.</p>}</details>;
}
