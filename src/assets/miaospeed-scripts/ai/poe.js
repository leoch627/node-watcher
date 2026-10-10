// @id: poe
// @name: Poe
// @description: 检测 Quora Poe 在当前地区是否可用
// @category: ai
// @regions: global
// @tags: ai
// @priority: 8
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="142,140,142",e="239,107,115",M="失败",G="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",A="failed",S=["AF","AL","DZ","AS","AD","AO","AI","AG","AR","AM","AW","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BA","BW","BR","VG","BN","BG","BF","BI","KH","CM","CA","CV","KY","CF","TD","IO","CL","CN","CX","CC","CO","KM","CG","CD","CK","CR","CI","HR","CU","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ","ER","EE","SZ","ET","FK","FO","FJ","FI","FR","GF","PF","GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY","HT","HN","HK","HU","IS","IN","ID","IR","IQ","IE","IM","IL","IT","JM","JP","JE","JO","KZ","KE","KI","KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MO","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MS","MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI","NE","NG","NU","NF","KP","MK","MP","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH","PN","PL","PT","PR","QA","RE","RO","RU","RW","WS","SM","ST","SA","SN","RS","SC","SL","SG","SK","SI","GS","SB","SO","ZA","KR","ES","LK","BL","SH","KN","LC","MF","PM","VC","SD","SR","SJ","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TK","TO","TT","TN","TR","TM","TC","TV","VI","UG","UA","AE","GB","US","UY","UZ","VU","VA","VE","VN","WF","YE","ZM","ZW"];function handler(){let C=fetch("https://poe.com/cdn-cgi/trace",{headers:{"User-Agent":G},retry:3,timeout:5e3});if(!C||200!==C.statusCode)return{text:"N/A",background:t,status:"na"};let T=C.body.match(/loc=([A-Z]{2})/),o=T?T[1]:"",r=fetch("https://poe.com/",{headers:{"User-Agent":G},retry:3,timeout:5e3});return r?403===r.statusCode?{text:`${M}${o?`(${o})`:""}`,background:e,status:A,region:o}:o&&S.indexOf(o)>-1?{text:`解锁(${o})`,background:"186,230,126",status:"unlocked",region:o}:{text:`${M}${o?`(${o})`:""}`,background:e,status:A,region:o}:{text:"N/A",background:t,status:"na"}}module.exports=handler;
