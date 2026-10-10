// @id: claude
// @name: Claude
// @description: 检测 Anthropic Claude 在当前地区是否可用
// @category: ai
// @regions: global
// @tags: ai
// @priority: 7
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="142,140,142",e="186,230,126",M="解锁",A="unlocked",T=["AL","DZ","AD","AO","AG","AR","AM","AU","AT","AZ","BS","BH","BD","BB","BE","BZ","BJ","BT","BO","BA","BW","BR","BN","BG","BF","BI","CV","KH","CM","CA","TD","CL","CO","KM","CG","CR","CI","HR","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ","EE","SZ","FJ","FI","FR","GA","GM","GE","DE","GH","GR","GD","GT","GN","GW","GY","HT","HN","HU","IS","IN","ID","IQ","IE","IL","IT","JM","JP","JO","KZ","KE","KI","KW","KG","LA","LV","LB","LS","LR","LI","LT","LU","MG","MW","MY","MV","MT","MH","MR","MU","MX","FM","MD","MC","MN","ME","MA","MZ","NA","NR","NP","NL","NZ","NE","NG","MK","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH","PL","PT","QA","RO","RW","KN","LC","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SK","SI","SB","ZA","KR","ES","LK","SR","SE","CH","TW","TJ","TZ","TH","TL","TG","TO","TT","TN","TR","TM","TV","UG","UA","AE","GB","US","UY","UZ","VU","VA","VN","ZM","ZW"];function handler(){let a=fetch("https://claude.ai/cdn-cgi/trace",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!a||200!==a.statusCode)return{text:"N/A",background:t,status:"na"};let G=a.body.match(/loc=([A-Z]{2})/),n=G?G[1]:"";return"T1"===n?{text:`${M}(Tor)`,background:e,status:A,region:n}:n?T.indexOf(n)>-1?{text:`${M}(${n})`,background:e,status:A,region:n}:{text:`失败(${n})`,background:"239,107,115",status:"failed",region:n}:{text:"N/A",background:t,status:"na"}}module.exports=handler;
