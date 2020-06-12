const fetch = require('node-fetch');

module.exports = {
  send(webhooks, title, msg, chara) {
    const embed = {}
    
    if (process.env.PROJECT_DOMAIN) { // a glitch.me environment variable
      embed.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me`
    }

    if (msg.type === 'image') {
      embed.title = 'New image post';
    } else if (msg.type === 'text') {
      if (msg.who === 'narrator') {
        embed.title = 'New narrator post';
      } else if (msg.who === 'ooc') {
        embed.title = 'New OOC post';
      } else {
        if (chara) {
          embed.color = parseInt(chara.color.slice(1), 16);
        }
        embed.title = 'New character post';
      }
    } else {
      embed.title = 'Unknown post'
    }

    const body = { embeds: [embed] };

    for (const webhook of webhooks) {
      fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
  }
}
