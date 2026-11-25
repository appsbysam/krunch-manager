/**
 * KRUNCH Google Sheets connector (installation candidate).
 * Uses the existing authenticated KRUNCH member account, NOT a service-role key.
 * Only install in the KRUNCH Google Sheet and test with a non-critical row first.
 * Password is used for one login request; only rotating Supabase session tokens are stored.
 */
const KRUNCH = Object.freeze({
  spreadsheetId:"1mYzZTDNeedXp7FOB_bwBpx5bR5miZOje18sPOcHBd6A",
  api:"https://dipyagaxuoqttskrnnnh.supabase.co",
  publishableKey:"sb_publishable_UXfftbuScQ2TR0Huyuf34Q_hXfFu-_h",
  recordsTab:"Project Records", newTab:"New Entries", syncGuide:"Sync Guide"
});
const ITEM_FIELDS = {
  4:"item_name",5:"area",6:"subcategory",7:"assigned_to",
  8:"task_status",9:"purchase_status",10:"estimate",11:"actual",12:"supplier",13:"notes"
};
const TASK_STATUSES = ["Not started","In progress","Completed","Delayed"];
const PURCHASE_STATUSES = ["Not yet purchased","Wishlist","Researching","Being quoted","Quote received","Ordered","Purchased"];

function onOpen() {
  SpreadsheetApp.getUi().createMenu("KRUNCH Sync")
    .addItem("Connect my KRUNCH account","krunchConnectDialog")
    .addItem("Pause synchronisation","krunchPause")
    .addItem("Review & submit changes","krunchSubmitBatch")
    .addItem("Resume synchronisation","krunchResume")
    .addSeparator().addItem("Refresh Project Records","krunchPull")
    .addItem("Submit New Entries","krunchSubmitNewEntries")
    .addSeparator().addItem("Disconnect automatic sync","krunchDisconnect")
    .addToUi();
}
function krunchConnectDialog(){
  const html=HtmlService.createHtmlOutput(
    '<div style="font:14px Arial;padding:16px"><h3>Connect Project KRUNCH</h3>'+
    '<p>Use your existing Project KRUNCH sign-in. Your password will not be saved.</p>'+
    '<label>Email<input id="e" type="email" autocomplete="username" style="display:block;width:100%;padding:8px;margin:7px 0"></label>'+
    '<label>Password<input id="p" type="password" autocomplete="current-password" style="display:block;width:100%;padding:8px;margin:7px 0"></label>'+
    '<button onclick="run()" style="padding:10px 14px">Connect and enable sync</button>'+
    '<p id="msg"></p><script>function run(){document.getElementById("msg").textContent="Connecting...";'+
    'google.script.run.withSuccessHandler(x=>{document.getElementById("p").value="";document.getElementById("msg").textContent=x;}).'+
    'withFailureHandler(e=>{document.getElementById("msg").textContent=e.message;}).'+
    'krunchAuthorise(document.getElementById("e").value,document.getElementById("p").value);}</script></div>');
  SpreadsheetApp.getUi().showModalDialog(html,"KRUNCH connection");
}
function krunchAuthorise(email,password){
  if(krunchPaused_())throw Error("Batch editing is paused. Submit or resume the batch first; reconnecting could overwrite changes.");
  if(!email||!password)throw Error("Email and password are required.");
  const r=UrlFetchApp.fetch(KRUNCH.api+"/auth/v1/token?grant_type=password",{
    method:"post",contentType:"application/json",headers:{"apikey":KRUNCH.publishableKey},
    payload:JSON.stringify({email,password}),muteHttpExceptions:true
  });
  if(r.getResponseCode()!==200)throw Error("Sign-in failed. Check your KRUNCH credentials.");
  const session=JSON.parse(r.getContentText());
  PropertiesService.getScriptProperties().setProperties({
    KRUNCH_ACCESS:session.access_token,
    KRUNCH_REFRESH:session.refresh_token,
    KRUNCH_EXPIRES:String(Date.now()+(session.expires_in||3600)*1000)
  });
  const member=krunchRequest_("/rest/v1/krunch_manager_members?select=role","get");
  if(!member.length){PropertiesService.getScriptProperties().deleteAllProperties();throw Error("Account is not a member of Project KRUNCH.");}
  const triggers=ScriptApp.getProjectTriggers();
  if(!triggers.some(t=>t.getHandlerFunction()==="krunchEditHandler"))
    ScriptApp.newTrigger("krunchEditHandler").forSpreadsheet(KRUNCH.spreadsheetId).onEdit().create();
  if(!triggers.some(t=>t.getHandlerFunction()==="krunchPull"))
    ScriptApp.newTrigger("krunchPull").timeBased().everyMinutes(5).create();
  krunchAllowEdits_();
  krunchPull();
  return "Connected. Project Records will refresh about every five minutes; approved cell edits sync immediately.";
}
function krunchDisconnect(){
  if(krunchPaused_())throw Error("Finish the paused batch before disconnecting.");
  ScriptApp.getProjectTriggers().filter(t=>["krunchEditHandler","krunchPull"].includes(t.getHandlerFunction())).forEach(ScriptApp.deleteTrigger);
  PropertiesService.getScriptProperties().deleteAllProperties();
  const sheet=SpreadsheetApp.openById(KRUNCH.spreadsheetId).getSheetByName(KRUNCH.recordsTab);
  if(sheet){
    sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p=>p.setUnprotectedRanges([]));
  }
  SpreadsheetApp.getActive().toast("Automatic KRUNCH synchronisation stopped. Project Records locked.");
}
function krunchAllowEdits_(){
  const sheet=SpreadsheetApp.openById(KRUNCH.spreadsheetId).getSheetByName(KRUNCH.recordsTab);
  if(!sheet)throw Error("Project Records tab missing.");
  const protections=sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  if(protections.length!==1)throw Error("Unexpected protected range layout. Review before unlocking.");
  protections[0].setUnprotectedRanges([sheet.getRange("D2:M300")]);
}
function krunchToken_(){
  const prop=PropertiesService.getScriptProperties(),p=prop.getProperties();
  if(!p.KRUNCH_ACCESS||!p.KRUNCH_REFRESH)throw Error("Not connected. Use KRUNCH Sync > Connect.");
  if(Number(p.KRUNCH_EXPIRES)>Date.now()+60000)return p.KRUNCH_ACCESS;
  const r=UrlFetchApp.fetch(KRUNCH.api+"/auth/v1/token?grant_type=refresh_token",{
    method:"post",contentType:"application/json",headers:{"apikey":KRUNCH.publishableKey},
    payload:JSON.stringify({refresh_token:p.KRUNCH_REFRESH}),muteHttpExceptions:true
  });
  if(r.getResponseCode()!==200)throw Error("KRUNCH session expired. Connect again.");
  const session=JSON.parse(r.getContentText());
  prop.setProperties({KRUNCH_ACCESS:session.access_token,KRUNCH_REFRESH:session.refresh_token,
    KRUNCH_EXPIRES:String(Date.now()+(session.expires_in||3600)*1000)});
  return session.access_token;
}
function krunchRequest_(path,method,payload,extraHeaders){
  const headers=Object.assign({"apikey":KRUNCH.publishableKey,"Authorization":"Bearer "+krunchToken_(),
    "Content-Type":"application/json","Prefer":"return=representation"},extraHeaders||{});
  const opts={method:method||"get",headers,muteHttpExceptions:true};
  if(payload!==undefined)opts.payload=JSON.stringify(payload);
  const r=UrlFetchApp.fetch(KRUNCH.api+path,opts);
  const status=r.getResponseCode(),body=r.getContentText();
  if(status<200||status>=300)throw Error("KRUNCH API rejected request ("+status+"): "+body.slice(0,180));
  return body?JSON.parse(body):[];
}
function krunchLock_(callback){
  const lock=LockService.getScriptLock();
  lock.waitLock(25000);
  try{return callback();}finally{lock.releaseLock();}
}
function krunchPull(){
  return krunchLock_(()=>krunchPullUnsafe_());
}
function krunchPullUnsafe_(){
  if(krunchPaused_())return 0;
  const rows=krunchRequest_("/rest/v1/krunch_manager_items?select=*&order=created_at.asc&limit=1000","get");
  const sheet=SpreadsheetApp.openById(KRUNCH.spreadsheetId).getSheetByName(KRUNCH.recordsTab);
  if(!sheet)throw Error("Project Records tab missing.");
  if(rows.length>299)throw Error("Record capacity reached. Extend protected range before sync.");
  const safeText_=v=>{const str=String(v??"");return str.trimStart().startsWith("=")?"\u0027"+str:str};
  const data=rows.map(x=>[
    x.id||"",x.reference_id||"",x.item_kind||"Item",x.item_name||"",x.area||"",x.subcategory||"",
    x.assigned_to||"",x.task_status||"",x.purchase_status||"",Number(x.estimate)||0,
    Number(x.actual)||0,x.supplier||"",x.notes||"",x.updated_at||""
  ]);
  sheet.getRange(2,1,Math.max(sheet.getLastRow()-1,1),14).clearContent();
  if(data.length)sheet.getRange(2,1,data.length,14).setValues(data.map(row=>row.map((v,i)=>typeof v==="string"&&i!==13?safeText_(v):v)));
  SpreadsheetApp.openById(KRUNCH.spreadsheetId).toast("KRUNCH refreshed: "+rows.length+" records.");
  return rows.length;
}
function krunchEditHandler(e){
  if(!e||!e.range||e.range.getSheet().getName()!==KRUNCH.recordsTab)return;
  const range=e.range;
  if(range.getRow()<2)return;
  if(range.getNumRows()!==1){SpreadsheetApp.openById(KRUNCH.spreadsheetId).toast("Multi-row paste is not synchronised. Use one row at a time.","Sync warning",10);return;}
  const first=range.getColumn(),last=range.getLastColumn();
  if(first<4||last>13)return;
  try{
    krunchLock_(()=>{
      if(krunchPaused_())return;
      const sheet=range.getSheet(),row=range.getRow();
      const values=sheet.getRange(row,1,1,14).getValues()[0],id=values[0],version=values[13],kind=values[2];
      if(!/^[0-9a-f-]{36}$/i.test(String(id)))throw Error("Missing valid database record ID.");
      const changes={updated_at:new Date().toISOString()};
      for(let col=first;col<=last;col++){
        const field=ITEM_FIELDS[col];let value=values[col-1];
        if(col===8&&kind!=="Task")throw Error("Task status applies only to tasks.");
        if(col===9&&kind!=="Item")throw Error("Purchase status applies only to items.");
        if(col===8&&!TASK_STATUSES.includes(value))throw Error("Invalid task status.");
        if(col===9&&!PURCHASE_STATUSES.includes(value))throw Error("Invalid purchase status.");
        if(col===10||col===11){value=Number(value);if(!Number.isFinite(value)||value<0)throw Error("Amount must be a nonnegative number.");}
        if(col===4&&!String(value).trim())throw Error("Name cannot be blank.");
        changes[field]=value;
      }
      const path="/rest/v1/krunch_manager_items?id=eq."+encodeURIComponent(id)+
        "&updated_at=eq."+encodeURIComponent(version);
      const updated=krunchRequest_(path,"patch",changes);
      if(updated.length!==1)throw Error("Update conflict. Another user changed this row. Refresh from KRUNCH and review.");
      krunchPullUnsafe_();
    });
  }catch(error){krunchLogError_(range.getRow(),error.message,range.getValues());
    SpreadsheetApp.openById(KRUNCH.spreadsheetId).toast("KRUNCH edit NOT saved: "+error.message,"Sync error",10);}
}
function krunchSubmitNewEntries(){
  return krunchLock_(()=>{
    if(krunchPaused_())throw Error("Finish the paused batch before submitting new entries.");
    const sheet=SpreadsheetApp.openById(KRUNCH.spreadsheetId).getSheetByName(KRUNCH.newTab);
    if(!sheet)throw Error("New Entries tab missing.");
    const values=sheet.getRange(2,1,Math.max(sheet.getLastRow()-1,1),9).getValues();
    let count=0;
    values.forEach((r,i)=>{
      const [kind,name,area,category,owner,status,estimate,notes,result]=r;
      if(!name||String(result).startsWith("Imported:"))return;
      try{
        if(!["Task","Item"].includes(kind))throw Error("Select Type: Task or Item.");
        if(!String(area).trim())throw Error("Area required.");
        if(kind==="Task"&&!TASK_STATUSES.includes(status))throw Error("Invalid task status.");
        if(kind==="Item"&&!PURCHASE_STATUSES.includes(status))throw Error("Invalid item status.");
        const amount=Number(estimate||0);if(!Number.isFinite(amount)||amount<0)throw Error("Invalid estimate.");
        const payload={item_kind:kind,item_name:String(name).trim(),area:String(area).trim(),
          subcategory:String(category||""),assigned_to:String(owner||""),estimate:amount,
          notes:String(notes||""),task_status:kind==="Task"?status:"Not started",
          purchase_status:kind==="Item"?status:"Not purchased"};
        const created=krunchRequest_("/rest/v1/krunch_manager_items","post",payload);
        if(created.length!==1||!created[0].id)throw Error("Creation unconfirmed; check KRUNCH before retry.");
        sheet.getRange(i+2,9).setValue("Imported: "+created[0].id);count++;
      }catch(err){sheet.getRange(i+2,9).setValue("Error: "+err.message.slice(0,90));}
    });
    krunchPullUnsafe_();SpreadsheetApp.openById(KRUNCH.spreadsheetId).toast("Imported "+count+" new records.");return "Imported "+count+" new records.";
  });
}
function krunchLogError_(row,message,values){
  const ss=SpreadsheetApp.openById(KRUNCH.spreadsheetId);
  let sheet=ss.getSheetByName("Sync Errors");
  if(!sheet){sheet=ss.insertSheet("Sync Errors");sheet.appendRow(["Time","Source row","Reason","Attempted values"]);}
  sheet.appendRow([new Date(),row,message,JSON.stringify(values)]);
}

