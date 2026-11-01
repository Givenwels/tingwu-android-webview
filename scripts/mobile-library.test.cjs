const assert=require('node:assert/strict');
const {readFileSync,existsSync}=require('node:fs');
const {join}=require('node:path');
const {test,before,after}=require('node:test');
const {chromium}=require('playwright-core');
const assetPath=join(__dirname,'../app/src/main/assets/mobile-library.js');
const asset=()=>existsSync(assetPath)?readFileSync(assetPath,'utf8'):'void 0;';
const html=readFileSync(join(__dirname,'fixtures/mobile-library.html'),'utf8');
let browser;
before(async()=>{browser=await chromium.launch({channel:'chrome',headless:true});});
after(async()=>{await browser?.close();});
async function setup(beforeInstall){
  const context=await browser.newContext({viewport:{width:390,height:840}});
  await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));
  const page=await context.newPage();page.setDefaultTimeout(2000);
  await page.goto('https://tingwu.aliyun.com/mobile/#/pages/Start/Start');
  if(beforeInstall)await beforeInstall(page);
  await page.addScriptTag({content:asset()});
  return {context,page};
}

test('document-start injection waits for the page root before installing the folder UI',async()=>{
  const context=await browser.newContext({viewport:{width:390,height:840}});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));
    await context.addInitScript({content:asset()});
    await page.goto('https://tingwu.aliyun.com/#/pages/Start/Start');
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).waitFor({timeout:2000});
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('opens on My records and reads the existing directory tree through the official client',async()=>{
  const {context,page}=await setup();try{
    await page.waitForFunction(()=>document.querySelector('#mine-tab.current'));
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).waitFor();
    assert.equal(await page.locator('.original-card').first().isVisible(),true);
    const requests=await page.evaluate(()=>window.requests);
    assert.equal(requests[0].data.action,'getDirList');
    assert.equal(requests[0].data.returnDetails,true);
    assert.ok(requests.every(request=>['getDirList','getTransList'].includes(request.data.action)));
  }finally{await context.close();}
});

test('shows child folders and their records, then opens the phone record detail',async()=>{
  const {context,page}=await setup();try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByRole('button',{name:'打开文件夹 周会',exact:true}).waitFor();
    await page.getByText('方案讨论',{exact:true}).waitFor();
    assert.equal(await page.locator('.original-card').first().isVisible(),false);
    await page.getByRole('button',{name:'打开文件夹 周会',exact:true}).click();
    await page.getByText('周会记录',{exact:true}).click();
    assert.match(await page.evaluate(()=>window.routes[0]),/^\/pages\/Meeting\/Result\?transId=record-13$/);
    const reads=await page.evaluate(()=>window.requests.filter(request=>request.data.action==='getTransList'));
    assert.deepEqual(reads.map(request=>request.data.filter.dirId),[12,13]);
  }finally{await context.close();}
});

test('All records restores the official cards and other tabs remain usable',async()=>{
  const {context,page}=await setup();try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('方案讨论',{exact:true}).waitFor();
    await page.getByRole('button',{name:'全部记录',exact:true}).click();
    assert.equal(await page.locator('.original-card').first().isVisible(),true);
    await page.getByText('收藏',{exact:true}).click();
    await page.locator('[data-tingwu-library-panel]').waitFor({state:'hidden'});
    assert.equal(await page.locator('[data-tingwu-library-panel]').isVisible(),false);
    await page.locator('#discover-tab').click();
    await page.waitForFunction(()=>document.querySelector('#discover-tab.current'));
    assert.equal(await page.locator('#discover-pane').isVisible(),true);
  }finally{await context.close();}
});

test('refreshing a selected folder preserves its records after the directory tree reloads',async()=>{
  const {context,page}=await setup();try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('方案讨论',{exact:true}).waitFor();
    await page.getByRole('button',{name:'刷新文件夹',exact:true}).click();
    await page.waitForFunction(()=>window.requests.filter(request=>request.data.action==='getTransList').length===2);
    await page.getByText('方案讨论',{exact:true}).waitFor();
  }finally{await context.close();}
});

test('logging out clears the previous account directory data before another login',async()=>{
  const {context,page}=await setup();try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).waitFor();
    await page.evaluate(()=>{
      document.querySelector('.tabsTools').remove();
      const login=document.createElement('div');login.className='loginBlock';login.textContent='登录';document.body.append(login);
    });
    await page.waitForFunction(()=>!document.querySelector('[data-tingwu-library-panel]'));
    assert.equal(await page.getByText('项目资料',{exact:true}).count(),0);
  }finally{await context.close();}
});

