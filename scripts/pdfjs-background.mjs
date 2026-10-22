// PDF.js 4.10.38 schedules display rendering on animation frames internally.
// That stalls scan/OCR rasterization when Chrome hides the viewer. Change only
// scheduling, keeping display intent, annotations and optional layers identical.
export function backgroundSafePdfJs(source){
 const scheduling='useRequestAnimationFrame: !intentPrint,';
 if(source.split(scheduling).length!==2)throw new Error('PDF.js scheduling changed; review background rendering patch before upgrading.');
 return source.replace(scheduling,'useRequestAnimationFrame: false,');
}
