# RPNow

An RPNow server lets you do roleplaying and collaborative writing with a small group of friends!

Setting up your own RP room is now very easy, thanks to the magic of [Glitch.com!](https://glitch.com/)

## Terms of Use

[Refer to the glitch.com Terms of Service & DMCA document.](https://glitch.com/legal/)

In particular, pay attention to the information under the heading: **5. Content and Intellectual Property Rights**.
This contains information about ownership of your content, and what content is and isn't allowed. (See the subsection:
"You have the right to let us use your content. We don’t warrant other user’s content.")

## Setup

**Be sure to [create an account on glitch.com](https://glitch.com/signin) so your server isn't [automatically deleted after 5 days!](https://glitch.com/help/how-do-i-create-a-project-on-glitch/)**

First, remix this app to create your own server:

[![Remix on Glitch](https://cdn.glitch.com/2703baf2-b643-4da7-ab91-7ee2a2d00b5b%2Fremix-button.svg)](https://glitch.com/edit/#!/remix/rpnow?PASSCODE=%22Change%20me%22&LOCKDOWN=%22no%22)

To complete the setup, you'll need to **edit your `.env` file** to secure access to your room:

```
PASSCODE="Your very secret passcode"
```

Make sure you change your passcode to something only you and your friends will know!

Need help with editing your `.env` file? [Refer to this help page on glitch.com.](https://glitch.com/help/env/)

After this is done, congratulations! Your server is ready to use!

## Securing

If you're extra worried about strangers guessing the passcode, modify your `.env` file *(But don't change the passcode!)*

```
LOCKDOWN="yes"
```

However, if you can't store the login information on your device (for example, if you're using a public computer) then consider instead using a long, secure
passcode. [This page on the Electronic Frontier Foundation](https://www.eff.org/dice) can help you come up with a very secure passcode.

You can audit the history of logins and failed login attempts to your site by selecting "Audit logins" on the webpage's side menu.

## Revoking access

There's no way to remove a single user from the room.
However, you can change the passcode to something new, which will kick out everyone.
Then, just send the new passcode to all the users who should have access.

## Changing the look and feel

The webpage's look and feel can be customized by modifying `web/styles.css`!

TODO if the app gets bundled into an NPM package then change this link & instructions

## Updating

TODO instructions on how to update an `rpnow` package in package.json?
