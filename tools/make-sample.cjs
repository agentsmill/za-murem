// node tools/make-sample.cjs <overpass.json> <lat> <lon> <name> <out.js>
global.window={};const fs=require('fs');
eval(fs.readFileSync(__dirname+'/../public/v03/js/data.js','utf8'));eval(fs.readFileSync(__dirname+'/../public/v03/js/osm.js','utf8'));
const G=window.G;const [,,inp,lat,lon,name,out]=process.argv;
const geo=G.OSM.toGeo(JSON.parse(fs.readFileSync(inp,'utf8')),+lat,+lon);
geo.name=name;
const s='/* Przykładowe osiedle z OpenStreetMap. Dane © współtwórcy OpenStreetMap, licencja ODbL. */\nwindow.G=window.G||{};window.G.SAMPLE='+JSON.stringify(geo)+';\n';
fs.writeFileSync(out,s);
console.log('b',geo.b.length,'r',geo.r.length,'a',geo.a.length,'w',geo.w.length,'poi',geo.poi.length,'bytes',s.length);
const g=G.OSM.rasterize(geo,7);const cnt={};for(const t of g.terr)cnt[t]=(cnt[t]||0)+1;console.log('terr',JSON.stringify(cnt),'empty bld',g.btiles.filter(t=>!t.length).length);
const cats={};for(const p of geo.poi)cats[p.c]=(cats[p.c]||0)+1;console.log(JSON.stringify(cats));
// ascii preview
const ch={0:'.',1:'#',2:':',3:'=',4:'~',5:'t',6:'s',7:'B',8:'p',9:'a',10:','};
let str='';for(let y=0;y<G.N;y+=2){for(let x=0;x<G.N;x++)str+=ch[g.terr[y*G.N+x]];str+='\n'}fs.writeFileSync('/tmp/preview.txt',str);
