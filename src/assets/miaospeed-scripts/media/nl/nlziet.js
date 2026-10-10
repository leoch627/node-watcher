// @id: nlziet
// @name: NLZIET
// @description: 检测 NLZIET 解锁状态
// @category: media
// @regions: nl
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="142,140,142",e=["BE","BG","CZ","DK","DE","EE","IE","EL","ES","FR","HR","IT","CY","LV","LT","LU","HU","MT","NL","AT","PL","PT","RO","SI","SK","FI","SE"];function handler(){let n=fetch("https://nlziet.nl/cdn-cgi/trace",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!n||200!==n.statusCode)return{text:"N/A",background:t,status:"na"};let a=n.body.match(/loc=([A-Z]{2})/),r=a?a[1]:"";return r&&e.indexOf(r)>-1?{text:`解锁(${r})`,background:"186,230,126",status:"unlocked",region:r}:r?{text:`失败(${r})`,background:"239,107,115",status:"failed",region:r}:{text:"N/A",background:t,status:"na"}}module.exports=handler;