test('directory failures keep the original records visible and can be retried',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(()=>{window.folderFailure=true;});});try{
    await page.getByText('文件夹加载失败，请重试',{exact:true}).waitFor();
    assert.equal(await page.locator('.original-card').first().isVisible(),true);
    await page.evaluate(()=>{window.folderFailure=false;});
    await page.getByRole('button',{name:'刷新文件夹',exact:true}).click();
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).waitFor();
  }finally{await context.close();}
});

test('a late response cannot replace the currently selected folder',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(()=>{
    window.recordGates={12:new Promise(resolve=>{window.releaseProject=resolve;})};
  });});try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByRole('button',{name:'全部记录',exact:true}).click();
    await page.getByRole('button',{name:'打开文件夹 学习资料',exact:true}).click();
    await page.getByText('课程笔记',{exact:true}).waitFor();
    await page.evaluate(()=>window.releaseProject());
    await page.waitForTimeout(50);
    assert.equal(await page.getByText('方案讨论',{exact:true}).count(),0);
    assert.equal(await page.getByText('课程笔记',{exact:true}).isVisible(),true);
  }finally{await context.close();}
});

test('folder pagination and search use the selected directory and reset the page',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(()=>{
    window.recordRows=Array.from({length:23},(_,index)=>({transId:'record-'+index,tag:{showName:'会议资料 '+index},status:0}));
  });});try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByRole('button',{name:'加载更多',exact:true}).evaluate(button=>button.click());
    await page.getByText('会议资料 22',{exact:true}).waitFor();
    assert.equal(await page.locator('.tw-library-record').count(),23);
    await page.getByRole('searchbox',{name:'搜索此文件夹'}).fill('资料 22');
    await page.getByRole('button',{name:'搜索',exact:true}).click();
    await page.getByText('会议资料 22',{exact:true}).waitFor();
    assert.equal(await page.locator('.tw-library-record').count(),1);
    const reads=await page.evaluate(()=>window.requests.filter(request=>request.data.action==='getTransList'));
    assert.deepEqual(reads.map(request=>request.data.pageNo),[1,2,1]);
    assert.ok(reads.every(request=>request.data.filter.dirId===12));
    assert.equal(reads[2].data.filter.showName,'资料 22');
  }finally{await context.close();}
});

const rows=length=>Array.from({length},(_,index)=>({transId:'record-'+index,tag:{showName:'分页记录 '+index},status:0}));
const recordReads=page=>page.evaluate(()=>window.requests.filter(request=>request.data.action==='getTransList'));
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));

for(const [name,counts] of [
  ['total',{total:7}],['totalNum',{totalNum:'7'}],['null total with totalNum',{total:null,totalNum:7}],
  ['null total',{total:null}],['null totalNum',{totalNum:null}],['omitted count',{}],['blank count',{total:''}],
])test(`pagination continues after a server-capped page with ${name}`,async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(({data,counts})=>{
    window.recordRows=data;window.recordPageSize=2;window.recordCounts=counts;
  },{data:rows(7),counts});});try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('分页记录 1',{exact:true}).waitFor();
    assert.equal((await recordReads(page)).length,1,'opening a folder must only fetch its first page');
    for(const end of [3,5,6]){
      assert.equal(await page.getByRole('button',{name:'加载更多',exact:true}).count(),1,'short nonempty pages must keep Load more');
      await page.getByRole('button',{name:'加载更多',exact:true}).evaluate(button=>button.click());
      await page.getByText('分页记录 '+end,{exact:true}).waitFor();
    }
    if(!['total','totalNum','null total with totalNum'].includes(name)){
      await page.getByRole('button',{name:'加载更多',exact:true}).evaluate(button=>button.click());
      await page.getByText('正在加载记录…',{exact:true}).waitFor({state:'hidden'});
    }
    assert.equal(await page.locator('.tw-library-record').count(),7);
    assert.equal(await page.getByRole('button',{name:'加载更多',exact:true}).count(),0);
    const reads=await recordReads(page);
    assert.deepEqual(reads.map(request=>request.data.pageNo),name==='total'||name==='totalNum'||name==='null total with totalNum'?[1,2,3,4]:[1,2,3,4,5]);
    assert.ok(reads.every(request=>request.data.pageSize===20&&request.data.filter.dirId===12));
  }finally{await context.close();}
});

