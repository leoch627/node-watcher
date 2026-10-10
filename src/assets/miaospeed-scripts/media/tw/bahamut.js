// @id: bahamut
// @name: 動畫瘋
// @description: 检测 Bahamut / 動畫瘋 解锁状态
// @category: media
// @regions: tw
// @tags: stream, video, anime
// @priority: 31
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="186,230,126",t="239,107,115",r="解锁",a="失败",o="网络",n="设备",s="令牌",i="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36";function d(e){var t={};return e.forEach(e=>{var r=e.Name,a=e.Value;t[r]=a}),t}const c="unlocked",u="failed";function handler(){let h=fetch("https://ani.gamer.com.tw/ajax/getdeviceid.php",{method:"GET",headers:{"User-Agent":i},noRedir:!1,retry:3,timeout:15e3});if(!h||200!==h.statusCode)return{text:`${a}(${o}1)`,background:t,status:u,error:o};if(0===h.body.trim().indexOf("<"))return{text:a,background:t,status:u};let m=d(h.cookies),g=safeParse(h.body).deviceid;if(!g)return{text:`${a}(${n})`,background:t,status:u,error:n};let f=fetch(`https://ani.gamer.com.tw/ajax/token.php?adID=89422&sn=37783&device=${g}`,{method:"GET",headers:{"User-Agent":i},cookies:m,noRedir:!1,retry:3,timeout:15e3});if(!f||200!==f.statusCode)return{text:`${a}(${o}2)`,background:t,status:u,error:o};if(m=d(f.cookies),!safeParse(f.body).animeSn)return{text:`${a}(${s})`,background:t,status:u,error:s};let l=fetch(`https://ani.gamer.com.tw/ajax/token.php?adID=89422&sn=38832&device=${g}`,{method:"GET",headers:{"User-Agent":i},cookies:m,noRedir:!1,retry:3,timeout:15e3});if(l&&200===l.statusCode&&safeParse(l.body).animeSn)return{text:`${r}(TW)`,background:e,status:c,region:"TW"};let k=fetch("https://ani.gamer.com.tw/cdn-cgi/trace",{method:"GET",headers:{"User-Agent":i,accept:"*/*;q=0.8,application/signed-exchange;v=b3;q=0.7","accept-language":"zh-TW,zh;q=0.9","sec-ch-ua":'"Google Chrome";v="151", "Chromium";v="151", "Not_A Brand";v="8"'},cookies:m,noRedir:!1,retry:3,timeout:15e3});if(k&&200===k.statusCode){let t=k.body.match(/loc=([A-Z]{2})/);if(t)return{text:`${r}(${t[1]})`,background:e,status:c,region:t[1]}}return{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
