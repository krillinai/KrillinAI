import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createSubtitleRenderService } from '../apps/daemon/src/creator/krillin/subtitle-render.ts';
import { buildKrillinSubtitleStyle } from '../apps/daemon/src/creator/krillin/adapter.ts';
const sharp = createRequire(process.cwd()+'/apps/daemon/package.json')('sharp');
// Run from the repository root with the Web dev server running. No model API is used.
const root=process.cwd(), out=root+'/.runtime/subtitle-parity/matrix'; mkdirSync(out,{recursive:true});
const runtime=root+'/apps/desktop/.pack/creator-runtime/krillinai';
const manifest=JSON.parse(readFileSync(runtime+'/manifest.json','utf8'));
const env={...process.env,PATH:runtime+'/bin:'+process.env.PATH,KRILLINAI_RESOURCE_ROOT:runtime,KRILLINAI_OFFLINE_DEPENDENCIES:'1',OPENCREATOR_KRILLINAI_CLI:'1',OPENCREATOR_YT_DLP_COMMAND:JSON.stringify([runtime+'/'+manifest.ytDlp.executable,runtime+'/'+manifest.ytDlp.script])};
const service=createSubtitleRenderService({resourceRoot:runtime,workRoot:out,ensureRuntimeReady:async()=>{}});
const cases=[
 {id:'sans-bilingual',w:640,h:360,text:'保留标点！\n手动换行。',source:'Hello, subtitle preview!'},
 {id:'serif-shadow',w:1280,h:720,text:'不同字体、阴影和描边',source:'Font and shadow parity.',preset:'serif',shadow:true},
 {id:'soft-shadow',w:1920,h:1080,text:'你知道吗？你的人生今晚就可能彻底改变。',source:'Do you know your entire life can change tonight?',shadow:true,soft:true},
 {id:'rounded-long',w:1024,h:768,text:'完整保留：'+ '长字幕和标点，'.repeat(10),source:'Full source context with punctuation, '.repeat(8),preset:'rounded'},
 {id:'arabic',w:960,h:540,text:'مرحبا بالعالم، هذه ترجمة لاختبار الخطوط العربية.',source:'Arabic shaping and right to left text.'},
 {id:'hindi',w:960,h:540,text:'यह उपशीर्षक पूर्वावलोकन और वीडियो में एक जैसा होना चाहिए।',source:'Hindi shaping and conjuncts.'},
 {id:'thai-portrait',w:540,h:960,text:'สวัสดี นี่คือการทดสอบคำบรรยายภาษาไทยและการแสดงผล',source:'Thai portrait subtitle rendering.'},
 {id:'japanese-korean',w:720,h:1280,text:'日本語の字幕と句読点を確認します。',source:'한국어 자막도 같은 글꼴로 표시됩니다.'},
 {id:'converted-titles',w:720,h:1280,text:'横转竖字幕。',source:'Landscape to portrait.',converted:true,title:'横转竖标题',minor:'Subtitle composition'},
 {id:'literal-overlap',w:640,h:360,text:'Literal {\\pos(0,0)} and \\N, {braces}',source:'ASS tags must stay literal.',overlap:true}
];
const browser=await chromium.launch({headless:true}); const results=[];
const requestedCases=new Set(process.argv.slice(2));
try {
for(const c of cases){
 if(requestedCases.size && !requestedCases.has(c.id))continue;
 const dir=out+'/'+c.id;mkdirSync(dir+'/launcher/config',{recursive:true});writeFileSync(dir+'/launcher/config/config.toml','[app]\nproxy = ""\n');
 const subtitleStyle=c.soft
  ? {fontPreset:'sans',fontWeight:'medium',fontSize:'medium',primaryColor:'#FFFFFF',secondaryColor:'#D1D5DB',outlineColor:'#000000',outlineWidth:0,shadow:{enabled:true,color:'#000000',opacity:.85,offsetX:0,offsetY:2,blur:4}}
  : {fontPreset:c.preset??'sans',fontWeight:'bold',fontSize:'medium',primaryColor:'#7EE7FF',secondaryColor:'#FFD45C',outlineColor:'#102030',outlineWidth:2,shadow:{enabled:!!c.shadow,color:'#000000',opacity:.6,offsetX:-4,offsetY:6,blur:2}};
 const input={width:c.w,height:c.h,horizontal:!c.converted && c.w>=c.h,bilingual:true,subtitlePosition:'top',subtitleStyle,majorTitle:c.title??'',minorTitle:c.minor??'',cues:[{startMs:200,endMs:1800,text:c.text,sourceText:c.source},...(c.overlap?[{startMs:300,endMs:1600,text:'Overlapping event',sourceText:'独立重叠字幕'}]:[])]};
 const started=performance.now();const bundle=await service.compile(input); const compileMs=performance.now()-started;
 const fonts={}; for(const f of bundle.fonts)fonts[f.id]=(await service.font(f.id))!.toString('base64');
 writeFileSync(dir+'/document.json',JSON.stringify(input));writeFileSync(dir+'/style.json',JSON.stringify(buildKrillinSubtitleStyle(subtitleStyle)));
 writeFileSync(dir+'/input.srt','1\n00:00:00,200 --> 00:00:01,800\nUnused structured source\n\n');
 const ff=(args)=>execFileSync(runtime+'/bin/ffmpeg',['-v','error','-y',...args],{maxBuffer:24*1024*1024});
 const sw=c.converted?640:c.w,sh=c.converted?360:c.h;
 const backgroundColor=c.soft?'0xB0B0B0':'0x202020'; // Expose shadow differences on a light background.
 ff(['-f','lavfi','-i',`color=c=${backgroundColor}:s=${sw}x${sh}:d=2:r=25`,'-c:v','libx264','-pix_fmt','yuv420p',dir+'/source.mp4']);
 const renderStart=performance.now();
 execFileSync(runtime+'/bin/krillinai-cli',[input.horizontal?'render-horizontal':'render-vertical','--workdir',dir,'--task-id','parity','--video',dir+'/source.mp4','--subtitle',dir+'/input.srt','--subtitle-document',dir+'/document.json','--subtitle-style-file',dir+'/style.json'],{cwd:dir+'/launcher',env,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});
 const renderMs=performance.now()-renderStart;
 const assPath=dir+'/formatted_'+(input.horizontal?'horizontal':'vertical')+'_bilingual.ass';
 const nativeASS=readFileSync(assPath,'utf8');if(nativeASS!==bundle.ass)throw Error('ASS mismatch '+c.id);
 const composition=c.converted?'scale=720:406,pad=720:1280:0:250:black,':'';
 ff(['-f','lavfi','-i',`color=c=${backgroundColor}:s=${sw}x${sh}:d=1,format=rgb24`,'-vf',composition+`ass=filename='${assPath}':fontsdir='${runtime}/fonts'`,'-ss','0.5','-frames:v','1',dir+'/native.png']);
 ff(['-ss','0.5','-i',dir+'/'+(input.horizontal?'horizontal':'vertical')+'_bilingual.mp4','-frames:v','1',dir+'/encoded.png']);
 ff(['-f','lavfi','-i',`color=c=${backgroundColor}:s=${sw}x${sh}:d=1,format=rgb24`,...(c.converted?['-vf','scale=720:406,pad=720:1280:0:250:black']:[]),'-frames:v','1',dir+'/background.png']);
 const page=await browser.newPage({viewport:{width:c.w,height:c.h},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.OPENCREATOR_SUBTITLE_TEST_ORIGIN ?? 'http://127.0.0.1:19861')+'/e2e/fixtures/subtitle-renderer.html');await page.waitForFunction(()=>typeof window.mountComposition==='function');
 const loadStart=performance.now();await page.evaluate(data=>window.mountComposition(data),{input,bundle,fonts,converted:!!c.converted,background:c.soft?readFileSync(dir+'/background.png').toString('base64'):undefined});
 await page.locator('.subtitle-composition-preview[data-status=ready]').waitFor();
 await page.waitForTimeout(300); const loadMs=performance.now()-loadStart;
 await page.locator('#composition').screenshot({path:dir+'/wasm.png'});
 await page.evaluate(()=>window.updateCompositionTime(.8));await page.waitForTimeout(50);
 const compileCount=await page.evaluate(()=>window.compileCount);
 if(errors.length)throw Error(errors.join('\n'));
 const [a,b,d,bg]=await Promise.all(['native','wasm','encoded','background'].map(id=>sharp(dir+'/'+id+'.png').removeAlpha().raw().toBuffer()));
 function compare(x,y){let error=0,pixels=0;const bbox=buf=>{let x0=c.w,y0=c.h,x1=-1,y1=-1;for(let i=0;i<c.w*c.h;i++){let delta=0;for(let k=0;k<3;k++)delta+=Math.abs(buf[i*3+k]-bg[i*3+k]);if(delta>40){const px=i%c.w,py=Math.floor(i/c.w);x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py)}}return[x0,y0,x1,y1]};for(let i=0;i<x.length;i+=3){let dist=0;for(let k=0;k<3;k++)dist+=Math.abs(x[i+k]-bg[i+k])+Math.abs(y[i+k]-bg[i+k]);if(dist>40){pixels++;for(let k=0;k<3;k++)error+=Math.abs(x[i+k]-y[i+k])}}return{left:bbox(x),right:bbox(y),meanChannelError:error/(pixels*3),pixels};}
 if (compileCount !== 1) throw Error('Playback recompiled the document: '+c.id);
 const parity=compare(a,b);
 const tolerance=c.shadow?5:1;
 if (parity.meanChannelError>4 || parity.left.some((value,index)=>Math.abs(value-parity.right[index])>tolerance)) throw Error('Native/WASM parity regression: '+c.id);
 const row={id:c.id,size:[c.w,c.h],assIdentical:true,fontCount:bundle.fonts.length,compileMs,loadMs,renderMs,compileCount,native:compare(a,b),encoded:compare(d,b)};results.push(row);console.log(JSON.stringify(row));await page.close();
}
writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
}finally{await browser.close()}
