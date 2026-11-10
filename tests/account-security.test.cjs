"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8").replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,"").replace(/^export /gm,"");
function harness(password){
  const messages=[],calls=[];
  const sdk={auth:{async signUp(input){calls.push(['signup',input]);return {data:{session:null},error:null};},async signInWithPassword(input){calls.push(['login',input]);return {data:{session:null},error:null};}}};
  const app=new Function('document','window','customerSupabase',read('js/account.js')+`;return {handleEmailSignup,handleEmailLogin,prepare(values,messages){for(const [id,value]of Object.entries(values))el[id]={value};setAuthStatus=message=>messages.push(message);afterSuccessfulAuthentication=async()=>{};}};`)({addEventListener(){}},{location:{origin:'https://shop.test'}},sdk);
  app.prepare({'signup-name':'Test Customer','signup-email':'test@example.test','signup-password':password,'signup-confirm-password':password,'login-email':'test@example.test','login-password':password},messages);
  return {...app,messages,calls};
}
test('New email signup rejects a short password before calling Supabase',async()=>{
  const h=harness('short123');await h.handleEmailSignup({preventDefault(){}});assert.equal(h.calls.length,0);assert.match(h.messages.at(-1),/12 characters/);
});
test('A 12-character signup password passes local validation without generating staff permissions',async()=>{
  const h=harness('long-test-12');await h.handleEmailSignup({preventDefault(){}});assert.equal(h.calls[0][0],'signup');assert.deepEqual(h.calls[0][1].options.data,{full_name:'Test Customer'});
});
test('Existing shorter passwords are still passed through login for server verification',async()=>{
  const h=harness('older123');await h.handleEmailLogin({preventDefault(){}});assert.equal(h.calls[0][0],'login');assert.equal(h.calls[0][1].password,'older123');
});
test('Password reset refuses a short replacement before updating the account',async()=>{
  const nodes={};const node=id=>nodes[id]||=( {value:'short123',textContent:'',dataset:{},addEventListener(){},focus(){}} );let writes=0;
  const submit=new Function('document','window','customerSupabase','getVerifiedAccountSession','clearCustomerSession',read('js/reset-password.js')+';return handleSubmit;')({getElementById:node},{setTimeout(){}},{auth:{async updateUser(){writes++;return {error:null};}}},async()=>({user:{id:'test-user'}}),async()=>{});
  await new Promise(r=>setImmediate(r));await submit({preventDefault(){}});assert.equal(writes,0);assert.match(nodes['reset-password-status'].textContent,/12 characters/);
});