test('Load more is reachable through the clipped H5 layout and downward scroll loads one page',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(data=>{window.recordRows=data;},rows(65));});try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('分页记录 19',{exact:true}).waitFor();
    assert.equal((await recordReads(page)).length,1);
    // Hold page two so the continuation control can be checked at the actual scroll destination.
    await page.evaluate(()=>{window.recordGates={'12:2':new Promise(resolve=>{window.releaseNext=resolve;})};});
    await page.mouse.move(190,120);
    await page.mouse.wheel(0,400);
    await settle(page);
    await page.mouse.move(190,700);
    await page.mouse.wheel(0,2400);
    await settle(page);
    const reachable=await page.getByRole('button',{name:'加载更多',exact:true}).evaluate(button=>{
      const rect=button.getBoundingClientRect();
      return rect.top>=0&&rect.bottom<=innerHeight&&button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));
    });
    assert.equal(reachable,true,'Load more is clipped by the native mobile scroll view');
    await page.waitForFunction(()=>window.requests.filter(request=>request.data.action==='getTransList').length===2);
    await page.evaluate(()=>window.releaseNext());
    await page.getByText('分页记录 39',{exact:true}).waitFor();
    await settle(page);
    assert.equal((await recordReads(page)).length,2,'rendering the next page must not start another fetch');
    await page.mouse.wheel(0,2400);
    await page.getByText('分页记录 59',{exact:true}).waitFor();
    assert.deepEqual((await recordReads(page)).map(request=>request.data.pageNo),[1,2,3]);
  }finally{await context.close();}
});

test('folders remain usable when the official native records list is hidden',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(()=>{document.querySelector('.staticListMain').style.display='none';});});try{
    await page.waitForFunction(()=>window.requests.length===1);
    assert.equal(await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).isVisible(),true);
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('方案讨论',{exact:true}).waitFor();
  }finally{await context.close();}
});

for(const [name,second] of [['empty',[]],['duplicate',rows(2)]])test(`${name} pages stop pagination even when the total claims more records`,async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(({first,second})=>{
    window.recordPages={1:first,2:second};window.recordCounts={total:100};
  },{first:rows(2),second});});try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('分页记录 1',{exact:true}).waitFor();
    await page.getByRole('button',{name:'加载更多',exact:true}).evaluate(button=>button.click());
    await page.getByText('正在加载记录…',{exact:true}).waitFor({state:'hidden'});
    assert.equal(await page.locator('.tw-library-record').count(),2);
    assert.equal(await page.getByRole('button',{name:'加载更多',exact:true}).count(),0,'non-progressing pages must stop further requests');
    assert.deepEqual((await recordReads(page)).map(request=>request.data.pageNo),[1,2]);
  }finally{await context.close();}
});

test('overlapping pages append each record once, including nested cardInfo and demoId records',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(data=>{
    window.recordPages={1:data.slice(0,2),2:[data[1],{cardInfo:data[2]},{demoId:'record-3',tag:{showName:'分页记录 3'}}]};
    window.recordCounts={total:4};
  },rows(4));});try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('分页记录 1',{exact:true}).waitFor();
    await page.getByRole('button',{name:'加载更多',exact:true}).evaluate(button=>button.click());
    await page.getByText('分页记录 3',{exact:true}).waitFor();
    assert.equal(await page.locator('.tw-library-record').count(),4);
    assert.equal(await page.getByText('分页记录 1',{exact:true}).count(),1);
    assert.equal(await page.getByRole('button',{name:'加载更多',exact:true}).count(),0);
  }finally{await context.close();}
});

test('a late next page cannot append to a newly selected folder',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(data=>{
    window.recordRows=data;window.recordPageSize=2;
    window.recordGates={'12:2':new Promise(resolve=>{window.releaseNext=resolve;})};
  },rows(5));});try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('分页记录 1',{exact:true}).waitFor();
    await page.getByRole('button',{name:'加载更多',exact:true}).evaluate(button=>button.click());
    await page.getByRole('button',{name:'打开文件夹 周会',exact:true}).click();
    await page.getByText('分页记录 1',{exact:true}).waitFor();
    await page.evaluate(()=>window.releaseNext());
    await settle(page);
    assert.equal(await page.locator('.tw-library-record').count(),2);
    assert.equal(await page.getByText('分页记录 3',{exact:true}).count(),0);
    assert.deepEqual((await recordReads(page)).map(request=>[request.data.filter.dirId,request.data.pageNo]),[[12,1],[12,2],[13,1]]);
  }finally{await context.close();}
});

test('a reachable Load more button fetches one short page on click without prefetching',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(data=>{
    window.recordRows=data;window.recordPageSize=1;window.recordCounts={};
  },rows(3));});try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('分页记录 0',{exact:true}).waitFor();
    await page.waitForTimeout(100);
    assert.equal((await recordReads(page)).length,1);
    await page.getByRole('button',{name:'加载更多',exact:true}).click();
    await page.getByText('分页记录 1',{exact:true}).waitFor();
    await settle(page);
    assert.deepEqual((await recordReads(page)).map(request=>request.data.pageNo),[1,2]);
  }finally{await context.close();}
});

