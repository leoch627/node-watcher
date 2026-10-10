// @id: nhkplus
// @name: NHK+
// @description: 检测 NHK プラス 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video, live
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",o="IP阻止",a="failed";function handler(){let n=fetch("https://location-plus.nhk.jp/geoip/area.json",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!n)return{text:`${e}(${r})`,background:t,status:a,error:r};if(403===n.statusCode)return{text:`${e}(${o})`,background:t,status:a,error:o};let s=get(safeParse(n.body),"country_code","");return"JP"===s?{text:"解锁",background:"186,230,126",status:"unlocked"}:s?{text:`${e}(${s})`,background:t,status:a,region:s}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
