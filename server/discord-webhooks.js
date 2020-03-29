const https = require('https');
const url = require('url');

function httpsPost(urlString, bodyObj) {
  const bodyString = JSON.stringify(bodyObj);
  const req = https.request(
    {
      ...url.parse(urlString),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': bodyString.length
      }
    },
  );
  req.write(bodyString);
  req.end();
}

module.exports = {
  send(webhooks, title, msg, chara) {
    const embed = {
      footer: {
        text: title
      },
      url: `https://${process.env.PROJECT_DOMAIN}.glitch.me`,
    }

    if (msg.type === 'image') {
      embed.title = 'New image post';
    } else if (msg.type === 'text') {
      if (chara) {
        embed.color = parseInt(chara.color.slice(1), 16);
      }
      
      let bodyText = '';
      bodyText += (chara && chara.name) || ({narrator:'Narrator', ooc:'OOC'})[msg.who] || '???';
      bodyText += ': ';
      
      if (msg.content.length > 20) {
        bodyText += msg.content.slice(0, 20) + "..."
      } else {
        bodyText += msg.content;
      }
      embed.title = bodyText
    }

    const body = { embeds: [embed] };

    for (const webhook of webhooks) {
      httpsPost(webhook, body);
    }
  }
}