test('scrolling near the panel bottom coalesces in-flight requests and stops on other tabs',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(data=>{
    window.recordRows=data;
    window.recordGates={'12:2':new Promise(resolve=>{window.releaseNext=resolve;})};
  },rows(65));});try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('分页记录 19',{exact:true}).waitFor();
    const panel=page.locator('[data-tingwu-library-panel]');
    await panel.evaluate(element=>{element.scrollTop=100;});
    await settle(page);
    assert.equal((await recordReads(page)).length,1,'scrolling far from the bottom must not fetch');
    await panel.evaluate(element=>{element.scrollTop=element.scrollHeight-element.clientHeight-100;});
    await page.waitForFunction(()=>window.requests.filter(request=>request.data.action==='getTransList').length===2);
    assert.equal(await page.getByRole('button',{name:'加载更多',exact:true}).isDisabled(),true);
    for(let index=0;index<3;index++){
      await panel.evaluate(element=>{element.scrollTop+=10;});
      await settle(page);
    }
    assert.equal((await recordReads(page)).length,2,'one page must have only one pending request');
    await page.evaluate(()=>window.releaseNext());
    await page.getByText('分页记录 39',{exact:true}).waitFor();
    await page.getByText('收藏',{exact:true}).click();
    await panel.waitFor({state:'hidden'});
    await panel.evaluate(element=>{element.scrollTop=element.scrollHeight;element.dispatchEvent(new Event('scroll'));});
    await settle(page);
    assert.equal((await recordReads(page)).length,2,'inactive folder panels must not fetch');
  }finally{await context.close();}
});

test('a late next page cannot append to a new search in the same folder',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(data=>{
    window.recordRows=data;window.recordPageSize=2;
    window.recordGates={'12:2':new Promise(resolve=>{window.releaseNext=resolve;})};
  },rows(5));});try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('分页记录 1',{exact:true}).waitFor();
    await page.getByRole('button',{name:'加载更多',exact:true}).evaluate(button=>button.click());
    await page.getByRole('searchbox',{name:'搜索此文件夹'}).fill('分页记录 4');
    await page.getByRole('button',{name:'搜索',exact:true}).click();
    await page.getByText('分页记录 4',{exact:true}).waitFor();
    await page.evaluate(()=>window.releaseNext());
    await settle(page);
    assert.equal(await page.locator('.tw-library-record').count(),1);
    assert.deepEqual((await recordReads(page)).map(request=>[request.data.pageNo,request.data.filter.showName]),[[1,''],[2,''],[1,'分页记录 4']]);
  }finally{await context.close();}
});

test('a failed next page waits for a retry and preserves already loaded records',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(data=>{
    window.recordRows=data;window.recordPageSize=2;window.recordFailures={'12:2':true};
  },rows(5));});try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).click();
    await page.getByText('分页记录 1',{exact:true}).waitFor();
    await page.getByRole('button',{name:'加载更多',exact:true}).evaluate(button=>button.click());
    await page.getByText('记录加载失败，请重试',{exact:true}).waitFor();
    assert.equal(await page.locator('.tw-library-record').count(),2);
    await page.waitForTimeout(100);
    assert.equal((await recordReads(page)).length,2,'failures must not cause automatic retries');
    await page.evaluate(()=>{window.recordFailures={};});
    await page.getByRole('button',{name:'重试记录',exact:true}).click();
    await page.getByText('分页记录 3',{exact:true}).waitFor();
    assert.equal(await page.locator('.tw-library-record').count(),4);
    assert.deepEqual((await recordReads(page)).map(request=>request.data.pageNo),[1,2,2]);
  }finally{await context.close();}
});

test('logged-out home never requests account directories',async()=>{
  const {context,page}=await setup(async page=>{await page.evaluate(()=>{
    document.querySelector('.tabsTools').remove();
    document.querySelector('#mine-pane').remove();
    const login=document.createElement('div');login.className='loginBlock';login.textContent='登录';document.body.append(login);
  });});try{
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(()=>window.requests),[]);
    assert.equal(await page.locator('[data-tingwu-library-panel]').count(),0);
  }finally{await context.close();}
});

test('directory and record names are text and the folder layout fits a narrow phone',async()=>{
  const {context,page}=await setup(async page=>{
    await page.setViewportSize({width:320,height:800});
    await page.evaluate(()=>{const original=window.tingwuRequest;window.tingwuRequest=async request=>{
      const response=await original(request);
      if(request.data.action==='getDirList')response.data.data.push({dirId:88,dirName:'<img src=x onerror="window.bad=1">'});
      return response;
    };});
  });try{
    await page.getByRole('button',{name:'打开文件夹 项目资料',exact:true}).waitFor();
    const panel=await page.locator('[data-tingwu-library-panel]').boundingBox();
    assert.ok(panel.x>=0&&panel.x+panel.width<=320);
    assert.equal(await page.locator('[data-tingwu-library-panel] img').count(),0);
    assert.equal(await page.evaluate(()=>window.bad),undefined);
  }finally{await context.close();}
});
