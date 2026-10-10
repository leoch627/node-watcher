// @id: hbomax
// @name: HBO Max
// @description: 检测 HBO Max(Max) 解锁状态
// @category: media
// @regions: us
// @tags: stream, video
// @priority: 40
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="142,140,142",e="239,107,115",a="失败",r="网络",o="failed";function n(){return(n=Object.assign||function(t){for(var e=1;e<arguments.length;e++){var a=arguments[e];for(var r in a)Object.prototype.hasOwnProperty.call(a,r)&&(t[r]=a[r])}return t}).apply(this,arguments)}const s={"x-device-info":"beam/5.0.0 (desktop/desktop; Windows/10; afbb5daa-c327-461d-9460-d8e4b3ee4a1f/da0cdd94-5a39-42ef-aa68-54cbc1b852c3)","x-disco-client":"WEB:10:beam:5.2.1","x-disco-params":"realm=bolt"};function handler(){let d=fetch("https://default.any-any.prd.api.max.com/token?realm=bolt&deviceId=afbb5daa-c327-461d-9460-d8e4b3ee4a1f",{headers:s,retry:3,timeout:5e3});if(!d)return{text:`${a}(${r})`,background:e,status:o,error:r};let i=get(safeParse(d.body),"data.attributes.token","");if(!i)return{text:"N/A",background:t,status:"na"};let u=fetch("https://default.any-any.prd.api.max.com/session-context/headwaiter/v1/bootstrap",{method:"POST",body:"{}",headers:n({},s,{Cookie:`st=${i}`,"Content-Type":"application/json"}),retry:3,timeout:5e3});if(!u)return{text:`${a}(${r})`,background:e,status:o,error:r};let c=safeParse(u.body),b=get(c,"routing.domain",""),f=get(c,"routing.tenant",""),l=get(c,"routing.env",""),m=get(c,"routing.homeMarket","");if(!b||!f||!l||!m)return{text:"N/A",background:t,status:"na"};let h=fetch(`https://default.${f}-${m}.${l}.${b}/users/me`,{headers:n({},s,{Cookie:`st=${i}`}),retry:3,timeout:5e3});if(!h)return{text:`${a}(${r})`,background:e,status:o,error:r};let p=get(safeParse(h.body),"data.attributes.currentLocationTerritory",""),g=fetch("https://www.max.com/",{noRedir:!0,retry:3,timeout:5e3}),x=g&&g.headers.location||"";return!p||g&&g.statusCode>=300&&g.statusCode<400&&(x.indexOf("hbomax.com")>-1||x.indexOf("geo-availability")>-1)?{text:a,background:e,status:o}:{text:`解锁(${p.toLowerCase()})`,background:"186,230,126",status:"unlocked",region:p}}module.exports=handler;
