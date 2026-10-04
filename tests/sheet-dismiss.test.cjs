"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
async function run() {
  const source=fs.readFileSync(path.join(__dirname,"../js/sheet-dismiss.js"),"utf8");
  const {bindSheetDismiss,shouldDismissSwipe}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
  let count=0;
  const test=(name,fn)=>{fn();count++;console.log("PASS "+name);};
  function fixture() {
    const handlers={}, style={removeProperty(name){delete this[name];}};
    let captured=null, closed=0;
    const sheet={style, addEventListener(type,fn){handlers[type]=fn;},
      setPointerCapture(id){captured=id;}, hasPointerCapture(id){return captured===id;}, releasePointerCapture(){captured=null;}};
    bindSheetDismiss(sheet,()=>closed++);
    const event=(x,y,time=0,area="header")=>({pointerId:1,button:0,isPrimary:true,clientX:x,clientY:y,timeStamp:time,cancelable:true,
      target:{closest(selector){return selector===".sheet-drag-region" ? (area!=="body" ? {} : null) : (area==="control" ? {} : null);}},
      preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
    return {handlers,sheet,event,closed:()=>closed};
  }
  test("A deliberate downward header swipe closes the sheet",()=>{
    const f=fixture();f.handlers.pointerdown(f.event(10,10));f.handlers.pointermove(f.event(12,100,200));
    assert.equal(f.sheet.style.transform,"translateY(90px)");f.handlers.pointerup(f.event(12,100,400));
    assert.equal(f.closed(),1);assert.equal(f.sheet.style.transform,undefined);
    const click=f.event(12,100);f.handlers.click(click);assert.equal(click.stopped,true);
  });
  test("Short, upward, and horizontal gestures leave the sheet open",()=>{
    for(const [x,y] of [[0,20],[0,-100],[120,100]]){
      const f=fixture();f.handlers.pointerdown(f.event(0,0));f.handlers.pointermove(f.event(x,y,300));f.handlers.pointerup(f.event(x,y,500));assert.equal(f.closed(),0);
    }
  });
  test("A fast downward flick dismisses without needing the full travel distance",()=>{
    assert.equal(shouldDismissSwipe({distanceX:2,distanceY:45,elapsedMs:50}),true);
    assert.equal(shouldDismissSwipe({distanceX:2,distanceY:45,elapsedMs:300}),false);
  });
  test("Body scrolling and interactive controls cannot initiate dismissal",()=>{
    for(const area of ["body","control"]){
      const f=fixture();f.handlers.pointerdown(f.event(0,0,0,area));f.handlers.pointermove(f.event(0,100,200,area));f.handlers.pointerup(f.event(0,100,300,area));assert.equal(f.closed(),0);assert.equal(f.sheet.style.transform,undefined);
    }
  });
  test("Cancelled gestures reset the sheet and ignore a later pointer release",()=>{
    const f=fixture();f.handlers.pointerdown(f.event(0,0));f.handlers.pointermove(f.event(0,100,100));f.handlers.pointercancel();f.handlers.pointerup(f.event(0,100,200));
    assert.equal(f.closed(),0);assert.equal(f.sheet.style.transform,undefined);
  });
  console.log(`${count} sheet dismissal tests passed`);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
