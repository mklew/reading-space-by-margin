import type {Folder,Preferences,Document} from './domain';
export function captureLocation(preferences:Preferences):Folder {
 return preferences.workflow&&preferences.workflow!=='triage'?'later':'inbox';
}
export function workflowLocations(preferences:Preferences,documents:Document[]):Folder[] {
 const primary:Folder[]=preferences.workflow==='classic'?['later','archive']:preferences.workflow==='shortlist'?['later','shortlist','archive']:['inbox','later','archive'];
 return [...primary,...(['inbox','shortlist'] as Folder[]).filter(folder=>!primary.includes(folder)&&documents.some(d=>d.folder===folder))];
}
