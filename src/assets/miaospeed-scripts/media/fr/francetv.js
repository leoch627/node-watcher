// @id: francetv
// @name: France TV
// @description: 检测 France TV 解锁状态
// @category: media
// @regions: fr
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",r="failed";function handler(){let n=fetch("https://geo-info.ftven.fr/ws/edgescape.json",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!n)return{text:`${t}(${o})`,background:e,status:r,error:o};let s=get(safeParse(n.body),"reponse.geo_info.country_code","");return"FR"===s?{text:"解锁",background:"186,230,126",status:"unlocked"}:s?{text:`${t}(${s})`,background:e,status:r,region:s}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
