// @id: spotify
// @name: Spotify
// @description: 检测 Spotify 在当前地区是否可用
// @category: media
// @regions: global
// @tags: stream, music
// @priority: 9
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="failed",a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";function handler(){let n=fetch("https://open.spotify.com/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","Accept-Language":"en"},retry:3,timeout:5e3});if(!n)return{text:"N/A",background:"142,140,142",status:"na"};if(403===n.statusCode)return{text:e,background:t,status:r};let o=n.body.match(/<script[^>]+id="appServerConfig"[^>]*type="text\/plain"[^>]*>([^<]+)<\/script>/);if(!o)return{text:e,background:t,status:r};let i="";try{let t=function(t){let e=t.replace(/[^A-Za-z0-9+/=]/g,""),r="",n=0;for(;n<e.length;){let t=a.indexOf(e.charAt(n++)),o=a.indexOf(e.charAt(n++)),i=a.indexOf(e.charAt(n++)),c=a.indexOf(e.charAt(n++)),s=t<<2|o>>4,d=(15&o)<<4|i>>2,u=(3&i)<<6|c;r+=String.fromCharCode(s),-1!==i&&64!==i&&(r+=String.fromCharCode(d)),-1!==c&&64!==c&&(r+=String.fromCharCode(u))}return r}(o[1].trim()),e=safeParse(t);i=e&&e.market?e.market:""}catch(t){i=""}return i?{text:`解锁(${i.toLowerCase()})`,background:"186,230,126",status:"unlocked",region:i}:{text:e,background:t,status:r}}module.exports=handler;
