import {configuration,client,doorSession,fail} from './door-auth.mjs';
import {validateContent} from '../dist/model.mjs';
import {readState} from './content-service.mjs';
export const missingWorkflow=error=>error?.code==='PGRST202';
export async function websiteRead(req,admin,store,defaults){
  const config=configuration();if(!config)return null;
  const db=admin?(await doorSession(req,config)).supabase:client(config);
  let result=await db.rpc('ringside_website_read',{p_admin:admin});
  if(missingWorkflow(result.error))return null;
  if(result.error)throw fail('Event publishing is temporarily unavailable. Please try again.',503);
  if(!result.data&&admin){
    const {state}=await readState(store,defaults);
    const seed={...state,draft:validateContent(state.draft),published:validateContent(state.published)};
    result=await db.rpc('ringside_website_seed',{p_state:seed});
    if(result.error)throw fail('The existing website could not be imported. No changes were published.',503);
  }
  return result.data?{...result.data,workflowReady:true}:null;
}
export async function websiteChange(req,command){
  const config=configuration();if(!config)return null;
  const db=(await doorSession(req,config)).supabase;
  if(command.action==='save')command.content=validateContent(command.content);
  const result=await db.rpc('ringside_website_change',{p_revision:command.revision,p_action:command.action,p_content:command.content||null,p_version:command.id||null});
  if(missingWorkflow(result.error))throw fail('Event publishing needs its database update before changes can be published. Your current website is unchanged.',503);
  if(result.error)throw fail(result.error.message?.includes('newer version')?'Someone saved a newer version. Reload before saving.':result.error.message||'No changes were published.',result.error.message?.includes('newer version')?409:400);
  return {...result.data,workflowReady:true};
}
