function i(e){const t=String(e||"").trim();if(!t)return"";if(/^(https?:|blob:)/i.test(t))return t;const r="".replace(/\/$/,"");return t.startsWith("/")?r?`${r}${t}`:t:r?`${r}/${t}`:t}export{i as r};
