// @id: ipforwall
// @name: 回墙出口
// @description: 检测访问中国大陆服务时使用的出口 IP
// @category: network
// @regions: global
// @tags: ip, tool
// @priority: 5
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",a="未知",r="网络",d="响应",i="failed";function handler(){var l;let o=fetch("https://api.bilibili.com/x/web-interface/zone",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:15e3});if(!o||200!==o.statusCode)return{text:`${t}(${r})`,background:e,status:i,error:r};let n=safeParse(o.body);if((null==n?void 0:n.code)!==0||!(null==(l=n.data)?void 0:l.addr))return{text:`${t}(${d})`,background:e,status:i,error:d};let s=[];[n.data.country,n.data.province,n.data.city].forEach(e=>{e&&-1===s.indexOf(e)&&s.push(e)});let u=n.data.isp||a,c=s.length>0?s.join(", "):a;return{text:`${n.data.addr} - ${u} - ${c}`,background:"186,230,126",status:"unlocked",extra:[{key:"ip",label:"IP地址",value:n.data.addr,type:"string"},{key:"isp",label:"运营商",value:u,type:"string"},{key:"location",label:"位置",value:c,type:"string"}]}}module.exports=handler;
