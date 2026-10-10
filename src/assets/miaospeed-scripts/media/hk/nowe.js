// @id: nowe
// @name: Now E
// @description: 检测 Now E 解锁状态
// @category: media
// @regions: hk
// @tags: stream, video
// @priority: 20
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="92,207,230",t="未知",o="unknown";function handler(){let n=fetch("https://webtvapi.nowe.com/16/1/getVodURL",{method:"POST",headers:{"Content-Type":"application/json","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},body:JSON.stringify({contentId:"202403181904703",contentType:"Vod",pin:"",deviceName:"Browser",deviceId:"w-663bcc51-913c-913c-913c-913c913c",deviceType:"WEB",secureCookie:null,callerReferenceNo:"W17151951620081575",profileId:null,mupId:null}),noRedir:!1,retry:3,timeout:5e3});if(!n)return{text:"N/A",background:"142,140,142",status:"na"};if(200!==n.statusCode)return{text:t,background:e,status:o};{let r=safeParse(n.body);return"GEO_CHECK_FAIL"===r.responseCode?{text:"失败",background:"239,107,115",status:"failed"}:"SUCCESS"===r.responseCode||"ASSET_MISSING"===r.responseCode||"NOT_LOGIN"===r.responseCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:t,background:e,status:o}}}module.exports=handler;
