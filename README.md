# tiktok-login

Prérequis :
Ceux de Puppeteer : https://github.com/puppeteer/puppeteer

Installation :
```
npm install pierreminiggio/tiktok-login
```

Utilisation : 
```javascript
const post = require('@pierreminiggio/tiktok-login')
post(login, password, show).then((page) => {
    // do puppeteer stuff
}).catch((err) => {
    console.log(err) // 'timed out' 
})
```
