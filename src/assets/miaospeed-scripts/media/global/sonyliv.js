// @id: sonyliv
// @name: SonyLIV
// @description: 检测 SonyLIV 在当前地区是否可用
// @category: media
// @regions: global
// @tags: stream, video
// @priority: 40
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",n="网络",r="failed",o=["AE","AF","AT","AU","BD","BE","BH","BT","CA","CH","CN","DE","DK","ES","FI","FR","GB","GR","HK","ID","IE","IN","IT","KW","LK","MO","MV","MY","NL","NO","NP","NZ","OM","PH","PK","PL","PT","QA","SA","SE","SG","TH","TW","US"];function handler(){let a=fetch("https://www.sonyliv.com/signin",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!a)return{text:`${e}(${n})`,background:t,status:r,error:n};let s=a.body.match(/country_code:"([A-Z]{2})"/),u=s?s[1]:"";return u&&o.indexOf(u)>-1?{text:`解锁(${u})`,background:"186,230,126",status:"unlocked",region:u}:u?{text:`${e}(${u})`,background:t,status:r,region:u}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
