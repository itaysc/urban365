import { createHash } from 'node:crypto';

/**
 * The regions the app offers before anything is typed. The names are the filter
 * values, so they have to match `REGIONS` in the client.
 */
const REGIONS = [
  'מרכז והשרון',
  'תל אביב והסביבה',
  'ירושלים והסביבה',
  'שפלה',
  'חיפה והקריות',
  'חדרה והעמקים',
  'צפון והגליל',
  'דרום',
  'יהודה ושומרון',
];

/**
 * The place box on the front door.
 *
 * The HTML is a real form, so the page works with the script blocked. With it, the
 * box behaves as the app's does: recent places and the regions before a letter is
 * typed, then cities, neighbourhoods and districts from `/listings/suggest`.
 *
 * Nothing from that answer is written as HTML. A place name is text, and a place
 * name that could become markup would be a script we hashed a policy to prevent.
 */
export function placeSearchScript(apiUrl: string): string {
  const parsed = new URL(apiUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('API URL cannot be embedded in the home page script');
  }
  // Origin only. `API_URL` is the server, and the client calls it at `/api/v1`.
  const base = `${parsed.origin}/api/v1`;

  return `(function(){
var form=document.getElementById("u365-find");
var input=document.getElementById("u365-q");
var list=document.getElementById("u365-list");
if(!form||!input||!list)return;
var API=${JSON.stringify(base)};
var REGIONS=${JSON.stringify(REGIONS)};
var KEY="nadlan:recent-places";
var MAX=5;
var chosen=[];
var hi=0;
var open=false;
var term="";
var data=null;
var timer=0;
var seq=0;
var nav=[];
var locating=false;
var locError="";

function section(){
  var on=form.querySelector('input[name="section"]:checked');
  return on?on.value:"forsale";
}
function same(a,b){return a.kind===b.kind&&a.value===b.value&&a.city===b.city;}
function readRecent(){
  try{
    var raw=localStorage.getItem(KEY);
    var parsed=raw?JSON.parse(raw):[];
    if(!Array.isArray(parsed))return [];
    return parsed.filter(function(p){
      return p&&(p.kind==="city"||p.kind==="neighborhood"||p.kind==="district")&&typeof p.value==="string"&&typeof p.city==="string"&&typeof p.label==="string";
    }).slice(0,6);
  }catch(e){return [];}
}
function remember(place){
  try{
    var next=[place].concat(readRecent().filter(function(p){return !same(p,place);})).slice(0,6);
    localStorage.setItem(KEY,JSON.stringify(next));
  }catch(e){}
}
function clearRecent(){try{localStorage.removeItem(KEY);}catch(e){}draw();}
function taken(place){return chosen.some(function(c){return same(c,place);});}
function add(place){
  if(chosen.length>=MAX||taken(place))return;
  if(place.kind==="neighborhood"&&!chosen.some(function(c){return c.kind==="city"&&c.value===place.city;})){
    chosen.push({kind:"city",value:place.city,city:place.city,label:place.city});
  }
  chosen.push(place);
  remember(place);
  input.value="";
  term="";
  data=null;
  open=true;
  hi=0;
  draw();
}
function removeAt(place){chosen=chosen.filter(function(c){return !same(c,place);});draw();}
function el(tag,cls){var n=document.createElement(tag);if(cls)n.className=cls;return n;}
function mark(label,q){
  var span=el("span");
  var at=q?label.toLowerCase().indexOf(q.toLowerCase()):-1;
  if(at<0){span.textContent=label;return span;}
  span.appendChild(document.createTextNode(label.slice(0,at)));
  var strong=el("strong");
  strong.textContent=label.slice(at,at+q.length);
  span.appendChild(strong);
  span.appendChild(document.createTextNode(label.slice(at+q.length)));
  return span;
}
function rowButton(place,index){
  var b=el("button","sg-row"+(index===hi?" on":""));
  b.type="button";
  b.disabled=chosen.length>=MAX;
  b.appendChild(mark(place.label,term));
  if(place.count){var n=el("span","sg-n");n.textContent=String(place.count);b.appendChild(n);}
  b.addEventListener("mousedown",function(e){e.preventDefault();add(place);});
  b.addEventListener("mouseenter",function(){hi=index;});
  return b;
}
function suggestions(){
  if(!data)return [];
  var out=[];
  (data.districts||[]).forEach(function(d){
    var p={kind:"district",value:d.value,city:d.value,label:d.value,count:d.count||0};
    if(!taken(p))out.push(p);
  });
  (data.cities||[]).forEach(function(d){
    var p={kind:"city",value:d.value,city:d.value,label:d.value,count:d.count||0};
    if(!taken(p))out.push(p);
  });
  (data.neighborhoods||[]).forEach(function(d){
    var p={kind:"neighborhood",value:d.value,city:d.city,label:d.value+", "+d.city,count:d.count||0};
    if(!taken(p))out.push(p);
  });
  return out;
}
function starters(){
  var recent=readRecent().filter(function(p){return !taken(p);});
  var regions=REGIONS.filter(function(name){
    return !recent.some(function(p){return p.kind==="district"&&p.value===name;});
  }).map(function(name){return {kind:"district",value:name,city:name,label:name};})
    .filter(function(p){return !taken(p);});
  return {recent:recent,regions:regions,all:recent.concat(regions)};
}
function group(title,rows,offset){
  if(!rows.length)return;
  var h=el("h3");
  h.textContent=title;
  list.appendChild(h);
  var ul=el("ul");
  rows.forEach(function(place,i){
    var li=el("li");
    li.appendChild(rowButton(place,offset+i));
    ul.appendChild(li);
  });
  list.appendChild(ul);
}
function draw(){
  var typing=term.length>=2;
  var found=typing?suggestions():[];
  var start=typing?null:starters();
  nav=typing?found:(start?start.all:[]);
  if(hi>=nav.length)hi=0;
  list.textContent="";
  var left=MAX-chosen.length;
  var note=el("p","sg-note");
  note.textContent=left===0?"הגעתם למספר המיקומים המרבי":left===1?"נשאר עוד מיקום אחד לבחירה":"נשארו עוד "+left+" מיקומים לבחירה";
  list.appendChild(note);
  if(chosen.length){
    var chips=el("div","sg-chips");
    chosen.forEach(function(place){
      var chip=el("button","sg-chip");
      chip.type="button";
      chip.textContent="× "+place.label;
      chip.addEventListener("mousedown",function(e){e.preventDefault();removeAt(place);});
      chips.appendChild(chip);
    });
    list.appendChild(chips);
  }
  var near=el("button","sg-near");
  near.type="button";
  near.disabled=locating||left===0;
  near.textContent=locating?"מאתר…":"קרוב למיקום שלי";
  near.addEventListener("mousedown",function(e){e.preventDefault();locate();});
  list.appendChild(near);
  if(locError){var err=el("p","sg-err");err.textContent=locError;list.appendChild(err);}
  if(!typing&&start&&start.recent.length){
    var bar=el("div","sg-bar");
    var title=el("h3");
    title.textContent="חיפושים אחרונים";
    title.style.padding="0";
    title.style.background="transparent";
    var clear=el("button","sg-clear");
    clear.type="button";
    clear.textContent="ניקוי";
    clear.addEventListener("mousedown",function(e){e.preventDefault();clearRecent();});
    bar.appendChild(title);
    bar.appendChild(clear);
    list.appendChild(bar);
    var ul=el("ul");
    start.recent.forEach(function(place,i){var li=el("li");li.appendChild(rowButton(place,i));ul.appendChild(li);});
    list.appendChild(ul);
  }
  if(!typing&&start)group("אזורים",start.regions,start.recent.length);
  if(typing&&!found.length){var empty=el("p","sg-empty");empty.textContent="לא נמצאו מיקומים מתאימים";list.appendChild(empty);}
  if(typing){
    var districts=found.filter(function(p){return p.kind==="district";});
    var cities=found.filter(function(p){return p.kind==="city";});
    var hoods=found.filter(function(p){return p.kind==="neighborhood";});
    group("אזור",districts,0);
    group("עיר",cities,districts.length);
    group("שכונה",hoods,districts.length+cities.length);
  }
  var foot=el("div","sg-foot");
  var reset=el("button","sg-reset");
  reset.type="button";
  reset.textContent="איפוס";
  reset.disabled=!chosen.length;
  reset.addEventListener("mousedown",function(e){e.preventDefault();chosen=[];draw();});
  var ok=el("button","sg-ok");
  ok.type="button";
  ok.textContent="אישור";
  ok.addEventListener("mousedown",function(e){e.preventDefault();close();});
  foot.appendChild(reset);
  foot.appendChild(ok);
  list.appendChild(foot);
  list.hidden=!open;
  input.setAttribute("aria-expanded",open?"true":"false");
  input.placeholder=chosen.length?chosen.length+" מיקומים נבחרו":"עיר, שכונה או רחוב";
}
function close(){open=false;list.hidden=true;input.setAttribute("aria-expanded","false");}
function fetchSuggest(q){
  var n=++seq;
  fetch(API+"/listings/suggest?q="+encodeURIComponent(q)+"&section="+encodeURIComponent(section()))
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){if(n!==seq)return;data=d;hi=0;draw();})
    .catch(function(){});
}
function schedule(){
  window.clearTimeout(timer);
  term=input.value.trim();
  open=true;
  if(term.length<2){data=null;seq++;draw();return;}
  timer=window.setTimeout(function(){fetchSuggest(term);},200);
}
function locate(){
  locError="";
  if(!navigator.geolocation){locError="הדפדפן לא תומך באיתור מיקום.";draw();return;}
  if(chosen.length>=MAX)return;
  locating=true;draw();
  navigator.geolocation.getCurrentPosition(function(pos){
    fetch(API+"/listings/city-at?lat="+pos.coords.latitude+"&lng="+pos.coords.longitude)
      .then(function(r){return r.ok?r.json():null;})
      .then(function(d){
        locating=false;
        if(!d||!d.city){locError="לא זיהינו עיר במיקום שלך.";draw();return;}
        add({kind:"city",value:d.city,city:d.city,label:d.city});
      })
      .catch(function(){locating=false;locError="לא הצלחנו לזהות את המיקום שלך.";draw();});
  },function(err){
    locating=false;
    locError=err&&err.code===1?"לא ניתנה הרשאה לשימוש במיקום.":"לא הצלחנו לאתר את המיקום שלך.";
    draw();
  },{timeout:10000,maximumAge:300000});
}
input.addEventListener("input",schedule);
input.addEventListener("focus",function(){open=true;draw();});
input.addEventListener("keydown",function(e){
  if(e.key==="Escape"){close();return;}
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    e.preventDefault();
    open=true;
    if(!nav.length){draw();return;}
    hi=e.key==="ArrowDown"?(hi+1)%nav.length:(hi-1+nav.length)%nav.length;
    draw();
    return;
  }
  if(e.key==="Enter"&&open&&nav[hi]){e.preventDefault();add(nav[hi]);}
});
form.addEventListener("change",function(e){
  if(e.target&&e.target.name==="section"&&term.length>=2)fetchSuggest(term);
});
form.addEventListener("submit",function(e){
  if(!chosen.length)return;
  e.preventDefault();
  var params=new URLSearchParams();
  params.set("section",section());
  ["city","neighborhood","district"].forEach(function(kind){
    var values=chosen.filter(function(p){return p.kind===kind;}).map(function(p){return p.value;});
    if(values.length)params.set(kind,values.join(","));
  });
  location.assign("/search?"+params.toString());
});
document.addEventListener("pointerdown",function(e){if(!form.contains(e.target))close();});
})();`;
}

/** The policy names the script by this, so a changed byte has to be allowed on purpose. */
export function placeScriptHash(source: string): string {
  return `sha256-${createHash('sha256').update(source).digest('base64')}`;
}
