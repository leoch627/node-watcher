// @id: sbsondemand
// @name: SBS on Demand
// @description: 检测 SBS on Demand 解锁状态
// @category: media
// @regions: au
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",o="failed";function handler(){let n=fetch("https://www.sbs.com.au/api/v3/network?context=odwebsite",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!n)return{text:`${t}(${r})`,background:e,status:o,error:r};let s=get(safeParse(n.body),"get.response.country_code","");return"AU"===s?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:`${t}${s?`(${s})`:""}`,background:e,status:o,region:s}}module.exports=handler;
