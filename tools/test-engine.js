const E = require('../engine.js');
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
// 5-card category counts
const cnt = new Array(9).fill(0); const h = new Int32Array(5);
for (let a=0;a<52;a++)for(let b=a+1;b<52;b++)for(let c=b+1;c<52;c++)for(let d=c+1;d<52;d++)for(let e=d+1;e<52;e++){h[0]=a;h[1]=b;h[2]=c;h[3]=d;h[4]=e;cnt[E.evaluate(h,5)>>20]++;}
assert(JSON.stringify(cnt)===JSON.stringify([1302540,1098240,123552,54912,10200,5108,3744,624,40]), '5-card counts '+cnt);
// 7-card category distribution via sampling of known freq not needed; ordering checks
const ev = s => E.evaluate(E.parseCards(s));
assert(ev('AsKsQsJsTs2c3d') > ev('9s9h9d9cAh2c3d'), 'royal > quads');
assert(ev('5c4d3h2sAs9h9d') < ev('6c5d4h3s2s9h9d'), 'wheel < 6-high straight');
assert(ev('AhAd KcKd QsQh 2c'.replace(/ /g,'')) === ev('AhAdKcKdQsQh3c'), 'two pair kicker Q both');
assert(ev('AhAdKcKd3s3h2c') < ev('AhAdKcKdQs3h2c'), 'two pair kicker');
assert(ev('7h7d7c5s5h5d2c') === ev('7h7d7c5s5h2d2c'), 'FH 77755 equal');
let t=Date.now();
let r = E.equity([[{c1:E.card('Ah'),c2:E.card('As'),w:1}],[{c1:E.card('Kh'),c2:E.card('Ks'),w:1}]],[],[],{iterations:200000});
console.log('AA vs KK MC', r.equity, Date.now()-t,'ms');
r = E.equity([[{c1:E.card('Ah'),c2:E.card('Kh'),w:1}],[{c1:E.card('Qs'),c2:E.card('Qd'),w:1}]],E.parseCards('2h7c9h'),[]);
console.log('AhKh vs QQ on 2h7c9h exact', r.equity, r.samples);
r = E.equity([E.rangeCombos(E.parseRange('AA'),[]), E.rangeCombos(E.parseRange('KK'),[])],[],[],{iterations:100000});
console.log('AA vs KK range', r.equity);
console.log('pct UTG', E.rangePercent(E.parseRange('22+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,65s,AJo+,KQo')));
console.log('outs', E.outs(E.parseCards('AhKh'),E.parseCards('QsQd'),E.parseCards('2h7c9h3d')).map(E.cardStr).join(' '));
