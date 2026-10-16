import {randomUUID} from 'node:crypto';
import {validateContent} from '../dist/model.mjs';
export const initialState=defaults=>({revision:'initial',draft:defaults,published:defaults,history:[],publishedAt:null,savedAt:null});
export async function readState(store,defaults){const entry=await store.getWithMetadata('content',{type:'json',consistency:'strong'});return {state:entry?.data||initialState(defaults),etag:entry?.etag};}
export async function changeState(store,defaults,body){
  const {state,etag}=await readState(store,defaults);
  if(body.revision!==state.revision)throw Object.assign(Error('Someone saved a newer version. Reload before saving; your changes have not overwritten theirs.'),{status:409});
  const now=new Date().toISOString();
  if(body.action==='save'){state.draft=validateContent(body.content);state.savedAt=now;}
  else if(body.action==='publish'){
    validateContent(state.draft);
    state.history=[{id:state.revision,date:state.publishedAt,content:state.published},...state.history].slice(0,10);
    state.published=structuredClone(state.draft);state.published.updatedAt=now;state.publishedAt=now;
  }else if(body.action==='restore'){
    const version=state.history.find(h=>h.id===body.id);if(!version)throw Error('That version is no longer in the publication history.');state.draft=structuredClone(version.content);state.savedAt=now;
  }else throw Error('Unknown operation.');
  state.revision=randomUUID();
  const result=await store.setJSON('content',state,etag?{onlyIfMatch:etag}:{onlyIfNew:true});
  if(!result.modified)throw Object.assign(Error('Another save completed first. Reload and try again.'),{status:409});
  return state;
}