/** Batch mode: shared pause flag and durable baseline, no automatic pull while paused. */
function krunchPaused_(){return PropertiesService.getScriptProperties().getProperty("KRUNCH_PAUSED")==="1";}
function krunchBatchSheet_(){return SpreadsheetApp.openById(KRUNCH.spreadsheetId).getSheetByName("_KRUNCH Batch Baseline");}
function krunchRecordRows_(){
  const sh=SpreadsheetApp.openById(KRUNCH.spreadsheetId).getSheetByName(KRUNCH.recordsTab);
  return sh.getRange(2,1,Math.max(1,sh.getLastRow()-1),14).getValues().filter(r=>r[0]);
}
function krunchPause(){
  krunchLock_(()=>{
    if(krunchPaused_())throw Error("Already paused.");
    krunchToken_();
    const ss=SpreadsheetApp.openById(KRUNCH.spreadsheetId);
    if(krunchBatchSheet_())throw Error("An existing batch baseline needs review; do not overwrite it.");
    krunchPullUnsafe_();
    const rows=krunchRecordRows_();
    const sh=ss.insertSheet("_KRUNCH Batch Baseline");
    sh.getRange(1,1,1,14).setValues([["ID","Reference","Type","Name","Area","Category","Owner","Task status","Purchase status","Estimate","Actual","Supplier","Notes","Updated"]]);
    if(rows.length)sh.getRange(2,1,rows.length,14).setValues(rows.map(r=>r.map(v=>typeof v==="string"&&v.startsWith("=")?"'"+v:v)));
    sh.protect().setDescription("KRUNCH batch baseline");
    sh.hideSheet();
    PropertiesService.getScriptProperties().setProperty("KRUNCH_PAUSED","1");
    krunchAllowEdits_();
    ss.toast("Paused. Edit Project Records D:M; do not add, delete or reorder records.");
  });
}
function krunchBatchChanges_(){
  const sh=krunchBatchSheet_();
  if(!krunchPaused_()||!sh)throw Error("No paused batch.");
  const base=sh.getRange(2,1,Math.max(1,sh.getLastRow()-1),14).getValues().filter(r=>r[0]);
  const rows=krunchRecordRows_(), map=new Map(base.map(r=>[String(r[0]),r]));
  if(rows.length!==base.length||new Set(rows.map(r=>String(r[0]))).size!==base.length)throw Error("Record IDs or row count changed. Restore the original records before submitting.");
  const changes=[];
  for(const r of rows){
    const b=map.get(String(r[0]));
    if(!b||[1,2,13].some(i=>String(r[i])!==String(b[i])))throw Error("Locked fields changed. Restore them before submitting.");
    const patch={};
    for(let c=4;c<=13;c++){
      let v=r[c-1];if(String(v)===String(b[c-1]))continue;
      if(c===8&&(r[2]!=="Task"||!TASK_STATUSES.includes(v)))throw Error("Invalid task status: "+r[3]);
      if(c===9&&(r[2]!=="Item"||!PURCHASE_STATUSES.includes(v)))throw Error("Invalid purchase status: "+r[3]);
      if(c===10||c===11){v=Number(v);if(!Number.isFinite(v)||v<0)throw Error("Invalid amount: "+r[3]);}
      if(c===4&&!String(v).trim())throw Error("Blank item name.");
      patch[ITEM_FIELDS[c]]=v;
    }
    if(Object.keys(patch).length)changes.push({id:String(r[0]),name:String(r[3]),version:String(b[13]),patch});
  }
  return changes;
}
function krunchSubmitBatch(){
  const ui=SpreadsheetApp.getUi();
  const changes=krunchLock_(()=>krunchBatchChanges_());
  if(!changes.length){ui.alert("No pending changes.");return;}
  const signature=JSON.stringify(changes);
  const preview=changes.slice(0,20).map(x=>x.name+": "+Object.keys(x.patch).join(", ")).join("\n");
  if(ui.alert("Submit "+changes.length+" changed records?",preview+(changes.length>20?"\n…and more":""),ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
  krunchLock_(()=>{
    const pending=krunchBatchChanges_();
    if(JSON.stringify(pending)!==signature)throw Error("The batch changed during review. Review again.");
    const remote=krunchRequest_("/rest/v1/krunch_manager_items?select=id,updated_at&limit=1000","get");
    const versions=new Map(remote.map(x=>[x.id,String(x.updated_at)]));
    const conflicts=pending.filter(x=>versions.get(x.id)!==x.version);
    if(conflicts.length)throw Error("No changes submitted. Database conflicts: "+conflicts.map(x=>x.name).join(", "));
    const ss=SpreadsheetApp.openById(KRUNCH.spreadsheetId),baseline=krunchBatchSheet_(),records=ss.getSheetByName(KRUNCH.recordsTab);
    let done=0;
    for(const x of pending){
      const path="/rest/v1/krunch_manager_items?id=eq."+encodeURIComponent(x.id)+"&updated_at=eq."+encodeURIComponent(x.version);
      try{
        const updated=krunchRequest_(path,"patch",Object.assign({},x.patch,{updated_at:new Date().toISOString()}));
        if(updated.length!==1)throw Error("Concurrent update conflict.");
        const br=baseline.getRange(2,1,baseline.getLastRow()-1,1).getValues().findIndex(r=>String(r[0])===x.id)+2;
        const rr=records.getRange(2,1,records.getLastRow()-1,1).getValues().findIndex(r=>String(r[0])===x.id)+2;
        const old=baseline.getRange(br,1,1,14).getValues()[0];
        for(const [c,f] of Object.entries(ITEM_FIELDS))if(Object.prototype.hasOwnProperty.call(x.patch,f))old[Number(c)-1]=x.patch[f];
        old[13]=updated[0].updated_at;
        baseline.getRange(br,1,1,14).setValues([old.map(v=>typeof v==="string"&&v.startsWith("=")?"'"+v:v)]);
        records.getRange(rr,14).setValue(old[13]);done++;
      }catch(e){throw Error(done+" records submitted; remaining changes stay paused. "+x.name+": "+e.message);}
    }
    ss.toast(done+" records submitted. Still paused; resume when ready.");
  });
}
function krunchResume(){
  krunchLock_(()=>{
    if(!krunchPaused_())throw Error("Not paused.");
    if(krunchBatchChanges_().length)throw Error("Pending edits exist. Review & submit changes before resuming.");
    const ss=SpreadsheetApp.openById(KRUNCH.spreadsheetId),sh=krunchBatchSheet_();
    PropertiesService.getScriptProperties().deleteProperty("KRUNCH_PAUSED");
    try{krunchPullUnsafe_();}catch(e){PropertiesService.getScriptProperties().setProperty("KRUNCH_PAUSED","1");throw e;}
    ss.deleteSheet(sh);
    ss.toast("Automatic synchronisation resumed.");
  });
}
