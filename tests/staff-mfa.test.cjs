"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {requiresStaffMfa,staffSecurityDestination,createStaffMfaRepository}=new Function(fs.readFileSync(path.join(__dirname,'../js/staff-mfa.js'),'utf8').replace(/^export /gm,'')+';return {requiresStaffMfa,staffSecurityDestination,createStaffMfaRepository};')();
function harness(options={}) {
  const calls=[];let owner='staff',level='aal1';
  const mfa={
    async listFactors(){return {data:{all:options.factors||[]}};},
    async getAuthenticatorAssuranceLevel(){if(options.levelThrows)throw Error('offline');return {data:{currentLevel:level}};},
    async unenroll(input){calls.push(['unenroll',input]);return {};},
    async enroll(input){calls.push(['enroll',input]);if(options.switchOwner)owner='another';return {data:{id:'factor',totp:{qr_code:options.qr||'<svg xmlns="http://www.w3.org/2000/svg"></svg>',secret:'SAMPLE-ONLY'}}};},
    async challengeAndVerify(input){calls.push(['verify',input]);if(options.badCode)return {error:{message:'invalid'}};level=options.noElevation?'aal1':'aal2';return {};}
  };
  const client={auth:{mfa},async rpc(){return {data:options.permissions||{active:true,can_manage_orders:true,mfa_required:false}};}};
  const repo=createStaffMfaRepository(client,async()=>({user:{id:owner,is_anonymous:!!options.anonymous}}));
  return {repo,client,calls,setOwner(value){owner=value;}};
}
test('Staff MFA rollout leaves existing access working until explicitly enabled',async()=>{
  const h=harness();assert.equal(await requiresStaffMfa(h.client,{mfa_required:false}),false);
  assert.equal(await requiresStaffMfa(h.client,{mfa_required:true}),true);
  await h.repo.verify('staff','factor','123456');assert.equal(await requiresStaffMfa(h.client,{mfa_required:true}),false);
});
test('MFA gate fails closed if assurance status cannot load',async()=>{
  assert.equal(await requiresStaffMfa(harness({levelThrows:true}).client,{mfa_required:true}),true);
});
test('Customer and anonymous accounts cannot start staff enrollment',async()=>{
  for(const options of [{permissions:{active:false}},{anonymous:true}]){const h=harness(options);await assert.rejects(h.repo.enroll());assert.equal(h.calls.length,0);}
});
test('Enrollment restarts only unfinished TOTP and renders an inline QR',async()=>{
  const h=harness({factors:[{id:'unfinished',factor_type:'totp',status:'unverified'}]});const data=await h.repo.enroll();
  assert.equal(h.calls[0][0],'unenroll');assert.equal(h.calls[0][1].factorId,'unfinished');assert.match(data.qrCode,/^data:image\/svg\+xml/);
  const verified=harness({factors:[{id:'existing',factor_type:'totp',status:'verified'}]});await assert.rejects(verified.repo.enroll(),/already added/);assert.equal(verified.calls.length,0);
});
test('Enrollment rejects external QR URLs and account changes without returning secrets',async()=>{
  await assert.rejects(harness({qr:'https://untrusted.test/qr'}).repo.enroll(),/safely/);
  await assert.rejects(harness({switchOwner:true}).repo.enroll(),/account changed/);
});
test('Verification rejects malformed, wrong, or non-elevating codes',async()=>{
  const h=harness();await assert.rejects(h.repo.verify('staff','factor','123'),/6-digit/);assert.equal(h.calls.length,0);
  await assert.rejects(harness({badCode:true}).repo.verify('staff','factor','123456'),/could not be verified/);
  await assert.rejects(harness({noElevation:true}).repo.verify('staff','factor','123456'),/could not be confirmed/);
});
test('Verification refuses a different signed-in account before sending the code',async()=>{
  const h=harness();h.setOwner('another');await assert.rejects(h.repo.verify('staff','factor','123456'),/account changed/);assert.equal(h.calls.length,0);
});
test('Staff return destination stays on an authorized local dashboard',()=>{
  assert.equal(staffSecurityDestination('https://untrusted.test',{can_manage_orders:true}),'/admin.html');
  assert.equal(staffSecurityDestination('/rider.html',{can_manage_orders:true,can_deliver_orders:true}),'/rider.html');
  assert.equal(staffSecurityDestination('/admin.html',{can_deliver_orders:true}),'/rider.html');
});
