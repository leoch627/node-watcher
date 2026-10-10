// @id: trueid
// @name: TrueID
// @description: 检测 TrueID TV 解锁状态
// @category: media
// @regions: th
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="142,140,142",e="239,107,115",r="失败",a="网络",n="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",d="failed";function handler(){let i=fetch("https://tv.trueid.net/th-en/live/thairathtv-hd",{headers:{"User-Agent":n},retry:3,timeout:5e3});if(!i)return{text:`${r}(${a})`,background:e,status:d,error:a};let o=i.body.match(/"channelId":"([^"]*)"/),s=i.body.match(/"buildId":"([^"]*)"/),u=o?o[1]:"",h=s?s[1]:"";if(h.length<11)return{text:"N/A",background:t,status:"na"};let c=h.slice(10),l=fetch(`https://tv.trueid.net/api/stream/checkedPlay?channelId=${u}&lang=en&country=th`,{headers:{"User-Agent":n,Authorization:`${h}:${c}`,Accept:"application/json, text/plain, */*",Referer:"https://tv.trueid.net/th-en/live/thairathtv-hd"},retry:3,timeout:5e3});if(!l)return{text:`${r}(${a})`,background:e,status:d,error:a};let b=l.body.match(/"billboardType":"([^"]*)"/),p=b?b[1]:"";return"GEO_BLOCK"===p||l.body.indexOf("Access denied")>-1||401===i.statusCode?{text:r,background:e,status:d}:"LOADING"===p?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:t,status:"na"}}module.exports=handler;
