import type {ShortcutOverrides} from './keyboard';
export type Folder = 'inbox' | 'later' | 'shortlist' | 'archive' | 'trash';
export type Preferences = {
  shortcuts?: ShortcutOverrides;
  workflow?:'triage'|'shortlist'|'classic';
  autoAdvance?: boolean;
  defaultView?: 'library'|'feed'|'notebook'|'search';
  readerPanel?: 'notebook'|'info'|'hidden';
  theme: 'light' | 'dark' | 'system';
  font: 'serif' | 'sans';
  fontSize: number;
  width: 'narrow' | 'medium' | 'wide';
};
export type Document = {
  category?:'article'|'podcast'|'epub'|'pdf'|'video';
  youtubeVideoId?:string;
  attachmentId?:string;
  audioUrl?:string;
  id: string; title: string; author: string; siteName: string; url: string;
  html: string; text: string; excerpt: string; wordCount: number;
  favorite?: boolean;
  folder: Folder; tags: string[]; note: string; progress: number; revision: number;
  createdAt: string; movedAt: string;
};
export type Highlight = {
  revision?:number;
  id: string; documentId: string; start: number; end: number; quote: string;
  note: string; tags?: string[]; createdAt: string;
};
export type Feed = {
  folder?:string;
  id: string; title: string; url: string; checkedAt: string | null; error: string | null;
};
export type FeedEntry = {
  youtubeVideoId?:string;
  audioUrl?:string;
  id: string; feedId: string; title: string; url: string; author: string;
  summary: string; publishedAt: string | null; state: 'new' | 'saved' | 'dismissed';
};
export type SavedView = {id:string;name:string;description:string;query:string;pinned:boolean;revision:number};
export type Library = {
  views?: SavedView[];
  documents: Document[]; highlights: Highlight[]; feeds: Feed[]; entries: FeedEntry[];
  preferences: Preferences; preferencesRevision: number;
};
export const defaultPreferences: Preferences = {theme:'light',font:'serif',fontSize:20,width:'medium'};
