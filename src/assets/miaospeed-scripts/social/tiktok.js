// @id: tiktok
// @name: Tiktok
// @description: 检测 Tiktok 是否可用
// @category: social
// @regions: global
// @tags: social
// @priority: 3
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="186,230,126",t="239,107,115",a="解锁",c="失败",o="网络",n="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",i='"Google Chrome";v="151", "Chromium";v="151", "Not_A Brand";v="8"',s="unlocked",r="failed";function handler(){let u=fetch("https://www.tiktok.com/explore",{method:"GET",headers:{accept:"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7","accept-language":"en","sec-ch-ua":i,"sec-ch-ua-mobile":"?0","sec-ch-ua-platform":'"Windows"',"sec-fetch-dest":"document","sec-fetch-mode":"navigate","sec-fetch-site":"none","sec-fetch-user":"?1","upgrade-insecure-requests":"1","User-Agent":n},noRedir:!1,retry:3,timeout:15e3});if(!u||200!==u.statusCode)return{text:`${c}(${o})`,background:t,status:r,error:o};let d=u.body;if(d.includes("https://www.tiktok.com/hk/notfound"))return{text:c,background:t,status:r};let h=d.match(/"region":"(\w+)"/),l=h&&h[1]?h[1]:"";if(l)return{text:`${a}(${l})`,background:e,status:s,region:l};let m=fetch("https://www.tiktok.com/",{method:"GET",headers:{accept:"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7","accept-language":"en","sec-ch-ua":i,"sec-ch-ua-mobile":"?0","sec-ch-ua-platform":'"Windows"',"sec-fetch-dest":"document","sec-fetch-mode":"navigate","sec-fetch-site":"none","sec-fetch-user":"?1","upgrade-insecure-requests":"1","User-Agent":n},noRedir:!1,retry:3,timeout:15e3});if(m&&200===m.statusCode){if(m.body.includes("https://www.tiktok.com/hk/notfound"))return{text:c,background:t,status:r};let o=m.body.match(/"region":"(\w+)"/),n=o&&o[1]?o[1]:"";if(n)return{text:`${a}(${n})`,background:e,status:s,region:n}}return{text:c,background:t,status:r}}module.exports=handler;
